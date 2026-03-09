/**
 * paid-event-creator.js
 *
 * paid_events 생성 유틸리티 (트랜잭션 분리)
 *
 * 핵심 원칙:
 * - paid_events는 "결제 증거"로 항상 남겨야 함 (불변: INSERT만, 중복 시 기존 행 참조)
 * - 별도 커넥션(autocommit)으로 먼저 커밋
 * - 이후 주문 처리 트랜잭션과 분리
 *
 * 수정 반영 (PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION.md):
 * - Promise.race 제거 → 풀 누수(좀비 커넥션) 방지, queueLimit으로 fail-fast
 * - ODKU 제거 → INSERT + ER_DUP_ENTRY 시 SELECT (증거 불변성, alreadyExists 정확 판정)
 * - rawPayload: 루프 밖 1회 stringify, 64KB 상한
 * - updateProcessingStatus/recordStockIssue: 실패 시 throw (유령 주문 방지)
 */

const Logger = require('../logger');
const { pool } = require('../db');
require('dotenv').config();

/** raw_payload_json 최대 길이 (바이트). MySQL/네트워크 부하·악용 방지 */
const RAW_PAYLOAD_MAX_LENGTH = 65535;

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

    // [성능/보안] 루프 밖에서 1회만 직렬화 및 크기 제한 (문서 §4)
    const payloadString = rawPayload
        ? JSON.stringify(rawPayload).substring(0, RAW_PAYLOAD_MAX_LENGTH)
        : null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        let connection;
        try {
            // [풀 누수 방지] Promise.race 제거. queueLimit으로 풀 고갈 시 즉시 에러 (문서 §1)
            connection = await pool.getConnection();
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
                // [증거 불변성] INSERT만 사용. 중복 시 ER_DUP_ENTRY → SELECT로 기존 event_id 반환 (문서 §2, §8.2)
                Logger.log('[PAID_EVENT_CREATOR] paid_events INSERT 실행', {
                    orderId,
                    paymentKey: paymentKey?.substring(0, 20) + '...',
                    eventSource,
                    amount,
                    currency,
                    hasRawPayload: !!rawPayload
                });

                const [result] = await connection.execute(
                    `INSERT INTO paid_events 
                    (order_id, payment_key, event_source, amount, currency, raw_payload_json, confirmed_at, created_at) 
                    VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [orderId, paymentKey, eventSource, amount, currency, payloadString]
                );

                const eventId = result.insertId;
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

                return { eventId, alreadyExists: false };
            } catch (innerError) {
                // ER_DUP_ENTRY: 이미 완료된 주문 재요청(뒤로가기·멱등) → 기존 event_id 반환
                if (innerError.code === 'ER_DUP_ENTRY') {
                    Logger.log('[PAID_EVENT_CREATOR] 이미 존재하는 paid_events (ER_DUP_ENTRY)', {
                        orderId,
                        paymentKey: paymentKey?.substring(0, 20) + '...'
                    });
                    const [rows] = await connection.execute(
                        `SELECT event_id FROM paid_events 
                         WHERE order_id = ? AND payment_key = ?`,
                        [orderId, paymentKey]
                    );
                    if (rows.length > 0) {
                        return { eventId: rows[0].event_id, alreadyExists: true };
                    }
                    // SELECT 실패(이론상 없음) 시 원래 에러 전파
                }

                // ER_LOCK_WAIT_TIMEOUT / ER_LOCK_DEADLOCK → 재시도
                if (
                    (innerError.code === 'ER_LOCK_WAIT_TIMEOUT' || innerError.code === 'ER_LOCK_DEADLOCK') &&
                    attempt < maxRetries
                ) {
                    const delay = retryDelay * attempt;
                    Logger.warn('[PAID_EVENT_CREATOR] 락 대기/데드락, 재시도 예정', {
                        orderId,
                        attempt,
                        maxRetries,
                        error_code: innerError.code,
                        delay_ms: delay
                    });
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }

                Logger.error('[PAID_EVENT_CREATOR] paid_events INSERT 실패 (내부 catch)', {
                    orderId,
                    attempt,
                    maxRetries,
                    error: innerError.message,
                    error_code: innerError.code
                });
                throw innerError;
            } finally {
                if (connection) connection.release();
            }
        } catch (error) {
            if (attempt === maxRetries) {
                Logger.error('[PAID_EVENT_CREATOR] paid_events 생성 실패 (모든 재시도 실패)', {
                    orderId,
                    attempt,
                    maxRetries,
                    error: error.message,
                    error_code: error.code
                });
                throw error;
            }
            // 재시도 가능: 락 타임아웃/데드락만 (풀 race 제거로 POOL_ACQUIRE_TIMEOUT 재시도 제거)
            if (
                (error.code === 'ER_LOCK_WAIT_TIMEOUT' || error.code === 'ER_LOCK_DEADLOCK') &&
                attempt < maxRetries
            ) {
                const delay = retryDelay * attempt;
                Logger.warn('[PAID_EVENT_CREATOR] 재시도 예정', {
                    orderId,
                    attempt,
                    reason: error.code,
                    delay_ms: delay
                });
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            throw error;
        }
    }

    throw new Error('paid_events 생성 실패: 모든 재시도 실패');
}

/**
 * paid_event_processing 상태 업데이트
 *
 * @param {number} eventId - paid_events.event_id
 * @param {string} status - 'pending', 'processing', 'success', 'failed'
 * @param {string} lastError - 에러 메시지 (실패 시)
 * @throws 실패 시 에러 전파 (유령 주문 방지. 문서 §3, §8.3.2)
 */
async function updateProcessingStatus(eventId, status, lastError = null) {
    let connection = null;
    try {
        connection = await pool.getConnection();
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
        throw error;
    } finally {
        if (connection) connection.release();
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
 * @throws 실패 시 에러 전파 (문서 §3)
 */
async function recordStockIssue(eventId, orderId, productId, requiredQty, availableQty) {
    let connection = null;
    try {
        connection = await pool.getConnection();
        connection.config.autocommit = true;

        await connection.execute(
            `INSERT INTO order_stock_issues 
            (order_id, event_id, product_id, required_qty, available_qty, status, created_at, updated_at) 
            VALUES (?, ?, ?, ?, ?, 'open', NOW(), NOW())`,
            [orderId, eventId, productId, requiredQty, availableQty]
        );

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
        throw error;
    } finally {
        if (connection) connection.release();
    }
}

module.exports = {
    createPaidEvent,
    updateProcessingStatus,
    recordStockIssue
};
