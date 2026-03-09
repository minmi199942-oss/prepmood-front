/**
 * payments-routes.js - 결제 관리 API
 *
 * 흐름 요약:
 * 1. 클라이언트에서 결제창 진입 시 checkoutSessionKey 발급·전달
 * 2. 결제 성공 후 successUrl로 리다이렉트 (paymentKey, orderId, amount 전달)
 * 3. 클라이언트에서 서버로 POST /api/payments/confirm 호출
 *    - 서버에서 withPaymentAttempt로 선점·Fetch·결과 반영
 *    - 토스 Confirm API 호출 (시크릿 키로 Basic Auth)
 *    - 결제 성공 시 payments 테이블에 저장 (status='captured' 또는 'authorized')
 *    - 주문 상태: 'confirmed' 또는 'processing'으로 전이
 *    - 실패 시 'failed'로 전이
 *
 * 웹훅 처리:
 * - POST /api/payments/webhook
 * - 토스에서 결제 상태 변경 시 호출. WEBHOOK_SHARED_SECRET로 HMAC 검증
 * - 검증 통과 시 payments & orders 동기화 (handlePaymentStatusChange)
 *
 * 참고: 토스페이먼츠 통합 문서
 * - 위젯: https://docs.tosspayments.com/guides/v2/widget/overview
 * - 결제 확정: https://docs.tosspayments.com/guides/v2/payment/confirm
 * - 웹훅: https://docs.tosspayments.com/guides/v2/webhook/overview
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, optionalAuth } = require('./auth-middleware');
const { verifyCSRF } = require('./csrf-middleware');
const { sendOrderConfirmationEmail } = require('./mailer');
const Logger = require('./logger');
const crypto = require('crypto');
const { createInvoiceFromOrder } = require('./utils/invoice-creator');
const { processPaidOrder } = require('./utils/paid-order-processor');
const { createPaidEvent, updateProcessingStatus } = require('./utils/paid-event-creator');
const { selectValidGuestTokenSql } = require('./utils/guest-token-helpers');
const { updateOrderStatus } = require('./utils/order-status-aggregator');
const { withPaymentAttempt } = require('./utils/payment-wrapper');
const { pool } = require('./db');
const https = require('https');
const http = require('http');
require('dotenv').config();

/**
 * processPaidOrder 실패 시 웹훅 알림 (Phase 3, 14.7·16.5)
 * PAID_ORDER_FAILURE_WEBHOOK_URL 설정 시에만 발송. Slack/Discord 등 POST JSON.
 * payload: 주문번호, 결제금액, 에러 메시지, paymentKey (문서 16.5)
 */
