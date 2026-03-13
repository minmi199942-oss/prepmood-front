/**
 * recovery-admin-routes.js
 *
 * 결제/주문 복구 이슈 조회 전용 관리자 API.
 * - GET /api/admin/recovery/issues       : 리스트 조회 (완전 read-only)
 * - GET /api/admin/recovery/issues/:id   : 단건 상세 + live state + 추천 액션
 *     · 비즈니스 상태(orders/payments/stock)는 변경하지 않지만,
 *       recovery_action_logs에 VIEW_ISSUE_DETAIL 감사 로그를 1건 기록하는
 *       "관측 + 감사 로그용" 관리자 API.
 *
 * 설계 참고: GPT_PAYMENT_STOCK_FEEDBACK_REVIEW.md §7.2, ORDER_RECOVERY_GUIDE.md
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const Logger = require('./logger');
const {
    computeRecommendedActionCandidate,
    computeRecommendedAction,
    resolveRecoveryAttempt
} = require('./services/payment-recovery-service');
const { logRecoveryAction } = require('./services/recovery-issue-service');

require('dotenv').config();

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * 공통: 안전한 정수 파싱 (최소/최대 범위 제한)
 */
function parseIntSafe(value, defaultValue, { min, max }) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return defaultValue;
    if (typeof min === 'number' && n < min) return min;
    if (typeof max === 'number' && n > max) return max;
    return n;
}

/**
 * payload_snapshot 화이트리스트 직렬화
 * - DB에는 raw-ish JSON을 저장하더라도,
 *   응답에는 최소한의 필드만 노출한다.
 */
function sanitizePayloadSnapshot(raw) {
    if (!raw) return null;
    let parsed;
    try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    } catch (e) {
        return null;
    }
    return {
        orderId: parsed.orderId ?? null,
        paymentKey: parsed.paymentKey ?? null,
        gateway: parsed.gateway ?? null,
        reasonCode: parsed.reasonCode ?? null,
        holdAttemptIds: Array.isArray(parsed.holdAttemptIds) ? parsed.holdAttemptIds : [],
        legacyAttemptIds: Array.isArray(parsed.legacyAttemptIds) ? parsed.legacyAttemptIds : [],
        matchedAttemptIds: Array.isArray(parsed.matchedAttemptIds) ? parsed.matchedAttemptIds : []
    };
}

/**
 * GET /api/admin/recovery/issues
 * - recovery_issues 투영본 리스트 조회 (읽기 전용)
 * - 서버에서 candidate 추천 액션 계산 (snapshot 기반)
 */
router.get('/admin/recovery/issues', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const page = parseIntSafe(req.query.page, 1, { min: 1, max: 1000 });
        const pageSize = parseIntSafe(req.query.pageSize || req.query.limit, 20, { min: 1, max: 100 });
        const offset = (page - 1) * pageSize;

        connection = await mysql.createConnection(dbConfig);

        // 총 개수
        const [[countRow]] = await connection.execute(
            'SELECT COUNT(*) AS total FROM recovery_issues'
        );
        const total = countRow ? Number(countRow.total) || 0 : 0;

        // 목록 조회: orders 조인으로 order_number 노출
        // 일부 MySQL 버전에서 LIMIT ? OFFSET ? 바인딩이 mysqld_stmt_execute 오류를 유발할 수 있어,
        // 검증된 정수 값만 사용하여 안전하게 문자열로 삽입한다.
        const [rows] = await connection.execute(
            `SELECT
                 ri.id,
                 ri.order_id,
                 o.order_number,
                 ri.payment_key,
                 ri.issue_code,
                 ri.reason_code,
                 ri.recommended_action,
                 ri.use_hold,
                 ri.first_seen_at,
                 ri.last_seen_at,
                 ri.last_retry_result,
                 ri.last_error_code
             FROM recovery_issues ri
             LEFT JOIN orders o ON o.order_id = ri.order_id
             ORDER BY ri.last_seen_at DESC
             LIMIT ${pageSize} OFFSET ${offset}`
        );

        const items = (rows || []).map((row) => {
            const candidate = computeRecommendedActionCandidate(
                row.issue_code,
                row.reason_code,
                row.use_hold
            );

            return {
                id: row.id,
                orderId: row.order_id,
                orderNumber: row.order_number || null,
                paymentKey: row.payment_key,
                issueCode: row.issue_code,
                reasonCode: row.reason_code,
                recommendedActionSnapshot: row.recommended_action,
                useHold: Number(row.use_hold) === 1,
                firstSeenAt: row.first_seen_at,
                lastSeenAt: row.last_seen_at,
                lastRetryResult: row.last_retry_result,
                lastErrorCode: row.last_error_code,
                recommendedActionCandidate: candidate.recommendedActionCandidate,
                recommendedActionCandidateLabel: candidate.recommendedActionCandidateLabel,
                candidateOnly: candidate.candidateOnly
            };
        });

        res.json({
            success: true,
            data: {
                items,
                pagination: {
                    page,
                    pageSize,
                    total
                }
            }
        });
    } catch (error) {
        if (connection) {
            await connection.end();
        }
        Logger.error('[recovery-admin] 리스트 조회 실패', {
            error: error.message
        });
        return res.status(500).json({
            success: false,
            message: '복구 이슈 목록 조회 중 오류가 발생했습니다.'
        });
    }

    if (connection) {
        await connection.end();
    }
});

