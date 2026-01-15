/**
 * 주문 61 수동 수정 스크립트
 * 
 * paid_events가 없는 주문 61을 수정합니다.
 * 1. paid_events 생성 (이미 생성되어 있으면 건너뜀)
 * 2. processPaidOrder() 재실행
 */

const mysql = require('mysql2/promise');
const { processPaidOrder } = require('../utils/paid-order-processor');
const Logger = require('../logger');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
};

async function fixOrder61() {
    const orderId = 61;
    const orderNumber = 'ORD-20260115-079226-J3ASVO';
    const paymentKey = 'tprep202601152144397i7W4';
    const amount = 128000.00;
    const currency = 'KRW';

    let connection;
    try {
        Logger.log('[FIX_ORDER_61] 시작', { orderId, orderNumber });

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 1. 주문 정보 확인
        const [orderRows] = await connection.execute(
            `SELECT order_id, order_number, status, total_price, user_id
             FROM orders 
             WHERE order_id = ?`,
            [orderId]
        );

        if (orderRows.length === 0) {
            throw new Error(`주문을 찾을 수 없습니다: order_id=${orderId}`);
        }

        const order = orderRows[0];
        Logger.log('[FIX_ORDER_61] 주문 정보 확인', {
            order_id: order.order_id,
            order_number: order.order_number,
            status: order.status,
            total_price: order.total_price
        });

        // 2. payments 테이블 확인
        const [paymentRows] = await connection.execute(
            `SELECT payment_id, payment_key, status, amount, currency
             FROM payments
             WHERE order_number = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [orderNumber]
        );

        if (paymentRows.length === 0) {
            throw new Error(`결제 정보를 찾을 수 없습니다: order_number=${orderNumber}`);
        }

        const payment = paymentRows[0];
        Logger.log('[FIX_ORDER_61] 결제 정보 확인', {
            payment_id: payment.payment_id,
            payment_key: payment.payment_key,
            status: payment.status,
            amount: payment.amount
        });

        // 3. paid_events 확인 및 생성
        const [paidEventRows] = await connection.execute(
            `SELECT event_id, order_id, payment_key, amount, currency
             FROM paid_events
             WHERE order_id = ?`,
            [orderId]
        );

        let paidEventId;

        if (paidEventRows.length > 0) {
            // 이미 존재하는 경우
            paidEventId = paidEventRows[0].event_id;
            Logger.log('[FIX_ORDER_61] paid_events 이미 존재', {
                event_id: paidEventId
            });
        } else {
            // 생성 필요
            const [insertResult] = await connection.execute(
                `INSERT INTO paid_events 
                 (order_id, payment_key, event_source, amount, currency, raw_payload_json)
                 VALUES (?, ?, 'manual_verify', ?, ?, NULL)`,
                [orderId, payment.payment_key, payment.amount, payment.currency]
            );

            paidEventId = insertResult.insertId;
            Logger.log('[FIX_ORDER_61] paid_events 생성 완료', {
                event_id: paidEventId
            });
        }

        // 4. paid_event_processing 확인 및 생성
        const [processingRows] = await connection.execute(
            `SELECT event_id, status, last_error
             FROM paid_event_processing
             WHERE event_id = ?`,
            [paidEventId]
        );

        if (processingRows.length === 0) {
            await connection.execute(
                `INSERT INTO paid_event_processing 
                 (event_id, status, last_error, retry_count)
                 VALUES (?, 'pending', NULL, 0)`,
                [paidEventId]
            );
            Logger.log('[FIX_ORDER_61] paid_event_processing 생성 완료', {
                event_id: paidEventId
            });
        } else {
            Logger.log('[FIX_ORDER_61] paid_event_processing 이미 존재', {
                event_id: paidEventId,
                status: processingRows[0].status,
                last_error: processingRows[0].last_error
            });
        }

        // 5. processPaidOrder() 실행
        Logger.log('[FIX_ORDER_61] processPaidOrder() 실행 시작', {
            orderId,
            paidEventId,
            paymentKey: payment.payment_key
        });

        const paidResult = await processPaidOrder({
            connection,
            paidEventId: paidEventId,
            orderId: orderId,
            paymentKey: payment.payment_key,
            amount: payment.amount,
            currency: payment.currency,
            eventSource: 'manual_verify',
            rawPayload: null
        });

        await connection.commit();
        await connection.end();

        Logger.log('[FIX_ORDER_61] 완료', {
            orderId,
            paidEventId,
            stockUnitsReserved: paidResult.data.stockUnitsReserved,
            orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
            warrantiesCreated: paidResult.data.warrantiesCreated,
            invoiceNumber: paidResult.data.invoiceNumber
        });

        console.log('✅ 주문 61 수정 완료!');
        console.log(`   - paid_events.event_id: ${paidEventId}`);
        console.log(`   - 재고 배정: ${paidResult.data.stockUnitsReserved}개`);
        console.log(`   - order_item_units 생성: ${paidResult.data.orderItemUnitsCreated}개`);
        console.log(`   - warranties 생성: ${paidResult.data.warrantiesCreated}개`);
        console.log(`   - invoice_number: ${paidResult.data.invoiceNumber || '없음'}`);

    } catch (error) {
        if (connection) {
            await connection.rollback();
            await connection.end();
        }
        Logger.error('[FIX_ORDER_61] 실패', {
            orderId,
            error: error.message,
            error_code: error.code,
            stack: error.stack
        });
        console.error('❌ 주문 61 수정 실패:', error.message);
        process.exit(1);
    }
}

// 스크립트 실행
if (require.main === module) {
    fixOrder61()
        .then(() => process.exit(0))
        .catch((error) => {
            console.error('Fatal error:', error);
            process.exit(1);
        });
}

module.exports = { fixOrder61 };
