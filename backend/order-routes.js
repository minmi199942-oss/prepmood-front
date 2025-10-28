// order-routes.js - 주문 관리 API

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const { body, validationResult } = require('express-validator');
const Logger = require('./logger');
const rateLimit = require('express-rate-limit');

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
    
    // 이름 길이 및 패턴 검증
    if (!shipping.recipient_first_name || shipping.recipient_first_name.trim().length < 1 || shipping.recipient_first_name.trim().length > 50) {
        errors['shipping.recipient_first_name'] = '이름은 1-50자 사이여야 합니다';
    }
    if (!shipping.recipient_last_name || shipping.recipient_last_name.trim().length < 1 || shipping.recipient_last_name.trim().length > 50) {
        errors['shipping.recipient_last_name'] = '성은 1-50자 사이여야 합니다';
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
        if (!item.product_id || !Number.isInteger(item.product_id) || item.product_id <= 0) {
            errors[`${prefix}.product_id`] = '유효한 상품 ID가 필요합니다';
        }
        
        // quantity 검증
        if (!item.quantity || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10) {
            errors[`${prefix}.quantity`] = '수량은 1-10 사이여야 합니다';
        }
        
        // price 검증 (클라이언트에서 보낸 가격은 무시하고 서버에서 재계산)
        if (item.price !== undefined) {
            Logger.log(`경고: 클라이언트에서 가격 정보 전송됨 (무시됨): ${item.price}`);
        }
    }
    
    return Object.keys(errors).length > 0 ? errors : null;
}

// Rate limiting 미들웨어
const orderCreationLimiter = rateLimit({
    windowMs: 60 * 1000, // 1분
    max: 10, // IP당 분당 10회
    message: {
        code: 'RATE_LIMIT_EXCEEDED',
        details: { message: '주문 생성 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // IP + 사용자 ID 조합으로 제한
        return `${req.ip}-${req.user?.userId || 'anonymous'}`;
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
router.post('/orders', authenticateToken, orderCreationLimiter, async (req, res) => {
    let connection;
    try {
        // 0) Idempotency-Key 처리 (중복 생성 방지)
        const idemKey = req.header('X-Idempotency-Key');
        const userId = req.user?.user_id || null;

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
            const [productRows] = await connection.execute(
                'SELECT product_id, name, price, image, sku FROM products WHERE product_id = ?',
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
                    
                    // orders 테이블에 주문 생성 (배송 정보 및 주문번호 포함)
                    [orderResult] = await connection.execute(
                        `INSERT INTO orders (user_id, order_number, total_price, status, 
                         shipping_first_name, shipping_last_name, shipping_email, shipping_phone,
                         shipping_address, shipping_city, shipping_postal_code, shipping_country,
                         shipping_method, shipping_cost, estimated_delivery) 
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [userId, orderNumber, finalTotal, 'pending',
                         shipping.recipient_first_name, shipping.recipient_last_name, shipping.email, shipping.phone,
                         shipping.address, shipping.city, shipping.postal_code, shipping.country,
                         shipping.method || 'standard', shipping.cost || 0, etaStr] // 새로운 필드명 사용
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
                await connection.execute(
                    `INSERT INTO order_items (order_id, product_id, product_name, product_image, quantity, unit_price, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [orderId, itemData.product_id, itemData.product_name, itemData.product_image, 
                     itemData.quantity, itemData.unit_price, itemData.subtotal]
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
            userId: req.user?.userId,
            shipping: maskedShipping
        });
        
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

        connection = await mysql.createConnection(dbConfig);

        // 주문 목록 조회 (배송 정보 및 주문번호 포함)
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, total_price, order_date, status, 
                    shipping_first_name, shipping_last_name, shipping_city, shipping_country,
                    shipping_method, shipping_cost, estimated_delivery
             FROM orders 
             WHERE user_id = ? 
             ORDER BY order_date DESC`,
            [userId]
        );

        // 각 주문의 상품 정보 조회
        const ordersWithItems = await Promise.all(
            orders.map(async (order) => {
                const [items] = await connection.execute(
                    `SELECT order_item_id, product_id, product_name, product_image, 
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
router.get('/orders/:orderId', authenticateToken, async (req, res) => {
    let connection;
    try {
        const userId = req.user.userId;
        const orderId = req.params.orderId;

        connection = await mysql.createConnection(dbConfig);

        // 주문 정보 조회
        const [orders] = await connection.execute(
            'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
            [orderId, userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ 
                code: 'NOT_FOUND', 
                details: { message: '주문을 찾을 수 없습니다' }
            });
        }

        const order = orders[0];

        // 주문 상품 조회
        const [items] = await connection.execute(
            `SELECT order_item_id, product_id, product_name, product_image, 
                    quantity, unit_price, subtotal 
             FROM order_items 
             WHERE order_id = ?`,
            [orderId]
        );

        const orderDetail = {
            order_id: order.order_id,
            order_number: order.order_number,
            user_id: order.user_id,
            total_price: parseFloat(order.total_price),
            order_date: order.order_date,
            status: order.status,
            shipping: {
                first_name: order.shipping_first_name,
                last_name: order.shipping_last_name,
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
                image: item.product_image,
                quantity: item.quantity,
                unit_price: parseFloat(item.unit_price),
                subtotal: parseFloat(item.subtotal)
            }))
        };

        res.json({
            success: true,
            order: orderDetail
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

module.exports = router;

