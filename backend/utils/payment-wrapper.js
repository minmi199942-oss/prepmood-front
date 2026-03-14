/**
 * payment-wrapper.js - 결제 엔진 래퍼 (withPaymentAttempt)
 *
 * 설계 문서 GEMINI_FEEDBACK_ORDER_COMPLETE_BACK_NAVIGATION_REVIEW.md §5·§6·§10 반영.
 * Gemini 제안 코드를 우리 환경에 맞게 수정한 버전.
 *
 * === Gemini 코드와의 차이 (채택/버림) ===
 * - external_ref_id: Gemini는 'TEMP_PG_REF' 또는 sessionKey 사용 → 버림. 우리는 paymentKey 사용 (게이트웨이 키, 090 DDL).
 * - pg_order_id: 091 컬럼. Intent Binding·response.orderId 대조용.
 * - checkout_sessions: Gemini와 동일 테이블 사용. 091 DDL. session_key는 호출부에서 paymentKey 또는 서버 발급 키.
 * - processOrderFn: 시그니처 (connB, attemptId, pgResponse). 우리는 내부에서 createPaidEvent(별도 커넥션) → processPaidOrder(connB) → updateOrderStatus(connB).
 * - Path C cancelKey: 설계대로 orderId_attemptSeq_CANCEL (attemptId 아님).
 * - server.close(): Gemini 코드에는 없음. index.js에서 SIGINT 수신 시 server.close() 호출 필요 (§2).
 * - Logger: console 대신 Logger 사용.
 *
 * === Gemini 피드백 검토 (원자성·sessionKey·Logger) ===
 * [1] createPaidEvent에 connB 전달하지 않음: 우리 설계·기존 코드는 "결제 증거 보존"으로 paid_events를
 *     별도 커넥션(autocommit)에서 먼저 남긴다(paid-event-creator.js 주석). connB에 묶으면 processPaidOrder
 *     롤백 시 paid_events까지 롤백되어 리콘 근거가 사라진다. 따라서 별도 커넥션 유지(채택하지 않음).
 * [2] sessionKey: paymentKey를 sessionKey로 쓰면 결제창 재진입 시 새 paymentKey로 동일 주문에 다중
 *     PROCESSING이 허용된다 → 채택. sessionKey는 주문·결제창 진입 시 서버가 발급한 키 필수.
 * [3] Logger: 현재 Logger는 console만 사용해 블로킹 위험 낮음. finally 블록에는 Logger 호출 없이
 *     clearTimeout/removeListener/activePaymentCount-- 만 수행하므로 카운터 감소가 로그에 종속되지 않음.
 * [4] Fetch 후 검증 실패 시 환불: Path C를 최외곽 catch로 이동. pgResponse 스코프 승격 후
 *     ZERO_TRUST_VIOLATION(Phase 2) 또는 INSUFFICIENT_STOCK(Phase 3) 시에도 환불 수행. pgResponse
 *     없을 때 TypeError 방지를 위해 needsRefund = pgResponse && ... 조건 및 refundPaymentKey = (pgResponse?.paymentKey) || paymentKey 사용.
 * [5] 409 In-doubt: error.attemptId는 catch 진입 직후 항상 할당. fallback status 업데이트 실패해도
 *     attemptId는 에러에 붙어 있으므로 라우터에서 409 + retry_after_seconds·recon_recommended 반환 가능.
 * [6] Watchdog: abort()만으로는 processOrderFn 내부 블로킹을 끊지 못함. processOrderFn 직전·직후에
 *     if (signal.aborted) throw 로 물리적 방어선 추가.
 * [7] Floating Promise: process.exit(0) 전에 상태 변경 쿼리 완료 보장을 위해 fallback UPDATE를 await.
 * [8] statusHandled: Path C 환불 성공 시 status='FAILED'로 확정 후 fallback 미실행. 이중 덮어쓰기 방지.
 *
 * === 연동 (payments-routes.js confirm) ===
 * 1. 091 마이그레이션 선행 실행.
 * 2. sessionKey: 주문서·결제창 진입 시 서버가 발급한 CheckoutSessionKey 사용 필수.
 *    paymentKey를 sessionKey로 쓰면 동일 주문에 대해 다중 시도가 허용되므로 사용 금지.
 * 3. processOrderFn: createPaidEvent(별도 커넥션) → processPaidOrder(connB) → updateOrderStatus(connB).
 * 4. executeRefundFn: 토스 취소 API 호출 함수 전달 (없으면 Path C 시 로그만).
 * 5. 409 응답 시 error.attemptId 포함하여 retry_after_seconds·recon_recommended 클라이언트 전달 (§10.23).
 *
 * === 선행 존재 원칙 (Phase 1) ===
 * checkout_sessions 행은 반드시 POST /orders 시점에 PENDING으로 생성됨. 래퍼 진입 시 행이 없으면
 * CHECKOUT_SESSION_NOT_FOUND(400) throw — INSERT로 새 행을 만들지 않음. 레이스/위조 키 방어.
 */

