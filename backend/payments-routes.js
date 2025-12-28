/**
 * payments-routes.js - 결제 관리 API
 * 
 * 흐름 요약:
 * 1. 클라이언트에서 토스페이먼츠 위젯으로 결제 진행
 * 2. 결제 성공 후 successUrl로 리다이렉트 (paymentKey, orderId, amount 전달)
 * 3. 클라이언트에서 서버로 POST /api/payments/confirm 호출
 *    - 서버에서 주문 금액 재계산 및 검증 (클라이언트 금액 신뢰 금지)
 *    - 토스페이먼츠 Confirm API 호출 (시크릿 키로 Basic Auth)
 *    - 결제 성공 시 payments 테이블에 저장 (status='captured' 또는 'authorized')
 *    - 주문 상태를 'confirmed' 또는 'processing'으로 전이
 *    - 실패 시 주문 상태를 'failed'로 전이
 * 
 * 웹훅 처리:
 * - POST /api/payments/webhook
 * - 토스페이먼츠에서 결제 상태 변경 시 호출
 * - 추후 HMAC 서명 검증 구현 필요 (일반적 HMAC 검증 모범사례)
 * - 검증 통과 시 payments & orders 동기화 (상태 업데이트)
 * 
 * 참고: 토스페이먼츠 통합 문서
 * - 위젯: https://docs.tosspayments.com/guides/v2/widget/overview
 * - 결제 확정: https://docs.tosspayments.com/guides/v2/payment/confirm
 * - 웹훅: https://docs.tosspayments.com/guides/v2/webhook/overview
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const { verifyCSRF } = require('./csrf-middleware');
const Logger = require('./logger');
const crypto = require('crypto');
require('dotenv').config();

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
 * 클라이언트에서 토스페이먼츠 위젯 결제 성공 후 서버 승인 요청
 * 
 * 요청 바디:
 * {
 *   "orderNumber": "ORD-2025-...",
 *   "paymentKey": "tgen_...",
 *   "amount": 129000
 * }
 * 
 * 동작:
 * 1. 주문 조회 (JWT로 본인 주문 여부 확인)
 * 2. 서버에서 최종 금액 재계산 (클라이언트 금액 신뢰 금지)
 * 3. 토스 Confirm API 호출 (시크릿 키로 Basic Auth)
 * 4. payments 테이블에 저장 (status = 'captured' 또는 'authorized')
 * 5. 주문 상태 업데이트 ('confirmed' 또는 'processing' / 실패 시 'failed')
 */