/**
 * GET /api/admin/recovery/issues/:id
 * - 단일 recovery_issue + live state 요약 + 추천 액션
 * - orders/payments/stock 등 비즈니스 상태는 변경하지 않지만,
 *   recovery_action_logs에 VIEW_ISSUE_DETAIL 감사 로그를 1건 기록한다.
 */
router.get('/admin/recovery/issues/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    const issueId = parseIntSafe(req.params.id, NaN, { min: 1 });
    if (!issueId || Number.isNaN(issueId)) {
        return res.status(400).json({
            success: false,
            message: '유효하지 않은 issue id 입니다.'
        });
    }

    try {
        connection = await mysql.createConnection(dbConfig);

        // 1) 이슈 기본 정보
        const [issueRows] = await connection.execute(
            `SELECT
                 ri.id,
                 ri.order_id,
                 ri.payment_key,
                 ri.issue_code,
                 ri.reason_code,
                 ri.recommended_action,
                 ri.use_hold,
                 ri.first_seen_at,
                 ri.last_seen_at,
                 ri.last_retry_result,
                 ri.last_error_code,
                 ri.payload_snapshot,
                 o.order_number
             FROM recovery_issues ri
             LEFT JOIN orders o ON o.order_id = ri.order_id
             WHERE ri.id = ?
             LIMIT 1`,
            [issueId]
        );

        if (!issueRows || issueRows.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '해당 이슈를 찾을 수 없습니다.'
            });
        }

        const issue = issueRows[0];
        const orderId = issue.order_id;
        const paymentKey = issue.payment_key;

        // 2) live state 조회 (orders/payments/paid_events/order_item_units/payment_attempts/invoices)
        const [[orderRow]] = await connection.execute(
            `SELECT order_id, order_number, status
             FROM orders
             WHERE order_id = ?
             LIMIT 1`,
            [orderId]
        );

        const [[paymentRow]] = await connection.execute(
            `SELECT payment_key, status
             FROM payments
             WHERE payment_key = ?
             ORDER BY created_at DESC
             LIMIT 1`,
            [paymentKey]
        );

        const [[countsRow]] = await connection.execute(
            `SELECT
                 (SELECT COUNT(*) FROM paid_events pe WHERE pe.order_id = ? AND pe.payment_key = ?) AS paid_events_count,
                 (SELECT COUNT(*) FROM order_item_units oi WHERE oi.order_id = ?) AS order_item_units_count,
                 (SELECT COUNT(*) FROM paid_event_processing pep
                     INNER JOIN paid_events pe2 ON pe2.event_id = pep.event_id
                     WHERE pe2.order_id = ? AND pe2.payment_key = ? AND pep.status = 'success') AS processed_success_count,
                 (SELECT COUNT(*) FROM payment_attempts pa
                     WHERE pa.order_id = ? AND pa.external_ref_id = ? AND pa.recovery_status = 'IN_PROGRESS') AS active_claim_count,
                 (SELECT COUNT(*) FROM invoices i WHERE i.order_id = ?) AS invoices_count
             `,
            [orderId, paymentKey, orderId, orderId, paymentKey, orderId, paymentKey, orderId]
        );

        const [[activeHoldsRow]] = await connection.execute(
            `SELECT COUNT(*) AS active_holds_count
             FROM stock_holds
             WHERE order_id = ?
               AND status = 'ACTIVE'
               AND (expires_at IS NULL OR expires_at > NOW())`,
            [orderId]
        );

        const liveState = {
            paymentsStatus: paymentRow ? paymentRow.status : null,
            paidEventsCount: countsRow ? Number(countsRow.paid_events_count) || 0 : 0,
            orderItemUnitsCount: countsRow ? Number(countsRow.order_item_units_count) || 0 : 0,
            hasActiveClaim: countsRow ? Number(countsRow.active_claim_count) > 0 : false,
            alreadyProcessed: countsRow ? Number(countsRow.processed_success_count) > 0 : false,
            activeHoldsCount: activeHoldsRow ? Number(activeHoldsRow.active_holds_count) || 0 : 0,
            invoicesCount: countsRow ? Number(countsRow.invoices_count) || 0 : 0
            // NOTE: warranties 는 현재 스키마 기준으로 order_id 직접 연결이 없어,
            //       안전한 경로 설계 후 별도 liveState 확장 예정.
        };

        // 3) attempt 패턴 진단 (hold-aware)
        const resolution = await resolveRecoveryAttempt({
            connection,
            orderId,
            paymentKey,
            gateway: 'toss'
        });

        // 4) 상세 화면용 최종 추천 액션 계산
        // - 액션 판단은 "현재 재진단 결과"인 resolution.reasonCode를 우선 사용
        // - 저장 당시 이유(issue.reason_code)는 화면 표시용(stored)으로만 사용
        const storedReasonCode = issue.reason_code || null;
        const baseReasonForAction = resolution.reasonCode || storedReasonCode || null;
        const actionInfo = computeRecommendedAction(
            issue.issue_code,
            baseReasonForAction,
            liveState
        );

        // 5) 액션 로그 (최근 50개)
        const [logs] = await connection.execute(
            `SELECT id, order_id, actor, actor_type, request_id, action, issue_code, reason_code, result, error_code, created_at
             FROM recovery_action_logs
             WHERE issue_id = ?
             ORDER BY created_at DESC
             LIMIT 50`,
            [issueId]
        );

        // 6) 최소한의 조회 감사 로그
        // - VIEW_ISSUE_DETAIL 기록이 실패하더라도 상세 응답은 영향을 받지 않도록,
        //   logRecoveryAction 내부에서 오류를 처리한다.
        await logRecoveryAction({
            connection,
            issueId,
            orderId,
            actor: req.user?.email || 'unknown-admin',
            actorType: 'admin',
            requestId: req.headers['x-request-id'] || null,
            action: 'VIEW_ISSUE_DETAIL',
            issueCode: issue.issue_code,
            reasonCode: issue.reason_code,
            preStateSnapshot: {
                liveState,
                resolutionDebug: resolution.debugContext
            },
            result: 'SUCCESS',
            errorCode: null
        });

        await connection.end();

        res.json({
            success: true,
            data: {
                issue: {
                    id: issue.id,
                    orderId: issue.order_id,
                    orderNumber: issue.order_number || (orderRow ? orderRow.order_number : null),
                    paymentKey: issue.payment_key,
                    issueCode: issue.issue_code,
                    storedReasonCode: storedReasonCode,
                    recommendedActionSnapshot: issue.recommended_action,
                    useHold: Number(issue.use_hold) === 1,
                    firstSeenAt: issue.first_seen_at,
                    lastSeenAt: issue.last_seen_at,
                    lastRetryResult: issue.last_retry_result,
                    lastErrorCode: issue.last_error_code,
                    payloadSnapshot: sanitizePayloadSnapshot(issue.payload_snapshot)
                },
                liveState,
                resolution,
                action: actionInfo,
                logs: logs || []
            }
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.end();
            } catch (e) {
                // ignore
            }
        }
        Logger.error('[recovery-admin] 상세 조회 실패', {
            issueId,
            error: error.message
        });
        return res.status(500).json({
            success: false,
            message: '복구 이슈 상세 조회 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;