const { pool } = require('../db');
const {
    loadOrderItemsSnapshot,
    loadActiveHoldsForOrder,
    validateHoldReuseForOrder,
    acquireNewHoldsForOrder
} = require('./stock-hold-service');
const Logger = require('../logger');
const { markAttemptRecoveryRequired } = require('../services/payment-recovery-service');

// ---------------------------------------------------------
// [운영 안정성] 전역 상태 및 Graceful Shutdown 제어 (§2·§10.23)
// ---------------------------------------------------------
let activePaymentCount = 0;
let isShuttingDown = false;
const POOL_SIZE = parseInt(process.env.DB_CONNECTION_LIMIT || '100', 10);
const RESERVED_FOR_B = 20;

process.on('SIGINT', () => {
    isShuttingDown = true;
    Logger.warn(`[Shutdown] SIGINT 수신. 현재 진행 중인 결제: ${activePaymentCount}건`);

    if (activePaymentCount === 0) process.exit(0);

    setTimeout(() => {
        Logger.error('[Shutdown] 15초 Hard Kill Timeout 초과. 프로세스를 강제 종료합니다.');
        process.exit(1);
    }, 15000);
});

// ---------------------------------------------------------
// [가용성] AbortSignal과 Race하는 안전한 커넥션 획득 (§10.14)
// [풀 누수 방지] 타임아웃/abort 시 나중에 도착한 커넥션 즉시 release (PAID_EVENT_CREATOR_SENIOR_FIX_VERIFICATION.md §5, §8.4)
// ---------------------------------------------------------
function releaseOrphanConnection(connectionPromise) {
    connectionPromise.then((conn) => conn.release()).catch(() => {});
}

async function getSafeConnection(signal, timeoutMs) {
    const connectionPromise = pool.getConnection();

    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', abortHandler);
            releaseOrphanConnection(connectionPromise);
            reject(new Error('CONN_TIMEOUT'));
        }, timeoutMs);

        const abortHandler = () => {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', abortHandler);
            releaseOrphanConnection(connectionPromise);
            reject(new Error(signal && signal.reason ? signal.reason : 'CLIENT_ABORTED'));
        };

        if (signal && signal.aborted) return abortHandler();
        if (signal) signal.addEventListener('abort', abortHandler);

        connectionPromise
            .then((conn) => {
                clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', abortHandler);
                if (signal && signal.aborted) {
                    conn.release();
                    return reject(new Error('CLIENT_ABORTED'));
                }
                resolve(conn);
            })
            .catch((err) => {
                clearTimeout(timer);
                if (signal) signal.removeEventListener('abort', abortHandler);
                reject(err);
            });
    });
}

// ---------------------------------------------------------
// withPaymentAttempt - 핵심 결제 엔진 래퍼
// ---------------------------------------------------------
/**
 * @param {Object} params
 * @param {import('express').Request} params.req - Express req (close 리스너·메모리 누수 방지)
 * @param {string} params.sessionKey - 주문·결제창 진입 시 서버가 발급한 CheckoutSessionKey (paymentKey 사용 금지)
 * @param {number} params.orderId - orders.order_id (PK)
 * @param {string} params.pgOrderId - PG에 전달한 orderId (토스 기준: order_number)
 * @param {string} params.paymentKey - 토스 paymentKey (external_ref_id·게이트웨이 키)
 * @param {number|string} params.amount - 결제 금액 (BigInt 호환으로 내부에서 toString)
 * @param {string} [params.currency='KRW']
 * @param {Function} params.fetchPgFn - (signal) => Promise<pgResponse> 토스 Confirm API 호출
 * @param {Function} params.processOrderFn - (connB, attemptId, pgResponse) => Promise<void|Object> createPaidEvent + processPaidOrder + updateOrderStatus; 반환 객체는 응답 data에 병합(paidEventId, paidResult 등)
 * @param {Function} [params.executeRefundFn] - (cancelKey, paymentKey, reason) => Promise<void> Path C PG 취소
 * @returns {Promise<{ status: number, message?: string, data?: any }>}
 */