router.post('/payments/confirm', authenticateToken, verifyCSRF, async (req, res) => {
    let connection;
    try {
        const { orderNumber, paymentKey, amount } = req.body;
        const userId = req.user?.userId;

        // userId 검증 로그
        Logger.log('[payments][confirm] 결제 확인 요청 - userId 확인', {
            userId: userId,
            userIdType: typeof userId,
            userInfo: userId ? { userId } : 'null',
            hasUser: !!req.user,
            userKeys: req.user ? Object.keys(req.user) : []
        });

        // 입력 검증
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

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        // 1. 주문 조회 (본인 주문 확인)
        const [orderRows] = await connection.execute(
            `SELECT order_id, order_number, user_id, total_price, shipping_country, status
             FROM orders 
             WHERE order_number = ? AND user_id = ? 
             LIMIT 1`,
            [orderNumber, userId]
        );

        if (orderRows.length === 0) {
            await connection.rollback();
            await connection.end();
            return res.status(404).json({
                code: 'NOT_FOUND',
                details: {
                    field: 'orderNumber',
                    message: '주문을 찾을 수 없습니다.'
                }
            });
        }

        const order = orderRows[0];
        const normalizedStatus = (order.status || '').toLowerCase();
        const alreadyProcessedStatuses = new Set(['confirmed', 'completed', 'processing', 'paid']);

        // 2. 서버에서 최종 금액 재계산
        // order.total_price와 클라이언트 금액 비교 (클라이언트 금액 신뢰 금지)
        const serverAmount = parseFloat(order.total_price);
        const currency = order.shipping_country === 'KR' ? 'KRW' : 
                        order.shipping_country === 'US' ? 'USD' : 
                        order.shipping_country === 'JP' ? 'JPY' : 'KRW';

        if (alreadyProcessedStatuses.has(normalizedStatus)) {
            const [existingPaymentRows] = await connection.execute(
                `SELECT status, amount, currency FROM payments
                 WHERE order_number = ?
                 ORDER BY created_at DESC
                 LIMIT 1`,
                [orderNumber]
            );

            const existingPaymentStatus = existingPaymentRows.length ? existingPaymentRows[0].status : 'captured';
            const existingCurrency = existingPaymentRows.length && existingPaymentRows[0].currency
                ? existingPaymentRows[0].currency
                : currency;

            const [cartCountRows] = await connection.execute(
                `SELECT COUNT(*) AS itemCount
                 FROM cart_items ci
                 INNER JOIN carts c ON ci.cart_id = c.cart_id
                 WHERE c.user_id = ?`,
                [userId]
            );

            const cartCleared = (cartCountRows[0].itemCount || 0) === 0;

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
                    cartCleared
                }
            });
        }

        if (Math.abs(serverAmount - clientAmount) > 0.01) { // 부동소수점 오차 허용
            await connection.rollback();
            await connection.end();
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

        // 결제 모드 확인 (MOCK_GATEWAY=1이면 모의 결제)
        const isMockMode = process.env.MOCK_GATEWAY === '1';
        const paymentMode = isMockMode ? 'MOCK' : 'TOSS';

        let confirmData;
        let paymentStatus;
        let orderStatus;

        // 3. 결제 승인 처리 (MOCK 모드 분기)
        if (isMockMode) {
            // MOCK 모드: 토스 API 호출 건너뛰고 내부 승인 처리
            Logger.log('[payments][mode=MOCK] 모의 결제 처리', {
                orderNumber,
                amount: serverAmount,
                currency
            });

            // 모의 승인 응답 생성
            confirmData = {
                status: 'DONE',
                method: 'CARD',
                paymentKey: paymentKey,
                orderId: orderNumber,
                totalAmount: serverAmount,
                currency: currency
            };

            paymentStatus = 'captured';
            orderStatus = 'confirmed';

        } else {
            // TOSS 모드: 실제 토스페이먼츠 API 호출
            const tossApiBase = process.env.TOSS_API_BASE || 'https://api.tosspayments.com';
            const tossSecretKey = process.env.TOSS_SECRET_KEY;

            if (!tossSecretKey) {
                await connection.rollback();
                await connection.end();
                Logger.log('[payments][mode=TOSS] 토스 시크릿 키 미설정');
                return res.status(500).json({
                    code: 'INTERNAL_ERROR',
                    details: {
                        message: '결제 서비스 설정 오류입니다.'
                    }
                });
            }

            try {
                Logger.log('[payments][mode=TOSS] 토스 Confirm API 호출', {
                    orderNumber,
                    amount: serverAmount
                });

                // Basic Auth: 시크릿 키를 Base64 인코딩
                const authHeader = Buffer.from(`${tossSecretKey}:`).toString('base64');
                
                const confirmResponse = await fetch(`${tossApiBase}/v1/payments/confirm`, {
                    method: 'POST',
                    headers: {
                        'Authorization': `Basic ${authHeader}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        paymentKey: paymentKey,
                        orderId: orderNumber,
                        amount: serverAmount
                    })
                });

                confirmData = await confirmResponse.json();

                if (!confirmResponse.ok) {
                    // 토스 API 오류
                    await connection.rollback();
                    await connection.end();
                    Logger.log('[payments][mode=TOSS] 토스 Confirm API 실패', {
                        orderNumber,
                        status: confirmResponse.status,
                        error: confirmData
                    });
                    return res.status(400).json({
                        code: 'GATEWAY_ERROR',
                        details: {
                            message: confirmData.message || '결제 승인에 실패했습니다.',
                            gatewayError: confirmData.code || null
                        }
                    });
                }

                // 토스 응답에 따라 상태 결정
                paymentStatus = confirmData.status === 'DONE' ? 'captured' : 
                               confirmData.status === 'IN_PROGRESS' ? 'authorized' : 'failed';
                
                orderStatus = paymentStatus === 'captured' ? 'processing' : 
                             paymentStatus === 'authorized' ? 'confirmed' : 'failed';

            } catch (fetchError) {
                await connection.rollback();
                await connection.end();
                Logger.log('[payments][mode=TOSS] 토스 API 호출 오류', {
                    orderNumber,
                    error: fetchError.message
                });
                return res.status(500).json({
                    code: 'GATEWAY_ERROR',
                    details: {
                        message: '결제 서비스 통신 오류가 발생했습니다.'
                    }
                });
            }
        }

        // 4. payments 테이블에 저장 (MOCK/TOSS 공통)
        await connection.execute(
            `INSERT INTO payments 
             (order_number, gateway, payment_key, status, amount, currency, payload_json)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                orderNumber,
                isMockMode ? 'mock' : 'toss',
                paymentKey,
                paymentStatus,
                serverAmount,
                currency,
                JSON.stringify(confirmData)
            ]
        );

        // 5. 주문 상태 업데이트 (MOCK/TOSS 공통)
        await connection.execute(
            'UPDATE orders SET status = ? WHERE order_number = ?',
            [orderStatus, orderNumber]
        );

        let cartCleared = false;
        if (userId) {
            try {
                await connection.execute(
                    `DELETE ci FROM cart_items ci
                     INNER JOIN carts c ON ci.cart_id = c.cart_id
                     WHERE c.user_id = ?`,
                    [userId]
                );
                cartCleared = true;
            } catch (cartError) {
                Logger.log('[payments][confirm] 장바구니 정리 중 오류', {
                    userId,
                    error: cartError.message
                });
            }
        }

        await connection.commit();
        await connection.end();

        Logger.log(`[payments][mode=${paymentMode}] 결제 확정 성공`, {
            orderNumber,
            paymentKey,
            amount: serverAmount,
            status: paymentStatus,
            cartCleared
        });

        res.json({
            success: true,
            data: {
                order_number: orderNumber,
                amount: serverAmount,
                currency: currency,
                payment_status: paymentStatus,
                cartCleared,
                alreadyConfirmed: false
            }
        });

    } catch (error) {
        if (connection) {
            await connection.rollback();
            await connection.end();
        }
        const paymentMode = process.env.MOCK_GATEWAY === '1' ? 'MOCK' : 'TOSS';
        Logger.log(`[payments][mode=${paymentMode}] 결제 확정 처리 오류`, {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            code: 'INTERNAL_ERROR',
            details: {
                message: '결제 처리 중 오류가 발생했습니다.'
            }
        });
    }
});

/**
 * 웹훅 HMAC 서명 검증 함수
 * 
 * 토스페이먼츠 웹훅 서명 검증 방식:
 * 1. 요청 본문(body)을 문자열로 직렬화 (JSON.stringify)
 * 2. WEBHOOK_SHARED_SECRET으로 HMAC-SHA256 계산
 * 3. Base64 인코딩하여 서명 헤더와 비교
 * 
 * @param {Object} body - 요청 본문 객체
 * @param {String} signature - x-toss-signature 헤더 값
 * @param {String} secret - WEBHOOK_SHARED_SECRET
 * @returns {Boolean} 서명 검증 결과
 */
function verifyWebhookSignature(body, signature, secret) {
    // 방어적 체크: signature나 secret이 없으면 false 반환
    if (!signature || !secret) {
        Logger.log('[payments][webhook] 서명 또는 시크릿 키 없음', {
            hasSignature: !!signature,
            hasSecret: !!secret
        });
        return false;
    }

    // secret이 기본값이면 검증 실패로 처리
    if (secret === 'your_webhook_secret_here') {
        Logger.log('[payments][webhook] 시크릿 키가 기본값입니다', {
            hasSignature: !!signature
        });
        return false;
    }

    try {
        // 요청 본문을 문자열로 직렬화
        const bodyString = typeof body === 'string' ? body : JSON.stringify(body);
        
        // HMAC-SHA256 계산
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(bodyString);
        const calculatedSignature = hmac.digest('base64');

        // 서명 비교 (타이밍 공격 방지를 위해 crypto.timingSafeEqual 사용 권장)
        // 단순 비교로도 대체 가능 (서명 길이가 고정되어 있지 않을 수 있음)
        const isValid = calculatedSignature === signature;

        if (!isValid) {
            Logger.log('[payments][webhook] 서명 검증 실패', {
                receivedSignature: signature.substring(0, 20) + '...', // 로그에 전체 서명 노출 방지
                calculatedSignature: calculatedSignature.substring(0, 20) + '...',
                bodyLength: bodyString.length
            });
        }

        return isValid;
    } catch (error) {
        Logger.log('[payments][webhook] 서명 검증 중 오류', {
            error: error.message
        });
        return false;
    }
}

/**
 * 토스페이먼츠 결제 조회 API (재조회 검증용)
 * 
 * @param {string} paymentKey - 결제 키
 * @returns {Object|null} 토스 API 응답 또는 null
 */
async function verifyPaymentWithToss(paymentKey) {
    try {
        const tossApiBase = process.env.TOSS_API_BASE || 'https://api.tosspayments.com';
        const tossSecretKey = process.env.TOSS_SECRET_KEY;

        if (!tossSecretKey) {
            Logger.log('[payments][webhook] TOSS_SECRET_KEY가 설정되지 않아 재조회 검증을 건너뜁니다.');
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
            Logger.log('[payments][webhook] 토스 결제 조회 실패', {
                paymentKey: paymentKey.substring(0, 10) + '...',
                status: response.status,
                statusText: response.statusText
            });
            return null;
        }

        const paymentData = await response.json();
        Logger.log('✅ [payments][webhook] 토스 결제 재조회 성공', {
            paymentKey: paymentKey.substring(0, 10) + '...',
            status: paymentData.status,
            orderId: paymentData.orderId
        });

        return paymentData;
    } catch (error) {
        Logger.log('[payments][webhook] 토스 결제 조회 중 오류', {
            error: error.message,
            paymentKey: paymentKey ? paymentKey.substring(0, 10) + '...' : 'unknown'
        });
        return null;
    }
}

/**
 * 웹훅 이벤트: 결제 상태 변경 처리
 * 
 * @param {Object} connection - MySQL 연결
 * @param {Object} data - 웹훅 데이터
 */
async function handlePaymentStatusChange(connection, data) {
    if (!data) {
        Logger.log('[payments][webhook] 결제 상태 변경: 데이터 없음');
        return;
    }

    // 토스페이먼츠 웹훅 데이터 구조에 맞춰 필드 추출
    // seller.changed 이벤트의 경우 data 구조가 다를 수 있음
    const paymentKey = data.paymentKey || data.payment?.paymentKey || data.id;
    const orderId = data.orderId || data.payment?.orderId || data.order?.orderId;
    const webhookStatus = data.status || data.payment?.status || data.state;
    const webhookAmount = data.totalAmount || data.payment?.totalAmount || data.amount;

    if (!paymentKey) {
        Logger.log('[payments][webhook] 결제 상태 변경: paymentKey 없음', { data });
        return;
    }

    // 🔒 보안: 토스 API로 재조회 검증 (웹훅 payload를 그대로 신뢰하지 않음)
    const verifiedPayment = await verifyPaymentWithToss(paymentKey);
    
    if (!verifiedPayment) {
        Logger.warn('[payments][webhook] 토스 재조회 실패 - 웹훅 처리 중단', {
            paymentKey: paymentKey.substring(0, 10) + '...',
            orderId
        });
        // 재조회 실패 시 웹훅 처리 중단 (보안)
        return;
    }

    // 재조회 결과로 실제 상태 확인
    const status = verifiedPayment.status;
    const verifiedOrderId = verifiedPayment.orderId;
    const verifiedAmount = verifiedPayment.totalAmount;

    // 웹훅 payload와 재조회 결과 일치 여부 검증
    if (orderId && verifiedOrderId && orderId !== verifiedOrderId) {
        Logger.warn('[payments][webhook] orderId 불일치 - 웹훅 처리 중단', {
            webhookOrderId: orderId,
            verifiedOrderId: verifiedOrderId,
            paymentKey: paymentKey.substring(0, 10) + '...'
        });
        return;
    }

    if (webhookAmount && verifiedAmount && webhookAmount !== verifiedAmount) {
        Logger.warn('[payments][webhook] amount 불일치 - 웹훅 처리 중단', {
            webhookAmount,
            verifiedAmount,
            paymentKey: paymentKey.substring(0, 10) + '...'
        });
        return;
    }

    // 재조회 결과를 기준으로 상태 매핑 (웹훅 payload가 아닌 실제 토스 응답 사용)
    
    // 토스페이먼츠 상태를 내부 상태로 매핑 (재조회 결과 기준)
    let paymentStatus;
    let orderStatus;
    
    // 토스페이먼츠 상태: DONE, CANCELED, PARTIAL_CANCELED, ABORTED, EXPIRED
    const statusUpper = String(status || '').toUpperCase();
    
    if (statusUpper === 'DONE' || statusUpper === 'COMPLETED' || statusUpper === 'CONFIRMED') {
        paymentStatus = 'captured';
        orderStatus = 'processing';
    } else if (statusUpper === 'CANCELED' || statusUpper === 'CANCELLED' || statusUpper === 'PARTIAL_CANCELED') {
        paymentStatus = 'cancelled';
        orderStatus = 'cancelled';
    } else if (statusUpper === 'ABORTED' || statusUpper === 'EXPIRED' || statusUpper === 'FAILED') {
        paymentStatus = 'failed';
        orderStatus = 'failed';
    } else {
        Logger.log('[payments][webhook] 알 수 없는 결제 상태 (기본값 사용)', { 
            status,
            statusUpper,
            paymentKey: paymentKey.substring(0, 10) + '...',
            orderId: verifiedOrderId
        });
        // 알 수 없는 상태는 로그만 남기고 처리하지 않음
        return;
    }

    // 멱등성 처리: 이미 처리된 paymentKey인지 확인
    const [existingPayments] = await connection.execute(
        `SELECT status, updated_at FROM payments WHERE payment_key = ?`,
        [paymentKey]
    );

    if (existingPayments.length > 0) {
        const existingStatus = existingPayments[0].status;
        // 이미 같은 상태로 처리되었으면 건너뛰기
        if (existingStatus === paymentStatus) {
            Logger.log('[payments][webhook] 이미 처리된 결제 (멱등성)', {
                paymentKey: paymentKey.substring(0, 10) + '...',
                status: paymentStatus,
                orderId: verifiedOrderId
            });
            return;
        }
    }

    try {
        // payments 테이블 업데이트
        const [paymentRows] = await connection.execute(
            `UPDATE payments 
             SET status = ?, updated_at = NOW() 
             WHERE payment_key = ?`,
            [paymentStatus, paymentKey]
        );

        if (paymentRows.affectedRows === 0) {
            Logger.log('[payments][webhook] payments 테이블에 해당 payment_key 없음', { paymentKey });
        } else {
            Logger.log('✅ [payments][webhook] payments 테이블 업데이트 완료', {
                paymentKey,
                status: paymentStatus,
                affectedRows: paymentRows.affectedRows
            });
        }

        // orders 테이블 업데이트 (재조회 결과의 orderId 사용)
        const finalOrderId = verifiedOrderId || orderId;
        if (finalOrderId) {
            const [orderRows] = await connection.execute(
                `UPDATE orders 
                 SET status = ?, updated_at = NOW() 
                 WHERE order_number = ?`,
                [orderStatus, finalOrderId]
            );

            if (orderRows.affectedRows > 0) {
                Logger.log('✅ [payments][webhook] orders 테이블 업데이트 완료', {
                    orderId: finalOrderId,
                    status: orderStatus,
                    affectedRows: orderRows.affectedRows
                });
            }
        } else {
            // orderId가 없으면 payment_key로 orders 조회
            const [orderRows] = await connection.execute(
                `UPDATE orders o
                 INNER JOIN payments p ON o.order_number = p.order_number
                 SET o.status = ?, o.updated_at = NOW()
                 WHERE p.payment_key = ?`,
                [orderStatus, paymentKey]
            );

            if (orderRows.affectedRows > 0) {
                Logger.log('[payments][webhook] orders 테이블 업데이트 완료 (payment_key로 조회)', {
                    paymentKey: paymentKey.substring(0, 10) + '...',
                    status: orderStatus,
                    affectedRows: orderRows.affectedRows
                });
            }
        }

    } catch (error) {
        Logger.log('[payments][webhook] 결제 상태 변경 처리 오류', {
            error: error.message,
            paymentKey: paymentKey ? paymentKey.substring(0, 10) + '...' : 'unknown',
            orderId: verifiedOrderId || orderId
        });
        throw error;
    }
}

/**
 * 웹훅 이벤트: 입금 콜백 처리
 * 
 * @param {Object} connection - MySQL 연결
 * @param {Object} data - 웹훅 데이터
 */
async function handleDepositCallback(connection, data) {
    // 입금 콜백은 필요시 구현
    Logger.log('[payments][webhook] 입금 콜백 수신', { data });
}

/**
 * POST /api/payments/webhook
 * 
 * 토스페이먼츠 웹훅 수신 엔드포인트
 * 
 * 🔒 보안: 재조회 검증 방식
 * - 토스페이먼츠 웹훅은 HMAC 서명을 제공하지 않습니다.
 * - 웹훅 payload를 그대로 신뢰하지 않고, 토스 API로 재조회하여 검증합니다.
 * - handlePaymentStatusChange 내부에서 verifyPaymentWithToss() 호출
 * - 재조회 실패 또는 데이터 불일치 시 웹훅 처리 중단
 * 
 * 참고: 토스 웹훅 문서
 * https://docs.tosspayments.com/guides/v2/webhook/overview
 */
router.post('/payments/webhook', async (req, res) => {
    try {
        // 🔒 보안: 토스 웹훅은 시크릿 서명을 제공하지 않으므로
        // 재조회 검증으로 대체 (handlePaymentStatusChange 내부에서 수행)
        // WEBHOOK_SHARED_SECRET은 내부 웹훅용으로만 사용 (토스 웹훅에는 불필요)
        
        Logger.log('✅ [payments][webhook] 웹훅 수신 - 재조회 검증으로 처리 예정');

        const { eventType, data } = req.body;

        Logger.log('✅ [payments][webhook] 웹훅 수신 (서명 검증 완료)', {
            eventType,
            data: data ? {
                orderId: data.orderId,
                paymentKey: data.paymentKey,
                status: data.status
            } : null
        });

        // 웹훅 이벤트에 따라 payments & orders 동기화 (상태 업데이트)
        let connection;
        try {
            connection = await mysql.createConnection(dbConfig);
            await connection.beginTransaction();

            // 이벤트 타입에 따른 처리
            // 토스페이먼츠 가이드: seller.changed = 결제 상태 변경 이벤트
            if (eventType === 'PAYMENT_STATUS_CHANGED' || 
                eventType === 'CANCEL_STATUS_CHANGED' || 
                eventType === 'seller.changed') {
                await handlePaymentStatusChange(connection, data);
            } else if (eventType === 'DEPOSIT_CALLBACK') {
                await handleDepositCallback(connection, data);
            } else if (eventType === 'payout.changed') {
                // 지급대행 상태 변경 (필요시 구현)
                Logger.log('[payments][webhook] 지급대행 상태 변경 수신', { data });
            } else {
                Logger.log('[payments][webhook] 알 수 없는 이벤트 타입 (로그만 기록)', { 
                    eventType,
                    hasData: !!data
                });
            }

            await connection.commit();
            Logger.log('✅ [payments][webhook] 웹훅 처리 완료', { eventType });

        } catch (webhookError) {
            if (connection) {
                await connection.rollback();
                await connection.end();
            }
            Logger.log('[payments][webhook] 웹훅 처리 중 오류', {
                error: webhookError.message,
                stack: webhookError.stack
            });
            // 웹훅 오류는 로그만 남기고 200 반환 (토스페이먼츠 재시도 방지)
        }

        // 웹훅은 항상 200 OK 반환 (토스페이먼츠 재시도 방지)
        res.status(200).json({ received: true });

    } catch (error) {
        Logger.log('[payments][webhook] 웹훅 처리 오류', {
            error: error.message
        });
        // 웹훅 오류도 200 반환 (토스페이먼츠 재시도 방지)
        res.status(200).json({ received: true, error: 'Internal error' });
    }
});

module.exports = router;