function notifyProcessPaidOrderFailure({ orderNumber, amount, paymentKey, error }) {
    const url = process.env.PAID_ORDER_FAILURE_WEBHOOK_URL;
    if (!url || typeof url !== 'string' || !url.trim()) return;

    const errMsg = error && (error.message || String(error));
    const stackFirst = (error && error.stack && error.stack.split('\n')[1]) ? error.stack.split('\n')[1].trim() : '';

    const payload = {
        text: `[processPaidOrder 실패] 주문번호: ${orderNumber || '-'}, 결제금액: ${amount ?? '-'}, paymentKey: ${paymentKey ? String(paymentKey).substring(0, 12) + '...' : '-'}, 에러: ${errMsg || '-'}${stackFirst ? ` | ${stackFirst}` : ''}`
    };

    const u = new URL(url.trim());
    const isHttps = u.protocol === 'https:';
    const postData = JSON.stringify(payload);
    const options = {
        hostname: u.hostname,
        port: u.port || (isHttps ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const req = (isHttps ? https : http).request(options, (res) => {
        if (res.statusCode >= 400) {
            Logger.warn('[payments] processPaidOrder 실패 알림 웹훅 응답 오류', { statusCode: res.statusCode, orderNumber });
        }
    });
    req.on('error', (e) => Logger.warn('[payments] processPaidOrder 실패 알림 웹훅 전송 실패', { error: e.message, orderNumber }));
    req.setTimeout(5000, () => { req.destroy(); });
    req.write(postData);
    req.end();
}

// MySQL 연결 설정 (order-routes.js와 동일)
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * POST /api/payments/confirm
 *
 * checkoutSessionKey 필수. 선점·Fetch·결과 반영은 withPaymentAttempt에서 수행.
 *
 * 요청 body:
 * {
 *   "orderNumber": "ORD-2025-...",
 *   "paymentKey": "tgen_...",
 *   "amount": 129000,
 *   "checkoutSessionKey": "uuid..."
 * }
 *
 * 동작:
 * 1. 주문 조회 (JWT 회원: user_id 일치, 비회원: user_id IS NULL)
 * 2. checkoutSessionKey로 세션 조회 후 CONSUMED 여부 확인(이미 완료 시 멱등 200)
 * 3. 토스 Confirm API 호출 (시크릿 키로 Basic Auth)
 * 4. payments 테이블에 저장 (status = 'captured' 또는 'authorized')
 * 5. 주문 상태 업데이트 ('confirmed' 또는 'processing' / 실패 시 'failed')
 */
router.post('/payments/confirm', optionalAuth, verifyCSRF, async (req, res) => {
    let connection;
    try {
        const { orderNumber, paymentKey, amount, checkoutSessionKey } = req.body;
        const userId = req.user?.userId;

        // userId 검증 로그
        Logger.log('[payments][confirm] 결제 확인 요청 - userId 확인', {
            userId: userId,
            userIdType: typeof userId,
            userInfo: userId ? { userId } : 'null',
            hasUser: !!req.user,
            userKeys: req.user ? Object.keys(req.user) : []
        });

        // Step 5: CheckoutSessionKey 검증 (멱등·세션 소비 전)
        if (!checkoutSessionKey || typeof checkoutSessionKey !== 'string' || !checkoutSessionKey.trim()) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: 'checkoutSessionKey가 필요합니다. 주문/결제창에서 발급한 checkoutSessionKey를 전달해주세요.'
                }
            });
        }
        if (!orderNumber || !paymentKey || amount === undefined) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'body',
                    message: 'orderNumber, paymentKey, amount가 필요합니다.'
                }
            });
        }

        // 금액 검증 (숫자, 양수)
        const clientAmount = parseFloat(amount);
        if (isNaN(clientAmount) || clientAmount <= 0) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'amount',
                    message: '유효한 금액이 아닙니다.'
                }
            });
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // 1. 주문 조회 (회원: user_id 일치, 비회원: user_id IS NULL)
        const [orderRows] = await connection.execute(
            userId != null
                ? `SELECT order_id, order_number, user_id, total_price, shipping_country, status
                   FROM orders
                   WHERE order_number = ? AND user_id = ?
                   LIMIT 1`
                : `SELECT order_id, order_number, user_id, total_price, shipping_country, status
                   FROM orders
                   WHERE order_number = ? AND user_id IS NULL
                   LIMIT 1`,
            userId != null ? [orderNumber, userId] : [orderNumber]
        );

        if (orderRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(404).json({
                code: 'NOT_FOUND',
                details: {
                    field: 'orderNumber',
                    message: '주문을 찾을 수 없습니다.'
                }
            });
        }

        const order = orderRows[0];

        // 2. Zero-Trust: 세션 조회 + 만료 + CONSUMED 검사. [문서] GEMINI §6 Step 5·§10.24.
        const [sessionRows] = await connection.execute(
            `SELECT order_id, status, expires_at FROM checkout_sessions WHERE session_key = ? LIMIT 1`,
            [checkoutSessionKey.trim()]
        );
        if (sessionRows.length === 0) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: '유효한 결제 세션을 찾을 수 없습니다.'
                }
            });
        }
        const sessionRow = sessionRows[0];
        if (new Date(sessionRow.expires_at) <= new Date()) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: '결제 세션이 만료되었습니다. 주문/결제창에서 다시 진행해주세요.'
                }
            });
        }
        if (sessionRow.order_id !== order.order_id) {
            await connection.rollback();
            connection.release();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: '세션이 해당 주문과 일치하지 않습니다.'
                }
            });
        }
        if (sessionRow.status === 'CONSUMED') {
            // 이미 완료: 동일 세션으로 이미 결제된 경우 payments 기준으로 멱등 응답 (새로고침/재진입 시 UI 안내)
            const [existingPaymentRows] = await connection.execute(
                `SELECT status, amount, currency, payment_key, gateway FROM payments
                 WHERE order_number = ? ORDER BY created_at DESC LIMIT 1`,
                [orderNumber]
            );
            const existingPaymentStatus = existingPaymentRows.length ? existingPaymentRows[0].status : 'captured';
            const existingCurrency = existingPaymentRows.length && existingPaymentRows[0].currency
                ? existingPaymentRows[0].currency
                : (order.shipping_country === 'KR' ? 'KRW' : order.shipping_country === 'US' ? 'USD' : 'JPY');
            const existingGateway = existingPaymentRows.length && existingPaymentRows[0].gateway
                ? existingPaymentRows[0].gateway
                : 'toss';
            let guestAccessToken = null;
            if (order.user_id == null) {
                const [tokenRows] = await connection.execute(
                    `SELECT token FROM guest_order_access_tokens got
                     WHERE got.order_id = ? AND ${selectValidGuestTokenSql('got')}
                     ORDER BY got.created_at DESC LIMIT 1`,
                    [order.order_id]
                );
                if (tokenRows.length > 0) guestAccessToken = tokenRows[0].token;
            }
            let cartCleared = false;
            if (userId != null) {
                const [cartCountRows] = await connection.execute(
                    `SELECT COUNT(*) AS itemCount FROM cart_items ci INNER JOIN carts c ON ci.cart_id = c.cart_id WHERE c.user_id = ?`,
                    [userId]
                );
                cartCleared = (cartCountRows[0].itemCount || 0) === 0;
            }
            await connection.rollback();
            connection.release();
            return res.json({
                success: true,
                data: {
                    order_number: orderNumber,
                    amount: parseFloat(order.total_price),
                    currency: existingCurrency,
                    payment_status: existingPaymentStatus,
                    payment_gateway: existingGateway,
                    alreadyConfirmed: true,
                    cartCleared,
                    user_id: order.user_id,
                    ...(guestAccessToken != null ? { guest_access_token: guestAccessToken } : {})
                }
            });
        }

        // 3. 서버 금액 (order.total_price 기준, Zero-Trust)
        const serverAmount = parseFloat(order.total_price);
        const currency = order.shipping_country === 'KR' ? 'KRW' :
                        order.shipping_country === 'US' ? 'USD' :
                        order.shipping_country === 'JP' ? 'JPY' : 'KRW';

        // 환불 함수: confirm 성공 경로(Path C) 및 §C failed 재시도 시 재고 부족 자동 환불에서 공용
        const executeRefundFn = (cancelKey, refundPaymentKey, reason) => {
            const tossSecretKeyRef = process.env.TOSS_SECRET_KEY;
            if (!tossSecretKeyRef) return Promise.resolve();
            const tossApiBase = process.env.TOSS_API_BASE || 'https://api.tosspayments.com';
            const authHeader = Buffer.from(`${tossSecretKeyRef}:`).toString('base64');
            return fetch(`${tossApiBase}/v1/payments/${refundPaymentKey}/cancel`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${authHeader}`,
                    'Content-Type': 'application/json',
                    'Idempotency-Key': cancelKey
                },
                body: JSON.stringify({ cancelReason: reason || '재고 부족 등 주문 처리 실패' })
            }).then(r => {
                if (!r.ok) return r.json().then(d => Promise.reject(new Error(d.message || '취소 실패')));
                return r.json();
            });
        };

        // SSOT: "이미 완료" = paid_event_processing.status = 'success'인 event가 해당 주문에 있을 때만 (유령 주문 방지, CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK §4.1)
        const [existingSuccessRows] = await connection.execute(
            `SELECT pe.event_id FROM paid_events pe
             INNER JOIN paid_event_processing pep ON pe.event_id = pep.event_id
             WHERE pe.order_id = ? AND pep.status = 'success' LIMIT 1`,
            [order.order_id]
        );

        if (existingSuccessRows.length > 0) {
            // 실제 주문 처리까지 완료된 경우에만 멱등 200
            const [existingPaymentRows] = await connection.execute(
                `SELECT status, amount, currency, payment_key FROM payments
                 WHERE order_number = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [orderNumber]
            );

            const existingPaymentStatus = existingPaymentRows.length ? existingPaymentRows[0].status : 'captured';
            const existingCurrency = existingPaymentRows.length && existingPaymentRows[0].currency
                ? existingPaymentRows[0].currency
                : currency;
            const existingPaymentKey = existingPaymentRows.length ? existingPaymentRows[0].payment_key : paymentKey;

            // 비회원 시: guest_access_token 조회 (헬퍼: expires_at > NOW() AND revoked_at IS NULL)
            let guestAccessToken = null;
            if (order.user_id == null) {
                const [tokenRows] = await connection.execute(
                    `SELECT token FROM guest_order_access_tokens got
                     WHERE got.order_id = ? AND ${selectValidGuestTokenSql('got')}
                     ORDER BY got.created_at DESC
                     LIMIT 1`,
                    [order.order_id]
                );
                if (tokenRows.length > 0) {
                    guestAccessToken = tokenRows[0].token;
                }
            }

            // 장바구니 상태: 회원은 DB 조회, 비회원은 localStorage(pm_cart_v1)에 있어 서버에서 미조회
            let cartCleared = false;
            if (userId != null) {
                const [cartCountRows] = await connection.execute(
                    `SELECT COUNT(*) AS itemCount
                     FROM cart_items ci
                     INNER JOIN carts c ON ci.cart_id = c.cart_id
                     WHERE c.user_id = ?`,
                    [userId]
                );
                cartCleared = (cartCountRows[0].itemCount || 0) === 0;
            }

            await connection.rollback();
            connection.release();

            return res.json({
                success: true,
                data: {
                    order_number: orderNumber,
                    amount: serverAmount,
                    currency: existingCurrency,
                    payment_status: existingPaymentStatus,
                    alreadyConfirmed: true,
                    cartCleared,
                    user_id: order.user_id,
                    ...(guestAccessToken != null ? { guest_access_token: guestAccessToken } : {})
                }
            });
        }

        // paid_events + pep 상태로 분기: success(이미 처리됨), processing(409), failed(§C 재시도 또는 환불)
        const [pepRows] = await connection.execute(
            `SELECT pe.event_id, pe.payment_key, pe.amount, pe.currency, pep.status
             FROM paid_events pe
             INNER JOIN paid_event_processing pep ON pe.event_id = pep.event_id
             WHERE pe.order_id = ?`,
            [order.order_id]
        );
        if (pepRows.length > 0) {
            const hasProcessing = pepRows.some(r => r.status === 'processing');
            if (hasProcessing) {
                await connection.rollback();
                connection.release();
                return res.status(409).json({
                    success: false,
                    code: 'ORDER_PROCESSING_INCOMPLETE',
                    details: {
                        message: '주문이 처리 중입니다. 잠시 후 다시 시도해 주세요.',
                        retry_after_seconds: 3,
                        retry_once_recommended: true
                    }
                });
            }

            const failedRow = pepRows.find(r => r.status === 'failed');
            if (failedRow) {
                // §C: CAS로 한 요청만 재시도 선점 (광클릭·동시 재시도 방지)
                const [updRes] = await connection.execute(
                    `UPDATE paid_event_processing SET status = 'processing', updated_at = NOW() WHERE event_id = ? AND status = 'failed'`,
                    [failedRow.event_id]
                );
                if (updRes.affectedRows === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(409).json({
                        success: false,
                        code: 'CONCURRENT_RETRY_DETECTED',
                        details: { message: '다른 요청이 이미 재시도 중입니다. 잠시 후 다시 확인해 주세요.' }
                    });
                }
                await connection.rollback();
                connection.release();
                connection = null;

                let retryConn = null;
                try {
                    retryConn = await pool.getConnection();
                    await retryConn.beginTransaction();
                    Logger.log('[payments][confirm] §C failed 재시도 진입', { orderId: order.order_id, eventId: failedRow.event_id });

                    // 재고 검증·차감은 processPaidOrder 내부 트랜잭션에 위임 (TOCTOU 방지)
                    const paidResult = await processPaidOrder({
                        connection: retryConn,
                        paidEventId: failedRow.event_id,
                        orderId: order.order_id,
                        paymentKey: failedRow.payment_key,
                        amount: parseFloat(failedRow.amount),
                        currency: failedRow.currency || 'KRW',
                        eventSource: 'failed_retry',
                        rawPayload: null
                    });
                    await updateOrderStatus(retryConn, order.order_id);
                    await retryConn.commit();
                    retryConn.release();
                    retryConn = null;

                    // 성공 시 일반 confirm과 동일한 200 응답 (장바구니·이메일 등은 아래 공통 블록 전에 여기서 처리 가능하나, 구조 단순화를 위해 200만 반환 후 클라이언트가 order-complete 등으로 처리)
                    let cartCleared = false;
                    if (userId) {
                        let cartConn = null;
                        try {
                            cartConn = await pool.getConnection();
                            await cartConn.execute(
                                `DELETE ci FROM cart_items ci INNER JOIN carts c ON ci.cart_id = c.cart_id WHERE c.user_id = ?`,
                                [userId]
                            );
                            cartCleared = true;
                        } catch (cartErr) {
                            Logger.log('[payments][confirm] §C 재시도 후 장바구니 비우기 실패 (무시)', { userId, error: cartErr.message });
                        } finally {
                            if (cartConn) cartConn.release();
                        }
                    }
                    const guestAccessToken = paidResult?.data?.orderInfo?.guest_access_token ?? null;
                    return res.json({
                        success: true,
                        data: {
                            order_number: orderNumber,
                            amount: serverAmount,
                            currency: failedRow.currency || currency,
                            payment_status: 'captured',
                            cartCleared,
                            invoice_created: !!paidResult?.data?.invoiceNumber,
                            invoice_number: paidResult?.data?.invoiceNumber ?? null,
                            alreadyConfirmed: false,
                            user_id: order.user_id,
                            guest_access_token: guestAccessToken
                        }
                    });
                } catch (retryErr) {
                    if (retryConn) {
                        try { await retryConn.rollback(); } catch (_) {}
                        retryConn.release();
                    }
                    if (retryErr.code === 'INSUFFICIENT_STOCK') {
                        try {
                            const cancelKey = `order_${order.order_id}_failed_retry_CANCEL`;
                            await executeRefundFn(cancelKey, failedRow.payment_key, '재고 소진으로 인한 자동 취소');
                            await updateProcessingStatus(failedRow.event_id, 'failed', 'AUTO_REFUNDED_OUT_OF_STOCK');
                            return res.status(400).json({
                                success: false,
                                code: 'AUTO_REFUNDED',
                                details: { message: '결제 진행 중 재고가 소진되어 자동으로 결제가 취소(환불)되었습니다.' }
                            });
                        } catch (refundErr) {
                            Logger.error('[payments][confirm] §C 자동 환불 API 실패. 수동 대사 필요', {
                                orderId: order.order_id,
                                payment_key: failedRow.payment_key?.substring(0, 20) + '...',
                                error: refundErr.message
                            });
                            await updateProcessingStatus(failedRow.event_id, 'failed', 'REFUND_API_FAILED');
                            return res.status(500).json({
                                success: false,
                                code: 'REFUND_PENDING',
                                details: { message: '재고 부족으로 취소 중 지연이 발생했습니다. 고객센터로 문의해 주세요.' }
                            });
                        }
                    }
                    await updateProcessingStatus(failedRow.event_id, 'failed', (retryErr.message || '알 수 없는 에러').substring(0, 255));
                    return res.status(500).json({
                        success: false,
                        code: 'PAYMENT_ERROR',
                        details: { message: retryErr.message || '주문 처리 재시도 중 오류가 발생했습니다.' }
                    });
                }
            }

            // paid_events 있으나 success/processing/failed 아님(pending 등) → 409
            await connection.rollback();
            connection.release();
            return res.status(409).json({
                success: false,
                code: 'ORDER_PROCESSING_INCOMPLETE',
                details: {
                    message: '이전 결제 시도에서 주문 처리까지 완료되지 않았습니다. 잠시 후 다시 시도하거나 고객센터에 문의해 주세요.',
                    retry_after_seconds: 3,
                    retry_once_recommended: true
                }
            });
        }

        if (Math.abs(serverAmount - clientAmount) > 0.01) { // Zero-Trust 금액 불일치
            await connection.rollback();
            connection.release();
            Logger.log('결제 금액 불일치', {
                orderNumber,
                serverAmount,
                clientAmount
            });
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'amount',
                    message: '주문 금액과 결제 금액이 일치하지 않습니다.'
                }
            });
        }

        // Conn A 여기서 해제. 이후 Fetch 및 DB 결과 반영은 withPaymentAttempt에서. withPaymentAttempt는 Conn A/B를 db.js 풀에서 사용.
        await connection.rollback();
        connection.release();
        connection = null;

        const isMockMode = process.env.MOCK_GATEWAY === '1';
        const paymentMode = isMockMode ? 'MOCK' : 'TOSS';
        const orderId = order.order_id;
        const amountForPg = serverAmount;
        const currencyVal = currency;

        const fetchPgFn = isMockMode
            ? () => Promise.resolve({
                status: 'DONE',
                method: 'CARD',
                paymentKey,
                orderId: orderNumber,
                totalAmount: serverAmount,
                currency: currencyVal
            })
            : (signal) => {
                const tossApiBase = process.env.TOSS_API_BASE || 'https://api.tosspayments.com';
                const tossSecretKey = process.env.TOSS_SECRET_KEY;
                if (!tossSecretKey) return Promise.reject(new Error('TOSS_SECRET_KEY 미설정'));
                const authHeader = Buffer.from(`${tossSecretKey}:`).toString('base64');
                // 토스 API 전용 10초 타임아웃: 외부 지연 시 DB 락 점유 방지 (문서 §타임아웃 계층, Fetch 타임아웃)
                const TOSS_FETCH_TIMEOUT_MS = 10000;
                const tossAbort = new AbortController();
                const timeoutId = setTimeout(() => tossAbort.abort(), TOSS_FETCH_TIMEOUT_MS);
                if (signal) {
                    if (signal.aborted) {
                        clearTimeout(timeoutId);
                        return Promise.reject(new Error(signal.reason || 'ABORTED'));
                    }
                    signal.addEventListener('abort', () => { clearTimeout(timeoutId); tossAbort.abort(); }, { once: true });
                }
                return fetch(`${tossApiBase}/v1/payments/confirm`, {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentKey, orderId: orderNumber, amount: serverAmount }),
                    signal: tossAbort.signal
                }).then(r => r.json()).then(data => {
                    clearTimeout(timeoutId);
                    if (!data.paymentKey) throw new Error(data.message || 'Confirm API 실패');
                    return data;
                }).catch(err => {
                    clearTimeout(timeoutId);
                    if (err.name === 'AbortError' && tossAbort.signal.aborted) throw new Error('TOSS_FETCH_TIMEOUT');
                    throw err;
                });
            };

        const processOrderFn = async (connB, attemptId, pgResponse) => {
            const paidEventResult = await createPaidEvent({
                orderId,
                paymentKey,
                amount: amountForPg,
                currency: currencyVal,
                eventSource: 'redirect',
                rawPayload: pgResponse
            });
            const paidEventId = paidEventResult.eventId;
            if (!paidEventId) throw new Error('paid_events 생성 실패: eventId가 null입니다.');
            const paymentStatus = pgResponse.status === 'DONE' ? 'captured' : pgResponse.status === 'IN_PROGRESS' ? 'authorized' : 'failed';
            await connB.execute(
                `INSERT INTO payments (order_number, gateway, payment_key, status, amount, currency, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [orderNumber, isMockMode ? 'mock' : 'toss', paymentKey, paymentStatus, serverAmount, currencyVal, JSON.stringify(pgResponse)]
            );
            const paidResult = await processPaidOrder({
                connection: connB,
                paidEventId,
                orderId,
                paymentKey,
                amount: amountForPg,
                currency: currencyVal,
                eventSource: 'redirect',
                rawPayload: pgResponse
            });
            await updateOrderStatus(connB, orderId);
            return { paidEventId, paidResult };
        };

        try {
            const tStart = process.hrtime.bigint();
            const result = await withPaymentAttempt({
                req,
                sessionKey: checkoutSessionKey.trim(),
                orderId,
                pgOrderId: orderNumber,
                paymentKey,
                amount: amountForPg,
                currency: currencyVal,
                fetchPgFn,
                processOrderFn,
                executeRefundFn
            });
            const tAfterWrapper = process.hrtime.bigint();

            if (result.status !== 200) {
                return res.status(result.status || 500).json({
                    success: false,
                    code: 'PAYMENT_ERROR',
                    details: { message: result.message || '결제 처리 중 오류가 발생했습니다.' }
                });
            }

            const paidResult = result.data?.paidResult;
            const paymentStatus = result.data?.status === 'DONE' ? 'captured' : result.data?.status === 'IN_PROGRESS' ? 'authorized' : 'failed';
            const invoiceCreated = !!paidResult?.data?.invoiceNumber;
            const invoiceNumber = paidResult?.data?.invoiceNumber ?? null;

            let cartCleared = false;
            if (userId) {
                let cartConn = null;
                try {
                    cartConn = await pool.getConnection();
                    await cartConn.execute(
                        `DELETE ci FROM cart_items ci INNER JOIN carts c ON ci.cart_id = c.cart_id WHERE c.user_id = ?`,
                        [userId]
                    );
                    cartCleared = true;
                } catch (cartError) {
                    Logger.log('[payments][confirm] 장바구니 비우기 실패 (무시)', { userId, error: cartError.message });
                } finally {
                    if (cartConn) cartConn.release();
                }
            }
            const tAfterCart = process.hrtime.bigint();

            const wrapperMs = Number((tAfterWrapper - tStart) / 1000000n);
            const cartMs = Number((tAfterCart - tAfterWrapper) / 1000000n);
            const totalMs = Number((tAfterCart - tStart) / 1000000n);
            const poolStatus = typeof pool._allConnections !== 'undefined'
                ? { all: pool._allConnections.length, free: pool._freeConnections ? pool._freeConnections.length : 'n/a' }
                : 'n/a';
            Logger.log(`[payments][mode=${paymentMode}] 결제 확인 성공 (withPaymentAttempt)`, {
                orderNumber,
                paymentKey,
                amount: serverAmount,
                cartCleared,
                invoiceCreated,
                invoiceNumber,
                duration_ms: { wrapperMs, cartMs, totalMs },
                poolStatus
            });

            if (paidResult?.data?.orderInfo) {
                try {
                    const orderInfo = paidResult.data.orderInfo;
                    const recipientEmail = orderInfo.user_email || orderInfo.shipping_email;
                    if (recipientEmail) {
                        const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                        const orderLink = orderInfo.guest_access_token
                            ? `${baseUrl}/guest-order-access.html?token=${orderInfo.guest_access_token}`
                            : `${baseUrl}/guest/orders.html?order=${encodeURIComponent(orderInfo.order_number)}`;

                        // P2: processPaidOrder에서 이미 넘어온 items·customerName 사용 시 DB 조회 0회
                        let orderItems = orderInfo.items;
                        let customerName = orderInfo.customerName;
                        if (!Array.isArray(orderItems) || orderItems.length === 0) {
                            let emailConnection = null;
                            try {
                                emailConnection = await pool.getConnection();
                                const [itemsRows] = await emailConnection.execute(
                                    `SELECT product_name, size, color, quantity, unit_price, subtotal FROM order_items WHERE order_id = ? ORDER BY order_item_id`,
                                    [orderInfo.order_id]
                                );
                                const [orderDetails] = await emailConnection.execute(
                                    `SELECT o.shipping_name, u.name as user_name FROM orders o LEFT JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`,
                                    [orderInfo.order_id]
                                );
                                orderItems = itemsRows;
                                customerName = orderDetails.length ? (orderDetails[0].user_name || orderDetails[0].shipping_name || null) : null;
                            } finally {
                                if (emailConnection) emailConnection.release();
                            }
                        }

                        // P0: 이메일은 부가 작업 — 응답 지연 제거를 위해 비동기(Fire-and-Forget)
                        sendOrderConfirmationEmail(recipientEmail, {
                            orderNumber: orderInfo.order_number,
                            orderDate: orderInfo.order_date,
                            totalAmount: orderInfo.total_amount,
                            items: orderItems,
                            orderLink,
                            isGuest: !!orderInfo.guest_access_token,
                            customerName
                        }).catch(err => {
                            Logger.error('[payments][confirm] 주문 확인 이메일 발송 실패 (무시)', { orderNumber, error: err.message });
                        });
                    }
                } catch (emailError) {
                    Logger.error('[payments][confirm] 주문 확인 이메일 발송 실패 (무시)', {
                        orderNumber,
                        error: emailError.message
                    });
                }
            }

            const guestAccessToken = paidResult?.data?.orderInfo?.guest_access_token ?? null;
            return res.json({
                success: true,
                data: {
                    order_number: orderNumber,
                    amount: serverAmount,
                    currency: currencyVal,
                    payment_status: paymentStatus,
                    cartCleared,
                    invoice_created: invoiceCreated,
                    invoice_number: invoiceNumber,
                    alreadyConfirmed: false,
                    user_id: order.user_id,
                    guest_access_token: guestAccessToken
                }
            });
        } catch (wrapperError) {
            if (wrapperError.message === 'CHECKOUT_SESSION_NOT_FOUND') {
                return res.status(400).json({
                    code: 'VALIDATION_ERROR',
                    details: {
                        field: 'checkoutSessionKey',
                        message: '유효한 결제 세션을 찾을 수 없습니다.'
                    }
                });
            }
            if (wrapperError.message === 'SESSION_ALREADY_IN_USE') {
                return res.status(409).json({
                    code: 'SESSION_ALREADY_IN_USE',
                    details: {
                        message: '이미 진행 중인 결제가 있습니다. 잠시 후 주문/결제 상태를 다시 확인해주세요.'
                    }
                });
            }
            if (wrapperError.attemptId != null && (wrapperError.message === 'INSUFFICIENT_STOCK' || wrapperError.message === 'ZERO_TRUST_VIOLATION')) {
                return res.status(409).json({
                    code: wrapperError.message === 'INSUFFICIENT_STOCK' ? 'INSUFFICIENT_STOCK' : 'ZERO_TRUST_VIOLATION',
                    details: {
                        message: wrapperError.message === 'INSUFFICIENT_STOCK' ? '재고가 부족합니다.' : '금액 검증에 실패했습니다.',
                        order_number: orderNumber,
                        payment_key: paymentKey
                    }
                });
            }
            if (wrapperError.attemptId != null && (wrapperError.message === 'WATCHDOG_TIMEOUT' || wrapperError.message === 'ABORTED_CHECK_REQUIRED' || wrapperError.message === 'CLIENT_CLOSED')) {
                return res.status(409).json({
                    code: 'PAYMENT_IN_PROGRESS',
                    details: {
                        message: '결제가 진행 중입니다. 잠시 후 다시 확인해주세요.',
                        attemptId: wrapperError.attemptId,
                        retry_after_seconds: 3,
                        recon_recommended: true
                    }
                });
            }
            const status = wrapperError.status || 500;
            return res.status(status).json({
                success: false,
                code: status === 503 ? 'SERVICE_UNAVAILABLE' : 'PAYMENT_ERROR',
                details: { message: wrapperError.message || '결제 처리 중 오류가 발생했습니다.' }
            });
        }

    } catch (error) {
        // (confirm 라우트 단계에서만 사용한 connection - withPaymentAttempt 호출 전 이미 해제됨)
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
            connection.release();
        }
        const paymentMode = process.env.MOCK_GATEWAY === '1' ? 'MOCK' : 'TOSS';
        Logger.error(`[payments][mode=${paymentMode}] 결제 확인 중 예외 발생`, {
            error: error.message,
            error_code: error.code,
            error_sql_state: error.sqlState,
            error_sql_message: error.sqlMessage,
            stack: error.stack,
            orderNumber: req.body?.orderNumber,
            paymentKey: req.body?.paymentKey
        });
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            details: {
                message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            }
        });
    }
});

/**
 * POST /api/payments/inicis/request
 * 요청 body: orderNumber, amount, orderName, buyerName, buyerEmail, buyerTel
 * 반환: success, data.formData (INIStdPay.pay() 호출용)
 */
router.post('/payments/inicis/request', authenticateToken, verifyCSRF, async (req, res) => {
    let connection;
    try {
        const { orderNumber, amount, orderName, buyerName, buyerEmail, buyerTel } = req.body;
        const userId = req.user?.userId;

        // 필수 검증
        if (!orderNumber || !amount || !orderName || !buyerName) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    message: '주문번호, 금액, 상품명, 구매자명이 필요합니다.'
                }
            });
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 주문 조회 (inicis request)
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, user_id, total_price, status
             FROM orders 
             WHERE order_number = ? AND user_id = ? 
             LIMIT 1`,
            [orderNumber, userId]
        );

        if (orders.length === 0) {
            await connection.rollback();
            await connection.end();
            return res.status(404).json({
                code: 'ORDER_NOT_FOUND',
                details: {
                    message: '주문을 찾을 수 없습니다.'
                }
            });
        }

        const order = orders[0];

        // 금액 검증
        const serverAmount = parseFloat(order.total_price);
        const clientAmount = parseFloat(amount);
        
        if (Math.abs(serverAmount - clientAmount) > 0.01) {
            await connection.rollback();
            await connection.end();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    message: '주문 금액과 결제 금액이 일치하지 않습니다.'
                }
            });
        }

        // 이니시스 환경 변수
        const inicisMid = process.env.INICIS_MID;
        const inicisSignKey = process.env.INICIS_SIGN_KEY;
        const inicisReturnUrl = process.env.INICIS_RETURN_URL || `${req.protocol}://${req.get('host')}/api/payments/inicis/return`;

        if (!inicisMid || !inicisSignKey) {
            await connection.rollback();
            await connection.end();
            Logger.log('[payments][inicis] 이니시스 환경 미설정', {
                hasMid: !!inicisMid,
                hasSignKey: !!inicisSignKey
            });
            return res.status(503).json({
                code: 'SERVICE_UNAVAILABLE',
                details: {
                    message: '이니시스 결제가 일시적으로 불가합니다. 잠시 후 다시 시도해주세요.',
                    reason: 'INICIS_MID 또는 INICIS_SIGN_KEY가 설정되지 않음'
                }
            });
        }

        // 타임스탬프 생성
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        // 이니시스 formData (서명 대상: version + mid + goodname + oid + price + timestamp + signKey)
        const formData = {
            version: '1.0',
            mid: inicisMid,
            goodname: orderName,
            oid: orderNumber,
            price: amount.toString(),
            currency: 'WON',
            buyername: buyerName,
            buyertel: buyerTel || '',
            buyeremail: buyerEmail || '',
            timestamp: timestamp,
            returnUrl: inicisReturnUrl,
            closeUrl: `${req.protocol}://${req.get('host')}/checkout-payment.html?status=fail`,
            gopaymethod: 'Card',  // 카드 결제
            acceptmethod: 'HPP(1):no_receipt:va_receipt:below1000',  // 카드 + 가상계좌 + 1000원이하
            language: 'ko',
            charset: 'UTF-8',
            payViewType: 'overlay'  // 레이어 팝업
        };

        // 서명 생성 (서명 대상: version + mid + goodname + oid + price + timestamp + signKey)
        const signString = [
            formData.version,
            formData.mid,
            formData.goodname,
            formData.oid,
            formData.price,
            formData.timestamp
        ].join('');
        
        const signHash = crypto.createHash('sha256').update(signString + inicisSignKey).digest('hex');
        formData.signature = signHash;

        await connection.commit();
        await connection.end();

        Logger.log('[payments][inicis] 이니시스 요청 성공', {
            orderNumber,
            amount
        });

        res.json({
            success: true,
            data: {
                formData: formData
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            await connection.end();
        }
        Logger.log('[payments][inicis] 이니시스 요청 실패', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            details: {
                message: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
            }
        });
    }
});

