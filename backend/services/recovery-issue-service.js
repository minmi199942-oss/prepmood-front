const Logger = require('../logger');

/**
 * recovery 이슈 관측용 투영본(recovery_issues) upsert.
 * - SSOT 아님. orders/payment_attempts/paid_events/... 원본 상태를 덮어쓰지 않는다.
 *
 * @param {Object} params
 * @param {Object} params.connection - MySQL connection
 * @param {number} params.orderId
 * @param {string} params.paymentKey
 * @param {string} params.issueCode - 상위 이슈 코드 (예: USE_HOLD_RECOVERY_UNRESOLVED, UNRESOLVED_ATTEMPT 등)
 * @param {string} params.reasonCode - 세부 진단 코드 (예: NO_MATCHING_ATTEMPT 등)
 * @param {string|null} [params.recommendedAction] - 서버가 판단한 권장 액션 코드
 * @param {number} [params.useHold] - 1|0 (use_hold 주문 여부)
 * @param {Object} [params.payloadSnapshot] - 선택 스냅샷 (JSON으로 저장)
 */
async function upsertRecoveryIssue({
    connection,
    orderId,
    paymentKey,
    issueCode,
    reasonCode,
    recommendedAction = null,
    useHold = 0,
    payloadSnapshot = null
}) {
    try {
        const snapshotJson = payloadSnapshot ? JSON.stringify(payloadSnapshot) : null;
        await connection.execute(
            `INSERT INTO recovery_issues
                 (order_id, payment_key, issue_code, reason_code, recommended_action, use_hold, first_seen_at, last_seen_at, last_retry_result, last_error_code, payload_snapshot)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW(), NULL, NULL, ?)
             ON DUPLICATE KEY UPDATE
                 reason_code = VALUES(reason_code),
                 recommended_action = VALUES(recommended_action),
                 use_hold = VALUES(use_hold),
                 last_seen_at = NOW(),
                 payload_snapshot = COALESCE(VALUES(payload_snapshot), recovery_issues.payload_snapshot)`,
            [orderId, paymentKey, issueCode, reasonCode, recommendedAction, useHold ? 1 : 0, snapshotJson]
        );
    } catch (error) {
        Logger.error('[recovery-issue-service] upsertRecoveryIssue 실패', {
            orderId,
            paymentKey,
            issueCode,
            reasonCode,
            error: error.message
        });
    }
}

/**
 * recovery 액션 감사 로그 기록.
 *
 * @param {Object} params
 * @param {Object} params.connection
 * @param {number|null} [params.issueId]
 * @param {number} params.orderId
 * @param {string} params.actor
 * @param {string} params.action
 * @param {string} [params.actorType]
 * @param {string} [params.requestId]
 * @param {string|null} [params.issueCode]
 * @param {string|null} [params.reasonCode]
 * @param {Object|null} [params.preStateSnapshot]
 * @param {string} params.result
 * @param {string|null} [params.errorCode]
 */
async function logRecoveryAction({
    connection,
    issueId = null,
    orderId,
    actor,
    action,
    actorType = 'admin',
    requestId = null,
    issueCode = null,
    reasonCode = null,
    preStateSnapshot = null,
    result,
    errorCode = null
}) {
    try {
        const snapshotJson = preStateSnapshot ? JSON.stringify(preStateSnapshot) : null;
        await connection.execute(
            `INSERT INTO recovery_action_logs
                 (issue_id, order_id, actor, actor_type, request_id, action, issue_code, reason_code, pre_state_snapshot, result, error_code, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
            [issueId, orderId, actor, actorType, requestId, action, issueCode, reasonCode, snapshotJson, result, errorCode]
        );
    } catch (error) {
        Logger.error('[recovery-issue-service] logRecoveryAction 실패', {
            issueId,
            orderId,
            actor,
            action,
            result,
            error: error.message
        });
    }
}

module.exports = {
    upsertRecoveryIssue,
    logRecoveryAction
};