async function withPaymentAttempt({
    req,
    sessionKey,
    orderId,
    pgOrderId,
    paymentKey,
    amount,
    currency = 'KRW',
    fetchPgFn,
    processOrderFn,
    executeRefundFn
}) {
    if (pgOrderId == null || String(pgOrderId).trim() === '') {
        const err = new Error('pgOrderId required for Intent Binding');
        err.status = 400;
        throw err;
    }
    if (isShuttingDown) {
        const err = new Error('SERVER_SHUTTING_DOWN');
        err.status = 503;
        throw err;
    }
    if (activePaymentCount >= POOL_SIZE - RESERVED_FOR_B) {
        const err = new Error('결제 트래픽이 혼잡합니다. 잠시 후 다시 시도해주세요.');
        err.status = 503;
        throw err;
    }

    activePaymentCount++;
    const controller = new AbortController();
    const { signal } = controller;
    let pgResponse = null;
    let isLocalSuccess = false;
    let statusHandled = false;
    let attemptId = null;
    let attemptSeq = null;

    const onClose = () => controller.abort('CLIENT_CLOSED');
    req.on('close', onClose);
    const watchdog = setTimeout(() => controller.abort('WATCHDOG_TIMEOUT'), 40000);

    const amountStr = typeof amount === 'bigint' || typeof amount === 'number' ? String(amount) : String(amount);

    try {
        // ---------- Phase 1: 선점 (Conn A) ----------
        // TOCTOU 방지: 검증(PENDING)과 진입 사이 레이스 시 동일 세션으로 두 요청이 들어와도
        // Phase 1에서 checkout_sessions를 FOR UPDATE로 잡고 IN_PROGRESS/CONSUMED면 재진입 차단.
        let connA;
        try {
            connA = await getSafeConnection(signal, 3000);
            await connA.beginTransaction();

            await connA.query('SELECT order_id FROM orders WHERE order_id = ? FOR UPDATE', [orderId]);

            // 선행 존재 원칙: checkout_sessions 행은 반드시 POST /orders 시점에 PENDING으로 생성됨. 없으면 위조/만료 키.
            const [sessionCheckRows] = await connA.query(
                'SELECT session_key, status, attempt_id, expires_at FROM checkout_sessions WHERE session_key = ? FOR UPDATE',
                [sessionKey]
            );
            if (sessionCheckRows.length === 0) {
                const err = new Error('CHECKOUT_SESSION_NOT_FOUND');
                err.status = 400;
                throw err;
            }
            const sessionRow = sessionCheckRows[0];
            const existingStatus = sessionRow.status;
            if (existingStatus === 'CONSUMED') {
                const err = new Error('SESSION_ALREADY_IN_USE');
                err.status = 409;
                throw err;
            }
            // Phase 1 stale: IN_PROGRESS + expires_at<=NOW → mark-only, provider/paid_events 접근 금지
            if (existingStatus === 'IN_PROGRESS') {
                const expiresAt = sessionRow.expires_at ? new Date(sessionRow.expires_at) : null;
                if (expiresAt && expiresAt <= new Date()) {
                    const attemptIdForStale = sessionRow.attempt_id;
                    if (attemptIdForStale) {
                        await markAttemptRecoveryRequired(connA, attemptIdForStale, 'stale', 'phase1', orderId);
                    }
                    const err = new Error('STALE_SESSION_NEEDS_RECOVERY');
                    err.status = 423;
                    throw err;
                }
                const err = new Error('SESSION_ALREADY_IN_USE');
                err.status = 409;
                throw err;
            }

            const [seqRows] = await connA.query(
                'SELECT COALESCE(MAX(attempt_seq), 0) + 1 AS next_seq FROM payment_attempts WHERE order_id = ?',
                [orderId]
            );
            attemptSeq = seqRows[0].next_seq;

            const [insertRes] = await connA.query(
                `INSERT INTO payment_attempts
                 (order_id, external_ref_id, gateway, attempt_seq, status, amount, currency, expires_at, pg_order_id, use_hold)
                 VALUES (?, ?, 'toss', ?, 'PROCESSING', ?, ?, DATE_ADD(NOW(), INTERVAL 10 MINUTE), ?, 1)`,
                [orderId, paymentKey, attemptSeq, amountStr, currency, pgOrderId]
            );
            attemptId = insertRes.insertId != null ? Number(insertRes.insertId) : insertRes.insertId;

            await connA.query(
                `INSERT INTO checkout_sessions (session_key, order_id, status, attempt_id, expires_at)
                 VALUES (?, ?, 'IN_PROGRESS', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))
                 ON DUPLICATE KEY UPDATE status = 'IN_PROGRESS', attempt_id = ?, updated_at = NOW()`,
                [sessionKey, orderId, attemptId, attemptId]
            );

            await connA.commit();
        } catch (err) {
            if (connA) await connA.rollback().catch(() => {});
            throw err;
        } finally {
            if (connA) connA.release();
        }

        // ---------- Phase 1.5: 재고 hold 확보 (Conn H - 짧은 트랜잭션) ----------
        // Phase 1: redirect 기반 confirm만 hold-enabled로 본다.
        // - Conn A에서 orders/session/attempt 선점이 끝난 뒤,
        //   별도 짧은 트랜잭션(Conn H)에서 stock_units FOR UPDATE SKIP LOCKED + stock_holds INSERT 수행.
        let connH;
        try {
            connH = await getSafeConnection(signal, 3000);
            await connH.beginTransaction();

            const orderItems = await loadOrderItemsSnapshot(connH, orderId);
            const existingHolds = await loadActiveHoldsForOrder(connH, orderId);

            let needNewHolds = true;
            if (existingHolds.length > 0) {
                const reuseCheck = validateHoldReuseForOrder({
                    holds: existingHolds,
                    orderItems
                });
                if (reuseCheck.reusable) {
                    Logger.log('[payment-wrapper] 기존 ACTIVE holds 재사용', {
                        orderId,
                        attemptId,
                        holdCount: existingHolds.length
                    });
                    needNewHolds = false;
                } else {
                    Logger.log('[payment-wrapper] 기존 ACTIVE holds 재사용 불가, 새로 acquire 시도', {
                        orderId,
                        attemptId,
                        reason: reuseCheck.reason
                    });
                }
            }

            if (needNewHolds) {
                const acquireResult = await acquireNewHoldsForOrder({
                    connection: connH,
                    orderId,
                    orderItems,
                    holdTtlMinutes: 12
                });
                if (!acquireResult.created) {
                    Logger.error('[payment-wrapper] stock_holds acquire 실패', {
                        orderId,
                        attemptId,
                        reason: acquireResult.reason
                    });
                    throw new Error('INSUFFICIENT_STOCK_FOR_HOLD');
                }
            }

            await connH.commit();
        } catch (err) {
            if (connH) await connH.rollback().catch(() => {});
            throw err;
        } finally {
            if (connH) connH.release();
        }

        // ---------- Phase 2: 무상태 Fetch ----------
        if (signal.aborted) throw new Error(signal.reason || 'ABORTED_BEFORE_FETCH');

        pgResponse = await fetchPgFn(signal);

        const respOrderId = pgResponse.orderId != null ? String(pgResponse.orderId) : '';
        const respAmount = (pgResponse.totalAmount != null ? String(pgResponse.totalAmount) : '') || (pgResponse.amount != null ? String(pgResponse.amount) : '');
        if (respOrderId !== String(pgOrderId) || respAmount !== amountStr) {
            throw new Error('ZERO_TRUST_VIOLATION');
        }

        // ---------- Phase 3: 결과 반영 (Conn B) ----------
        // orders FOR UPDATE 제거: createPaidEvent(별도 autocommit conn)가 paid_events INSERT 시
        // FK check로 orders 행에 shared lock을 요청 — connB가 exclusive lock을 잡으면 self-deadlock.
        // processPaidOrder가 자체적으로 orders FOR UPDATE를 수행하므로 여기서 중복 잠금 불필요.
        let connB;
        try {
            connB = await getSafeConnection(signal, 5000);
            await connB.beginTransaction();

            const [[attemptRow]] = await connB.query(
                'SELECT status FROM payment_attempts WHERE id = ? FOR UPDATE',
                [attemptId]
            );

            if (attemptRow && attemptRow.status === 'CONFIRMED') {
                await connB.commit();
                isLocalSuccess = true;
                statusHandled = true;
                return { status: 200, message: 'ALREADY_CONFIRMED', data: pgResponse };
            }

            if (signal.aborted) throw new Error(signal.reason || 'WATCHDOG_TIMEOUT');
            const processResult = await processOrderFn(connB, attemptId, pgResponse);
            if (signal.aborted) throw new Error(signal.reason || 'WATCHDOG_TIMEOUT');

            await connB.query(
                'UPDATE payment_attempts SET status = ?, updated_at = NOW() WHERE id = ?',
                ['CONFIRMED', attemptId]
            );
            try {
                await connB.query(
                    `INSERT INTO payment_attempt_logs (attempt_id, from_status, to_status, reason)
                     VALUES (?, 'PROCESSING', 'CONFIRMED', 'PG_SUCCESS')`,
                    [attemptId]
                );
            } catch (e) {
                Logger.error('[payment-wrapper] payment_attempt_logs INSERT 실패', e);
            }
            // 현재 세션 + 같은 order_id의 모든 세션 CONSUMED (재진입 차단, ORDER_ALREADY_PAID_REVISED_PLAN §4.3)
            await connB.query(
                "UPDATE checkout_sessions SET status = 'CONSUMED', updated_at = NOW() WHERE order_id = ?",
                [orderId]
            );

            await connB.commit();
            isLocalSuccess = true;
            statusHandled = true;
            const mergedData = processResult && typeof processResult === 'object' ? { ...pgResponse, ...processResult } : pgResponse;
            return { status: 200, data: mergedData };
        } catch (err) {
            if (connB) await connB.rollback().catch(() => {});
            throw err;
        } finally {
            if (connB) connB.release();
        }
    } catch (error) {
        error.attemptId = attemptId;

        const needsRefund = pgResponse != null &&
            (error.message === 'INSUFFICIENT_STOCK' || error.message === 'ZERO_TRUST_VIOLATION') &&
            executeRefundFn &&
            attemptId;

        if (needsRefund) {
            try {
                await pool.query(
                    `UPDATE payment_attempts SET refund_required = 1, refund_status = 'PENDING', updated_at = NOW() WHERE id = ?`,
                    [attemptId]
                );
            } catch (e) {
                Logger.error('[payment-wrapper] Pre-refund 로깅 실패 (091 컬럼 없을 수 있음)', e);
            }
            const cancelKey = `${orderId}_${attemptSeq}_CANCEL`;
            const refundPaymentKey = (pgResponse && pgResponse.paymentKey) || paymentKey;
            try {
                await executeRefundFn(cancelKey, refundPaymentKey, error.message || '결제 반영 실패');
                await pool.query(
                    `UPDATE payment_attempts SET status = 'FAILED', refund_status = 'SUCCESS', refund_required = 0, updated_at = NOW() WHERE id = ?`,
                    [attemptId]
                );
                statusHandled = true;
            } catch (refundErr) {
                Logger.error('[CRITICAL] 자동 취소 API 실패. 리콘 배치가 재시도합니다.', refundErr);
            }
        }

        if (!isLocalSuccess && !statusHandled && attemptId) {
            const fallbackStatus =
                (error.message === 'WATCHDOG_TIMEOUT' || error.message === 'CONN_TIMEOUT' || error.message === 'TOSS_FETCH_TIMEOUT')
                    ? 'TIMEOUT_WAITING'
                    : 'ABORTED_CHECK_REQUIRED';
            try {
                await pool.query(
                    'UPDATE payment_attempts SET status = ?, updated_at = NOW() WHERE id = ? AND status = ?',
                    [fallbackStatus, attemptId, 'PROCESSING']
                );
            } catch (e) {
                Logger.error('[payment-wrapper] fallback status 전이 실패', e);
            }
        }

        throw error;
    } finally {
        clearTimeout(watchdog);
        req.removeListener('close', onClose);
        activePaymentCount--;
        if (isShuttingDown && activePaymentCount === 0) {
            Logger.log('[Shutdown] 모든 결제 완료. 프로세스를 종료합니다.');
            process.exit(0);
        }
    }
}

module.exports = { withPaymentAttempt, getSafeConnection };