/**
 * POST /api/payments/inicis/return
 *
 * 이니시스 결제 후 콜백 리다이렉트 URL
 * resultCode로 성공/실패 판단
 */
router.post('/payments/inicis/return', async (req, res) => {
    let connection;
    try {
        const resultCode = req.body.resultCode;
        const resultMsg = req.body.resultMsg;
        const tid = req.body.TID;
        const orderNumber = req.body.oid;
        const amount = req.body.amount;
        const payMethod = req.body.payMethod;
        const applTime = req.body.applTime;
        const applNum = req.body.applNum;
        const cardCode = req.body.cardCode;
        const cardName = req.body.cardName;
        const cardQuota = req.body.cardQuota;
        const cardNum = req.body.cardNum;
        const vactNum = req.body.vactNum;
        const vactBankCode = req.body.vactBankCode;
        const vactBankName = req.body.vactBankName;
        const vactInputName = req.body.vactInputName;
        const vactDate = req.body.vactDate;
        const vactTime = req.body.vactTime;
        const vactName = req.body.vactName;
        const vactAccount = req.body.vactAccount;
        const vactDepositor = req.body.vactDepositor;
        const vactBank = req.body.vactBank;
        const vactBankAccount = req.body.vactBankAccount;
        const vactBankAccountName = req.body.vactBankAccountName;
        const vactBankAccountDate = req.body.vactBankAccountDate;
        const vactBankAccountTime = req.body.vactBankAccountTime;
        const vactBankAccountNum = req.body.vactBankAccountNum;
        const vactBankAccountDepositor = req.body.vactBankAccountDepositor;
        const vactBankAccountBank = req.body.vactBankAccountBank;
        const vactBankAccountBankName = req.body.vactBankAccountBankName;
        const vactBankAccountBankCode = req.body.vactBankAccountBankCode;
        const vactBankAccountBankAccount = req.body.vactBankAccountBankAccount;
        const vactBankAccountBankAccountName = req.body.vactBankAccountBankAccountName;
        const vactBankAccountBankAccountDate = req.body.vactBankAccountBankAccountDate;
        const vactBankAccountBankAccountTime = req.body.vactBankAccountBankAccountTime;
        const vactBankAccountBankAccountNum = req.body.vactBankAccountBankAccountNum;
        const vactBankAccountBankAccountDepositor = req.body.vactBankAccountBankAccountDepositor;
        const vactBankAccountBankAccountBank = req.body.vactBankAccountBankAccountBank;
        const vactBankAccountBankAccountBankName = req.body.vactBankAccountBankAccountBankName;
        const vactBankAccountBankAccountBankCode = req.body.vactBankAccountBankAccountBankCode;
        const vactBankAccountBankAccountBankAccount = req.body.vactBankAccountBankAccountBankAccount;
        const vactBankAccountBankAccountBankAccountName = req.body.vactBankAccountBankAccountBankAccountName;
        const vactBankAccountBankAccountBankAccountDate = req.body.vactBankAccountBankAccountBankAccountDate;
        const vactBankAccountBankAccountBankAccountTime = req.body.vactBankAccountBankAccountBankAccountTime;
        const vactBankAccountBankAccountBankAccountNum = req.body.vactBankAccountBankAccountBankAccountNum;
        const vactBankAccountBankAccountBankAccountDepositor = req.body.vactBankAccountBankAccountBankAccountDepositor;
        const vactBankAccountBankAccountBankAccountBank = req.body.vactBankAccountBankAccountBankAccountBank;
        const vactBankAccountBankAccountBankAccountBankName = req.body.vactBankAccountBankAccountBankAccountBankName;
        const vactBankAccountBankAccountBankAccountBankCode = req.body.vactBankAccountBankAccountBankAccountBankCode;
        const vactBankAccountBankAccountBankAccountBankAccount = req.body.vactBankAccountBankAccountBankAccountBankAccount;
        const vactBankAccountBankAccountBankAccountBankAccountName = req.body.vactBankAccountBankAccountBankAccountBankAccountName;
        const vactBankAccountBankAccountBankAccountBankAccountDate = req.body.vactBankAccountBankAccountBankAccountBankAccountDate;
        const vactBankAccountBankAccountBankAccountBankAccountTime = req.body.vactBankAccountBankAccountBankAccountBankAccountTime;
        const vactBankAccountBankAccountBankAccountBankAccountNum = req.body.vactBankAccountBankAccountBankAccountBankAccountNum;
        const vactBankAccountBankAccountBankAccountBankAccountDepositor = req.body.vactBankAccountBankAccountBankAccountBankAccountDepositor;
        const vactBankAccountBankAccountBankAccountBankAccountBank = req.body.vactBankAccountBankAccountBankAccountBankAccountBank;
        const vactBankAccountBankAccountBankAccountBankAccountBankName = req.body.vactBankAccountBankAccountBankAccountBankAccountBankName;
        const vactBankAccountBankAccountBankAccountBankAccountBankCode = req.body.vactBankAccountBankAccountBankAccountBankAccountBankCode;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccount = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccount;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountName = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountName;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountDate = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountDate;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountTime = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountTime;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountNum = req.body.vactBankAccountBankAccountBankAccountBankAccountNum;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountDepositor = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountDepositor;
        const vactBankAccountBankAccountBankAccountBankAccountBankBank = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBank;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankName = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankName;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankCode = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankCode;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccount = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccount;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountName = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountName;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountDate = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountDate;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountTime = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountTime;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountNum = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountNum;
        const vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountDepositor = req.body.vactBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountBankAccountDepositor;

        // 결제 실패 시
        if (resultCode !== '00') {
            Logger.log('[payments][inicis] 결제 실패', {
                orderNumber,
                resultCode,
                resultMsg
            });
            return res.redirect(`/checkout-payment.html?status=fail&code=${resultCode}&message=${encodeURIComponent(resultMsg)}`);
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 주문 조회 (inicis return)
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, user_id, total_price, status
             FROM orders 
             WHERE order_number = ? 
             LIMIT 1`,
            [orderNumber]
        );

        if (orders.length === 0) {
            await connection.rollback();
            await connection.end();
            Logger.log('[payments][inicis] 주문 없음', { orderNumber });
            return res.redirect(`/checkout-payment.html?status=fail&code=ORDER_NOT_FOUND&message=${encodeURIComponent('주문을 찾을 수 없습니다.')}`);
        }

        const order = orders[0];

        // 금액 검증
        const serverAmount = parseFloat(order.total_price);
        const clientAmount = parseFloat(amount);
        
        if (Math.abs(serverAmount - clientAmount) > 0.01) {
            await connection.rollback();
            await connection.end();
            Logger.log('[payments][inicis] 금액 불일치', {
                orderNumber,
                serverAmount,
                clientAmount
            });
            return res.redirect(`/checkout-payment.html?status=fail&code=AMOUNT_MISMATCH&message=${encodeURIComponent('주문 금액과 결제 금액이 일치하지 않습니다.')}`);
        }

        // 중복 결제 방지 (tid 기준)
        const [existingPayments] = await connection.execute(
            'SELECT payment_id FROM payments WHERE payment_key = ? LIMIT 1',
            [tid]
        );

        if (existingPayments.length > 0) {
            // 이미 결제됨 (멱등)
            await connection.commit();
            await connection.end();
            Logger.log('[payments][inicis] 이미 결제됨 멱등 (tid)', { orderNumber, tid });
            return res.redirect(`/order-complete.html?orderId=${orderNumber}&amount=${amount}`);
        }

        // payments 테이블 insert
        const paymentStatus = (payMethod === 'Card' && resultCode === '00') ? 'captured' : 
                             (payMethod === 'VBank' && resultCode === '00') ? 'authorized' : 'failed';
        
        const orderStatus = paymentStatus === 'captured' ? 'processing' : 
                           paymentStatus === 'authorized' ? 'confirmed' : 'failed';

        await connection.execute(
            `INSERT INTO payments 
             (order_number, gateway, payment_key, status, amount, currency, payload_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber,
                'inicis',
                tid,
                paymentStatus,
                serverAmount,
                'KRW',
                JSON.stringify(req.body)
            ]
        );

        // Paid 이벤트 생성 및 processPaidOrder (captured 시에만)
        // 참고: paid_events insert는 autocommit으로 별도 커넥션 (문서 16.5)
        // 참고: processPaidOrder() 실패 시 rollback해도 paid_events는 유지
        // 참고: paid_events 존재 시 주문 상태는 processing 등으로 집계
        let paidProcessError = null;
        if (paymentStatus === 'captured') {
            try {
                // paid_events 생성 (별도 autocommit - 결제 증거 보존)
                // 참고: processPaidOrder 실패 시 rollback, paid_events는 유지
                const paidEventResult = await createPaidEvent({
                    orderId: order.order_id,
                    paymentKey: tid,
                    amount: serverAmount,
                    currency: 'KRW',
                    eventSource: 'redirect', // 참고: 'inicis_return' 또는 'redirect' (ENUM 동일)
                    rawPayload: req.body
                });

                const paidEventId = paidEventResult.eventId;

                if (!paidEventId) {
                    throw new Error('paid_events 생성 실패: eventId가 null입니다.');
                }

                if (paidEventResult.alreadyExists) {
                    Logger.log('[payments][inicis] 이미 존재 paid_events (멱등)', {
                        order_id: order.order_id,
                        order_number: orderNumber,
                        paidEventId
                    });
                }

                // processPaidOrder 호출 (동일 connection 사용)
                // 참고: orders.status는 집계 함수로만 갱신 (SSOT는 order_item_units)
                const paidResult = await processPaidOrder({
                    connection,
                    paidEventId: paidEventId,
                    orderId: order.order_id,
                    paymentKey: tid,
                    amount: serverAmount,
                    currency: 'KRW',
                    eventSource: 'redirect', // 참고: 'inicis_return' 또는 'redirect'
                    rawPayload: req.body
                });
                
                // orders.status 집계 (processPaidOrder 완료 후)
                // 참고: orders.status는 order_item_units.unit_status와 paid_events 기반 집계
                await updateOrderStatus(connection, order.order_id);
                
                Logger.log('[payments][inicis] Paid 처리 완료', {
                    order_id: order.order_id,
                    order_number: orderNumber,
                    paidEventId,
                    stockUnitsReserved: paidResult.data.stockUnitsReserved,
                    orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
                    warrantiesCreated: paidResult.data.warrantiesCreated,
                    invoiceNumber: paidResult.data.invoiceNumber
                });
            } catch (err) {
                // 참고: processPaidOrder() 실패 시 rollback (paid_events는 별도 커넥션으로 유지)
                paidProcessError = err;
                
                Logger.error('[payments][inicis] Paid 처리 실패 - processPaidOrder 예외', {
                    order_id: order.order_id,
                    order_number: orderNumber,
                    error: err.message,
                    error_code: err.code,
                    error_sql_state: err.sqlState,
                    error_sql_message: err.sqlMessage,
                    stack: err.stack
                });
                
                // 참고: rollback 후 (processPaidOrder() 내부 작업만 취소됨)
                await connection.rollback();
                
                // 집계만 갱신: orders.status 재계산 (paid_events 있으면 paid, 없으면 pending)
                try {
                    const statusConnection = await mysql.createConnection(dbConfig);
                    await updateOrderStatus(statusConnection, order.order_id);
                    await statusConnection.end();
                } catch (statusError) {
                    Logger.error('[payments][inicis] updateOrderStatus 실패 (무시)', {
                        order_id: order.order_id,
                        error: statusError.message
                    });
                }
                
                // paidProcessError 유지 (catch 블록 밖에서 처리)
            }
        } else {
            // 참고: paymentStatus가 'captured'가 아니면 orders.status만 집계
            // (paid_events 없으면 pending 등)
            await updateOrderStatus(connection, order.order_id);
        }

        // 분기: processPaidOrder() 실패 시 500/리다이렉트
        // paidProcessError가 있으면 이미 rollback, 웹훅 알림 발송
        if (paidProcessError) {
            await connection.end();

            notifyProcessPaidOrderFailure({
                orderNumber,
                amount: serverAmount,
                paymentKey: tid || null,
                error: paidProcessError
            });

            Logger.error('[payments][inicis] processPaidOrder 실패 - 웹훅 알림 발송', {
                orderNumber,
                tid,
                amount: serverAmount,
                error: paidProcessError.message,
                error_code: paidProcessError.code
            });
            
            // 재고 부족 시 리다이렉트 (더 나은 UX). 그 외 500 JSON
            if (paidProcessError.code === 'INSUFFICIENT_STOCK') {
                return res.redirect('/checkout-payment.html?status=fail&code=INSUFFICIENT_STOCK');
            }
            
            return res.status(500).json({
                code: 'ORDER_PROCESSING_FAILED',
                details: {
                    message: '주문 처리 중 오류가 발생했습니다. 잠시 후 주문/결제 상태를 확인해주세요.',
                    order_number: orderNumber
                }
            });
        }

        // 회원 장바구니 비우기 (결제 성공 시)
        if (order.user_id) {
            try {
                await connection.execute(
                    `DELETE ci FROM cart_items ci
                     INNER JOIN carts c ON ci.cart_id = c.cart_id
                     WHERE c.user_id = ?`,
                    [order.user_id]
                );
            } catch (cartError) {
                Logger.log('[payments][inicis] 장바구니 비우기 실패 (무시)', {
                    userId: order.user_id,
                    error: cartError.message
                });
            }
        }

        // 트랜잭션 커밋 및 커넥션 종료
        await connection.commit();
        await connection.end();

        Logger.log('[payments][inicis] 이니시스 결제 완료', {
            orderNumber,
            tid,
            amount: serverAmount,
            payMethod,
            status: paymentStatus
        });

        // ============================================================
        // 주문 확인 이메일 발송 (captured 시에만)
        // ============================================================
        if (paymentStatus === 'captured' && !paidProcessError) {
            try {
                // paidResult에서 orderInfo 사용 (이메일용)
                let orderInfoForEmail = null;
                if (typeof paidResult !== 'undefined' && paidResult?.data?.orderInfo) {
                    orderInfoForEmail = paidResult.data.orderInfo;
                } else {
                    // paidResult 없으면 DB에서 주문 정보 조회
                    let emailConnection = null;
                    try {
                        emailConnection = await mysql.createConnection(dbConfig);
                        const [orderRows] = await emailConnection.execute(
                            `SELECT 
                                o.order_id,
                                o.order_number,
                                o.user_id,
                                o.guest_id,
                                o.total_price,
                                o.shipping_email,
                                o.shipping_name,
                                o.created_at,
                                u.email as user_email,
                                u.name as user_name
                            FROM orders o
                            LEFT JOIN users u ON o.user_id = u.user_id
                            WHERE o.order_id = ?`,
                            [order.order_id]
                        );
                        
                        if (orderRows.length > 0) {
                            const orderRow = orderRows[0];
                            
                            // guest_order_access_tokens 조회 (비회원 주문 시, 유효 토큰만)
                            let guestAccessToken = null;
                            if (orderRow.guest_id && !orderRow.user_id) {
                                const [tokenRows] = await emailConnection.execute(
                                    `SELECT token FROM guest_order_access_tokens got
                                     WHERE got.order_id = ? AND ${selectValidGuestTokenSql('got')}
                                     ORDER BY got.created_at DESC LIMIT 1`,
                                    [order.order_id]
                                );
                                if (tokenRows.length > 0) {
                                    guestAccessToken = tokenRows[0].token;
                                }
                            }
                            
                            orderInfoForEmail = {
                                order_id: orderRow.order_id,
                                order_number: orderRow.order_number,
                                order_date: orderRow.created_at,
                                total_amount: orderRow.total_price,
                                user_email: orderRow.user_email,
                                shipping_email: orderRow.shipping_email,
                                user_id: orderRow.user_id,
                                guest_id: orderRow.guest_id,
                                guest_access_token: guestAccessToken
                            };
                        }
                    } finally {
                        if (emailConnection) await emailConnection.end();
                    }
                }
                
                if (orderInfoForEmail) {
                    // 주문 상세 조회 (이메일용)
                    let emailConnection2 = null;
                    try {
                        emailConnection2 = await mysql.createConnection(dbConfig);
                        const [orderItems] = await emailConnection2.execute(
                            `SELECT 
                                product_name,
                                size,
                                color,
                                quantity,
                                unit_price,
                                subtotal
                            FROM order_items
                            WHERE order_id = ?
                            ORDER BY order_item_id`,
                            [orderInfoForEmail.order_id]
                        );

                        // 수취인 정보
                        const [orderDetails] = await emailConnection2.execute(
                            `SELECT 
                                o.shipping_name,
                                u.name as user_name
                            FROM orders o
                            LEFT JOIN users u ON o.user_id = u.user_id
                            WHERE o.order_id = ?`,
                            [orderInfoForEmail.order_id]
                        );

                        // 수취 이메일
                        const recipientEmail = orderInfoForEmail.user_email || orderInfoForEmail.shipping_email;
                        
                        // 고객명
                        const customerName = orderDetails.length > 0 
                            ? (orderDetails[0].user_name || orderDetails[0].shipping_name || null)
                            : null;
                        
                        if (!recipientEmail) {
                            Logger.warn('[payments][inicis] 수취 이메일 없음 (이메일 미발송)', {
                                order_id: orderInfoForEmail.order_id,
                                order_number: orderInfoForEmail.order_number
                            });
                        } else {
                            // 주문 링크 생성
                            let orderLink;
                            if (orderInfoForEmail.guest_access_token) {
                                // 비회원: 토큰 기반 주문 조회
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest-order-access.html?token=${orderInfoForEmail.guest_access_token}`;
                            } else {
                                // 회원: 내 주문 목록 (동일 URL)
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest/orders.html?order=${encodeURIComponent(orderInfoForEmail.order_number)}`;
                            }

                            // 주문 확인 이메일 발송 (성공 시에만, 실패 시 로그)
                            const emailResult = await sendOrderConfirmationEmail(recipientEmail, {
                                orderNumber: orderInfoForEmail.order_number,
                                orderDate: orderInfoForEmail.order_date,
                                totalAmount: orderInfoForEmail.total_amount,
                                items: orderItems,
                                orderLink: orderLink,
                                isGuest: !!orderInfoForEmail.guest_access_token,
                                customerName: customerName
                            });

                            if (emailResult.success) {
                                Logger.log('[payments][inicis] 주문 확인 이메일 발송 완료', {
                                    order_id: orderInfoForEmail.order_id,
                                    order_number: orderInfoForEmail.order_number,
                                    recipient: recipientEmail
                                });
                            } else {
                                Logger.warn('[payments][inicis] 주문 확인 이메일 발송 실패 (무시)', {
                                    order_id: orderInfoForEmail.order_id,
                                    order_number: orderInfoForEmail.order_number,
                                    recipient: recipientEmail,
                                    error: emailResult.error
                                });
                            }

                            // 이메일 커넥션 1회 사용 (finally에서 end)
                        }
                    } catch (emailError) {
                        // 이메일 발송 실패만 로그 (결제 성공에는 영향 없음)
                        Logger.error('[payments][inicis] 주문 확인 이메일 발송 실패 (무시)', {
                            order_id: orderInfoForEmail?.order_id,
                            order_number: orderInfoForEmail?.order_number,
                            orderNumber,
                            error: emailError.message,
                            stack: emailError.stack
                        });
                    }
                    finally {
                        if (emailConnection2) await emailConnection2.end();
                    }
                }
            } catch (emailSectionError) {
                // 이메일 블록 전체 예외 (결제 성공에는 영향 없음)
            Logger.warn('[payments][inicis] 이메일 블록 예외 (무시)', {
                orderNumber,
                error: emailSectionError?.message,
                stack: emailSectionError?.stack
            });
        }
        }

        // 이니시스 결제 성공 시 주문 완료 페이지로 리다이렉트
        return res.redirect(`/order-complete.html?orderId=${orderNumber}&amount=${amount}`);

    } catch (error) {
        if (connection) {
            await connection.rollback();
            await connection.end();
        }
        Logger.log('[payments][inicis] 이니시스 return 예외', {
            error: error.message,
            stack: error.stack
        });
        return res.redirect(`/checkout-payment.html?status=fail&code=INTERNAL_ERROR&message=${encodeURIComponent('서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')}`);
    }
});

