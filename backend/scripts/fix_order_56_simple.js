/**
 * 주문 56 간단 수동 처리 스크립트
 * 
 * paid_events가 이미 생성된 경우 사용
 * 
 * 사용법:
 * node scripts/fix_order_56_simple.js
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const { processPaidOrder } = require('../utils/paid-order-processor');

const ORDER_ID = 56;

async function fixOrder56Simple() {
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

        // 1. paid_events 확인
        const [paidEvents] = await connection.execute(
            `SELECT event_id, order_id, payment_key, amount, currency 
             FROM paid_events 
             WHERE order_id = ? 
             ORDER BY created_at DESC 
             LIMIT 1`,
            [ORDER_ID]
        );

        if (paidEvents.length === 0) {
            console.error('❌ paid_events를 찾을 수 없습니다. fix_order_56_manual.sql을 먼저 실행하세요.');
            process.exit(1);
        }

        const paidEvent = paidEvents[0];
        console.log('✅ paid_events 확인:', {
            event_id: paidEvent.event_id,
            order_id: paidEvent.order_id,
            payment_key: paidEvent.payment_key.substring(0, 20) + '...',
            amount: paidEvent.amount
        });

        // 2. paid_event_processing 확인 및 생성
        const [processing] = await connection.execute(
            `SELECT event_id, status, last_error 
             FROM paid_event_processing 
             WHERE event_id = ?`,
            [paidEvent.event_id]
        );

        if (processing.length === 0) {
            console.log('📝 paid_event_processing 생성 중...');
            await connection.execute(
                `INSERT INTO paid_event_processing 
                 (event_id, status, created_at, updated_at) 
                 VALUES (?, 'pending', NOW(), NOW())`,
                [paidEvent.event_id]
            );
            console.log('✅ paid_event_processing 생성 완료');
        } else {
            console.log('✅ 기존 paid_event_processing 사용:', processing[0].status);
            if (processing[0].status === 'success') {
                console.log('⚠️  이미 처리 완료된 주문입니다. 중복 처리 시도합니다...');
            }
        }

        // 3. 트랜잭션 시작
        await connection.beginTransaction();

        console.log('🔄 processPaidOrder() 실행 중...');

        // 4. processPaidOrder() 실행
        const result = await processPaidOrder({
            connection,
            paidEventId: paidEvent.event_id,
            orderId: ORDER_ID,
            paymentKey: paidEvent.payment_key,
            amount: parseFloat(paidEvent.amount),
            currency: paidEvent.currency || 'KRW',
            eventSource: 'manual_verify',
            rawPayload: null
        });

        // 5. 트랜잭션 커밋
        await connection.commit();

        console.log('✅ 처리 완료:', result);

        // 6. 최종 상태 확인
        const [finalOrder] = await connection.execute(
            `SELECT order_id, status, paid_at FROM orders WHERE order_id = ?`,
            [ORDER_ID]
        );

        const [finalWarranties] = await connection.execute(
            `SELECT COUNT(*) as count FROM warranties 
             WHERE source_order_item_unit_id IN (
                 SELECT order_item_unit_id FROM order_item_units WHERE order_id = ?
             )`,
            [ORDER_ID]
        );

        const [finalInvoices] = await connection.execute(
            `SELECT COUNT(*) as count FROM invoices WHERE order_id = ?`,
            [ORDER_ID]
        );

        console.log('📊 최종 상태:');
        console.log('  - 주문:', finalOrder[0]);
        console.log('  - 보증서:', finalWarranties[0].count, '개');
        console.log('  - 인보이스:', finalInvoices[0].count, '개');

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

fixOrder56Simple();
