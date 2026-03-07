/**
 * payments-routes.js - ?? ???API
 * 
 * ??? ???:
 * 1. ??????????????????? ?????? ?? ??
 * 2. ?? ??? ??successUrl?????????(paymentKey, orderId, amount ???)
 * 3. ????????????????POST /api/payments/confirm ???
 *    - ?????? ?? ?? ??????????(?????????? ??? ???)
 *    - ???????? Confirm API ??? (???????? Basic Auth)
 *    - ?? ??? ??payments ????? ????(status='captured' ??? 'authorized')
 *    - ?? ?????'confirmed' ??? 'processing'??? ???
 *    - ??? ???? ?????'failed'?????
 * 
 * ??? ??:
 * - POST /api/payments/webhook
 * - ??????????? ?? ??? ????????
 * - ?? HMAC ??? ????? ??? (?????HMAC ?????????)
 * - ?????? ??payments & orders ?????(??? ??????)
 * 
 * ??: ???????? ??? ??
 * - ???: https://docs.tosspayments.com/guides/v2/widget/overview
 * - ?? ???: https://docs.tosspayments.com/guides/v2/payment/confirm
 * - ???: https://docs.tosspayments.com/guides/v2/webhook/overview
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
const { createPaidEvent } = require('./utils/paid-event-creator');
const { selectValidGuestTokenSql } = require('./utils/guest-token-helpers');
const { updateOrderStatus } = require('./utils/order-status-aggregator');
const { withPaymentAttempt } = require('./utils/payment-wrapper');
const https = require('https');
const http = require('http');
require('dotenv').config();

/**
 * processPaidOrder ??? ????? ??? (Phase 3, 14.7?16.5)
 * PAID_ORDER_FAILURE_WEBHOOK_URL ??? ???????. Slack/Discord ??POST JSON.
 * ?????: ????, ????, ??? ???, paymentKey (?? 16.5)
 */
function notifyProcessPaidOrderFailure({ orderNumber, amount, paymentKey, error }) {
    const url = process.env.PAID_ORDER_FAILURE_WEBHOOK_URL;
    if (!url || typeof url !== 'string' || !url.trim()) return;

    const errMsg = error && (error.message || String(error));
    const stackFirst = (error && error.stack && error.stack.split('\n')[1]) ? error.stack.split('\n')[1].trim() : '';

    const payload = {
        text: `[processPaidOrder ???] ????: ${orderNumber || '-'}, ????: ${amount ?? '-'}, paymentKey: ${paymentKey ? String(paymentKey).substring(0, 12) + '...' : '-'}, ???: ${errMsg || '-'}${stackFirst ? ` | ${stackFirst}` : ''}`
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
            Logger.warn('[payments] processPaidOrder ??? ??? ??? ??? ???', { statusCode: res.statusCode, orderNumber });
        }
    });
    req.on('error', (e) => Logger.warn('[payments] processPaidOrder ??? ??? ??? ??? ???', { error: e.message, orderNumber }));
    req.setTimeout(5000, () => { req.destroy(); });
    req.write(postData);
    req.end();
}

// MySQL ??? ??? (order-routes.js?? ???)
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
 * ??????????????????? ??? ?? ??? ????? ??? ???
 * 
 * ??? ??:
 * {
 *   "orderNumber": "ORD-2025-...",
 *   "paymentKey": "tgen_...",
 *   "amount": 129000
 * }
 * 
 * ???:
 * 1. ?? ?? (JWT???? ?? ???? ???)
 * 2. ?????? ?? ?? ?????(?????????? ??? ???)
 * 3. ??? Confirm API ??? (???????? Basic Auth)
 * 4. payments ????? ????(status = 'captured' ??? 'authorized')
 * 5. ?? ??? ?????? ('confirmed' ??? 'processing' / ??? ??'failed')
 */