/**
 * 토스 웹훅 HMAC 서명 검증
 *
 * 검증 절차:
 * 1. body를 문자열로 직렬화 (JSON.stringify)
 * 2. WEBHOOK_SHARED_SECRET으로 HMAC-SHA256 계산
 * 3. Base64 인코딩 후 x-toss-signature와 비교
 *
 * @param {Object} body - 웹훅 요청 body
 * @param {String} signature - x-toss-signature 헤더값
 * @param {String} secret - WEBHOOK_SHARED_SECRET
 * @returns {Boolean} 서명 일치 여부
 */
function verifyWebhookSignature(body, signature, secret) {
    // 필수 검사: signature 또는 secret 없으면 false 반환
    if (!signature || !secret) {
        Logger.log('[payments][webhook] 웹훅 서명 검증 스킵 (시크릿 없음)', {
            hasSignature: !!signature,
            hasSecret: !!secret
        });
        return false;
    }

    // secret이 기본값이면 검증 거부
    if (secret === 'your_webhook_secret_here') {
        Logger.log('[payments][webhook] 웹훅 시크릿 기본값 사용 중', {
            hasSignature: !!signature
        });
        return false;
    }

    try {
        // body 직렬화 (문자열이면 그대로)
        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        
        // HMAC-SHA256 계산
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(bodyString);
        const calculatedSignature = hmac.digest('base64');

        // 문자열 비교 (권장: crypto.timingSafeEqual 사용)
        // 참고: 바이트 길이 다르면 Node 신규/구버전에서 crypto.timingSafeEqual 예외 가능
        const isValid = calculatedSignature === signature;

        if (!isValid) {
            Logger.log('[payments][webhook] 웹훅 서명 불일치', {
                receivedSignature: signature.substring(0, 20) + '...', // 로그 시 앞 20자만
                calculatedSignature: calculatedSignature.substring(0, 20) + '...',
                bodyLength: bodyString.length
            });
        }

        return isValid;
    } catch (error) {
        Logger.log('[payments][webhook] 웹훅 서명 검증 예외', {
            error: error.message
        });
        return false;
    }
}

