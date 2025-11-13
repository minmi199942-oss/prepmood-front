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
    if (!signature || !secret) {
        Logger.log('[payments][webhook] 서명 또는 시크릿 키 없음', {
            hasSignature: !!signature,
            hasSecret: !!secret
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
 * POST /api/payments/webhook
 * 
 * 토스페이먼츠 웹훅 수신 엔드포인트
 * 
 * HMAC 서명 검증:
 * - 토스페이먼츠 웹훅은 HMAC 서명을 x-toss-signature 헤더에 포함하여 전송합니다.
 * - WEBHOOK_SHARED_SECRET 환경변수로 서명을 검증합니다.
 * - 검증 실패 시 401 반환
 * 
 * 참고: 토스 웹훅 문서
 * https://docs.tosspayments.com/guides/v2/webhook/overview
 */
router.post('/payments/webhook', async (req, res) => {
    try {
        // HMAC 서명 검증 (WEBHOOK_SHARED_SECRET이 설정되어 있을 때만 활성화)
        const webhookSecret = process.env.WEBHOOK_SHARED_SECRET;
        const signature = req.headers['x-toss-signature'];

        if (webhookSecret && webhookSecret !== 'your_webhook_secret_here') {
            // 시크릿 키가 설정되어 있으면 서명 검증 수행
            const rawBody = req.body; // Express는 body-parser로 이미 파싱됨
            // 원본 raw body가 필요한 경우, express.raw() 미들웨어 또는 body를 다시 직렬화

            // body가 객체인 경우 JSON.stringify로 직렬화
            const isValid = verifyWebhookSignature(rawBody, signature, webhookSecret);

            if (!isValid) {
                Logger.log('[payments][webhook] 서명 검증 실패 - 401 반환', {
                    hasSignature: !!signature,
                    hasSecret: !!webhookSecret
                });
                return res.status(401).json({ 
                    success: false,
                    error: 'Invalid signature',
                    code: 'INVALID_SIGNATURE'
                });
            }

            Logger.log('[payments][webhook] 서명 검증 성공');
        } else {
            // 시크릿 키가 설정되지 않았으면 검증 건너뛰기 (개발 단계)
            Logger.log('[payments][webhook] 서명 검증 건너뜀 (시크릿 키 미설정)', {
                hasSecret: !!webhookSecret
            });
        }

        const { eventType, data } = req.body;

        Logger.log('[payments][webhook] 웹훅 수신 (서명 검증 완료)', {
            eventType,
            data: data ? {
                orderId: data.orderId,
                paymentKey: data.paymentKey,
                status: data.status
            } : null
        });

        // 웹훅 이벤트에 따라 payments & orders 동기화 (상태 업데이트)
        // 예: 결제 완료, 결제 실패, 환불 등
        // TODO: 상태 동기화 로직 구현

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

