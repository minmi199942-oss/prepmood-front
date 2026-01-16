// order-routes.js - 주문 관리 API

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const { verifyCSRF } = require('./csrf-middleware');
const { body, validationResult } = require('express-validator');
const Logger = require('./logger');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { resolveProductIdBoth } = require('./utils/product-id-resolver');
const crypto = require('crypto');

// 국가별 규칙 맵 (서버판 - 프런트보다 더 엄격)
const COUNTRY_RULES = {
    KR: {
        postalRe: /^\d{5}$/,                     // 5자리
        phoneRe: /^0\d{1,2}-?\d{3,4}-?\d{4}$/, // 010-1234-5678 / 01012345678
        currency: 'KRW',
        locale: 'ko-KR',
        businessDays: 2,
        cutoffHour: 15,
        postalHint: '12345',
        phoneHint: '010-1234-5678',
        fraction: 0
    },
    JP: {
        postalRe: /^(\d{3}-?\d{4})$/,           // 123-4567 / 1234567
        phoneRe: /^0\d{1,3}-?\d{2,4}-?\d{4}$/, // 03-1234-5678
        currency: 'JPY',
        locale: 'ja-JP',
        businessDays: 3,
        cutoffHour: 15,
        postalHint: '123-4567',
        phoneHint: '03-1234-5678',
        fraction: 0
    },
    US: {
        postalRe: /^\d{5}(-\d{4})?$/,           // 12345 or 12345-6789
        phoneRe: /^[+]?1?[- .(]?\d{3}[- .)]?\d{3}[- .]?\d{4}$/, // (415) 555-1234 / 415-555-1234
        currency: 'USD',
        locale: 'en-US',
        businessDays: 5,
        cutoffHour: 15,
        postalHint: '12345 또는 12345-6789',
        phoneHint: '(415) 555-1234',
        fraction: 2
    },
    CN: {
        postalRe: /^\d{6}$/,                     // 6자리
        phoneRe: /^\d{8,11}$/,                   // 도시별 다양 → 숫자 8~11자 허용
        currency: 'CNY',
        locale: 'zh-CN',
        businessDays: 4,
        cutoffHour: 15,
        postalHint: '123456',
        phoneHint: '13812345678',
        fraction: 2
    },
    GB: {
        // 실제 왕복패턴은 복잡하므로 3~8 길이(공백 포함)로 완화
        postalRe: /^[A-Za-z0-9\s]{3,8}$/,
        phoneRe: /^[0-9\-()\s]{7,20}$/,
        currency: 'GBP',
        locale: 'en-GB',
        businessDays: 3,
        cutoffHour: 15,
        postalHint: 'SW1A 1AA',
        phoneHint: '020 1234 5678',
        fraction: 2
    },
    DE: {
        postalRe: /^\d{5}$/,
        phoneRe: /^[0-9\-()\s]{7,20}$/,
        currency: 'EUR',
        locale: 'de-DE',
        businessDays: 3,
        cutoffHour: 15,
        postalHint: '12345',
        phoneHint: '030 123456',
        fraction: 2
    },
    FR: {
        postalRe: /^\d{5}$/,
        phoneRe: /^[0-9\-()\s]{7,20}$/,
        currency: 'EUR',
        locale: 'fr-FR',
        businessDays: 3,
        cutoffHour: 15,
        postalHint: '75001',
        phoneHint: '01 23 45 67 89',
        fraction: 2
    },
    IT: {
        postalRe: /^\d{5}$/,
        phoneRe: /^[0-9\-()\s]{7,20}$/,
        currency: 'EUR',
        locale: 'it-IT',
        businessDays: 3,
        cutoffHour: 15,
        postalHint: '00100',
        phoneHint: '06 1234 5678',
        fraction: 2
    },
    ES: {
        postalRe: /^\d{5}$/,
        phoneRe: /^[0-9\-()\s]{7,20}$/,
        currency: 'EUR',
        locale: 'es-ES',
        businessDays: 3,
        cutoffHour: 15,
        postalHint: '28013',
        phoneHint: '91 123 45 67',
        fraction: 2
    }
};

// 통화 결정 로직
function determineCurrency(country) {
    const rule = COUNTRY_RULES[country];
    return rule ? rule.currency : 'KRW';
}

// 영업일 추가 유틸리티 (주말 제외)
function addBusinessDays(start, days) {
    const d = new Date(start);
    let added = 0;
    while (added < days) {
        d.setDate(d.getDate() + 1);
        const day = d.getDay(); // 0=Sun, 6=Sat
        if (day !== 0 && day !== 6) added++;
    }
    return d;
}

// ETA 계산 유틸리티 (영업일 기준, 주말 제외 + cutoff)
function calculateETA(shippingMethod, country, now = new Date()) {
    const rule = COUNTRY_RULES[country] || COUNTRY_RULES.KR;
    const method = (shippingMethod || 'standard').toLowerCase();

    let baseDays = rule.businessDays;
    const cutoffHour = rule.cutoffHour;

    // cutoff 이후 주문은 시작일을 다음 영업일로 미룸
    const start = new Date(now);
    if (start.getHours() >= cutoffHour) {
        // 다음 영업일로 start 이동
        let tmp = addBusinessDays(start, 1);
        start.setTime(tmp.getTime());
    }

    let adj = 0;
    if (method === 'express') adj = Math.max(rule.businessDays - 2, 1);
    else if (method === 'overnight') adj = 1;
    else if (method === 'pickup') adj = Math.max(rule.businessDays - 3, 0);
    // standard는 adj=0

    const eta = addBusinessDays(start, baseDays + adj);
    return eta.toISOString().split('T')[0];
}

// 개인정보 마스킹 유틸리티 함수
function maskSensitiveData(data) {
    const masked = { ...data };
    
    // 전화번호 마스킹 (010-1234-5678 -> 010-****-5678)
    if (masked.phone) {
        masked.phone = masked.phone.replace(/(\d{3})-(\d{4})-(\d{4})/, '$1-****-$3');
    }
    
    // 이메일 마스킹 (user@domain.com -> u***@domain.com)
    if (masked.email) {
        const [local, domain] = masked.email.split('@');
        if (local && local.length > 1) {
            masked.email = local[0] + '*'.repeat(local.length - 1) + '@' + domain;
        }
    }
    
    // 우편번호 마스킹 (12345 -> 1****)
    if (masked.postalCode) {
        masked.postalCode = masked.postalCode[0] + '*'.repeat(masked.postalCode.length - 1);
    }
    
    // 주소 마스킹 (상세주소 부분만 마스킹)
    if (masked.address) {
        const parts = masked.address.split(' ');
        if (parts.length > 2) {
            parts[parts.length - 1] = '*'.repeat(parts[parts.length - 1].length);
            masked.address = parts.join(' ');
        }
    }
    
    return masked;
}

