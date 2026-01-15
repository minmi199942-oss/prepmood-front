/**
 * 주문 번호로 주문 복구 스크립트
 * 
 * 주문 번호(order_number)를 기준으로 주문을 복구합니다.
 * 
 * 사용법:
 * node scripts/recover_order_by_number.js [order_number]
 * 
 * 예시:
 * node scripts/recover_order_by_number.js ORD-20260115-272164-5M1IMA
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

async function recoverOrderByNumber(orderNumber) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 1. 주문 정보 확인
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, status, paid_at, total_price, user_id, guest_id
             FROM orders 
             WHERE order_number = ?`,
            [orderNumber]
        );

        if (orders.length === 0) {
            throw new Error(`주문 ${orderNumber}를 찾을 수 없습니다.`);
        }

        const order = orders[0];
        const orderId = order.order_id;

        console.log(`📋 주문 정보:`);
        console.log(`   - 주문 ID: ${orderId}`);
        console.log(`   - 주문 번호: ${order.order_number}`);
        console.log(`   - 상태: ${order.status}`);
        console.log(`   - paid_at: ${order.paid_at || 'NULL'}`);
        console.log(`   - 총액: ${order.total_price}`);
        console.log('');

        // 2. payments 정보 확인
        const [payments] = await connection.execute(
            `SELECT payment_id, payment_key, status, amount, currency, payload_json
             FROM payments 
             WHERE order_number = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [orderNumber]
        );

        if (payments.length === 0) {
            throw new Error(`주문 ${orderNumber}에 대한 결제 정보를 찾을 수 없습니다.`);
        }

        const payment = payments[0];

        console.log(`💳 결제 정보:`);
        console.log(`   - 결제 키: ${payment.payment_key}`);
        console.log(`   - 상태: ${payment.status}`);
        console.log(`   - 금액: ${payment.amount} ${payment.currency}`);
        console.log('');

        if (payment.status !== 'captured') {
            throw new Error(`결제 상태가 'captured'가 아닙니다. 현재 상태: ${payment.status}`);
        }

        // 3. paid_events 확인
        const [existingPaidEvents] = await connection.execute(
            `SELECT event_id FROM paid_events WHERE order_id = ?`,
            [orderId]
        );

        let paidEventId;

        if (existingPaidEvents.length > 0) {
            paidEventId = existingPaidEvents[0].event_id;
            console.log(`⚠️  이미 paid_events가 있습니다. event_id: ${paidEventId}`);
            console.log('processPaidOrder()만 재실행합니다...\n');
        } else {
            // 4. paid_events 생성
            console.log(`📝 paid_events 생성 중...`);
            Logger.log('[RECOVER_ORDER_BY_NUMBER] paid_events 생성 시작', {
                order_id: orderId,
                order_number: orderNumber,
                payment_key: payment.payment_key
            });

            const paidEventResult = await createPaidEvent({
                orderId: orderId,
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
            console.log(`✅ paid_events 생성 완료. event_id: ${paidEventId}\n`);
            Logger.log('[RECOVER_ORDER_BY_NUMBER] paid_events 생성 완료', {
                order_id: orderId,
                paidEventId
            });
        }

        // 5. processPaidOrder() 실행
        console.log(`🔄 processPaidOrder() 실행 중...`);
        Logger.log('[RECOVER_ORDER_BY_NUMBER] processPaidOrder 시작', {
            order_id: orderId,
            paidEventId
        });

        const paidResult = await processPaidOrder({
            connection,
            paidEventId: paidEventId,
            orderId: orderId,
            paymentKey: payment.payment_key,
            amount: parseFloat(payment.amount),
            currency: payment.currency || 'KRW',
            eventSource: 'manual_verify',
            rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null
        });

        // 6. orders.status 집계 함수 호출
        await updateOrderStatus(connection, orderId);

        await connection.commit();

        const resultSummary = {
            order_id: orderId,
            order_number: orderNumber,
            paidEventId,
            stockUnitsReserved: paidResult.data.stockUnitsReserved,
            orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
            warrantiesCreated: paidResult.data.warrantiesCreated,
            invoiceNumber: paidResult.data.invoiceNumber
        };

        console.log('✅ 주문 복구 완료:');
        console.log(JSON.stringify(resultSummary, null, 2));
        Logger.log('[RECOVER_ORDER_BY_NUMBER] 주문 복구 완료', resultSummary);

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('❌ 오류 발생:', error.message);
        console.error(error.stack);
        Logger.error('[RECOVER_ORDER_BY_NUMBER] 주문 복구 실패', {
            order_number: orderNumber,
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

// 명령줄 인자에서 order_number 읽기
const orderNumber = process.argv[2];

if (!orderNumber) {
    console.error('사용법: node scripts/recover_order_by_number.js [order_number]');
    console.error('예시: node scripts/recover_order_by_number.js ORD-20260115-272164-5M1IMA');
    process.exit(1);
}

recoverOrderByNumber(orderNumber)
    .then(() => {
        console.log('\n✅ 완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ 실패:', error);
        process.exit(1);
    });
