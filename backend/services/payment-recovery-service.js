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
 * recovery에서 payment_attempts 패턴을 분석해 자동 복구 가능 여부를 판정.
 * - 개발 단계 기준: 기본값은 'unresolved' (fail-closed)
 * - hold-aware (use_hold=1) attempt가 정확히 1개인 경우에만 mode='hold' 로 자동 복구 허용
 *
 * @param {Object} params
 * @param {Object} params.connection
 * @param {number} params.orderId
 * @param {string} params.paymentKey
 * @param {string} [params.gateway='toss']
 * @returns {Promise<{
 *   mode: 'hold'|'unresolved',
 *   attemptId: number|null,
 *   reasonCode: string,
 *   holdAttemptIds: number[],
 *   legacyAttemptIds: number[],
 *   matchedAttemptIds: number[],
 *   debugContext: Object
 * }>}
 */
async function resolveRecoveryAttempt({
    connection,
    orderId,
    paymentKey,
    gateway = 'toss'
}) {
    const debugContext = { orderId, paymentKey, gateway };
    let attemptRows = [];
    try {
        const [rows] = await connection.execute(
            `SELECT id, use_hold
             FROM payment_attempts
             WHERE order_id = ?
               AND external_ref_id = ?
               AND gateway = ?
             ORDER BY created_at DESC`,
            [orderId, paymentKey, gateway]
        );
        attemptRows = rows || [];
    } catch (err) {
        Logger.error('[payment-recovery] resolveRecoveryAttempt 쿼리 실패', {
            ...debugContext,
            error: err.message
        });
        return {
            mode: 'unresolved',
            attemptId: null,
            reasonCode: 'QUERY_FAILED',
            holdAttemptIds: [],
            legacyAttemptIds: [],
            matchedAttemptIds: [],
            debugContext: { ...debugContext, error: err.message }
        };
    }

    const holdAttempts = attemptRows.filter(r => Number(r.use_hold) === 1);
    const legacyAttempts = attemptRows.filter(r => Number(r.use_hold) === 0);
    const holdAttemptIds = holdAttempts.map(a => a.id);
    const legacyAttemptIds = legacyAttempts.map(a => a.id);
    const matchedAttemptIds = attemptRows.map(a => a.id);

    // 아무 attempt도 없는 경우
    if (attemptRows.length === 0) {
        return {
            mode: 'unresolved',
            attemptId: null,
            reasonCode: 'NO_MATCHING_ATTEMPT',
            holdAttemptIds,
            legacyAttemptIds,
            matchedAttemptIds,
            debugContext
        };
    }

    // hold-aware 단일 attempt만 존재하는 경우에만 자동 복구 허용
    if (holdAttempts.length === 1 && legacyAttempts.length === 0) {
        return {
            mode: 'hold',
            attemptId: holdAttempts[0].id,
            reasonCode: 'HOLD_SINGLE_ATTEMPT',
            holdAttemptIds,
            legacyAttemptIds,
            matchedAttemptIds,
            debugContext
        };
    }

    // hold-only 여러 개
    if (holdAttempts.length > 1 && legacyAttempts.length === 0) {
        return {
            mode: 'unresolved',
            attemptId: null,
            reasonCode: 'MULTIPLE_HOLD_ATTEMPTS',
            holdAttemptIds,
            legacyAttemptIds,
            matchedAttemptIds,
            debugContext
        };
    }

    // legacy-only 여러 개
    if (holdAttempts.length === 0 && legacyAttempts.length > 1) {
        return {
            mode: 'unresolved',
            attemptId: null,
            reasonCode: 'MULTIPLE_LEGACY_ATTEMPTS',
            holdAttemptIds,
            legacyAttemptIds,
            matchedAttemptIds,
            debugContext
        };
    }

    // hold/legacy 섞이거나 그 외 애매한 모든 패턴
    return {
        mode: 'unresolved',
        attemptId: null,
        reasonCode: 'MIXED_HOLD_AND_LEGACY_ATTEMPTS',
        holdAttemptIds,
        legacyAttemptIds,
        matchedAttemptIds,
        debugContext
    };
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
    rawPayload = null,
    attemptId = null
}) {
    return processPaidOrder({
        connection,
        paidEventId,
        orderId,
        paymentKey,
        amount,
        currency,
        eventSource,
        rawPayload,
        attemptId
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

/**
 * 리스트용 추천 액션 후보 계산 (issue 스냅샷만 기반).
 * - live state는 보지 않고, issueCode/reasonCode/useHold만 보고 참고용 candidate를 반환한다.
 *
 * @param {string} issueCode
 * @param {string} reasonCode
 * @param {boolean|number} useHold
 * @returns {{ recommendedActionCandidate: string|null, recommendedActionCandidateLabel: string|null, candidateOnly: boolean }}
 */
function computeRecommendedActionCandidate(issueCode, reasonCode, useHold) {
    const useHoldFlag = !!useHold;

    // 기본값: 후보 없음
    let action = null;
    let label = null;

    if (issueCode === 'UNRESOLVED_ATTEMPT') {
        // 웹훅에서 attempt를 못 찾은 케이스 → 보통 재시도 후보
        action = 'RETRY_RECOVERY';
        label = '자동 복구 재시도 후보 (웹훅 미해결)';
    } else if (issueCode === 'USE_HOLD_RECOVERY_UNRESOLVED') {
        // hold-aware recovery에서 attempt/패턴이 애매한 케이스 → 수동 검토 후보
        action = 'MANUAL_REVIEW';
        label = '수동 검토 필요 (hold/use_hold 패턴 애매함)';
    } else if (issueCode === 'RECOVERY_FAILED') {
        // 기타 복구 실패 계열은 일단 수동 검토 후보
        action = 'MANUAL_REVIEW';
        label = '수동 검토 필요 (복구 실패)';
    }

    // useHold 주문이면 레이블에 힌트 추가
    if (useHoldFlag && label) {
        label += ' / use_hold 주문';
    }

    return {
        recommendedActionCandidate: action,
        recommendedActionCandidateLabel: label,
        candidateOnly: true
    };
}

/**
 * 상세/재시도 전용 최종 추천 액션 계산 (live state 기반).
 *
 * @param {string} issueCode
 * @param {string} reasonCode
 * @param {Object} liveState
 * @returns {{
 *   recommendedAction: string|null,
 *   recommendedActionLabel: string|null,
 *   actionAllowed: boolean,
 *   actionAllowedReason: string|null,
 *   currentReasonCode: string
 * }}
 */
function computeRecommendedAction(issueCode, reasonCode, liveState = {}) {
    const {
        paymentsStatus = null,
        paidEventsCount = 0,
        orderItemUnitsCount = 0,
        hasActiveClaim = false,
        alreadyProcessed = false
    } = liveState;

    let action = null;
    let label = null;
    let allowed = false;
    let allowedReason = null;
    let currentReasonCode = reasonCode || 'UNKNOWN';

    // 예시 규칙: UNRESOLVED_ATTEMPT + liveState가 "결제 완료 + paid_events 있음 + units 없음 + claim 없음 + 아직 미처리"일 때만 재시도 허용
    if (issueCode === 'UNRESOLVED_ATTEMPT') {
        if (
            paymentsStatus === 'captured' &&
            paidEventsCount >= 1 &&
            orderItemUnitsCount === 0 &&
            !hasActiveClaim &&
            !alreadyProcessed
        ) {
            action = 'RETRY_RECOVERY';
            label = '자동 복구 재시도 가능 (웹훅 미해결, 결제 완료 · paid_events 있음 · units 없음)';
            allowed = true;
            allowedReason = 'LIVE_STATE_RETRYABLE';
            currentReasonCode = 'RETRYABLE_UNRESOLVED_ATTEMPT';
        } else {
            action = 'MANUAL_REVIEW';
            label = '조건 미충족: 수동 검토 필요';
            allowed = false;
            allowedReason = 'LIVE_STATE_NOT_RETRYABLE';
            currentReasonCode = 'NON_RETRYABLE_UNRESOLVED_ATTEMPT';
        }
    } else if (issueCode === 'USE_HOLD_RECOVERY_UNRESOLVED') {
        // hold/use_hold 패턴이 애매한 경우는 기본적으로 수동 검토 대상
        action = 'MANUAL_REVIEW';
        label = 'hold/use_hold 패턴이 애매하여 자동 복구 불가 · 수동 검토 필요';
        allowed = false;
        allowedReason = reasonCode || 'HOLD_PATTERN_AMBIGUOUS';
        currentReasonCode = reasonCode || 'HOLD_PATTERN_AMBIGUOUS';
    } else {
        // 그 외 이슈코드는 일단 수동 검토로 모은다.
        action = 'MANUAL_REVIEW';
        label = '수동 검토 필요 (기타 이슈)';
        allowed = false;
        allowedReason = reasonCode || 'MANUAL_REVIEW_REQUIRED';
        currentReasonCode = reasonCode || 'MANUAL_REVIEW_REQUIRED';
    }

    return {
        recommendedAction: action,
        recommendedActionLabel: label,
        actionAllowed: allowed,
        actionAllowedReason: allowedReason,
        currentReasonCode
    };
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
    completeRecoveryAttempt,
    resolveRecoveryAttempt,
    computeRecommendedActionCandidate,
    computeRecommendedAction
};