// 서버측 요청 스키마 검증 함수
function validateOrderRequest(req) {
    const errors = {};
    const { items, shipping } = req.body;
    
    Logger.log('검증 시작', { items, shipping });
    
    // shipping 필드 검증
    if (!shipping) {
        errors.shipping = '배송 정보가 필요합니다';
        return errors;
    }
    
    // 이름 검증 (recipient_name 우선, 없으면 recipient_first_name/last_name 사용 - 하위 호환)
    let recipientName = '';
    if (shipping.recipient_name && shipping.recipient_name.trim()) {
        recipientName = shipping.recipient_name.trim();
        if (recipientName.length < 1 || recipientName.length > 100) {
            errors['shipping.recipient_name'] = '이름은 1-100자 사이여야 합니다';
        }
    } else if (shipping.recipient_first_name || shipping.recipient_last_name) {
        // 하위 호환: 기존 방식 지원
        const firstName = (shipping.recipient_first_name || '').trim();
        const lastName = (shipping.recipient_last_name || '').trim();
        if (!firstName && !lastName) {
            errors['shipping.recipient_name'] = '이름을 입력해주세요';
        } else {
            recipientName = `${lastName} ${firstName}`.trim();
        }
    } else {
        errors['shipping.recipient_name'] = '이름을 입력해주세요';
    }
    
    // recipientName을 req 객체에 저장 (나중에 사용)
    if (recipientName && !errors['shipping.recipient_name']) {
        req.recipientName = recipientName;
    }
    
    // 이메일 패턴 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!shipping.email || !emailRegex.test(shipping.email) || shipping.email.length > 255) {
        errors['shipping.email'] = '유효한 이메일 주소가 필요합니다 (최대 255자)';
    }
    
    // 주소 길이 검증
    if (!shipping.address || shipping.address.trim().length < 10 || shipping.address.trim().length > 200) {
        errors['shipping.address'] = '주소는 10-200자 사이여야 합니다';
    }
    
    // 도시 검증
    if (!shipping.city || shipping.city.trim().length < 1 || shipping.city.trim().length > 50) {
        errors['shipping.city'] = '도시는 1-50자 사이여야 합니다';
    }
    
    // 국가 허용 목록 검증 (동적 화이트리스트)
    const allowedCountries = Object.keys(COUNTRY_RULES);
    if (!shipping.country || !allowedCountries.includes(shipping.country)) {
        errors['shipping.country'] = '지원하지 않는 국가입니다';
    }
    
    // 국가별 postalCode 및 phone 검증 (국가가 유효한 경우에만)
    if (shipping.country && allowedCountries.includes(shipping.country)) {
        const R = COUNTRY_RULES[shipping.country];
        
        // postalCode 검증
        if (!R.postalRe.test(shipping.postal_code || '')) {
            errors['shipping.postal_code'] = `우편번호 형식이 올바르지 않습니다 (예: ${R.postalHint})`;
        }
        
        // phone 검증
        if (!R.phoneRe.test(shipping.phone || '')) {
            errors['shipping.phone'] = `전화번호 형식이 올바르지 않습니다 (예: ${R.phoneHint})`;
        }
    }
    
    // line_items 검증
    if (!items || !Array.isArray(items) || items.length === 0) {
        errors.items = '주문 상품이 필요합니다';
        return errors;
    }
    
    if (items.length > 20) {
        errors.items = '주문 상품은 최대 20개까지 가능합니다';
    }
    
    for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const prefix = `items[${i}]`;
        
        // product_id 검증
        // 참고: admin_products.id는 VARCHAR(50) (문자열)이므로 정수 검증 불필요
        const productId = String(item.product_id || '').trim();
        if (!productId || productId === 'undefined' || productId === 'null' || productId === '') {
            errors[`${prefix}.product_id`] = '유효한 상품 ID가 필요합니다';
        }
        
        // quantity 검증 (정수)
        const quantity = Number(item.quantity);
        if (!item.quantity || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
            errors[`${prefix}.quantity`] = '수량은 1-10 사이여야 합니다';
        }
        
        // price 검증 (클라이언트에서 보낸 가격은 무시하고 서버에서 재계산)
        if (item.price !== undefined) {
            Logger.log(`경고: 클라이언트에서 가격 정보 전송됨 (무시됨): ${item.price}`);
        }
    }
    
    return Object.keys(errors).length > 0 ? errors : null;
}

// 주문 생성 Rate limiting 미들웨어 (사용자 기준 + IP fallback)
const orderCreationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: 5,               // 1분에 5번
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req, res) => {
        // 1) 로그인한 경우: userId 기준
        if (req.user && req.user.userId) {
            return `user:${req.user.userId}`;
        }
        // 2) 비로그인: IPv6 포함 IP 기준 (express-rate-limit 권장 방식)
        return ipKeyGenerator(req.ip || '');
    },
    handler: (req, res) => {
        Logger.warn('주문 생성 Rate Limit 초과', {
            userId: req.user?.userId || null,
            ip: req.ip
        });
        return res.status(429).json({
            code: 'RATE_LIMIT_EXCEEDED',
            message: '주문 생성 요청이 너무 잦습니다. 잠시 후 다시 시도해주세요.'
        });
    }
});

