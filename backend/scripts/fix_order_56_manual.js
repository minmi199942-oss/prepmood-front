/**
 * 주문 56 수동 처리 스크립트
 * 
 * 사용법:
 * node scripts/fix_order_56_manual.js
 * 
 * 주의: 이미 처리된 경우 중복 처리될 수 있으므로 주의
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const { processPaidOrder } = require('../utils/paid-order-processor');
const { createPaidEvent } = require('../utils/paid-event-creator');

const ORDER_ID = 56;

async function fixOrder56() {
    let connection;
    try {
        // DB 연결
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306
        });

        console.log('📊 주문 56 상태 확인 중...');

        // 1. 주문 정보 확인
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, status, paid_at, total_price, user_id 
             FROM orders WHERE order_id = ?`,
            [ORDER_ID]
        );

        if (orders.length === 0) {
            console.error('❌ 주문을 찾을 수 없습니다:', ORDER_ID);
            process.exit(1);
        }

        const order = orders[0];
        console.log('✅ 주문 정보:', {
            order_id: order.order_id,
            order_number: order.order_number,
            status: order.status,
            paid_at: order.paid_at,
            total_price: order.total_price
        });

        // 2. 결제 정보 확인
        const [payments] = await connection.execute(
            `SELECT payment_id, payment_key, status, amount, currency 
             FROM payments 
             WHERE order_number = ? AND status = 'captured'
             ORDER BY created_at DESC 
             LIMIT 1`,
            [order.order_number]
        );

        if (payments.length === 0) {
            console.error('❌ captured 상태의 결제를 찾을 수 없습니다');
            process.exit(1);
        }

        const payment = payments[0];
        console.log('✅ 결제 정보:', {
            payment_key: payment.payment_key.substring(0, 20) + '...',
            status: payment.status,
            amount: payment.amount
        });

        // 3. paid_events 확인
        const [paidEvents] = await connection.execute(
            `SELECT event_id, order_id, payment_key 
             FROM paid_events 
             WHERE order_id = ?`,
            [ORDER_ID]
        );

        let paidEventId;

        if (paidEvents.length === 0) {
            console.log('📝 paid_events 생성 중...');
            // paid_events 생성
            const paidEventResult = await createPaidEvent({
                orderId: ORDER_ID,
                paymentKey: payment.payment_key,
                amount: parseFloat(payment.amount),
                currency: payment.currency || 'KRW',
                eventSource: 'manual_verify',
                rawPayload: null
            });

            paidEventId = paidEventResult.eventId;
            console.log('✅ paid_events 생성 완료:', paidEventId);
        } else {
            paidEventId = paidEvents[0].event_id;
            console.log('✅ 기존 paid_events 사용:', paidEventId);
        }

        // 4. 트랜잭션 시작
        await connection.beginTransaction();

        console.log('🔄 processPaidOrder() 실행 중...');

        // 5. processPaidOrder() 실행
        const result = await processPaidOrder({
            connection,
            paidEventId,
            orderId: ORDER_ID,
            paymentKey: payment.payment_key,
            amount: parseFloat(payment.amount),
            currency: payment.currency || 'KRW',
            eventSource: 'manual_verify',
            rawPayload: null
        });

        // 6. 트랜잭션 커밋
        await connection.commit();

        console.log('✅ 처리 완료:', result);

        // 7. 최종 상태 확인
        const [finalOrder] = await connection.execute(
            `SELECT order_id, status, paid_at FROM orders WHERE order_id = ?`,
            [ORDER_ID]
        );

        console.log('📊 최종 주문 상태:', finalOrder[0]);

        await connection.end();
        process.exit(0);

    } catch (error) {
        if (connection) {
            await connection.rollback();
            await connection.end();
        }

        console.error('❌ 처리 실패:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

fixOrder56();
