/**
 * paid-event-creator.js
 * 
 * paid_events 생성 유틸리티 (트랜잭션 분리)
 * 
 * 핵심 원칙:
 * - paid_events는 "결제 증거"로 항상 남겨야 함
 * - 별도 커넥션(autocommit)으로 먼저 커밋
 * - 이후 주문 처리 트랜잭션과 분리
 */

const mysql = require('mysql2/promise');
const Logger = require('../logger');
require('dotenv').config();

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * paid_events 생성 (별도 커넥션, autocommit)
 * 
 * @param {Object} params - 생성 파라미터
 * @param {number} params.orderId - 주문 ID
 * @param {string} params.paymentKey - 결제 키
 * @param {number} params.amount - 결제 금액
 * @param {string} params.currency - 통화
 * @param {string} params.eventSource - 이벤트 소스
 * @param {Object} params.rawPayload - 원본 결제 응답
 * 
 * @returns {Promise<Object>} { eventId, alreadyExists }
 */
async function createPaidEvent({
    orderId,
    paymentKey,
    amount,
    currency = 'KRW',
    eventSource = 'redirect',
    rawPayload = null
}) {
    let connection;
    try {
        // 별도 커넥션 생성 (autocommit)
        connection = await mysql.createConnection(dbConfig);
        connection.config.autocommit = true;

        Logger.log('[PAID_EVENT_CREATOR] paid_events INSERT 시도', {
            orderId,
            paymentKey: paymentKey?.substring(0, 20) + '...'
        });

        try {
            const [paidEventResult] = await connection.execute(
                `INSERT INTO paid_events 
                (order_id, payment_key, event_source, amount, currency, raw_payload_json, confirmed_at, created_at) 
                VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                [orderId, paymentKey, eventSource, amount, currency, rawPayload ? JSON.stringify(rawPayload) : null]
            );

            const eventId = paidEventResult.insertId;

            // paid_event_processing 초기 상태 기록
            await connection.execute(
                `INSERT INTO paid_event_processing 
                (event_id, status, created_at, updated_at) 
                VALUES (?, 'pending', NOW(), NOW())`,
                [eventId]
            );

            Logger.log('[PAID_EVENT_CREATOR] paid_events INSERT 성공', {
                orderId,
                eventId
            });

            await connection.end();

            return {
                eventId,
                alreadyExists: false
            };

        } catch (error) {
            if (error.code === 'ER_DUP_ENTRY') {
                // 이미 존재하는 경우 event_id 조회
                Logger.log('[PAID_EVENT_CREATOR] 이미 존재하는 paid_events', {
                    orderId,
                    paymentKey: paymentKey?.substring(0, 20) + '...'
                });

                const [existing] = await connection.execute(
                    `SELECT event_id FROM paid_events 
                     WHERE order_id = ? AND payment_key = ?`,
                    [orderId, paymentKey]
                );

                await connection.end();

                if (existing.length > 0) {
                    return {
                        eventId: existing[0].event_id,
                        alreadyExists: true
                    };
                }
            }
            throw error;
        }

    } catch (error) {
        Logger.error('[PAID_EVENT_CREATOR] paid_events 생성 실패', {
            orderId,
            error: error.message,
            error_code: error.code,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        throw error;
    }
}

/**
 * paid_event_processing 상태 업데이트
 * 
 * @param {number} eventId - paid_events.event_id
 * @param {string} status - 'pending', 'processing', 'success', 'failed'
 * @param {string} lastError - 에러 메시지 (실패 시)
 */
async function updateProcessingStatus(eventId, status, lastError = null) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        connection.config.autocommit = true;

        await connection.execute(
            `UPDATE paid_event_processing 
             SET status = ?, 
                 last_error = ?, 
                 processed_at = NOW(), 
                 updated_at = NOW()
             WHERE event_id = ?`,
            [status, lastError, eventId]
        );

        await connection.end();

        Logger.log('[PAID_EVENT_CREATOR] 처리 상태 업데이트', {
            eventId,
            status,
            hasError: !!lastError
        });

    } catch (error) {
        Logger.error('[PAID_EVENT_CREATOR] 처리 상태 업데이트 실패', {
            eventId,
            status,
            error: error.message
        });

        if (connection) {
            await connection.end();
        }

        // 상태 업데이트 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
}

/**
 * 재고 부족 이슈 기록
 * 
 * @param {number} eventId - paid_events.event_id
 * @param {number} orderId - orders.order_id
 * @param {string} productId - admin_products.id
 * @param {number} requiredQty - 필요 수량
 * @param {number} availableQty - 가용 수량
 */
async function recordStockIssue(eventId, orderId, productId, requiredQty, availableQty) {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);
        connection.config.autocommit = true;

        await connection.execute(
            `INSERT INTO order_stock_issues 
            (order_id, event_id, product_id, required_qty, available_qty, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'open', NOW(), NOW())`,
            [orderId, eventId, productId, requiredQty, availableQty]
        );

        await connection.end();

        Logger.log('[PAID_EVENT_CREATOR] 재고 부족 이슈 기록', {
            eventId,
            orderId,
            productId,
            requiredQty,
            availableQty
        });

    } catch (error) {
        Logger.error('[PAID_EVENT_CREATOR] 재고 부족 이슈 기록 실패', {
            eventId,
            orderId,
            productId,
            error: error.message
        });

        if (connection) {
            await connection.end();
        }

        // 이슈 기록 실패는 치명적이지 않으므로 에러를 던지지 않음
    }
}

module.exports = {
    createPaidEvent,
    updateProcessingStatus,
    recordStockIssue
};