router.post('/payments/confirm', optionalAuth, verifyCSRF, async (req, res) => {
    let connection;
    try {
        const { orderNumber, paymentKey, amount, checkoutSessionKey } = req.body;
        const userId = req.user?.userId;

        // userId ?????
        Logger.log('[payments][confirm] ?? ??? ??? - userId ???', {
            userId: userId,
            userIdType: typeof userId,
            userInfo: userId ? { userId } : 'null',
            hasUser: !!req.user,
            userKeys: req.user ? Object.keys(req.user) : []
        });

        // ??? ???(?5 CheckoutSessionKey: ????????????)
        if (!checkoutSessionKey || typeof checkoutSessionKey !== 'string' || !checkoutSessionKey.trim()) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: 'checkoutSessionKey? ???????? ?? ??? ?????checkoutSessionKey???????????.'
                }
            });
        }
        if (!orderNumber || !paymentKey || amount === undefined) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'body',
                    message: 'orderNumber, paymentKey, amount? ????????'
                }
            });
        }

        // ?? ???(???, ???)
        const clientAmount = parseFloat(amount);
        if (isNaN(clientAmount) || clientAmount <= 0) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'amount',
                    message: '???????????????.'
                }
            });
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 1. ?? ?? (???: user_id ???, ???? user_id IS NULL)
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
            await connection.end();
            return res.status(404).json({
                code: 'NOT_FOUND',
                details: {
                    field: 'orderNumber',
                    message: '?????? ????????.'
                }
            });
        }

        const order = orderRows[0];

        // 2. Zero-Trust: ??-?? ??? + ?? + CONSUMED ??. [????] ?? ???? 1??: ?? ?? ??(§10.24).
        const [sessionRows] = await connection.execute(
            `SELECT order_id, status, expires_at FROM checkout_sessions WHERE session_key = ? LIMIT 1`,
            [checkoutSessionKey.trim()]
        );
        if (sessionRows.length === 0) {
            await connection.rollback();
            await connection.end();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: '???? ?? ?? ?? ???? ???????.'
                }
            });
        }
        const sessionRow = sessionRows[0];
        if (new Date(sessionRow.expires_at) <= new Date()) {
            await connection.rollback();
            await connection.end();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: '?? ??? ???????. ??/?? ???? ?? ??? ???.'
                }
            });
        }
        if (sessionRow.order_id !== order.order_id) {
            await connection.rollback();
            await connection.end();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'checkoutSessionKey',
                    message: '?? ??? ?? ??? ???? ????.'
                }
            });
        }
        if (sessionRow.status === 'CONSUMED') {
            // ??: ?? ??? ?? ? payments?? ?? ?? ?? ?? (????/??? ? UI ????)
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
            await connection.end();
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

        // 3. ?? ?? ??? (order.total_price ??, ????? ?? ?? ??)
        const serverAmount = parseFloat(order.total_price);
        const currency = order.shipping_country === 'KR' ? 'KRW' : 
                        order.shipping_country === 'US' ? 'USD' : 
                        order.shipping_country === 'JP' ? 'JPY' : 'KRW';

        // SSOT ??? paid_events????? ??? (order.status???? ??????????? ??? ?????? ??????? ???)
        const [existingPaidEvents] = await connection.execute(
            `SELECT event_id FROM paid_events WHERE order_id = ?`,
            [order.order_id]
        );

        if (existingPaidEvents.length > 0) {
            // paid_events? ???? ????? "???? ??????? ??
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

            // ?????????? ?????guest_access_token ?? (??? ???: expires_at > NOW() AND revoked_at IS NULL)
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

            // ????? ??? ???: ????? DB ??, ?????? localStorage(pm_cart_v1)????? ?????? ?? ???
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
            await connection.end();

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

        if (Math.abs(serverAmount - clientAmount) > 0.01) { // ??????? ??? ???
            await connection.rollback();
            await connection.end();
            Logger.log('?? ?? ???', {
                orderNumber,
                serverAmount,
                clientAmount
            });
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    field: 'amount',
                    message: '?? ??? ?? ??? ???? ????.'
                }
            });
        }

        // Conn A ?? ? ??? ??? ?? ??. ??: ?? Fetch ?? DB ? ???. withPaymentAttempt ?? Conn A/B? db.js ? ??.
        await connection.rollback();
        await connection.end();
        connection = null;

        const isMockMode = process.env.MOCK_GATEWAY === '1';
        const paymentMode = isMockMode ? 'MOCK' : 'TOSS';
        const orderId = order.order_id;
        const amount = serverAmount;
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
                if (!tossSecretKey) return Promise.reject(new Error('TOSS_SECRET_KEY ????));
                const authHeader = Buffer.from(`${tossSecretKey}:`).toString('base64');
                return fetch(`${tossApiBase}/v1/payments/confirm`, {
                    method: 'POST',
                    headers: { 'Authorization': `Basic ${authHeader}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ paymentKey, orderId: orderNumber, amount: serverAmount }),
                    signal
                }).then(r => r.json()).then(data => {
                    if (!data.paymentKey) throw new Error(data.message || 'Confirm ???');
                    return data;
                });
            };

        const processOrderFn = async (connB, attemptId, pgResponse) => {
            const paidEventResult = await createPaidEvent({
                orderId,
                paymentKey,
                amount,
                currency: currencyVal,
                eventSource: 'redirect',
                rawPayload: pgResponse
            });
            const paidEventId = paidEventResult.eventId;
            if (!paidEventId) throw new Error('paid_events ??? ???: eventId? null?????');
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
                amount,
                currency: currencyVal,
                eventSource: 'redirect',
                rawPayload: pgResponse
            });
            await updateOrderStatus(connB, orderId);
            return { paidEventId, paidResult };
        };

        const tossSecretKeyRef = process.env.TOSS_SECRET_KEY;
        const executeRefundFn = (cancelKey, refundPaymentKey, reason) => {
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
                body: JSON.stringify({ cancelReason: reason || '?? ?? ???' })
            }).then(r => {
                if (!r.ok) return r.json().then(d => Promise.reject(new Error(d.message || '?? ???')));
                return r.json();
            });
        };

        try {
            const result = await withPaymentAttempt({
                req,
                sessionKey: checkoutSessionKey.trim(),
                orderId,
                pgOrderId: orderNumber,
                paymentKey,
                amount,
                currency: currencyVal,
                fetchPgFn,
                processOrderFn,
                executeRefundFn
            });

            if (result.status !== 200) {
                return res.status(result.status || 500).json({
                    success: false,
                    code: 'PAYMENT_ERROR',
                    details: { message: result.message || '?? ?? ???' }
                });
            }

            const paidResult = result.data?.paidResult;
            const paymentStatus = result.data?.status === 'DONE' ? 'captured' : result.data?.status === 'IN_PROGRESS' ? 'authorized' : 'failed';
            const invoiceCreated = !!paidResult?.data?.invoiceNumber;
            const invoiceNumber = paidResult?.data?.invoiceNumber ?? null;

            let cartCleared = false;
            if (userId) {
                try {
                    const cartConn = await mysql.createConnection(dbConfig);
                    await cartConn.execute(
                        `DELETE ci FROM cart_items ci INNER JOIN carts c ON ci.cart_id = c.cart_id WHERE c.user_id = ?`,
                        [userId]
                    );
                    cartCleared = true;
                    await cartConn.end();
                } catch (cartError) {
                    Logger.log('[payments][confirm] ????? ??? ?????', { userId, error: cartError.message });
                }
            }

            Logger.log(`[payments][mode=${paymentMode}] ?? ??? ??? (withPaymentAttempt)`, {
                orderNumber,
                paymentKey,
                amount: serverAmount,
                cartCleared,
                invoiceCreated,
                invoiceNumber
            });

            if (paidResult?.data?.orderInfo) {
                try {
                    const orderInfo = paidResult.data.orderInfo;
                    let emailConnection = null;
                    try {
                        emailConnection = await mysql.createConnection(dbConfig);
                        const [orderItems] = await emailConnection.execute(
                            `SELECT product_name, size, color, quantity, unit_price, subtotal FROM order_items WHERE order_id = ? ORDER BY order_item_id`,
                            [orderInfo.order_id]
                        );
                        const [orderDetails] = await emailConnection.execute(
                            `SELECT o.shipping_name, u.name as user_name FROM orders o LEFT JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`,
                            [orderInfo.order_id]
                        );
                        const recipientEmail = orderInfo.user_email || orderInfo.shipping_email;
                        const customerName = orderDetails.length ? (orderDetails[0].user_name || orderDetails[0].shipping_name || null) : null;
                        if (recipientEmail) {
                            const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                            const orderLink = orderInfo.guest_access_token
                                ? `${baseUrl}/guest-order-access.html?token=${orderInfo.guest_access_token}`
                                : `${baseUrl}/guest/orders.html?order=${encodeURIComponent(orderInfo.order_number)}`;
                            await sendOrderConfirmationEmail(recipientEmail, {
                                orderNumber: orderInfo.order_number,
                                orderDate: orderInfo.order_date,
                                totalAmount: orderInfo.total_amount,
                                items: orderItems,
                                orderLink,
                                isGuest: !!orderInfo.guest_access_token,
                                customerName
                            });
                        }
                    } finally {
                        if (emailConnection) await emailConnection.end();
                    }
                } catch (emailError) {
                    Logger.error('[payments][confirm] ?? ??? ??????? ????? (???? ???)', {
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
                        message: '???? ?? ?? ?? ???? ???????.'
                    }
                });
            }
            if (wrapperError.message === 'SESSION_ALREADY_IN_USE') {
                return res.status(409).json({
                    code: 'SESSION_ALREADY_IN_USE',
                    details: {
                        message: '?? ??? ?? ???? ??? ?????. ???? ? ?? ???? ??? ???.'
                    }
                });
            }
            if (wrapperError.attemptId != null && (wrapperError.message === 'INSUFFICIENT_STOCK' || wrapperError.message === 'ZERO_TRUST_VIOLATION')) {
                return res.status(409).json({
                    code: wrapperError.message === 'INSUFFICIENT_STOCK' ? 'INSUFFICIENT_STOCK' : 'ZERO_TRUST_VIOLATION',
                    details: {
                        message: wrapperError.message === 'INSUFFICIENT_STOCK' ? '???? ??????.' : '?? ??????.',
                        order_number: orderNumber,
                        payment_key: paymentKey
                    }
                });
            }
            if (wrapperError.attemptId != null && (wrapperError.message === 'WATCHDOG_TIMEOUT' || wrapperError.message === 'ABORTED_CHECK_REQUIRED' || wrapperError.message === 'CLIENT_CLOSED')) {
                return res.status(409).json({
                    code: 'PAYMENT_IN_PROGRESS',
                    details: {
                        message: '??? ?? ???? ????????????',
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
                details: { message: wrapperError.message || '?? ?? ?????? ????????.' }
            });
        }

    } catch (error) {
        // (?? ?? ?? ?????- withPaymentAttempt ???????)
        if (connection) {
            try { await connection.rollback(); } catch (_) {}
            await connection.end();
        }
        const paymentMode = process.env.MOCK_GATEWAY === '1' ? 'MOCK' : 'TOSS';
        Logger.error(`[payments][mode=${paymentMode}] ?? ??? ?? ???`, {
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
                message: '?? ?? ?????? ????????.'
            }
        });
    }
});

/**
 * POST /api/payments/inicis/request
 * ?? ??: orderNumber, amount, orderName, buyerName, buyerEmail, buyerTel
 * ??: success, data.formData (INIStdPay.pay() ???)
 */
router.post('/payments/inicis/request', authenticateToken, verifyCSRF, async (req, res) => {
    let connection;
    try {
        const { orderNumber, amount, orderName, buyerName, buyerEmail, buyerTel } = req.body;
        const userId = req.user?.userId;

        // ??? ???        if (!orderNumber || !amount || !orderName || !buyerName) {
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    message: '??? ???? ???????????'
                }
            });
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // ?? ???
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
                    message: '?????? ????????.'
                }
            });
        }

        const order = orders[0];

        // ?? ???        const serverAmount = parseFloat(order.total_price);
        const clientAmount = parseFloat(amount);
        
        if (Math.abs(serverAmount - clientAmount) > 0.01) {
            await connection.rollback();
            await connection.end();
            return res.status(400).json({
                code: 'VALIDATION_ERROR',
                details: {
                    message: '?? ?????? ??????????? ??????.'
                }
            });
        }

        // ?????? ???
        const inicisMid = process.env.INICIS_MID;
        const inicisSignKey = process.env.INICIS_SIGN_KEY;
        const inicisReturnUrl = process.env.INICIS_RETURN_URL || `${req.protocol}://${req.get('host')}/api/payments/inicis/return`;

        if (!inicisMid || !inicisSignKey) {
            await connection.rollback();
            await connection.end();
            Logger.log('[payments][inicis] ?????? ??? ????, {
                hasMid: !!inicisMid,
                hasSignKey: !!inicisSignKey
            });
            return res.status(503).json({
                code: 'SERVICE_UNAVAILABLE',
                details: {
                    message: '?????? ?? ??????? ??? ??????? ???????? ?????? ????????.',
                    reason: 'INICIS_MID ??? INICIS_SIGN_KEY? ??????? ????????'
                }
            });
        }

        // ???????? ???
        const timestamp = Math.floor(Date.now() / 1000).toString();
        
        // ?????? ?? ??? ???????? (??????????? ???????
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
            gopaymethod: 'Card',  // ????? ???
            acceptmethod: 'HPP(1):no_receipt:va_receipt:below1000',  // ????? + ??????+ ?????
            language: 'ko',
            charset: 'UTF-8',
            payViewType: 'overlay'  // ?????? ??
        };

        // ??? ??? (?????? ???? ??: version + mid + goodname + oid + price + timestamp + signKey)
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

        Logger.log('[payments][inicis] ?? ??? ???', {
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
        Logger.log('[payments][inicis] ?? ??? ???', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            details: {
                message: '?? ??? ?? ?????? ????????.'
            }
        });
    }
});

/**
 * POST /api/payments/inicis/return
 * 
 * ?????? ?? ??? ???? URL
 * ?? ??????????? ??
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

        // ?? ??? ??
        if (resultCode !== '00') {
            Logger.log('[payments][inicis] ?? ???', {
                orderNumber,
                resultCode,
                resultMsg
            });
            
            // ??? ?????????????            return res.redirect(`/checkout-payment.html?status=fail&code=${resultCode}&message=${encodeURIComponent(resultMsg)}`);
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // ?? ???
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
            Logger.log('[payments][inicis] ?????? ?????', { orderNumber });
            return res.redirect(`/checkout-payment.html?status=fail&code=ORDER_NOT_FOUND&message=${encodeURIComponent('?????? ????????.')}`);
        }

        const order = orders[0];

        // ?? ???        const serverAmount = parseFloat(order.total_price);
        const clientAmount = parseFloat(amount);
        
        if (Math.abs(serverAmount - clientAmount) > 0.01) {
            await connection.rollback();
            await connection.end();
            Logger.log('[payments][inicis] ?? ????, {
                orderNumber,
                serverAmount,
                clientAmount
            });
            return res.redirect(`/checkout-payment.html?status=fail&code=AMOUNT_MISMATCH&message=${encodeURIComponent('?? ??????????? ??????.')}`);
        }

        // ???? ?????????? ??? (????
        const [existingPayments] = await connection.execute(
            'SELECT payment_id FROM payments WHERE payment_key = ? LIMIT 1',
            [tid]
        );

        if (existingPayments.length > 0) {
            // ???? ??????
            await connection.commit();
            await connection.end();
            Logger.log('[payments][inicis] ???? ??????', { orderNumber, tid });
            return res.redirect(`/order-complete.html?orderId=${orderNumber}&amount=${amount}`);
        }

        // payments ????? ????        const paymentStatus = (payMethod === 'Card' && resultCode === '00') ? 'captured' : 
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

        // Paid ?? (?? ??? ?????
        // ??: paid_events???? ????autocommit)??? ??? ??? (?? ?? ??)
        // ????? processPaidOrder()????? ??, ?? ??? ???, ???????, ?????? ???????
        // ??? ??: paid_events ??? ??? ???? ?????processing??? ?????????? ???
        let paidProcessError = null;
        if (paymentStatus === 'captured') {
            try {
                // paid_events ??? (?? ???? autocommit - ???? ????)
                // ??? ??: ?????? ?????? ?? ?????processing??? ?????????? ???
                const paidEventResult = await createPaidEvent({
                    orderId: order.order_id,
                    paymentKey: tid,
                    amount: serverAmount,
                    currency: 'KRW',
                    eventSource: 'redirect', // ??? ???: 'inicis_return' ??'redirect' (ENUM?????)
                    rawPayload: req.body
                });

                const paidEventId = paidEventResult.eventId;

                if (!paidEventId) {
                    throw new Error('paid_events ??? ???: eventId? null?????');
                }

                if (paidEventResult.alreadyExists) {
                    Logger.log('[payments][inicis] ???? ????? paid_events (????????', {
                        order_id: order.order_id,
                        order_number: orderNumber,
                        paidEventId
                    });
                }

                // ?? ?? ??????? (?? connection ???)
                // ??? ??: orders.status???? ????? ?? (?? ?????? ???)
                const paidResult = await processPaidOrder({
                    connection,
                    paidEventId: paidEventId,
                    orderId: order.order_id,
                    paymentKey: tid,
                    amount: serverAmount,
                    currency: 'KRW',
                    eventSource: 'redirect', // ??? ???: 'inicis_return' ??'redirect' (??????
                    rawPayload: req.body
                });
                
                // orders.status ?? ??? ??? (processPaidOrder ??
                // ??? ??: orders.status??order_item_units.unit_status?? paid_events ????? ??
                await updateOrderStatus(connection, order.order_id);
                
                Logger.log('[payments][inicis] Paid ?? ???', {
                    order_id: order.order_id,
                    order_number: orderNumber,
                    paidEventId,
                    stockUnitsReserved: paidResult.data.stockUnitsReserved,
                    orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
                    warrantiesCreated: paidResult.data.warrantiesCreated,
                    invoiceNumber: paidResult.data.invoiceNumber
                });
            } catch (err) {
                // ??? ??: processPaidOrder() ??? ????????? ?? (??? ?? ???)
                paidProcessError = err;
                
                Logger.error('[payments][inicis] Paid ?? ??? - ??????? ?? ???', {
                    order_id: order.order_id,
                    order_number: orderNumber,
                    error: err.message,
                    error_code: err.code,
                    error_sql_state: err.sqlState,
                    error_sql_message: err.sqlMessage,
                    stack: err.stack
                });
                
                // ??? ??????? ?? (processPaidOrder() ???? ??? ?? ??)
                await connection.rollback();
                
                // ??? ?? ?????orders.status ?? ??? ??? (paid_events? ?????paid, ?????pending)
                // ?? ???? ??????????
                try {
                    const statusConnection = await mysql.createConnection(dbConfig);
                    await updateOrderStatus(statusConnection, order.order_id);
                    await statusConnection.end();
                } catch (statusError) {
                    Logger.error('[payments][inicis] updateOrderStatus ??? (?????? ???)', {
                        order_id: order.order_id,
                        error: statusError.message
                    });
                }
                
                // ??? ???????? ????? ??? ????? ???
                // ??? paidProcessError ????? ????            }
        } else {
            // ??? ??: paymentStatus? 'captured'? ??? ????? orders.status???? ????? ??
            // (paid_events? ?????pending ?????????
            await updateOrderStatus(connection, order.order_id);
        }

        // ??? ??: processPaidOrder() ??? ???????????? ??
        // paidProcessError? ????????? ????????????????? ?????? ???
        if (paidProcessError) {
            await connection.end();

            notifyProcessPaidOrderFailure({
                orderNumber,
                amount: serverAmount,
                paymentKey: tid || null,
                error: paidProcessError
            });

            Logger.error('[payments][inicis] ??????????????? ?? ???', {
                orderNumber,
                tid,
                amount: serverAmount,
                error: paidProcessError.message,
                error_code: paidProcessError.code
            });
            
            // ??? ????????????? ????????? ?????(7??UX). ???????????????? ???
            if (paidProcessError.code === 'INSUFFICIENT_STOCK') {
                return res.redirect('/checkout-payment.html?status=fail&code=INSUFFICIENT_STOCK');
            }
            
            return res.status(500).json({
                code: 'ORDER_PROCESSING_FAILED',
                details: {
                    message: '??????????????? ??? ??????? ???????? ??? ????? ?????????.',
                    order_number: orderNumber
                }
            });
        }

        // ????? ??? (??????? ?????
        if (order.user_id) {
            try {
                await connection.execute(
                    `DELETE ci FROM cart_items ci
                     INNER JOIN carts c ON ci.cart_id = c.cart_id
                     WHERE c.user_id = ?`,
                    [order.user_id]
                );
            } catch (cartError) {
                Logger.log('[payments][inicis] ????? ??? ?????', {
                    userId: order.user_id,
                    error: cartError.message
                });
            }
        }

        // ?? ??? ??? ????????? ??
        await connection.commit();
        await connection.end();

        Logger.log('[payments][inicis] ?? ???', {
            orderNumber,
            tid,
            amount: serverAmount,
            payMethod,
            status: paymentStatus
        });

        // ============================================================
        // ?? ??? ??????? (??????? ????)
        // ============================================================
        if (paymentStatus === 'captured' && !paidProcessError) {
            try {
                // paidResult? ?????? ???? ???
                let orderInfoForEmail = null;
                if (typeof paidResult !== 'undefined' && paidResult?.data?.orderInfo) {
                    orderInfoForEmail = paidResult.data.orderInfo;
                } else {
                    // paidResult? ??????? ???????????
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
                            
                            // guest_order_access_tokens ?? (??????????, ??? ??: ??? ???)
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
                    // ?? ???? ??? ?? (?? ????
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

                        // ?? ??? ??
                        const [orderDetails] = await emailConnection2.execute(
                            `SELECT 
                                o.shipping_name,
                                u.name as user_name
                            FROM orders o
                            LEFT JOIN users u ON o.user_id = u.user_id
                            WHERE o.order_id = ?`,
                            [orderInfoForEmail.order_id]
                        );

                        // ????????????
                        const recipientEmail = orderInfoForEmail.user_email || orderInfoForEmail.shipping_email;
                        
                        // ?? ??? ??
                        const customerName = orderDetails.length > 0 
                            ? (orderDetails[0].user_name || orderDetails[0].shipping_name || null)
                            : null;
                        
                        if (!recipientEmail) {
                            Logger.warn('[payments][inicis] ??????? ???? (?????????????)', {
                                order_id: orderInfoForEmail.order_id,
                                order_number: orderInfoForEmail.order_number
                            });
                        } else {
                            // ?? ?? ???
                            let orderLink;
                            if (orderInfoForEmail.guest_access_token) {
                                // ??????: ??? ??? ?? ??
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest-order-access.html?token=${orderInfoForEmail.guest_access_token}`;
                            } else {
                                // ??? ??: ??? ?? ??? (????? ??? ???)
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest/orders.html?order=${encodeURIComponent(orderInfoForEmail.order_number)}`;
                            }

                            // ??????? (???? ?????? ?? ????? ????)
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
                                Logger.log('[payments][inicis] ?? ??? ??????? ???', {
                                    order_id: orderInfoForEmail.order_id,
                                    order_number: orderInfoForEmail.order_number,
                                    recipient: recipientEmail
                                });
                            } else {
                                Logger.warn('[payments][inicis] ?? ??? ??????? ??? (???? ???)', {
                                    order_id: orderInfoForEmail.order_id,
                                    order_number: orderInfoForEmail.order_number,
                                    recipient: recipientEmail,
                                    error: emailResult.error
                                });
                            }

                            // ??????? ?? ??? 1??? (?????? ?? ????????)
                        }
                    } catch (emailError) {
                        // ??????? ?????????(?? ????? ????)
                        Logger.error('[payments][inicis] ?? ??? ??????? ????? (???? ???)', {
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
                // ?????????? ?? ?????????(?? ????? ????)
            Logger.warn('[payments][inicis] ???????? ??? (???? ???)', {
                orderNumber,
                error: emailSectionError?.message,
                stack: emailSectionError?.stack
            });
        }
        }

        // ??? ?????????????        return res.redirect(`/order-complete.html?orderId=${orderNumber}&amount=${amount}`);

    } catch (error) {
        if (connection) {
            await connection.rollback();
            await connection.end();
        }
        Logger.log('[payments][inicis] ?? ?? ???', {
            error: error.message,
            stack: error.stack
        });
        return res.redirect(`/checkout-payment.html?status=fail&code=INTERNAL_ERROR&message=${encodeURIComponent('?? ?? ?????? ????????.')}`);
    }
});

/**
 * ??? HMAC ??? ??????
 * 
 * ???????? ??? ??? ?????:
 * 1. ??? ??(body)??????? ????(JSON.stringify)
 * 2. WEBHOOK_SHARED_SECRET??? HMAC-SHA256 ??
 * 3. Base64 ??????????? ????? ??
 * 
 * @param {Object} body - ??? ?? ??
 * @param {String} signature - x-toss-signature ??? ?? * @param {String} secret - WEBHOOK_SHARED_SECRET
 * @returns {Boolean} ??? ?????
 */
function verifyWebhookSignature(body, signature, secret) {
    // ??????: signature??secret???????false ??
    if (!signature || !secret) {
        Logger.log('[payments][webhook] ??? ??? ??????????', {
            hasSignature: !!signature,
            hasSecret: !!secret
        });
        return false;
    }

    // secret??????????????????
    if (secret === 'your_webhook_secret_here') {
        Logger.log('[payments][webhook] ????????? ???????', {
            hasSignature: !!signature
        });
        return false;
    }

    try {
        // ??? ????????? ????        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        
        // HMAC-SHA256 ??
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(bodyString);
        const calculatedSignature = hmac.digest('base64');

        // ??? ?? (????? ?? ???????? crypto.timingSafeEqual ??? ??)
        // ??? ???? ???????(??? ??? ????? ???? ??? ?????)
        const isValid = calculatedSignature === signature;

        if (!isValid) {
            Logger.log('[payments][webhook] ??? ??????', {
                receivedSignature: signature.substring(0, 20) + '...', // ??????? ??? ??? ???
                calculatedSignature: calculatedSignature.substring(0, 20) + '...',
                bodyLength: bodyString.length
            });
        }

        return isValid;
    } catch (error) {
        Logger.log('[payments][webhook] ??? ????????', {
            error: error.message
        });
        return false;
    }
}

/**
 * ???????? ?? ?? API (????????)
 * 
 * @param {string} paymentKey - ?? ?? * @returns {Object|null} ??? API ??? ??? null
 */
async function verifyPaymentWithToss(paymentKey) {
    try {
        const tossApiBase = process.env.TOSS_API_BASE || 'https://api.tosspayments.com';
        const tossSecretKey = process.env.TOSS_SECRET_KEY;

        if (!tossSecretKey) {
            Logger.log('[payments][webhook] TOSS_SECRET_KEY? ??????? ??? ???????? ???????');
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
            Logger.log('[payments][webhook] ??? ?? ?? ???', {
                paymentKey: paymentKey.substring(0, 10) + '...',
                status: response.status,
                statusText: response.statusText
            });
            return null;
        }

        const paymentData = await response.json();
        Logger.log('??[payments][webhook] ??? ?? ????????', {
            paymentKey: paymentKey.substring(0, 10) + '...',
            status: paymentData.status,
            orderId: paymentData.orderId
        });

        return paymentData;
    } catch (error) {
        Logger.log('[payments][webhook] ??? ?? ?? ?????', {
            error: error.message,
            paymentKey: paymentKey ? paymentKey.substring(0, 10) + '...' : 'unknown'
        });
        return null;
    }
}

/**
 * ??? ????? ?? ??? ?????
 * 
 * @param {Object} connection - MySQL ???
 * @param {Object} data - ??? ????? */
async function handlePaymentStatusChange(connection, data) {
    if (!data) {
        Logger.log('[payments][webhook] ?? ??? ??? ????????');
        return;
    }

    // ???????? ??? ??????????? ??? ??
    // seller.changed ?????? ?? data ??? ???? ?????
    const paymentKey = data.paymentKey || data.payment?.paymentKey || data.id;
    const orderId = data.orderId || data.payment?.orderId || data.order?.orderId;
    const webhookStatus = data.status || data.payment?.status || data.state;
    const webhookAmount = data.totalAmount || data.payment?.totalAmount || data.amount;

    if (!paymentKey) {
        Logger.log('[payments][webhook] ?? ??? ??? paymentKey ???', { data });
        return;
    }

    // ??? ??: ??? API??????????(??? payload?????????????? ???)
    const verifiedPayment = await verifyPaymentWithToss(paymentKey);
    
    if (!verifiedPayment) {
        Logger.warn('[payments][webhook] ??? ???????? - ??? ?? ??', {
            paymentKey: paymentKey.substring(0, 10) + '...',
            orderId
        });
        // ???????? ????? ?? ?? (??)
        return;
    }

    // ???????????? ??? ???
    const status = verifiedPayment.status;
    const verifiedOrderId = verifiedPayment.orderId;
    const verifiedAmount = verifiedPayment.totalAmount;

    // ??? payload?? ??????? ??? ???? ???    if (orderId && verifiedOrderId && orderId !== verifiedOrderId) {
        Logger.warn('[payments][webhook] orderId ????- ??? ?? ??', {
            webhookOrderId: orderId,
            verifiedOrderId: verifiedOrderId,
            paymentKey: paymentKey.substring(0, 10) + '...'
        });
        return;
    }

    if (webhookAmount && verifiedAmount && webhookAmount !== verifiedAmount) {
        Logger.warn('[payments][webhook] amount ????- ??? ?? ??', {
            webhookAmount,
            verifiedAmount,
            paymentKey: paymentKey.substring(0, 10) + '...'
        });
        return;
    }

    // ??????????????? ??? ?? (??? payload? ??? ??? ??? ??? ???)
    
    // ???????? ????????? ??????? (??????? ???)
    let paymentStatus;
    // ??? orderStatus ??????: orders.status???? ????? ??
    
    // ???????? ???: DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED
    const statusUpper = String(status || '').toUpperCase();
    
    if (statusUpper === 'DONE' || statusUpper === 'COMPLETED' || statusUpper === 'CONFIRMED') {
        paymentStatus = 'captured';
    } else if (statusUpper === 'CANCELED' || statusUpper === 'CANCELLED' || statusUpper === 'PARTIAL_CANCELED') {
        paymentStatus = 'cancelled';
    } else if (statusUpper === 'ABORTED' || statusUpper === 'EXPIRED' || statusUpper === 'FAILED') {
        paymentStatus = 'failed';
    } else {
        Logger.log('[payments][webhook] ??????? ?? ??? (???????)', { 
            status,
            statusUpper,
            paymentKey: paymentKey.substring(0, 10) + '...',
            orderId: verifiedOrderId
        });
        // ??????? ???????????????????? ???
        return;
    }

    // ??????: ???? ????paymentKey???? ???
    const [existingPayments] = await connection.execute(
        `SELECT status, updated_at FROM payments WHERE payment_key = ?`,
        [paymentKey]
    );

    if (existingPayments.length > 0) {
        const existingStatus = existingPayments[0].status;
        // ???? ??? ????????????? ?????
        if (existingStatus === paymentStatus) {
            Logger.log('[payments][webhook] ???? ?????? (????', {
                paymentKey: paymentKey.substring(0, 10) + '...',
                status: paymentStatus,
                orderId: verifiedOrderId
            });
            return;
        }
    }

    try {
        // payments ???????????
        const [paymentRows] = await connection.execute(
            `UPDATE payments 
             SET status = ?, updated_at = NOW() 
             WHERE payment_key = ?`,
            [paymentStatus, paymentKey]
        );

        if (paymentRows.affectedRows === 0) {
            Logger.log('[payments][webhook] payments ????? ??? payment_key ???', { paymentKey });
        } else {
            Logger.log('??[payments][webhook] payments ??????????? ???', {
                paymentKey,
                status: paymentStatus,
                affectedRows: paymentRows.affectedRows
            });
        }

        // orders ??????????? (?????????orderId ???)
        // ??? ??: orders.status???? ????? ?? (?? ?????? ???)
        const finalOrderId = verifiedOrderId || orderId;
        let orderIdForPaidProcess = null;
        
        if (finalOrderId) {
            // order_number??order_id ??
            const [orderRows] = await connection.execute(
                `SELECT order_id FROM orders WHERE order_number = ?`,
                [finalOrderId]
            );

            if (orderRows.length > 0) {
                orderIdForPaidProcess = orderRows[0].order_id;
                
                // ?????????: ?? ??? ???
                await updateOrderStatus(connection, orderIdForPaidProcess);
                
                Logger.log('??[payments][webhook] orders.status ?? ???', {
                    orderId: finalOrderId,
                    order_id: orderIdForPaidProcess
                });
            }
        } else {
            // orderId? ?????payment_key??orders ??
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
                
                // ?????????: ?? ??? ???
                await updateOrderStatus(connection, orderIdForPaidProcess);
                
                Logger.log('[payments][webhook] orders.status ?? ??? (payment_key????)', {
                    paymentKey: paymentKey.substring(0, 10) + '...',
                    order_number: orderNumber,
                    order_id: orderIdForPaidProcess
                });
            }
        }

        // Paid ?? (?? ??? ?????
        // ??: paid_events???? ????autocommit)??? ??? ??? (?? ?? ??)
        let paidResultForEmail = null;
        if (paymentStatus === 'captured' && orderIdForPaidProcess) {
            try {
                // paid_events ??? (?? ???? autocommit - ???? ????)
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
                    Logger.log('[payments][webhook] ???? ????? paid_events (????????', {
                        order_id: orderIdForPaidProcess,
                        order_number: finalOrderId,
                        paidEventId
                    });
                }

                // ?? ?? ??????? (?? connection ???)
                // ??? ??: orders.status???? ????? ?? (?? ?????? ???)
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
                
                // ???????????? ??? ????                paidResultForEmail = paidResult;
                
                // orders.status ?? ??? ??? (processPaidOrder ??
                // ??? ??: orders.status??order_item_units.unit_status?? paid_events ????? ??
                await updateOrderStatus(connection, orderIdForPaidProcess);
                
                Logger.log('[payments][webhook] Paid ?? ???', {
                    order_id: orderIdForPaidProcess,
                    order_number: finalOrderId,
                    paidEventId,
                    stockUnitsReserved: paidResult.data.stockUnitsReserved,
                    orderItemUnitsCreated: paidResult.data.orderItemUnitsCreated,
                    warrantiesCreated: paidResult.data.warrantiesCreated,
                    invoiceNumber: paidResult.data.invoiceNumber
                });
            } catch (err) {
                // ??? ??: processPaidOrder() ??? ????????? ?? (??? ?? ???)
                Logger.error('[payments][webhook] Paid ?? ??? - ??????? ?? ???', {
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

                // ??? ??????? ?? (processPaidOrder() ???? ??? ?? ??)
                // paid_events???? ????autocommit)??? ?????? ????????????
                await connection.rollback();

                // ??? ???????? ????? ??? ??????                // ????? ??? ??????????, ?? ??????? ????????
                // ?????????????(paid_events??????
            }
        }

    } catch (error) {
        Logger.log('[payments][webhook] ?? ??? ????? ???', {
            error: error.message,
            paymentKey: paymentKey ? paymentKey.substring(0, 10) + '...' : 'unknown',
            orderId: verifiedOrderId || orderId
        });
        throw error;
    }
    
    // Paid ?? ??? ?????????????? ??? ??
    // (?????? ????commit ?????????)
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
 * ??? ????? ??? ?? ??
 * 
 * @param {Object} connection - MySQL ???
 * @param {Object} data - ??? ????? */
async function handleDepositCallback(connection, data) {
    // ??? ???? ???????
    Logger.log('[payments][webhook] ??? ?? ???', { data });
}

/**
 * POST /api/payments/webhook
 * 
 * ???????? ??? ??? ???????? * 
 * ??? ??: ??????????
 * - ???????? ????? HMAC ???????????? ??????.
 * - ??? payload?????????????? ???, ??? API????????????????.
 * - handlePaymentStatusChange ??????? verifyPaymentWithToss() ???
 * - ???????? ??? ?????????????? ?? ??
 * 
 * ??: ??? ??? ??
 * https://docs.tosspayments.com/guides/v2/webhook/overview
 */
router.post('/payments/webhook', async (req, res) => {
    try {
        // ??? ??: ??? ????? ????????????????? ??????        // ??????????????(handlePaymentStatusChange ??????? ???)
        // WEBHOOK_SHARED_SECRET?? ???? ???????? ??? (??? ?????? ????
        
        Logger.log('??[payments][webhook] ??? ??? - ???????????? ???');

        const { eventType, data } = req.body;

        Logger.log('??[payments][webhook] ??? ??? (??? ??????)', {
            eventType,
            data: data ? {
                orderId: data.orderId,
                paymentKey: data.paymentKey,
                status: data.status
            } : null
        });

        // ??? ?????? ??? payments & orders ?????(??? ??????)
        let connection;
        try {
            connection = await mysql.createConnection(dbConfig);
            await connection.beginTransaction();

            // ?????????? ??? ??
            // ???????? ????: seller.changed = ?? ??? ????????            let emailInfo = null;
            if (eventType === 'PAYMENT_STATUS_CHANGED' || 
                eventType === 'CANCEL_STATUS_CHANGED' || 
                eventType === 'seller.changed') {
                emailInfo = await handlePaymentStatusChange(connection, data);
            } else if (eventType === 'DEPOSIT_CALLBACK') {
                await handleDepositCallback(connection, data);
            } else if (eventType === 'payout.changed') {
                // ????????? ???(???????)
                Logger.log('[payments][webhook] ????????? ??????', { data });
            } else {
                Logger.log('[payments][webhook] ??????? ?????????(??????)', { 
                    eventType,
                    hasData: !!data
                });
            }

            await connection.commit();
            await connection.end();
            Logger.log('??[payments][webhook] ??? ?? ???', { eventType });

            // ============================================================
            // ?? ??? ??????? (??????? ????)
            // ============================================================
            if (emailInfo && emailInfo.shouldSendEmail) {
                try {
                    // ?? ???? ??? ?? (?? ????
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

                        // ?? ??? ??
                        const [orderDetails] = await emailConnection.execute(
                            `SELECT 
                                o.shipping_name,
                                u.name as user_name
                            FROM orders o
                            LEFT JOIN users u ON o.user_id = u.user_id
                            WHERE o.order_id = ?`,
                            [emailInfo.orderId]
                        );

                        // ????????????
                        const recipientEmail = emailInfo.orderInfo.user_email || emailInfo.orderInfo.shipping_email;
                        
                        // ?? ??? ??
                        const customerName = orderDetails.length > 0 
                            ? (orderDetails[0].user_name || orderDetails[0].shipping_name || null)
                            : null;
                        
                        if (!recipientEmail) {
                            Logger.warn('[payments][webhook] ??????? ???? (?????????????)', {
                                order_id: emailInfo.orderId,
                                order_number: emailInfo.orderInfo.order_number
                            });
                        } else {
                            // ?? ?? ???
                            let orderLink;
                            if (emailInfo.orderInfo.guest_access_token) {
                                // ??????: ??? ??? ?? ??
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest-order-access.html?token=${emailInfo.orderInfo.guest_access_token}`;
                            } else {
                                // ??? ??: ??? ?? ??? (????? ??? ???)
                                const baseUrl = process.env.FRONTEND_URL || (req.get('x-forwarded-proto') === 'https' ? 'https://' : 'http://') + req.get('host');
                                orderLink = `${baseUrl}/guest/orders.html?order=${encodeURIComponent(emailInfo.orderInfo.order_number)}`;
                            }

                            // ??????? (???? ?????? ?? ????? ????)
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
                                Logger.log('[payments][webhook] ?? ??? ??????? ???', {
                                    order_id: emailInfo.orderId,
                                    order_number: emailInfo.orderInfo.order_number,
                                    recipient: recipientEmail
                                });
                            } else {
                                Logger.warn('[payments][webhook] ?? ??? ??????? ??? (???? ???)', {
                                    order_id: emailInfo.orderId,
                                    order_number: emailInfo.orderInfo.order_number,
                                    recipient: recipientEmail,
                                    error: emailResult.error
                                });
                            }

                            // ??????? ?? ??? 1??? (?????? ?? ????????)
                        }
                    } finally {
                        if (emailConnection) await emailConnection.end();
                    }
                } catch (emailError) {
                    // ??????? ?????????(?? ????? ????)
                    Logger.error('[payments][webhook] ?? ??? ??????? ????? (???? ???)', {
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
            Logger.log('[payments][webhook] ??? ?? ?????', {
                error: webhookError.message,
                stack: webhookError.stack
            });
            // ??? ??????????????200 ?? (???????? ????????)
        }

        // ????? ???? 200 OK ?? (???????? ????????)
        res.status(200).json({ received: true });

    } catch (error) {
        Logger.log('[payments][webhook] ??? ?? ???', {
            error: error.message
        });
        // ??? ?????200 ?? (???????? ????????)
        res.status(200).json({ received: true, error: 'Internal error' });
    }
});

module.exports = router;
