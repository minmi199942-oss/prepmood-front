/**
 * payment-recovery-service.js
 *
 * 결제 복구·후처리 오케스트레이션 서비스.
 * - markAttemptRecoveryRequired: stale 감지 시 REQUIRED 마킹만 (provider/paid_events 접근 금지)
 * - claimRecoveryAttempt: recovery 실행 시 REQUIRED → IN_PROGRESS 원자적 선점
 * - ensurePaidEvent, ensurePaidEventProcessing, processPaidEventIfNeeded: confirm/webhook/recovery 공통
 *
 * 문서: PAYMENT_ORDER_SECURITY_CHECKLIST.md
 */

const Logger = require('../logger');
const { createPaidEvent } = require('../utils/paid-event-creator');
const { processPaidOrder } = require('../utils/paid-order-processor');

/** recovery_status 상수 */
const RECOVERY_REQUIRED = 'REQUIRED';
const RECOVERY_IN_PROGRESS = 'IN_PROGRESS';
const RECOVERY_DONE = 'DONE';

/**
 * payment_attempts.recovery_status를 REQUIRED로 마킹 (mark-only, 복구 실행 금지)
 * Phase 1 stale / webhook 실패 시 호출. provider/paid_events 조회 없음.
 * NULL/REQUIRED일 때만 설정. IN_PROGRESS/DONE 덮어쓰기 금지 (상태 역행 방지).
 *
 * @param {Object} connection - MySQL connection (트랜잭션 내)
 * @param {number} attemptId - payment_attempts.id
 * @param {string} [reason] - 마킹 사유 (로그용)
 * @param {string} [source] - 호출 출처 ('phase1'|'webhook'|'recovery')
 * @param {number} [orderId] - order_id (로그용, 가능 시)
 * @returns {Promise<{ marked: boolean }>}
 */
async function markAttemptRecoveryRequired(connection, attemptId, reason = 'stale', source = 'phase1', orderId = null) {
    const [result] = await connection.execute(
        `UPDATE payment_attempts SET recovery_status = ? WHERE id = ? AND (recovery_status IS NULL OR recovery_status = ?)`,
        [RECOVERY_REQUIRED, attemptId, RECOVERY_REQUIRED]
    );
    const marked = result.affectedRows > 0;
    if (marked) {
        Logger.log('[payment-recovery] recovery_status=REQUIRED 마킹', {
            attemptId,
            reason,
            source,
            orderId
        });
    }
    return { marked };
}

/**
 * REQUIRED → IN_PROGRESS 원자적 선점. affectedRows=1일 때만 성공.
 * SELECT 후 UPDATE 금지. recovery 스크립트에서 호출.
 *
 * @param {Object} connection - MySQL connection
 * @param {number} attemptId - payment_attempts.id
 * @returns {Promise<{ claimed: boolean }>}
 */
async function claimRecoveryAttempt(connection, attemptId) {
    const [result] = await connection.execute(
        `UPDATE payment_attempts SET recovery_status = ? WHERE id = ? AND recovery_status = ?`,
        [RECOVERY_IN_PROGRESS, attemptId, RECOVERY_REQUIRED]
    );
    const claimed = result.affectedRows === 1;
    if (!claimed) {
        Logger.log('[payment-recovery] claim 실패 (이미 선점됨 또는 REQUIRED 아님)', { attemptId });
    }
    return { claimed };
}

/**
 * paid_events가 없으면 생성, 있으면 기존 event_id 반환.
 * createPaidEvent 래핑. 멱등성: UNIQUE 충돌 시 기존 행 참조.
 *
 * 주의: createPaidEvent는 별도 커넥션(autocommit) 사용. webhook 처리 중 트랜잭션 일관성에 유의.
 * (paid_events는 "결제 증거"로 processPaidOrder 롤백과 무관하게 유지되어야 함)
 *
 * @param {Object} params
 * @param {number} params.orderId
 * @param {string} params.paymentKey
 * @param {number} params.amount
 * @param {string} [params.currency='KRW']
 * @param {string} [params.eventSource='redirect']
 * @param {Object} [params.rawPayload]
 * @param {number} [params.requestStartedAt]
 * @returns {Promise<{ eventId: number, alreadyExists: boolean }>}
 */
async function ensurePaidEvent({
    orderId,
    paymentKey,
    amount,
    currency = 'KRW',
    eventSource = 'redirect',
    rawPayload = null,
    requestStartedAt = null
}) {
    return createPaidEvent({
        orderId,
        paymentKey,
        amount,
        currency,
        eventSource,
        rawPayload,
        requestStartedAt
    });
}

/**
 * paid_event_processing row 보장. 없으면 INSERT IGNORE.
 *
 * @param {Object} connection - MySQL connection
 * @param {number} paidEventId - paid_events.event_id
 */
async function ensurePaidEventProcessing(connection, paidEventId) {
    await connection.execute(
        `INSERT IGNORE INTO paid_event_processing (event_id, status, created_at, updated_at)
         VALUES (?, 'pending', NOW(), NOW())`,
        [paidEventId]
    );
}

/**
 * processPaidOrder 호출. success 여부 판단은 processPaidOrder 내부에 위임.
 * (processPaidOrder가 pep.status='success' 체크 후 early return 수행)
 *
 * @param {Object} params
 * @param {Object} params.connection
 * @param {number} params.paidEventId
 * @param {number} params.orderId
 * @param {string} params.paymentKey
 * @param {number} params.amount
 * @param {string} [params.currency='KRW']
 * @param {string} [params.eventSource='redirect']
 * @param {Object} [params.rawPayload]
 * @returns {Promise<Object>} processPaidOrder 반환값
 */
async function processPaidEvent({
    connection,
    paidEventId,
    orderId,
    paymentKey,
    amount,
    currency = 'KRW',
    eventSource = 'redirect',
    rawPayload = null
}) {
    return processPaidOrder({
        connection,
        paidEventId,
        orderId,
        paymentKey,
        amount,
        currency,
        eventSource,
        rawPayload
    });
}

/**
 * recovery 성공 시 recovery_status=DONE 전이.
 * IN_PROGRESS → DONE만 허용 (선점 없이 DONE 전이 방지).
 *
 * @param {Object} connection
 * @param {number} attemptId
 * @returns {Promise<{ completed: boolean }>}
 */
async function completeRecoveryAttempt(connection, attemptId) {
    const [result] = await connection.execute(
        `UPDATE payment_attempts SET recovery_status = ? WHERE id = ? AND recovery_status = ?`,
        [RECOVERY_DONE, attemptId, RECOVERY_IN_PROGRESS]
    );
    const completed = result.affectedRows === 1;
    if (completed) {
        Logger.log('[payment-recovery] recovery_status=DONE', { attemptId });
    }
    return { completed };
}

module.exports = {
    RECOVERY_REQUIRED,
    RECOVERY_IN_PROGRESS,
    RECOVERY_DONE,
    markAttemptRecoveryRequired,
    claimRecoveryAttempt,
    ensurePaidEvent,
    ensurePaidEventProcessing,
    processPaidEvent,
    completeRecoveryAttempt
};