/**
 * 토스 결제 조회 API (Zero-Trust 검증용)
 *
 * @param {string} paymentKey - 결제 키
 * @returns {Object|null} 조회 API 응답 또는 null
 */
async function verifyPaymentWithToss(paymentKey) {
    try {
        const tossApiBase = process.env.TOSS_API_BASE || 'https://api.tosspayments.com';
        const tossSecretKey = process.env.TOSS_SECRET_KEY;

        if (!tossSecretKey) {
            Logger.log('[payments][webhook] TOSS_SECRET_KEY 미설정으로 조회 스킵');
            return null;
        }

        const response = await fetch(`${tossApiBase}/v1/payments/${paymentKey}`, {
            method: 'GET',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${tossSecretKey}:`).toString('base64')}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            Logger.log('[payments][webhook] 토스 조회 API 실패', {
                paymentKey: paymentKey.substring(0, 10) + '...',
                status: response.status,
                statusText: response.statusText
            });
            return null;
        }

        const paymentData = await response.json();
        Logger.log('[payments][webhook] 토스 조회 성공', {
            paymentKey: paymentKey.substring(0, 10) + '...',
            status: paymentData.status,
            orderId: paymentData.orderId
        });

        return paymentData;
    } catch (error) {
        Logger.log('[payments][webhook] 토스 조회 예외', {
            error: error.message,
            paymentKey: paymentKey ? paymentKey.substring(0, 10) + '...' : 'unknown'
        });
        return null;
    }
}

/**
 * 결제 상태 변경 시 payments·orders 동기화
 *
 * @param {Object} connection - MySQL 커넥션
 * @param {Object} data - 웹훅 payload
 */
async function handlePaymentStatusChange(connection, data) {
    if (!data) {
        Logger.log('[payments][webhook] 웹훅 payload 없음');
        return;
    }

    // 토스 페이먼츠 이벤트 구조에 맞게 필드 추출
    // seller.changed 등 구 이벤트명도 data 내부 구조로 처리
    const paymentKey = data.paymentKey || data.payment?.paymentKey || data.id;
    const orderId = data.orderId || data.payment?.orderId || data.order?.orderId;
    const webhookStatus = data.status || data.payment?.status || data.state;
    const webhookAmount = data.totalAmount || data.payment?.totalAmount || data.amount;

    if (!paymentKey) {
        Logger.log('[payments][webhook] 웹훅 payload에 paymentKey 없음', { data });
        return;
    }

    // Zero-Trust: 토스 API로 실제 조회 (웹훅 payload 단독 신뢰 금지)
    const verifiedPayment = await verifyPaymentWithToss(paymentKey);
    
    if (!verifiedPayment) {
        Logger.warn('[payments][webhook] 토스 조회 실패 - 검증 스킵', {
            paymentKey: paymentKey.substring(0, 10) + '...',
            orderId
        });
        // 웹훅만으로 승인 반영 금지 (리콘 등 다른 경로 대기)
        return;
    }

    // 토스 API 조회 결과 기준으로 상태 결정
    const status = verifiedPayment.status;
    const verifiedOrderId = verifiedPayment.orderId;
    const verifiedAmount = verifiedPayment.totalAmount;

    // 웹훅 payload와 조회 결과 orderId 불일치 시 무시
    if (orderId && verifiedOrderId && orderId !== verifiedOrderId) {
        Logger.warn('[payments][webhook] orderId 불일치 - 검증 스킵', {
            webhookOrderId: orderId,
            verifiedOrderId: verifiedOrderId,
            paymentKey: paymentKey.substring(0, 10) + '...'
        });
        return;
    }

    if (webhookAmount && verifiedAmount && webhookAmount !== verifiedAmount) {
        Logger.warn('[payments][webhook] amount 불일치 - 검증 스킵', {
            webhookAmount,
            verifiedAmount,
            paymentKey: paymentKey.substring(0, 10) + '...'
        });
        return;
    }

    // 토스 상태를 우리 paymentStatus로 매핑 (웹훅 payload 단독 신뢰 금지)
    
    // paymentStatus: payments 테이블 status (captured, cancelled, failed 등)
    let paymentStatus;
    // orderStatus 참고: orders.status는 집계 결과만 갱신
    
    // 토스 상태값: DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED
    const statusUpper = String(status || '').toUpperCase();
    
    if (statusUpper === 'DONE' || statusUpper === 'COMPLETED' || statusUpper === 'CONFIRMED') {
        paymentStatus = 'captured';
    } else if (statusUpper === 'CANCELED' || statusUpper === 'CANCELLED' || statusUpper === 'PARTIAL_CANCELED') {
        paymentStatus = 'cancelled';
    } else if (statusUpper === 'ABORTED' || statusUpper === 'EXPIRED' || statusUpper === 'FAILED') {
        paymentStatus = 'failed';
    } else {
        Logger.log('[payments][webhook] 알 수 없는 상태값 무시 (로깅)', { 
            status,
            statusUpper,
            paymentKey: paymentKey.substring(0, 10) + '...',
            orderId: verifiedOrderId
        });
        // 알 수 없는 상태는 payments 업데이트 스킵
        return;
    }

    // 참고: 이미 존재하는 paymentKey로 기존 행 조회
    const [existingPayments] = await connection.execute(
        `SELECT status, updated_at FROM payments WHERE payment_key = ?`,
        [paymentKey]
    );

    if (existingPayments.length > 0) {
        const existingStatus = existingPayments[0].status;
        // 이미 동일 상태면 업데이트 스킵 (멱등)
        if (existingStatus === paymentStatus) {
            Logger.log('[payments][webhook] 이미 동일 상태 (멱등)', {
                paymentKey: paymentKey.substring(0, 10) + '...',
                status: paymentStatus,
                orderId: verifiedOrderId
            });
            return;
        }
    }

    try {
        // payments 테이블 상태 갱신
        const [paymentRows] = await connection.execute(
            `UPDATE payments 
             SET status = ?, updated_at = NOW() 
             WHERE payment_key = ?`,
            [paymentStatus, paymentKey]
        );

        if (paymentRows.affectedRows === 0) {
            Logger.log('[payments][webhook] payments 업데이트 없음 (payment_key 없음)', { paymentKey });
        } else {
            Logger.log('[payments][webhook] payments 상태 갱신 완료', {
                paymentKey,
                status: paymentStatus,
                affectedRows: paymentRows.affectedRows
            });
        }

        // orders 집계 갱신 (order_number는 orderId와 동일)
        // 참고: orders.status는 집계 함수로만 갱신 (SSOT는 order_item_units)
        const finalOrderId = verifiedOrderId || orderId;
        let orderIdForPaidProcess = null;
        
        if (finalOrderId) {
            // order_number로 order_id 조회
            const [orderRows] = await connection.execute(
                `SELECT order_id FROM orders WHERE order_number = ?`,
                [finalOrderId]
            );

            if (orderRows.length > 0) {
                orderIdForPaidProcess = orderRows[0].order_id;
                
                // 집계만: 상태 재계산
                await updateOrderStatus(connection, orderIdForPaidProcess);
                
                Logger.log('[payments][webhook] orders.status 집계 갱신', {
                    orderId: finalOrderId,
                    order_id: orderIdForPaidProcess
                });
            }
        } else {
            // orderId 없으면 payment_key로 orders 조회
            const [orderRows] = await connection.execute(
                `SELECT o.order_id, o.order_number
                 FROM orders o
                 INNER JOIN payments p ON o.order_number = p.order_number
                 WHERE p.payment_key = ?`,
                [paymentKey]
            );

            if (orderRows.length > 0) {
                orderIdForPaidProcess = orderRows[0].order_id;
                const orderNumber = orderRows[0].order_number;
                
                // 집계만: 상태 재계산
                await updateOrderStatus(connection, orderIdForPaidProcess);
                
                Logger.log('[payments][webhook] orders.status 집계 갱신 (payment_key 기준)', {
                    paymentKey: paymentKey.substring(0, 10) + '...',
                    order_number: orderNumber,
                    order_id: orderIdForPaidProcess
                });
            }
        }

        // Paid 이벤트 생성 (captured 시에만)
        // 참고: paid_events insert는 autocommit으로 별도 (문서 16.5)
        let paidResultForEmail = null;
        if (paymentStatus === 'captured' && orderIdForPaidProcess) {
            try {
                // paid_events 생성 (별도 autocommit - 결제 증거 보존)
                const paidEventResult = await createPaidEvent({
                    orderId: orderIdForPaidProcess,
                    paymentKey: paymentKey,
                    amount: verifiedAmount || webhookAmount || 0,
                    currency: verifiedPayment.currency || 'KRW',
                    eventSource: 'webhook',
                    rawPayload: verifiedPayment
                });

                const paidEventId = paidEventResult.eventId;

                if (paidEventResult.alreadyExists) {
                    Logger.log('[payments][webhook] 이미 존재 paid_events (멱등)', {
                        order_id: orderIdForPaidProcess,
                        order_number: finalOrderId,
                        paidEventId
                    });
                }

                // processPaidOrder 호출 (동일 connection 사용)
                // 참고: orders.status는 집계 함수로만 갱신 (SSOT는 order_item_units)
                const paidResult = await processPaidOrder({
                    connection,
                    paidEventId: paidEventId,
                    orderId: orderIdForPaidProcess,
                    paymentKey: paymentKey,
                    amount: verifiedAmount || webhookAmount || 0,
                    currency: verifiedPayment.currency || 'KRW',
                    eventSource: 'webhook',
                    rawPayload: verifiedPayment
                });
                
                // 이메일 발송용 반환값 보관
                paidResultForEmail = paidResult;
                
                // orders.status 집계만 재계산 (processPaidOrder 완료 후)
                // 참고: orders.status는 order_item_units.unit_status와 paid_events 기반 집계
                await updateOrderStatus(connection, orderIdForPaidProcess);
                
                Logger.log('[payments][webhook] Paid 처리 완료', {
                    order_id: orderIdForPaidProcess,
                    order_number: finalOrderId,
                    paidEventId,
                    stockUnitsReserved: paidResult.data.stockUnitsReserved,
                    orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
                    warrantiesCreated: paidResult.data.warrantiesCreated,
                    invoiceNumber: paidResult.data.invoiceNumber
                });
            } catch (err) {
                // 참고: processPaidOrder() 실패 시 rollback (paid_events는 별도 커넥션으로 유지)
                Logger.error('[payments][webhook] Paid 처리 실패 - processPaidOrder 예외', {
                    order_id: orderIdForPaidProcess,
                    order_number: finalOrderId,
                    error: err.message,
                    error_code: err.code,
                    error_sql_state: err.sqlState,
                    error_sql_message: err.sqlMessage,
                    stack: err.stack
                });

                notifyProcessPaidOrderFailure({
                    orderNumber: finalOrderId,
                    amount: verifiedAmount || webhookAmount,
                    paymentKey: paymentKey,
                    error: err
                });

                // 참고: 트랜잭션 rollback (processPaidOrder() 내부 작업만 취소)
                // paid_events는 별도(autocommit)로 이미 커밋되어 유지
                await connection.rollback();

                // paid_events는 유지되므로 리콘 등 다른 경로에서 처리 가능
            }
        }

    } catch (error) {
        Logger.log('[payments][webhook] handlePaymentStatusChange 예외', {
            error: error.message,
            paymentKey: paymentKey ? paymentKey.substring(0, 10) + '...' : 'unknown',
            orderId: verifiedOrderId || orderId
        });
        throw error;
    }
    
    // Paid 처리 성공 시 이메일 발송 여부 반환
    // (handlePaymentStatusChange 호출부에서 commit 후 이메일 발송)
    if (paymentStatus === 'captured' && orderIdForPaidProcess && paidResultForEmail?.data?.orderInfo) {
        return {
            shouldSendEmail: true,
            orderInfo: paidResultForEmail.data.orderInfo,
            orderId: orderIdForPaidProcess,
            invoiceId: paidResultForEmail.data.invoiceId || null,
            invoiceNumber: paidResultForEmail.data.invoiceNumber || null
        };
    }
    
    return { shouldSendEmail: false };
}

/**
 * 입금 콜백 처리 (미구현)
 *
 * @param {Object} connection - MySQL 커넥션
 * @param {Object} data - 웹훅 payload
 */
async function handleDepositCallback(connection, data) {
    // 입금 알림만 로깅
    Logger.log('[payments][webhook] 입금 콜백 수신', { data });
}

/**
 * POST /api/payments/webhook
 *
 * 토스 페이먼츠 웹훅 수신.
 * 참고: 토스 문서
 * - 토스에서 전달하는 서명을 WEBHOOK_SHARED_SECRET으로 HMAC 검증 (미구현 시 로깅만).
 * - 웹훅 payload만으로 승인 반영 금지, 조회 API(verifyPaymentWithToss)로 검증.
 * - handlePaymentStatusChange 내부에서 verifyPaymentWithToss() 호출.
 * - 검증 통과 시 payments & orders 동기화 후 이메일 발송 여부 반환.
 *
 * 참고: 토스 웹훅 문서
 * https://docs.tosspayments.com/guides/v2/webhook/overview
 */
router.post('/payments/webhook', async (req, res) => {
    try {
        // 참고: 실제 환경에서는 WEBHOOK_SHARED_SECRET으로 서명 검증 후 처리
        // (handlePaymentStatusChange 내부에서 verifyPaymentWithToss로 검증)
        // WEBHOOK_SHARED_SECRET 미설정 시 서명 검증 스킵 (문서 참고)
        
        Logger.log('[payments][webhook] 웹훅 수신 - 이벤트 분기 처리');

        const { eventType, data } = req.body;

        Logger.log('[payments][webhook] 웹훅 수신 (이벤트 타입)', {
            eventType,
            data: data ? {
                orderId: data.orderId,
                paymentKey: data.paymentKey,
                status: data.status
            } : null
        });

        // 트랜잭션으로 payments & orders 동기화 (상태 업데이트)
        let connection;
        try {
            connection = await mysql.createConnection(dbConfig);
            await connection.beginTransaction();

            // 웹훅 이벤트별 분기 (seller.changed = 토스 구 이벤트명). 이메일 발송 정보는 handlePaymentStatusChange 반환값으로 채움.
            let emailInfo = null;
            if (eventType === 'PAYMENT_STATUS_CHANGED' || 
                eventType === 'CANCEL_STATUS_CHANGED' || 
                eventType === 'seller.changed') {
                emailInfo = await handlePaymentStatusChange(connection, data);
            } else if (eventType === 'DEPOSIT_CALLBACK') {
                await handleDepositCallback(connection, data);
            } else if (eventType === 'payout.changed') {
                // 정산 관련 이벤트(미처리)
                Logger.log('[payments][webhook] payout.changed 수신', { data });
            } else {
                Logger.log('[payments][webhook] 미지원 이벤트 타입 (무시)', { 
                    eventType,
                    hasData: !!data
                });
            }

            await connection.commit();
            await connection.end();
            Logger.log('[payments][webhook] 웹훅 처리 완료', { eventType });

            // ============================================================
            // 주문 확인 이메일 발송 (captured 시에만)
            // ============================================================
            if (emailInfo && emailInfo.shouldSendEmail) {
                try {
                    // 이메일용 별도 커넥션 (트랜잭션 외)
                    let emailConnection = null;
                    try {
                        emailConnection = await mysql.createConnection(dbConfig);
                        const [orderItems] = await emailConnection.execute(
                            `SELECT 
                                product_name,
                                size,
                                color,
                                quantity,
                                unit_price,
                                subtotal
                            FROM order_items
                            WHERE order_id = ?
                            ORDER BY order_item_id`,
                            [emailInfo.orderId]
                        );

                        // 수취인 정보
                        const [orderDetails] = await emailConnection.execute(
                            `SELECT 
                                o.shipping_name,
                                u.name as user_name
                            FROM orders o
                            LEFT JOIN users u ON o.user_id = u.user_id
                            WHERE o.order_id = ?`,
                            [emailInfo.orderId]
                        );

                        // 수취 이메일
                        const recipientEmail = emailInfo.orderInfo.user_email || emailInfo.orderInfo.shipping_email;
                        
                        // 고객명
                        const customerName = orderDetails.length > 0 
                            ? (orderDetails[0].user_name || orderDetails[0].shipping_name || null)
                            : null;
                        
                        if (!recipientEmail) {
                            Logger.warn('[payments][webhook] 수취 이메일 없음 (이메일 미발송)', {
                                order_id: emailInfo.orderId,
                                order_number: emailInfo.orderInfo.order_number
                            });
                        } else {
                            // 주문 링크 생성
                            let orderLink;
                            if (emailInfo.orderInfo.guest_access_token) {
                                // 비회원: 토큰 기반 주문 조회
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest-order-access.html?token=${emailInfo.orderInfo.guest_access_token}`;
                            } else {
                                // 회원: 내 주문 목록 (동일 URL)
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest/orders.html?order=${encodeURIComponent(emailInfo.orderInfo.order_number)}`;
                            }

                            // 주문 확인 이메일 발송 (성공 시 로그, 실패 시 경고)
                            const emailResult = await sendOrderConfirmationEmail(recipientEmail, {
                                orderNumber: emailInfo.orderInfo.order_number,
                                orderDate: emailInfo.orderInfo.order_date,
                                totalAmount: emailInfo.orderInfo.total_amount,
                                items: orderItems,
                                orderLink: orderLink,
                                isGuest: !!emailInfo.orderInfo.guest_access_token,
                                customerName: customerName
                            });

                            if (emailResult.success) {
                                Logger.log('[payments][webhook] 주문 확인 이메일 발송 완료', {
                                    order_id: emailInfo.orderId,
                                    order_number: emailInfo.orderInfo.order_number,
                                    recipient: recipientEmail
                                });
                            } else {
                                Logger.warn('[payments][webhook] 주문 확인 이메일 발송 실패 (무시)', {
                                    order_id: emailInfo.orderId,
                                    order_number: emailInfo.orderInfo.order_number,
                                    recipient: recipientEmail,
                                    error: emailResult.error
                                });
                            }

                            // 이메일은 주문 확인 1통만
                        }
                    } finally {
                        if (emailConnection) await emailConnection.end();
                    }
                } catch (emailError) {
                    // 이메일 발송 실패는 로깅만 (웹훅 200 유지)
                    Logger.error('[payments][webhook] 주문 확인 이메일 발송 실패 (무시)', {
                        order_id: emailInfo?.orderId,
                        order_number: emailInfo?.orderInfo?.order_number,
                        orderId: emailInfo?.orderId,
                        error: emailError.message,
                        stack: emailError.stack
                    });
                }
            }

        } catch (webhookError) {
            if (connection) {
                await connection.rollback();
                await connection.end();
            }
            Logger.log('[payments][webhook] 웹훅 처리 예외', {
                error: webhookError.message,
                stack: webhookError.stack
            });
            // 토스 재전송 방지를 위해 200 반환 (문서 권장)
        }

        // 항상 200 OK 반환 (토스 재전송 방지)
        res.status(200).json({ received: true });

    } catch (error) {
        Logger.log('[payments][webhook] 웹훅 최상위 예외', {
            error: error.message
        });
        // 토스 재전송 방지를 위해 200 반환 (문서 권장)
        res.status(200).json({ received: true, error: 'Internal error' });
    }
});

module.exports = router;