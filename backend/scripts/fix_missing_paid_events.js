/**
 * paid_events가 없는 주문에 대해 paid_events 생성 및 processPaidOrder() 실행
 * 
 * 사용법:
 * node scripts/fix_missing_paid_events.js [order_id]
 * 
 * 예시:
 * node scripts/fix_missing_paid_events.js 61
 */

const mysql = require('mysql2/promise');
const { createPaidEvent } = require('../utils/paid-event-creator');
const { processPaidOrder } = require('../utils/paid-order-processor');
const { updateOrderStatus } = require('../utils/order-status-aggregator');
const { resolveRecoveryAttempt } = require('../services/payment-recovery-service');
const { upsertRecoveryIssue } = require('../services/recovery-issue-service');
const Logger = require('../logger');
require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

async function fixMissingPaidEvents(orderId) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 1. 주문 정보 확인
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, status, paid_at, total_price, user_id
             FROM orders 
             WHERE order_id = ?`,
            [orderId]
        );

        if (orders.length === 0) {
            throw new Error(`주문 ${orderId}를 찾을 수 없습니다.`);
        }

        const order = orders[0];

        // 2. payments 정보 확인
        const [payments] = await connection.execute(
            `SELECT payment_id, payment_key, status, amount, currency, payload_json
             FROM payments 
             WHERE order_number = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [order.order_number]
        );

        if (payments.length === 0) {
            throw new Error(`주문 ${order.order_number}에 대한 결제 정보를 찾을 수 없습니다.`);
        }

        const payment = payments[0];

        if (payment.status !== 'captured') {
            throw new Error(`결제 상태가 'captured'가 아닙니다. 현재 상태: ${payment.status}`);
        }

        // 3. recovery용 attemptId 결정 (개발 단계: use_hold=1 하나만 허용, 나머지는 unresolved)
        const resolution = await resolveRecoveryAttempt({
            connection,
            orderId: order.order_id,
            paymentKey: payment.payment_key,
            gateway: 'toss'
        });

        if (resolution.mode !== 'hold') {
            Logger.error('[FIX_MISSING_PAID_EVENTS] resolveRecoveryAttempt 결과가 hold 아님 - USE_HOLD_RECOVERY_UNRESOLVED', {
                order_id: order.order_id,
                order_number: order.order_number,
                payment_key: payment.payment_key,
                reasonCode: resolution.reasonCode,
                holdAttemptIds: resolution.holdAttemptIds,
                legacyAttemptIds: resolution.legacyAttemptIds,
                matchedAttemptIds: resolution.matchedAttemptIds
            });
            // recovery_issues 투영본에 이슈 upsert (관측용)
            try {
                await upsertRecoveryIssue({
                    connection,
                    orderId: order.order_id,
                    paymentKey: payment.payment_key,
                    issueCode: 'USE_HOLD_RECOVERY_UNRESOLVED',
                    reasonCode: resolution.reasonCode,
                    recommendedAction: 'MANUAL_REVIEW',
                    useHold: 1,
                    payloadSnapshot: {
                        orderId: order.order_id,
                        paymentKey: payment.payment_key,
                        gateway: 'toss',
                        reasonCode: resolution.reasonCode,
                        holdAttemptIds: resolution.holdAttemptIds,
                        legacyAttemptIds: resolution.legacyAttemptIds,
                        matchedAttemptIds: resolution.matchedAttemptIds
                    }
                });
            } catch (e) {
                // upsert 실패는 복구 실패보다 우선하지 않음
            }
            throw new Error('USE_HOLD_RECOVERY_UNRESOLVED');
        }

        const attemptIdForRecovery = resolution.attemptId;

        // 4. paid_events 확인
        const [existingPaidEvents] = await connection.execute(
            `SELECT event_id FROM paid_events WHERE order_id = ?`,
            [orderId]
        );

        if (existingPaidEvents.length > 0) {
            console.log(`⚠️ 주문 ${orderId}에 이미 paid_events가 있습니다. event_id: ${existingPaidEvents[0].event_id}`);
            console.log('processPaidOrder()만 재실행합니다...');
            
            const paidEventId = existingPaidEvents[0].event_id;
            
            // processPaidOrder() 재실행
            const paidResult = await processPaidOrder({
                connection,
                paidEventId: paidEventId,
                orderId: order.order_id,
                paymentKey: payment.payment_key,
                amount: parseFloat(payment.amount),
                currency: payment.currency || 'KRW',
                eventSource: 'manual_verify', // ⚠️ 수정: 'manual_fix' → 'manual_verify' (ENUM에 맞춤)
                rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null,
                attemptId: attemptIdForRecovery
            });

            // orders.status 집계 함수 호출
            await updateOrderStatus(connection, order.order_id);

            await connection.commit();
            console.log('✅ processPaidOrder() 재실행 완료:', paidResult);
            Logger.log('[FIX_MISSING_PAID_EVENTS] processPaidOrder 재실행 완료', {
                order_id: orderId,
                paidEventId,
                result: paidResult
            });
            return;
        }

        // 4. paid_events 생성
        console.log(`📝 주문 ${orderId}에 대한 paid_events 생성 중...`);
        Logger.log('[FIX_MISSING_PAID_EVENTS] paid_events 생성 시작', {
            order_id: orderId,
            order_number: order.order_number,
            payment_key: payment.payment_key,
            amount: payment.amount
        });
        
        const paidEventResult = await createPaidEvent({
            orderId: order.order_id,
            paymentKey: payment.payment_key,
            amount: parseFloat(payment.amount),
            currency: payment.currency || 'KRW',
            eventSource: 'manual_verify', // ⚠️ 수정: 'manual_fix' → 'manual_verify' (ENUM에 맞춤)
            rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null
        });

        if (!paidEventResult.eventId) {
            throw new Error('paid_events 생성 실패: eventId가 null입니다.');
        }

        const paidEventId = paidEventResult.eventId;
        console.log(`✅ paid_events 생성 완료. event_id: ${paidEventId}`);

        // 5. processPaidOrder() 실행
        console.log(`🔄 processPaidOrder() 실행 중...`);
        Logger.log('[FIX_MISSING_PAID_EVENTS] processPaidOrder 시작', {
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
            eventSource: 'manual_verify', // ⚠️ 수정: 'manual_fix' → 'manual_verify' (ENUM에 맞춤)
            rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null,
            attemptId: attemptIdForRecovery
        });

        // orders.status 집계 함수 호출
        await updateOrderStatus(connection, order.order_id);

        await connection.commit();
        
        const resultSummary = {
            order_id: orderId,
            paidEventId,
            stockUnitsReserved: paidResult.data.stockUnitsReserved,
            orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
            warrantiesCreated: paidResult.data.warrantiesCreated,
            invoiceNumber: paidResult.data.invoiceNumber
        };
        
        console.log('✅ 주문 처리 완료:', resultSummary);
        Logger.log('[FIX_MISSING_PAID_EVENTS] 주문 처리 완료', resultSummary);

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('❌ 오류 발생:', error.message);
        console.error(error.stack);
        Logger.error('[FIX_MISSING_PAID_EVENTS] 오류 발생', {
            order_id: orderId,
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

// 명령줄 인자에서 order_id 읽기
const orderId = process.argv[2];

if (!orderId) {
    console.error('사용법: node scripts/fix_missing_paid_events.js [order_id]');
    console.error('예시: node scripts/fix_missing_paid_events.js 61');
    process.exit(1);
}

fixMissingPaidEvents(parseInt(orderId))
    .then(() => {
        console.log('완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('실패:', error);
        process.exit(1);
    });
