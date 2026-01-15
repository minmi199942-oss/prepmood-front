/**
 * 주문 후처리 파이프라인 배치 복구 스크립트
 * 
 * paid_events가 없거나 processPaidOrder가 실패한 주문들을 일괄 복구합니다.
 * 
 * 사용법:
 * node scripts/recover_pipeline_batch.js [--dry-run] [--limit N]
 * 
 * 옵션:
 *   --dry-run: 실제 복구하지 않고 문제가 있는 주문만 확인
 *   --limit N: 최대 N개 주문만 처리 (기본값: 10)
 * 
 * 예시:
 *   node scripts/recover_pipeline_batch.js --dry-run
 *   node scripts/recover_pipeline_batch.js --limit 5
 */

const mysql = require('mysql2/promise');
const { createPaidEvent } = require('../utils/paid-event-creator');
const { processPaidOrder } = require('../utils/paid-order-processor');
const { updateOrderStatus } = require('../utils/order-status-aggregator');
const Logger = require('../logger');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

// 명령줄 인자 파싱
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const limitArg = args.find(arg => arg.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 10;

/**
 * 문제가 있는 주문 목록 조회
 */
async function findProblematicOrders(connection, limitCount) {
    const [orders] = await connection.execute(
        `SELECT 
            o.order_id,
            o.order_number,
            o.status,
            o.paid_at,
            o.total_price,
            p.payment_id,
            p.payment_key,
            p.status as payment_status,
            p.amount,
            p.currency,
            p.payload_json,
            (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
            (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
            (SELECT COUNT(*) FROM warranties 
             WHERE source_order_item_unit_id IN (
                 SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
             )) as warranties_count,
            (SELECT COUNT(*) FROM invoices WHERE order_id = o.order_id) as invoices_count
        FROM orders o
        JOIN payments p ON o.order_number = p.order_number
        WHERE o.status IN ('processing', 'pending')
          AND p.status = 'captured'
          AND (
              -- paid_events가 없는 경우
              NOT EXISTS (SELECT 1 FROM paid_events WHERE order_id = o.order_id)
              OR
              -- paid_events는 있지만 order_item_units가 없는 경우
              (EXISTS (SELECT 1 FROM paid_events WHERE order_id = o.order_id)
               AND NOT EXISTS (SELECT 1 FROM order_item_units WHERE order_id = o.order_id))
          )
        ORDER BY o.order_id DESC
        LIMIT ?`,
        [limitCount]
    );

    return orders;
}

/**
 * 단일 주문 복구
 */
async function recoverOrder(connection, order, payment) {
    const orderId = order.order_id;
    
    try {
        await connection.beginTransaction();

        // 1. paid_events 확인
        const [existingPaidEvents] = await connection.execute(
            `SELECT event_id FROM paid_events WHERE order_id = ?`,
            [orderId]
        );

        let paidEventId;

        if (existingPaidEvents.length > 0) {
            // paid_events가 이미 있는 경우
            paidEventId = existingPaidEvents[0].event_id;
            Logger.log('[RECOVER_PIPELINE_BATCH] paid_events 이미 존재, processPaidOrder만 재실행', {
                order_id: orderId,
                paidEventId
            });
        } else {
            // paid_events 생성
            Logger.log('[RECOVER_PIPELINE_BATCH] paid_events 생성 시작', {
                order_id: orderId,
                payment_key: payment.payment_key
            });

            const paidEventResult = await createPaidEvent({
                orderId: order.order_id,
                paymentKey: payment.payment_key,
                amount: parseFloat(payment.amount),
                currency: payment.currency || 'KRW',
                eventSource: 'manual_verify',
                rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null
            });

            if (!paidEventResult.eventId) {
                throw new Error('paid_events 생성 실패: eventId가 null입니다.');
            }

            paidEventId = paidEventResult.eventId;
            Logger.log('[RECOVER_PIPELINE_BATCH] paid_events 생성 완료', {
                order_id: orderId,
                paidEventId
            });
        }

        // 2. processPaidOrder() 실행
        Logger.log('[RECOVER_PIPELINE_BATCH] processPaidOrder 시작', {
            order_id: orderId,
            paidEventId
        });

        const paidResult = await processPaidOrder({
            connection,
            paidEventId: paidEventId,
            orderId: order.order_id,
            paymentKey: payment.payment_key,
            amount: parseFloat(payment.amount),
            currency: payment.currency || 'KRW',
            eventSource: 'manual_verify',
            rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null
        });

        // 3. orders.status 집계 함수 호출
        await updateOrderStatus(connection, order.order_id);

        await connection.commit();

        return {
            success: true,
            order_id: orderId,
            paidEventId,
            result: paidResult
        };
    } catch (error) {
        await connection.rollback();
        Logger.error('[RECOVER_PIPELINE_BATCH] 주문 복구 실패', {
            order_id: orderId,
            error: error.message,
            error_code: error.code,
            stack: error.stack
        });
        return {
            success: false,
            order_id: orderId,
            error: error.message
        };
    }
}

/**
 * 메인 함수
 */
async function main() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        console.log('🔍 문제가 있는 주문 검색 중...');
        const orders = await findProblematicOrders(connection, limit);

        if (orders.length === 0) {
            console.log('✅ 문제가 있는 주문이 없습니다.');
            return;
        }

        console.log(`\n📋 발견된 주문: ${orders.length}개\n`);

        // 주문 정보 출력
        orders.forEach((order, index) => {
            console.log(`${index + 1}. 주문 ${order.order_id} (${order.order_number})`);
            console.log(`   - 상태: ${order.status}`);
            console.log(`   - paid_events: ${order.paid_events_count}개`);
            console.log(`   - order_item_units: ${order.order_item_units_count}개`);
            console.log(`   - warranties: ${order.warranties_count}개`);
            console.log(`   - invoices: ${order.invoices_count}개`);
            console.log('');
        });

        if (isDryRun) {
            console.log('🔍 --dry-run 모드: 실제 복구는 수행하지 않습니다.');
            return;
        }

        console.log('🔄 주문 복구 시작...\n');

        const results = [];
        for (const order of orders) {
            const payment = {
                payment_id: order.payment_id,
                payment_key: order.payment_key,
                status: order.payment_status,
                amount: order.amount,
                currency: order.currency,
                payload_json: order.payload_json
            };

            const result = await recoverOrder(connection, order, payment);
            results.push(result);

            if (result.success) {
                console.log(`✅ 주문 ${result.order_id} 복구 완료`);
            } else {
                console.log(`❌ 주문 ${result.order_id} 복구 실패: ${result.error}`);
            }
        }

        // 결과 요약
        console.log('\n📊 복구 결과 요약:');
        const successCount = results.filter(r => r.success).length;
        const failCount = results.filter(r => !r.success).length;
        console.log(`   ✅ 성공: ${successCount}개`);
        console.log(`   ❌ 실패: ${failCount}개`);

        if (failCount > 0) {
            console.log('\n❌ 실패한 주문:');
            results.filter(r => !r.success).forEach(r => {
                console.log(`   - 주문 ${r.order_id}: ${r.error}`);
            });
        }

    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        console.error(error.stack);
        Logger.error('[RECOVER_PIPELINE_BATCH] 배치 복구 실패', {
            error: error.message,
            error_code: error.code,
            stack: error.stack
        });
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

main()
    .then(() => {
        console.log('\n✅ 완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ 실패:', error);
        process.exit(1);
    });
