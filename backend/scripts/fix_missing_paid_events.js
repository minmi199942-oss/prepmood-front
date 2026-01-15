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

        // 3. paid_events 확인
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
                eventSource: 'manual_fix',
                rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null
            });

            await connection.commit();
            console.log('✅ processPaidOrder() 재실행 완료:', paidResult);
            return;
        }

        // 4. paid_events 생성
        console.log(`📝 주문 ${orderId}에 대한 paid_events 생성 중...`);
        
        const paidEventResult = await createPaidEvent({
            orderId: order.order_id,
            paymentKey: payment.payment_key,
            amount: parseFloat(payment.amount),
            currency: payment.currency || 'KRW',
            eventSource: 'manual_fix',
            rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null
        });

        if (!paidEventResult.eventId) {
            throw new Error('paid_events 생성 실패: eventId가 null입니다.');
        }

        const paidEventId = paidEventResult.eventId;
        console.log(`✅ paid_events 생성 완료. event_id: ${paidEventId}`);

        // 5. processPaidOrder() 실행
        console.log(`🔄 processPaidOrder() 실행 중...`);
        
        const paidResult = await processPaidOrder({
            connection,
            paidEventId: paidEventId,
            orderId: order.order_id,
            paymentKey: payment.payment_key,
            amount: parseFloat(payment.amount),
            currency: payment.currency || 'KRW',
            eventSource: 'manual_fix',
            rawPayload: payment.payload_json ? JSON.parse(payment.payload_json) : null
        });

        await connection.commit();
        
        console.log('✅ 주문 처리 완료:', {
            order_id: orderId,
            paidEventId,
            stockUnitsReserved: paidResult.data.stockUnitsReserved,
            orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
            warrantiesCreated: paidResult.data.warrantiesCreated,
            invoiceNumber: paidResult.data.invoiceNumber
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
        }
        console.error('❌ 오류 발생:', error.message);
        console.error(error.stack);
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
