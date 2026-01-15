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
    const maxRetries = 3;
    const retryDelay = 1000; // 1초
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let connection;
        try {
            // 별도 커넥션 생성 (autocommit)
            connection = await mysql.createConnection(dbConfig);
            connection.config.autocommit = true;

            Logger.log('[PAID_EVENT_CREATOR] paid_events INSERT 시도', {
                orderId,
                attempt,
                maxRetries,
                paymentKey: paymentKey?.substring(0, 20) + '...',
                amount,
                currency,
                eventSource
            });

            try {
                // INSERT ... ON DUPLICATE KEY UPDATE 사용하여 중복 시 업데이트
                // 이렇게 하면 락 경합을 줄이고 중복 체크도 자동으로 처리됨
                Logger.log('[PAID_EVENT_CREATOR] paid_events INSERT 실행', {
                    orderId,
                    paymentKey: paymentKey?.substring(0, 20) + '...',
                    eventSource,
                    amount,
                    currency,
                    hasRawPayload: !!rawPayload
                });
                
                const [paidEventResult] = await connection.execute(
                    `INSERT INTO paid_events 
                    (order_id, payment_key, event_source, amount, currency, raw_payload_json, confirmed_at, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())
                    ON DUPLICATE KEY UPDATE
                        event_id = LAST_INSERT_ID(event_id),
                        confirmed_at = NOW()`,
                    [orderId, paymentKey, eventSource, amount, currency, rawPayload ? JSON.stringify(rawPayload) : null]
                );
                
                Logger.log('[PAID_EVENT_CREATOR] paid_events INSERT 결과', {
                    orderId,
                    insertId: paidEventResult.insertId,
                    affectedRows: paidEventResult.affectedRows
                });

                const eventId = paidEventResult.insertId || (await connection.execute(
                    `SELECT event_id FROM paid_events 
                     WHERE order_id = ? AND payment_key = ?`,
                    [orderId, paymentKey]
                ))[0][0]?.event_id;

                if (!eventId) {
                    throw new Error('paid_events INSERT 후 event_id를 가져올 수 없습니다.');
                }

                // paid_event_processing 초기 상태 기록 (중복 시 무시)
                await connection.execute(
                    `INSERT IGNORE INTO paid_event_processing 
                    (event_id, status, created_at, updated_at) 
                    VALUES (?, 'pending', NOW(), NOW())`,
                    [eventId]
                );

                Logger.log('[PAID_EVENT_CREATOR] paid_events INSERT 성공', {
                    orderId,
                    eventId,
                    attempt
                });

                await connection.end();

                return {
                    eventId,
                    alreadyExists: paidEventResult.affectedRows === 0 // ON DUPLICATE KEY UPDATE 시 affectedRows는 0
                };

            } catch (error) {
                await connection.end();
                
                // ⚠️ 디버깅: 에러 상세 로깅
                Logger.error('[PAID_EVENT_CREATOR] paid_events INSERT 실패 (내부 catch)', {
                    orderId,
                    attempt,
                    maxRetries,
                    error: error.message,
                    error_code: error.code,
                    error_sql_state: error.sqlState,
                    error_sql_message: error.sqlMessage,
                    stack: error.stack
                });
                
                // ER_LOCK_WAIT_TIMEOUT 또는 ER_LOCK_DEADLOCK인 경우 재시도
                if ((error.code === 'ER_LOCK_WAIT_TIMEOUT' || error.code === 'ER_LOCK_DEADLOCK') && attempt < maxRetries) {
                    const delay = retryDelay * attempt; // 지수 백오프
                    Logger.warn('[PAID_EVENT_CREATOR] 락 대기 시간 초과, 재시도 예정', {
                        orderId,
                        attempt,
                        maxRetries,
                        error_code: error.code,
                        delay_ms: delay
                    });
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue; // 재시도
                }
                
                // ER_DUP_ENTRY인 경우 기존 레코드 조회
                if (error.code === 'ER_DUP_ENTRY') {
                    Logger.log('[PAID_EVENT_CREATOR] 이미 존재하는 paid_events (ER_DUP_ENTRY)', {
                        orderId,
                        paymentKey: paymentKey?.substring(0, 20) + '...'
                    });

                    // 별도 커넥션으로 기존 레코드 조회
                    const checkConnection = await mysql.createConnection(dbConfig);
                    checkConnection.config.autocommit = true;
                    
                    const [existing] = await checkConnection.execute(
                        `SELECT event_id FROM paid_events 
                         WHERE order_id = ? AND payment_key = ?`,
                        [orderId, paymentKey]
                    );

                    await checkConnection.end();

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
            // 마지막 시도에서도 실패한 경우
            if (attempt === maxRetries) {
                Logger.error('[PAID_EVENT_CREATOR] paid_events 생성 실패 (모든 재시도 실패)', {
                    orderId,
                    attempt,
                    maxRetries,
                    error: error.message,
                    error_code: error.code,
                    stack: error.stack
                });
                throw error;
            }
            
            // 재시도 가능한 에러인 경우 계속
            if (error.code === 'ER_LOCK_WAIT_TIMEOUT' || error.code === 'ER_LOCK_DEADLOCK') {
                continue;
            }
            
            // 재시도 불가능한 에러인 경우 즉시 throw
            throw error;
        }
    }
    
    // 모든 재시도 실패 (이 코드는 도달하지 않아야 하지만 방어 코드)
    throw new Error('paid_events 생성 실패: 모든 재시도 실패');
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