// 주문번호 생성 함수 (UNIQUE 충돌 시 지수 백오프 재시도 로직 포함)
async function generateOrderNumber(connection, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const timestamp = now.getTime().toString().slice(-6); // 마지막 6자리
        const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase(); // 6자리 랜덤
        const orderNumber = `ORD-${year}${month}${day}-${timestamp}-${randomSuffix}`;
        
        try {
            // UNIQUE 제약조건 확인
            const [existing] = await connection.execute(
                'SELECT 1 FROM orders WHERE order_number = ? LIMIT 1',
                [orderNumber]
            );
            
            if (existing.length === 0) {
                return orderNumber; // 고유한 주문번호 생성 성공
            }
            
            Logger.log(`주문번호 충돌 감지 (시도 ${attempt}/${maxRetries}): ${orderNumber}`);
            
            if (attempt === maxRetries) {
                throw new Error(`주문번호 생성 실패: ${maxRetries}회 재시도 후에도 고유한 번호를 생성할 수 없습니다`);
            }
            
            // 지수 백오프: 10ms, 20ms, 40ms
            const backoffMs = Math.min(10 * Math.pow(2, attempt - 1), 40);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            Logger.log(`주문번호 생성 오류 (시도 ${attempt}/${maxRetries}): ${error.message}`);
        }
    }
}

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 주문 생성 API
router.post('/orders', authenticateToken, verifyCSRF, orderCreationLimiter, async (req, res) => {
    let connection;
    try {
        // 0) Idempotency-Key 처리 (중복 생성 방지)
        // Express 헤더 읽기: req.get() 또는 req.headers 사용 (case-insensitive)
        const idemKey = req.get('X-Idempotency-Key') || req.headers['x-idempotency-key'] || req.headers['X-Idempotency-Key'];
        const userId = req.user?.userId || null;
        
        // 디버깅: 헤더 확인
        Logger.log('주문 생성 - Idempotency Key 확인', {
            idemKey: idemKey ? `${idemKey.substring(0, 20)}...` : '없음',
            userId: userId,
            hasUser: !!req.user,
            headersKeys: Object.keys(req.headers).filter(k => k.toLowerCase().includes('idempotency'))
        });

        // userId 검증 로그
        Logger.log('주문 생성 요청 - userId 확인', {
            userId: userId,
            userIdType: typeof userId,
            userInfo: userId ? { userId } : 'null',
            hasUser: !!req.user,
            userKeys: req.user ? Object.keys(req.user) : []
        });

        if (!idemKey) {
            return res.status(400).json({ 
                code: 'VALIDATION_ERROR', 
                details: { 
                    field: 'X-Idempotency-Key', 
                    message: '헤더가 필요합니다' 
                }
            });
        }

        connection = await mysql.createConnection(dbConfig);

        // 기존 동일 키 존재 여부 확인
        const [idemRows] = await connection.execute(
            'SELECT order_number FROM orders_idempotency WHERE user_id = ? AND idem_key = ? LIMIT 1',
            [userId, idemKey]
        );

        if (idemRows.length) {
            // 같은 응답 스펙으로 재전송(멱등성)
            const prevOrder = idemRows[0].order_number;
            const [rows] = await connection.execute(
                `SELECT order_number, total_price AS amount, estimated_delivery AS eta, status
                 FROM orders WHERE order_number = ? AND user_id = ? LIMIT 1`,
                [prevOrder, userId]
            );
            if (rows.length) {
                await connection.end();
                return res.status(200).json({ 
                    success: true, 
                    data: {
                        order_number: rows[0].order_number,
                        amount: rows[0].amount,
                        currency: determineCurrency(req.body?.shipping?.country) || 'KRW',
                        fraction: COUNTRY_RULES[req.body?.shipping?.country]?.fraction ?? 2,
                        eta: rows[0].eta
                    }
                });
            }
            // 기록은 있는데 주문이 없으면(예외적) 계속 진행하여 새 주문 생성
        }

        // 서버측 스키마 검증
        Logger.log('주문 요청 데이터 수신', { 
            userId, 
            requestBody: req.body,
            headers: {
                'X-Idempotency-Key': idemKey,
                'Content-Type': req.headers['content-type']
            }
        });
        
        const validationErrors = validateOrderRequest(req);
        if (validationErrors) {
            Logger.log('주문 검증 실패', { 
                userId, 
                errors: validationErrors, 
                requestBody: maskSensitiveData(req.body) 
            });
            await connection.end();
            return res.status(400).json({ 
                code: 'VALIDATION_ERROR', 
                details: validationErrors 
            });
        }

        const { items, shipping } = req.body;

        // 총 금액 계산
        let totalPrice = 0;
        const orderItemsData = [];

        for (const item of items) {
            // 상품 정보 조회 (product_id 존재 확인)
            // admin_products 테이블 사용 (cart-routes.js와 동일)
            const [productRows] = await connection.execute(
                'SELECT id AS product_id, name, price, image FROM admin_products WHERE id = ?',
                [item.product_id]
            );

            if (productRows.length === 0) {
                await connection.end();
                return res.status(400).json({ 
                    code: 'VALIDATION_ERROR', 
                    details: { [`items[${items.indexOf(item)}].product_id`]: `상품 ID ${item.product_id}를 찾을 수 없습니다` }
                });
            }

            const product = productRows[0];
            
            // 서버에서 가격 재계산 (클라이언트 가격 무시)
            const serverPrice = parseFloat(product.price);
            const subtotal = serverPrice * item.quantity;
            totalPrice += subtotal;

            orderItemsData.push({
                product_id: product.product_id,
                product_name: product.name,
                product_image: product.image,
                size: item.size || null,        // size 추가
                color: item.color || null,      // color 추가
                quantity: item.quantity,
                unit_price: serverPrice,
                subtotal: subtotal
            });
        }

        // 배송비 계산 (클라이언트에서 전송된 값 사용, 없으면 0)
        const shippingCost = shipping.cost || 0;
        const finalTotal = totalPrice + shippingCost;
        
        // 국가별 통화 결정
        const currency = determineCurrency(shipping.country);
        
        // ETA 계산 (영업일 기준, cutoff 반영)
        const etaStr = calculateETA(shipping.method || 'standard', shipping.country);

        // 트랜잭션 시작
        await connection.beginTransaction();

        try {
            // 주문번호 생성 (트랜잭션 내에서 지수 백오프 재시도 로직 포함)
            let orderNumber;
            let orderResult;
            let maxRetries = 3;
            
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    orderNumber = await generateOrderNumber(connection);
                    
                    // recipient_name을 shipping_name으로 사용 (단일 필드)
                    const shippingName = req.recipientName 
                        ? req.recipientName.trim() 
                        : (shipping.recipient_name || (shipping.recipient_first_name && shipping.recipient_last_name 
                            ? `${shipping.recipient_last_name} ${shipping.recipient_first_name}`.trim()
                            : (shipping.recipient_first_name || shipping.recipient_last_name || '')));
                    
                    // orders 테이블에 주문 생성 (배송 정보 및 주문번호 포함)
                    [orderResult] = await connection.execute(
                        `INSERT INTO orders (user_id, order_number, total_price, status, 
                         shipping_name, shipping_email, shipping_phone,
                         shipping_address, shipping_city, shipping_postal_code, shipping_country,
                         shipping_method, shipping_cost, estimated_delivery) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [userId, orderNumber, finalTotal, 'pending',
                         shippingName, shipping.email, shipping.phone,
                         shipping.address, shipping.city, shipping.postal_code, shipping.country,
                         shipping.method || 'standard', shipping.cost || 0, etaStr]
                    );
                    
                    // 성공 시 루프 종료
                    break;
                    
                } catch (error) {
                    if (error.code === 'ER_DUP_ENTRY' && attempt < maxRetries) {
                        Logger.log(`주문번호 UNIQUE 충돌 (시도 ${attempt}/${maxRetries}): ${orderNumber}`);
                        // 지수 백오프: 10ms, 20ms, 40ms
                        const backoffMs = Math.min(10 * Math.pow(2, attempt - 1), 40);
                        await new Promise(resolve => setTimeout(resolve, backoffMs));
                        continue;
                    }
                    throw error; // 다른 오류이거나 최대 재시도 초과
                }
            }

            const orderId = orderResult.insertId;

            // order_items 테이블에 주문 상품들 저장
            for (const itemData of orderItemsData) {
                // 상품 존재 확인
                const productIds = await resolveProductIdBoth(itemData.product_id, connection);
                
                if (!productIds) {
                    Logger.warn('[ORDER] 상품 ID를 찾을 수 없음 (주문 생성)', {
                        product_id: itemData.product_id,
                        order_id: orderId
                    });
                    // 경고만 하고 계속 진행 (기존 동작 유지)
                }
                
                await connection.execute(
                    `INSERT INTO order_items (order_id, product_id, product_name, size, color, product_image, quantity, unit_price, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        orderId,
                        productIds ? productIds.canonical_id : itemData.product_id,  // product_id (cutover 후 id가 canonical)
                        itemData.product_name,
                        itemData.size || null,
                        itemData.color || null,
                        itemData.product_image,
                        itemData.quantity,
                        itemData.unit_price,
                        itemData.subtotal
                    ]
                );
            }

            // 결제 사전승인 훅 자리 표시자 (향후 결제 시스템 연동 시 구현)
            // TODO: 결제 시스템 연동 시 여기서 사전승인 처리
            // const paymentResult = await processPaymentPreAuth(orderNumber, finalTotal, shipping);
            // if (!paymentResult.success) {
            //     throw new Error('결제 사전승인 실패: ' + paymentResult.error);
            // }

            // N) Idempotency 기록 저장
            await connection.execute(
                'INSERT IGNORE INTO orders_idempotency (user_id, idem_key, order_number) VALUES (?, ?, ?)',
                [userId, idemKey, orderNumber]
            );

            // 트랜잭션 커밋
            await connection.commit();

            // 마스킹된 배송 정보로 로깅 (전면 적용)
            const maskedShipping = maskSensitiveData(shipping);
            const maskedItems = items.map(item => ({
                product_id: item.product_id,
                quantity: item.quantity
                // price는 서버에서 재계산되므로 로깅하지 않음
            }));
            
            Logger.log('주문 생성 성공', { 
                orderId, 
                orderNumber, 
                userId, 
                totalPrice: finalTotal, 
                shipping: maskedShipping,
                items: maskedItems
            });

            // 응답 규격 고정
            res.json({
                success: true,
                data: {
                    order_number: orderNumber,
                    amount: finalTotal,
                    currency: currency,
                    eta: etaStr,
                    fraction: COUNTRY_RULES[shipping.country]?.fraction ?? 2,
                    localeHint: COUNTRY_RULES[shipping.country]?.locale || 'ko-KR'
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        // 마스킹된 정보로 오류 로깅
        const maskedShipping = req.body.shipping ? maskSensitiveData(req.body.shipping) : null;
        Logger.log('주문 생성 오류:', { 
            error: error.message,
            stack: error.stack,
            product_id: req.body?.items?.[0]?.product_id,
            shipping_country: maskedShipping?.country,
            userId: req.user?.userId,
            shipping: maskedShipping
        });
        console.error('주문 생성 오류 상세:', error);
        
        // DUPLICATE_ORDER_NUMBER 특별 처리
        if (error.code === 'ER_DUP_ENTRY' && error.message.includes('order_number')) {
            res.status(409).json({ 
                code: 'DUPLICATE_ORDER_NUMBER',
                details: { message: '주문번호 충돌이 발생했습니다. 다시 시도해주세요.' }
            });
        } else {
            res.status(500).json({ 
                code: 'INTERNAL_ERROR', 
                details: { message: '주문 생성에 실패했습니다' }
            });
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// 주문 목록 조회 API
router.get('/orders', authenticateToken, async (req, res) => {
    let connection;
    try {
        const userId = req.user.userId;

        // userId 검증 로그
        Logger.log('주문 목록 조회 요청 - userId 확인', {
            userId: userId,
            userIdType: typeof userId,
            userInfo: { userId },
            hasUser: !!req.user,
            userKeys: req.user ? Object.keys(req.user) : []
        });

        connection = await mysql.createConnection(dbConfig);

        // 주문 목록 조회 (배송 정보 및 주문번호 포함)
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, total_price, order_date, status, 
                    shipping_name, shipping_city, shipping_country,
                    shipping_method, shipping_cost, estimated_delivery
             FROM orders 
             WHERE user_id = ? 
             ORDER BY order_date DESC`,
            [userId]
        );

        // 각 주문의 상품 정보 조회 (size, color 포함)
        const ordersWithItems = await Promise.all(
            orders.map(async (order) => {
                const [items] = await connection.execute(
                    `SELECT order_item_id, product_id, product_name, size, color, product_image, 
                            quantity, unit_price, subtotal 
                     FROM order_items 
                     WHERE order_id = ?`,
                    [order.order_id]
                );

                return {
                    ...order,
                    items: items.map(item => ({
                        item_id: item.order_item_id,
                        product_id: item.product_id,
                        name: item.product_name,
                        size: item.size,
                        color: item.color,
                        image: item.product_image,
                        quantity: item.quantity,
                        unit_price: parseFloat(item.unit_price),
                        subtotal: parseFloat(item.subtotal)
                    }))
                };
            })
        );

        // 마스킹된 정보로 로깅
        Logger.log('주문 목록 조회 성공', { 
            userId, 
            orderCount: ordersWithItems.length,
            maskedUserId: maskSensitiveData({ userId: userId.toString() }).userId
        });

        res.json({
            success: true,
            orders: ordersWithItems
        });

    } catch (error) {
        // 마스킹된 정보로 오류 로깅
        Logger.log('주문 목록 조회 오류:', { 
            error: error.message,
            userId: req.user?.userId ? maskSensitiveData({ userId: req.user.userId.toString() }).userId : 'unknown'
        });
        res.status(500).json({ 
            code: 'INTERNAL_ERROR', 
            details: { message: '주문 목록 조회에 실패했습니다' }
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// 주문 상세 조회 API
// order_id (숫자) 또는 order_number (ORD-YYYYMMDD-######-######) 모두 지원
router.get('/orders/:orderId', authenticateToken, async (req, res) => {
    let connection;
    try {
        const userId = req.user.userId;
        const orderId = req.params.orderId;

        // userId 검증 로그
        Logger.log('주문 상세 조회 요청 - userId 확인', {
            userId: userId,
            userIdType: typeof userId,
            orderId: orderId,
            userInfo: { userId },
            hasUser: !!req.user,
            userKeys: req.user ? Object.keys(req.user) : []
        });

        // order_number 형식 판별: ORD-YYYYMMDD-######-######
        const ORDER_NUMBER_REGEX = /^ORD-\d{8}-\d{6}-[A-Z0-9]{6}$/;
        const isOrderNumber = ORDER_NUMBER_REGEX.test(orderId);

        connection = await mysql.createConnection(dbConfig);

        let orders;
        let order;
        let orderIdForItems;

        // order_number 또는 order_id로 조회 (항상 user_id 검증)
        if (isOrderNumber) {
            // order_number로 조회
            [orders] = await connection.execute(
                'SELECT * FROM orders WHERE order_number = ? AND user_id = ?',
                [orderId, userId]
            );
        } else {
            // order_id (숫자)로 조회
            const numOrderId = parseInt(orderId, 10);
            if (isNaN(numOrderId)) {
                await connection.end();
                return res.status(400).json({
                    code: 'VALIDATION_ERROR',
                    details: { message: '유효하지 않은 주문 ID 형식입니다' }
                });
            }
            [orders] = await connection.execute(
                'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
                [numOrderId, userId]
            );
        }

        // 본인 주문 확인 (불일치 시 403)
        if (orders.length === 0) {
            await connection.end();
            return res.status(404).json({ 
                code: 'NOT_FOUND', 
                details: { message: '주문을 찾을 수 없습니다' }
            });
        }

        order = orders[0];
        orderIdForItems = order.order_id;

        // 주문 상품 조회 (size, color 포함)
        const [items] = await connection.execute(
            `SELECT order_item_id, product_id, product_name, size, color, product_image, 
                    quantity, unit_price, subtotal 
             FROM order_items 
             WHERE order_id = ?`,
            [orderIdForItems]
        );

        // 통화 정보 결정
        const currency = determineCurrency(order.shipping_country);
        const fraction = COUNTRY_RULES[order.shipping_country]?.fraction ?? 2;

        const orderDetail = {
            order_id: order.order_id,
            order_number: order.order_number,
            user_id: order.user_id,
            total_price: parseFloat(order.total_price),
            amount: parseFloat(order.total_price), // 별칭 (호환성)
            order_date: order.order_date,
            status: order.status,
            currency: currency,
            fraction: fraction,
            eta: order.estimated_delivery ? order.estimated_delivery.toISOString().split('T')[0] : null,
            shipping: {
                recipient_name: order.shipping_name || '',
                email: order.shipping_email,
                phone: order.shipping_phone,
                address: order.shipping_address,
                city: order.shipping_city,
                postal_code: order.shipping_postal_code,
                country: order.shipping_country,
                method: order.shipping_method,
                cost: parseFloat(order.shipping_cost || 0),
                estimated_delivery: order.estimated_delivery
            },
            items: items.map(item => ({
                item_id: item.order_item_id,
                product_id: item.product_id,
                name: item.product_name,
                size: item.size,
                color: item.color,
                image: item.product_image,
                quantity: item.quantity,
                unit_price: parseFloat(item.unit_price),
                subtotal: parseFloat(item.subtotal)
            }))
        };

        res.json({
            success: true,
            data: {
                order_number: order.order_number,
                amount: parseFloat(order.total_price),
                currency: currency,
                fraction: fraction,
                status: order.status,
                eta: order.estimated_delivery ? order.estimated_delivery.toISOString().split('T')[0] : null
            },
            order: orderDetail // 상세 정보는 기존 호환성 유지
        });

    } catch (error) {
        // 마스킹된 정보로 오류 로깅
        Logger.log('주문 상세 조회 오류:', { 
            error: error.message,
            orderId: req.params.orderId,
            userId: req.user?.userId ? maskSensitiveData({ userId: req.user.userId.toString() }).userId : 'unknown'
        });
        res.status(500).json({ 
            code: 'INTERNAL_ERROR', 
            details: { message: '주문 상세 조회에 실패했습니다' }
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

/**
 * POST /api/orders/:orderId/claim-token
 * Claim Token 발급 API (비회원 → 회원 전환)
 * 
 * 처리 흐름 (SYSTEM_FLOW_DETAILED.md 3-2절, COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md Phase 6-1):
 * 1. 로그인 상태 확인
 * 2. 주문이 비회원 주문인지 확인 (user_id IS NULL)
 * 3. guest_order_access_token 검증 (쿠키 또는 세션) - TODO: 구현 필요
 * 4. claim_token 생성 (30분 유효)
 * 5. claim_tokens 테이블에 저장
 * 6. 토큰 반환
 */
router.post('/orders/:orderId/claim-token', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        const userId = req.user.userId || req.user.id;

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        // 1. 주문 확인 및 비회원 주문 확인
        const [orders] = await connection.execute(
            'SELECT order_id, user_id, guest_id FROM orders WHERE order_id = ?',
            [orderId]
        );

        if (orders.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '주문을 찾을 수 없습니다.'
            });
        }

        const order = orders[0];

        // 2. 비회원 주문 확인 (user_id IS NULL)
        if (order.user_id !== null) {
            await connection.end();
            return res.status(400).json({
                success: false,
                message: '이미 회원 계정에 연동된 주문입니다.'
            });
        }

        // 3. guest_order_access_token 검증 (TODO: 쿠키/세션에서 확인)
        // 현재는 주문이 비회원 주문이면 통과

        // 4. claim_token 생성 (30분 유효)
        const claimToken = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30분 후

        // 5. claim_tokens 테이블에 저장
        try {
            await connection.execute(
                `INSERT INTO claim_tokens (order_id, token, expires_at)
                 VALUES (?, ?, ?)`,
                [orderId, claimToken, expiresAt]
            );
        } catch (insertError) {
            await connection.end();
            if (insertError.code === 'ER_DUP_ENTRY') {
                Logger.error('[CLAIM_TOKEN] claim_token 중복 생성 시도', {
                    orderId,
                    userId
                });
                return res.status(500).json({
                    success: false,
                    message: '토큰 생성에 실패했습니다. 잠시 후 다시 시도해주세요.'
                });
            }
            throw insertError;
        }

        await connection.end();

        Logger.log('[CLAIM_TOKEN] Claim token 발급 완료', {
            orderId,
            userId,
            expiresAt: expiresAt.toISOString()
        });

        res.json({
            success: true,
            message: 'Claim token이 발급되었습니다.',
            data: {
                claim_token: claimToken,
                expires_at: expiresAt.toISOString(),
                expires_in: 30 * 60 // 30분 (초 단위)
            }
        });

    } catch (error) {
        if (connection) {
            try {
                await connection.end();
            } catch (endError) {
                Logger.error('[CLAIM_TOKEN] 연결 종료 실패', {
                    error: endError.message
                });
            }
        }

        Logger.error('[CLAIM_TOKEN] Claim token 발급 실패', {
            orderId: req.params.orderId,
            userId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: 'Claim token 발급 중 오류가 발생했습니다.'
        });
    }
});

/**
 * POST /api/orders/:orderId/claim
 * Claim API (비회원 → 회원 전환 실행)
 * 
 * 요청 본문:
 * - claim_token: string (필수) - Claim token
 * 
 * 처리 흐름 (SYSTEM_FLOW_DETAILED.md 3-2절, COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md Phase 6-2):
 * 1. 3-Factor Atomic Check (token, order_id, used_at IS NULL, expires_at > NOW())
 * 2. orders.user_id 업데이트
 * 3. orders.guest_id 유지
 * 4. warranties 상태 전이 (issued_unassigned → issued)
 * 5. warranties.owner_user_id 업데이트
 * 6. guest_order_access_token 회수 (revoked_at 설정)
 * 7. warranty_events 이벤트 기록
 */
router.post('/orders/:orderId/claim', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        const { claim_token } = req.body;
        const userId = req.user.userId || req.user.id;

        // claim_token 필수 확인
        if (!claim_token || typeof claim_token !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'claim_token이 필요합니다.'
            });
        }

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        await connection.beginTransaction();

        try {
            // 1. 주문 확인
            const [orders] = await connection.execute(
                'SELECT order_id, user_id, guest_id FROM orders WHERE order_id = ? FOR UPDATE',
                [orderId]
            );

            if (orders.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '주문을 찾을 수 없습니다.'
                });
            }

            const order = orders[0];

            // 이미 회원 계정에 연동된 주문인지 확인
            if (order.user_id !== null) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '이미 회원 계정에 연동된 주문입니다.'
                });
            }

            // 2. 3-Factor Atomic Check
            // ⚠️ 핵심: token, order_id, used_at IS NULL, expires_at > NOW() 모두 한 번에 검증
            const [updateResult] = await connection.execute(
                `UPDATE claim_tokens
                 SET used_at = NOW()
                 WHERE token = ?
                   AND order_id = ?
                   AND used_at IS NULL
                   AND expires_at > NOW()`,
                [claim_token, orderId]
            );

            // ⚠️ affectedRows=1 검증 필수
            if (updateResult.affectedRows !== 1) {
                await connection.rollback();
                await connection.end();

                // 실패 원인 확인 (별도 커넥션 사용 - 트랜잭션 롤백 후)
                const checkConnection = await mysql.createConnection({
                    host: process.env.DB_HOST,
                    user: process.env.DB_USER,
                    password: process.env.DB_PASSWORD,
                    database: process.env.DB_NAME,
                    port: process.env.DB_PORT || 3306,
                    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
                });
                
                const [tokenCheck] = await checkConnection.execute(
                    'SELECT * FROM claim_tokens WHERE token = ? AND order_id = ?',
                    [claim_token, orderId]
                );
                
                await checkConnection.end();

                let message = '유효하지 않거나 만료된 claim_token입니다.';
                if (tokenCheck.length === 0) {
                    message = 'claim_token을 찾을 수 없습니다.';
                } else if (tokenCheck[0].used_at !== null) {
                    message = '이미 사용된 claim_token입니다.';
                } else if (new Date(tokenCheck[0].expires_at) <= new Date()) {
                    message = '만료된 claim_token입니다.';
                }

                Logger.error('[CLAIM] 3-Factor Atomic Check 실패', {
                    orderId,
                    userId,
                    claimToken: claim_token.substring(0, 10) + '...',
                    affectedRows: updateResult.affectedRows
                });

                return res.status(400).json({
                    success: false,
                    message
                });
            }

            // 3. orders.user_id 업데이트
            const [orderUpdateResult] = await connection.execute(
                `UPDATE orders
                 SET user_id = ?
                 WHERE order_id = ? AND user_id IS NULL`,
                [userId, orderId]
            );

            if (orderUpdateResult.affectedRows !== 1) {
                await connection.rollback();
                await connection.end();
                Logger.error('[CLAIM] orders.user_id 업데이트 실패', {
                    orderId,
                    userId,
                    affectedRows: orderUpdateResult.affectedRows
                });
                return res.status(500).json({
                    success: false,
                    message: '주문 연동에 실패했습니다.'
                });
            }

            // 4. orders.guest_id는 유지 (감사 로그)

            // 5. 해당 주문의 모든 warranties 상태 전이 (issued_unassigned → issued)
            //    및 owner_user_id 업데이트
            // ⚠️ MySQL에서는 UPDATE와 서브쿼리를 함께 사용할 때 제한이 있으므로 JOIN 사용
            const [warrantiesUpdateResult] = await connection.execute(
                `UPDATE warranties w
                 INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
                 SET w.status = 'issued',
                     w.owner_user_id = ?
                 WHERE oiu.order_id = ?
                   AND w.status = 'issued_unassigned'
                   AND w.owner_user_id IS NULL`,
                [userId, orderId]
            );

            Logger.log('[CLAIM] warranties 상태 전이 완료', {
                orderId,
                userId,
                updatedWarranties: warrantiesUpdateResult.affectedRows
            });

            // 6. warranty_events에 이벤트 기록 (각 warranty별로)
            const [warranties] = await connection.execute(
                `SELECT w.id as warranty_id
                 FROM warranties w
                 INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
                 WHERE oiu.order_id = ?
                   AND w.status = 'issued'
                   AND w.owner_user_id = ?`,
                [orderId, userId]
            );

            for (const warranty of warranties) {
                try {
                    await connection.execute(
                        `INSERT INTO warranty_events
                         (warranty_id, event_type, old_value, new_value, changed_by, changed_by_id, reason)
                         VALUES (?, ?, ?, ?, ?, ?, ?)`,
                        [
                            warranty.warranty_id,
                            'status_change',
                            JSON.stringify({ status: 'issued_unassigned', owner_user_id: null }),
                            JSON.stringify({ status: 'issued', owner_user_id: userId }),
                            'user',
                            userId,
                            'Claim (비회원 → 회원 전환)'
                        ]
                    );
                } catch (eventError) {
                    // 이벤트 INSERT 실패 시 전이도 롤백 (Outbox 패턴)
                    await connection.rollback();
                    await connection.end();
                    Logger.error('[CLAIM] warranty_events INSERT 실패 - 트랜잭션 롤백', {
                        orderId,
                        userId,
                        warrantyId: warranty.warranty_id,
                        error: eventError.message
                    });
                    return res.status(500).json({
                        success: false,
                        message: '보증서 연동 이벤트 기록에 실패했습니다.'
                    });
                }
            }

            // 7. guest_order_access_token 회수 (revoked_at 설정)
            const [revokeResult] = await connection.execute(
                `UPDATE guest_order_access_tokens
                 SET revoked_at = NOW()
                 WHERE order_id = ?
                   AND revoked_at IS NULL`,
                [orderId]
            );

            Logger.log('[CLAIM] guest_order_access_token 회수 완료', {
                orderId,
                userId,
                revokedTokens: revokeResult.affectedRows
            });

            await connection.commit();
            await connection.end();

            Logger.log('[CLAIM] Claim 완료', {
                orderId,
                userId,
                updatedWarranties: warrantiesUpdateResult.affectedRows,
                revokedTokens: revokeResult.affectedRows
            });

            res.json({
                success: true,
                message: '주문이 계정에 연동되었습니다.',
                data: {
                    order_id: orderId,
                    user_id: userId,
                    warranties_updated: warrantiesUpdateResult.affectedRows
                }
            });

        } catch (error) {
            await connection.rollback();
            await connection.end();
            throw error;
        }

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
                await connection.end();
            } catch (rollbackError) {
                Logger.error('[CLAIM] 롤백 실패', {
                    error: rollbackError.message
                });
            }
        }

        Logger.error('[CLAIM] Claim 실패', {
            orderId: req.params.orderId,
            userId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: '주문 연동 중 오류가 발생했습니다.'
        });
    }
});

/**
 * ============================================================
 * Phase 10: 비회원 주문 조회 API (옵션 B: 세션 토큰 교환 방식)
 * ============================================================
 */

/**
 * GET /api/guest/orders/session
 * 게스트 세션 발급/검증 엔드포인트
 * 
 * Query Parameters:
 * - token: string (필수) - guest_order_access_token
 * 
 * 처리 흐름:
 * 1. guest_order_access_tokens에서 token 조회
 * 2. expires_at, revoked_at, orders.user_id IS NULL 확인
 * 3. 통과하면 세션 토큰 발급 (24시간 TTL)
 * 4. guest_order_sessions 테이블에 저장
 * 5. httpOnly Cookie로 세션 토큰 설정
 * 6. 302 Redirect (/guest/orders.html?order=ORD-...)
 */
router.get('/guest/orders/session', async (req, res) => {
    let connection;
    try {
        const { token } = req.query;

        if (!token || typeof token !== 'string' || !token.trim()) {
            return res.status(400).json({
                success: false,
                message: '토큰이 필요합니다.',
                code: 'MISSING_TOKEN'
            });
        }

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        // 1. guest_order_access_tokens에서 token 조회
        const [tokens] = await connection.execute(
            `SELECT 
                got.token_id,
                got.order_id,
                got.token,
                got.expires_at,
                got.revoked_at,
                o.order_number,
                o.user_id
            FROM guest_order_access_tokens got
            INNER JOIN orders o ON got.order_id = o.order_id
            WHERE got.token = ?`,
            [token.trim()]
        );

        if (tokens.length === 0) {
            await connection.end();
            return res.status(410).json({
                success: false,
                message: '유효하지 않은 토큰입니다.',
                code: 'INVALID_TOKEN'
            });
        }

        const tokenData = tokens[0];

        // 2. expires_at 확인
        if (new Date(tokenData.expires_at) < new Date()) {
            await connection.end();
            return res.status(410).json({
                success: false,
                message: '토큰이 만료되었습니다.',
                code: 'TOKEN_EXPIRED'
            });
        }

        // 3. revoked_at 확인
        if (tokenData.revoked_at !== null) {
            await connection.end();
            return res.status(410).json({
                success: false,
                message: '토큰이 회수되었습니다.',
                code: 'TOKEN_REVOKED'
            });
        }

        // 4. orders.user_id IS NULL 확인 (Claim 완료된 주문 차단)
        if (tokenData.user_id !== null) {
            await connection.end();
            return res.status(410).json({
                success: false,
                message: '이미 회원 계정에 연동된 주문입니다.',
                code: 'ORDER_CLAIMED'
            });
        }

        // 5. 세션 토큰 발급 (24시간 TTL)
        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24시간 후

        // 6. guest_order_sessions 테이블에 저장
        const [sessionResult] = await connection.execute(
            `INSERT INTO guest_order_sessions 
             (order_id, session_token, access_token_id, expires_at)
             VALUES (?, ?, ?, ?)`,
            [tokenData.order_id, sessionToken, tokenData.token_id, sessionExpiresAt]
        );

        const sessionId = sessionResult.insertId;

        await connection.end();

        Logger.log('[GUEST_SESSION] 세션 발급 완료', {
            sessionId,
            orderId: tokenData.order_id,
            orderNumber: tokenData.order_number,
            tokenPrefix: token.substring(0, 6) + '...'
        });

        // 7. httpOnly Cookie로 세션 토큰 설정
        const isSecure = process.env.NODE_ENV === 'production' || req.get('x-forwarded-proto') === 'https';
        res.cookie('guest_session_token', sessionToken, {
            httpOnly: true,
            secure: isSecure,
            sameSite: 'lax',
            maxAge: 24 * 60 * 60 * 1000, // 24시간
            path: '/'
        });

        // 8. 302 Redirect
        res.redirect(302, `/guest/orders.html?order=${encodeURIComponent(tokenData.order_number)}`);

    } catch (error) {
        if (connection) {
            await connection.end();
        }
        Logger.error('[GUEST_SESSION] 세션 발급 실패', {
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: '세션 발급에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/guest/orders/:orderNumber
 * 비회원 주문 조회 API (읽기 전용)
 * 
 * Path Parameters:
 * - orderNumber: string (필수) - 주문번호 (예: ORD-20250115-123456-ABC)
 * 
 * 인증:
 * - httpOnly Cookie (guest_session_token)로 세션 검증
 * - 세션 order_number == 요청 order_number 확인 (수평 권한상승 방지)
 * 
 * 응답 데이터 (최소 노출 + 배송지 정보 포함):
 * - order_number, order_date, total_price, status
 * - items: 상품명/옵션/수량
 * - shipments: carrier_code, tracking_number, shipped_at, delivered_at
 * - shipping_address, shipping_phone (원래 계획대로 포함)
 */
router.get('/guest/orders/:orderNumber', async (req, res) => {
    let connection;
    try {
        const { orderNumber } = req.params;
        const sessionToken = req.cookies?.guest_session_token;

        if (!sessionToken || typeof sessionToken !== 'string') {
            return res.status(401).json({
                success: false,
                message: '세션이 만료되었거나 유효하지 않습니다.',
                code: 'SESSION_REQUIRED'
            });
        }

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        // 1. 세션 토큰 검증
        const [sessions] = await connection.execute(
            `SELECT 
                gos.session_id,
                gos.order_id,
                gos.session_token,
                gos.expires_at,
                gos.last_access_at,
                o.order_number,
                o.user_id,
                got.revoked_at
            FROM guest_order_sessions gos
            INNER JOIN orders o ON gos.order_id = o.order_id
            INNER JOIN guest_order_access_tokens got ON gos.access_token_id = got.token_id
            WHERE gos.session_token = ?`,
            [sessionToken]
        );

        if (sessions.length === 0) {
            await connection.end();
            return res.status(401).json({
                success: false,
                message: '유효하지 않은 세션입니다.',
                code: 'INVALID_SESSION'
            });
        }

        const session = sessions[0];

        // 2. 세션 만료 확인
        if (new Date(session.expires_at) < new Date()) {
            await connection.end();
            return res.status(410).json({
                success: false,
                message: '세션이 만료되었습니다.',
                code: 'SESSION_EXPIRED'
            });
        }

        // 3. 수평 권한상승 방지: 세션 order_number == 요청 order_number
        if (session.order_number !== orderNumber) {
            await connection.end();
            return res.status(403).json({
                success: false,
                message: '접근 권한이 없습니다.',
                code: 'ACCESS_DENIED'
            });
        }

        // 4. Claim 완료 확인 (orders.user_id IS NOT NULL)
        if (session.user_id !== null) {
            await connection.end();
            return res.status(410).json({
                success: false,
                message: '이미 회원 계정에 연동된 주문입니다.',
                code: 'ORDER_CLAIMED'
            });
        }

        // 5. revoked_at 확인
        if (session.revoked_at !== null) {
            await connection.end();
            return res.status(410).json({
                success: false,
                message: '토큰이 회수되었습니다.',
                code: 'TOKEN_REVOKED'
            });
        }

        // 6. last_access_at 업데이트
        await connection.execute(
            `UPDATE guest_order_sessions 
             SET last_access_at = NOW() 
             WHERE session_id = ?`,
            [session.session_id]
        );

        // 7. 주문 정보 조회
        const [orders] = await connection.execute(
            `SELECT 
                o.order_id,
                o.order_number,
                o.created_at AS order_date,
                o.total_price,
                o.status,
                o.shipping_first_name,
                o.shipping_last_name,
                o.shipping_email,
                o.shipping_phone,
                o.shipping_address,
                o.shipping_city,
                o.shipping_postal_code,
                o.shipping_country,
                o.paid_at
            FROM orders o
            WHERE o.order_number = ?`,
            [orderNumber]
        );

        if (orders.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '주문을 찾을 수 없습니다.',
                code: 'ORDER_NOT_FOUND'
            });
        }

        const order = orders[0];

        // 8. 주문 항목 조회
        const [items] = await connection.execute(
            `SELECT 
                oi.order_item_id,
                oi.product_id,
                oi.quantity,
                oi.price,
                oi.size,
                oi.color,
                p.name AS product_name,
                p.product_id AS product_code
            FROM order_items oi
            INNER JOIN products p ON oi.product_id = p.product_id
            WHERE oi.order_id = ?
            ORDER BY oi.order_item_id`,
            [order.order_id]
        );

        // 9. 배송 정보 조회 (shipments 기반)
        const [shipments] = await connection.execute(
            `SELECT 
                s.shipment_id,
                s.carrier_code,
                s.tracking_number,
                s.shipped_at,
                c.name AS carrier_name
            FROM shipments s
            INNER JOIN carriers c ON s.carrier_code = c.code
            WHERE s.order_id = ?
              AND s.voided_at IS NULL
            ORDER BY s.shipped_at DESC`,
            [order.order_id]
        );

        // 10. 배송 완료 정보 조회 (order_item_units 기반)
        const [deliveredUnits] = await connection.execute(
            `SELECT 
                oiu.order_item_unit_id,
                oiu.delivered_at
            FROM order_item_units oiu
            WHERE oiu.order_id = ?
              AND oiu.unit_status = 'delivered'
              AND oiu.delivered_at IS NOT NULL
            ORDER BY oiu.delivered_at DESC
            LIMIT 1`,
            [order.order_id]
        );

        await connection.end();

        // 11. 응답 데이터 구성
        const responseData = {
            order: {
                order_number: order.order_number,
                order_date: order.order_date,
                total_price: parseFloat(order.total_price),
                status: order.status,
                paid_at: order.paid_at
            },
            shipping: {
                first_name: order.shipping_first_name,
                last_name: order.shipping_last_name,
                email: order.shipping_email,
                phone: order.shipping_phone,
                address: order.shipping_address,
                city: order.shipping_city,
                postal_code: order.shipping_postal_code,
                country: order.shipping_country
            },
            items: items.map(item => ({
                product_name: item.product_name,
                product_code: item.product_code,
                quantity: item.quantity,
                price: parseFloat(item.price),
                size: item.size,
                color: item.color
            })),
            shipments: shipments.map(shipment => ({
                carrier_code: shipment.carrier_code,
                carrier_name: shipment.carrier_name,
                tracking_number: shipment.tracking_number,
                shipped_at: shipment.shipped_at,
                delivered_at: deliveredUnits.length > 0 ? deliveredUnits[0].delivered_at : null
            }))
        };

        Logger.log('[GUEST_ORDER] 주문 조회 완료', {
            orderNumber,
            orderId: order.order_id,
            sessionId: session.session_id,
            itemsCount: items.length,
            shipmentsCount: shipments.length
        });

        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        if (connection) {
            await connection.end();
        }
        Logger.error('[GUEST_ORDER] 주문 조회 실패', {
            orderNumber: req.params.orderNumber,
            error: error.message,
            stack: error.stack
        });
        res.status(500).json({
            success: false,
            message: '주문 조회에 실패했습니다.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;

