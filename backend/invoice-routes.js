/**
 * 디지털 인보이스 API 라우트
 * 
 * 엔드포인트:
 * - GET /api/invoices/me - 사용자 인보이스 목록 조회
 * - GET /api/invoices/:invoiceId - 인보이스 상세 정보 조회
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const Logger = require('./logger');

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * GET /api/invoices/me
 * 마이페이지 인보이스 목록 조회
 * 
 * 역할:
 * - 로그인한 사용자의 인보이스 목록 반환
 * - orders 테이블과 조인하여 사용자별 인보이스 조회
 * 
 * 쿼리 파라미터:
 * - limit: 페이지 크기 (기본 20, 최대 100)
 * - offset: 오프셋 (기본 0)
 */
router.get('/invoices/me', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    
    // 페이지네이션 파라미터 검증 및 정수 변환
    let limit = parseInt(req.query.limit, 10);
    let offset = parseInt(req.query.offset, 10);
    
    // 기본값 설정 (NaN이거나 정수가 아닌 경우)
    if (!Number.isInteger(limit) || limit < 1) limit = 20;
    if (!Number.isInteger(offset) || offset < 0) offset = 0;
    
    // 범위 제한
    if (limit > 100) limit = 100;
    
    // 최종 검증: 문자열 보간에 사용되므로 반드시 정수 확정
    if (!Number.isInteger(limit) || !Number.isInteger(offset)) {
        limit = 20;
        offset = 0;
    }
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            // 1. 사용자별 인보이스 목록 조회 (orders와 조인, payload_json 포함)
            // 첫 번째 order_items의 product_id를 통해 admin_products.short_name 조회
            const [invoices] = await connection.execute(`
                SELECT 
                    i.invoice_id,
                    i.invoice_number,
                    i.type,
                    i.status,
                    i.currency,
                    i.total_amount,
                    i.tax_amount,
                    i.net_amount,
                    i.billing_name,
                    i.billing_email,
                    i.shipping_name,
                    i.payload_json,
                    i.issued_at,
                    o.order_id,
                    o.order_number,
                    o.status as order_status,
                    (SELECT ap.short_name 
                     FROM order_items oi 
                     INNER JOIN admin_products ap ON oi.product_id = ap.id 
                     WHERE oi.order_id = i.order_id 
                     ORDER BY oi.order_item_id ASC 
                     LIMIT 1) as product_short_name
                FROM invoices i
                INNER JOIN orders o ON i.order_id = o.order_id
                WHERE o.user_id = ?
                  AND i.status = 'issued'
                ORDER BY i.issued_at DESC
                LIMIT ${limit} OFFSET ${offset}
            `, [userId]);
            
            // 2. 총 개수 조회
            const [countResult] = await connection.execute(`
                SELECT COUNT(*) as total
                FROM invoices i
                INNER JOIN orders o ON i.order_id = o.order_id
                WHERE o.user_id = ?
                  AND i.status = 'issued'
            `, [userId]);
            
            const total = countResult[0]?.total || 0;
            
            // 3. 응답 데이터 포맷팅
            const formattedInvoices = invoices.map(invoice => {
                // issued_at을 ISO 형식으로 변환
                const issuedAt = invoice.issued_at instanceof Date 
                    ? invoice.issued_at.toISOString().replace(/\.\d{3}Z$/, 'Z')
                    : invoice.issued_at;
                
                // productName 우선순위: admin_products.short_name > payload_json.product_name
                let productName = null;
                
                // 1순위: admin_products.short_name (SQL 서브쿼리로 이미 가져옴)
                if (invoice.product_short_name) {
                    productName = invoice.product_short_name;
                } else {
                    // 2순위: payload_json에서 첫 번째 아이템의 product_name 추출 (fallback)
                    try {
                        if (invoice.payload_json) {
                            const payload = typeof invoice.payload_json === 'string' 
                                ? JSON.parse(invoice.payload_json) 
                                : invoice.payload_json;
                            if (payload.items && Array.isArray(payload.items) && payload.items.length > 0) {
                                productName = payload.items[0].product_name || null;
                            }
                        }
                    } catch (parseError) {
                        Logger.warn('[INVOICE] payload_json 파싱 실패', {
                            invoice_id: invoice.invoice_id,
                            error: parseError.message
                        });
                    }
                }
                
                return {
                    invoiceId: invoice.invoice_id,
                    invoiceNumber: invoice.invoice_number,
                    type: invoice.type,
                    status: invoice.status,
                    currency: invoice.currency,
                    totalAmount: parseFloat(invoice.total_amount),
                    taxAmount: parseFloat(invoice.tax_amount),
                    netAmount: parseFloat(invoice.net_amount),
                    billingName: invoice.billing_name,
                    billingEmail: invoice.billing_email,
                    shippingName: invoice.shipping_name,
                    productName: productName, // payload_json에서 추출한 제품명
                    issuedAt: issuedAt,
                    orderId: invoice.order_id,
                    orderNumber: invoice.order_number,
                    orderStatus: invoice.order_status
                };
            });
            
            return res.json({
                success: true,
                invoices: formattedInvoices,
                paging: {
                    total: total,
                    limit: limit,
                    offset: offset,
                    hasMore: offset + formattedInvoices.length < total
                }
            });
            
        } finally {
            await connection.end();
        }
        
    } catch (error) {
        Logger.error('[INVOICE] 인보이스 목록 조회 실패:', {
            message: error.message,
            code: error.code,
            user_id: userId
        });
        
        return res.status(500).json({
            success: false,
            message: '인보이스 목록 조회 중 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * GET /api/invoices/:invoiceId
 * 인보이스 상세 정보 조회
 * 
 * 역할:
 * - 특정 인보이스의 상세 정보 반환
 * - 결제 방법(payment_method) 포함
 * 
 * 파라미터:
 * - invoiceId: 인보이스 ID 또는 인보이스 번호
 */
router.get('/invoices/:invoiceId', authenticateToken, async (req, res) => {
    const invoiceId = req.params.invoiceId;
    const userId = req.user.userId;
    
    Logger.log('[INVOICE] 인보이스 상세 조회 요청:', {
        invoiceId,
        userId,
        type: typeof invoiceId
    });
    
    try {
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            // invoiceId가 숫자인지 문자열인지 확인
            const isNumeric = /^\d+$/.test(invoiceId);
            const whereClause = isNumeric 
                ? 'i.invoice_id = ?' 
                : 'i.invoice_number = ?';
            
            Logger.log('[INVOICE] 쿼리 조건:', {
                isNumeric,
                whereClause,
                invoiceId
            });
            
            // 인보이스 상세 정보 조회 (orders, users, payments와 조인하여 결제 방법 및 membership_id 포함)
            const [invoices] = await connection.execute(`
                SELECT 
                    i.invoice_id,
                    i.invoice_number,
                    i.type,
                    i.status,
                    i.currency,
                    i.total_amount,
                    i.tax_amount,
                    i.net_amount,
                    i.billing_name,
                    i.billing_email,
                    i.billing_phone,
                    i.billing_address_json,
                    i.shipping_name,
                    i.shipping_email,
                    i.shipping_phone,
                    i.shipping_address_json,
                    i.payload_json,
                    i.issued_at,
                    o.order_id,
                    o.order_number,
                    o.status as order_status,
                    u.membership_id,
                    p.gateway as payment_method
                FROM invoices i
                INNER JOIN orders o ON i.order_id = o.order_id
                LEFT JOIN users u ON o.user_id = u.user_id
                LEFT JOIN payments p ON o.order_number = p.order_number AND p.status = 'captured'
                WHERE ${whereClause}
                  AND o.user_id = ?
                  AND i.status = 'issued'
                ORDER BY p.created_at DESC
                LIMIT 1
            `, [invoiceId, userId]);
            
            if (invoices.length === 0) {
                Logger.warn('[INVOICE] 인보이스를 찾을 수 없음:', {
                    invoiceId,
                    userId,
                    isNumeric,
                    whereClause
                });
                return res.status(404).json({
                    success: false,
                    message: '인보이스를 찾을 수 없습니다.',
                    code: 'INVOICE_NOT_FOUND'
                });
            }
            
            const invoice = invoices[0];
            
            // issued_at을 ISO 형식으로 변환
            const issuedAt = invoice.issued_at instanceof Date 
                ? invoice.issued_at.toISOString().replace(/\.\d{3}Z$/, 'Z')
                : invoice.issued_at;
            
            // 결제 방법 포맷팅 (gateway를 사용자 친화적인 이름으로 변환)
            let paymentMethod = 'Credit Card'; // 기본값
            if (invoice.payment_method) {
                const gatewayMap = {
                    'toss': 'Credit Card',
                    'card': 'Credit Card',
                    'virtual': 'Virtual Account',
                    'bank': 'Bank Transfer',
                    'mobile': 'Mobile Payment'
                };
                paymentMethod = gatewayMap[invoice.payment_method.toLowerCase()] || invoice.payment_method.toUpperCase();
            }
            
            // order_items와 admin_products를 조인하여 product_id → short_name 매핑 생성
            const [orderItemsWithShortName] = await connection.execute(`
                SELECT 
                    oi.product_id,
                    oi.product_name,
                    ap.short_name
                FROM order_items oi
                LEFT JOIN admin_products ap ON oi.product_id = ap.id
                WHERE oi.order_id = ?
                ORDER BY oi.order_item_id ASC
            `, [invoice.order_id]);
            
            // product_id → short_name 매핑 생성
            const productShortNameMap = {};
            orderItemsWithShortName.forEach(item => {
                if (item.product_id && item.short_name) {
                    productShortNameMap[item.product_id] = item.short_name;
                }
            });
            
            // payload_json 파싱 및 items에 short_name 추가
            let payloadJson = invoice.payload_json;
            if (payloadJson) {
                try {
                    const payload = typeof payloadJson === 'string' 
                        ? JSON.parse(payloadJson) 
                        : payloadJson;
                    
                    // items 배열의 각 item에 short_name 추가
                    if (payload.items && Array.isArray(payload.items)) {
                        payload.items = payload.items.map(item => {
                            const shortName = item.product_id && productShortNameMap[item.product_id]
                                ? productShortNameMap[item.product_id]
                                : item.product_name; // fallback: short_name이 없으면 product_name 사용
                            
                            return {
                                ...item,
                                product_short_name: shortName
                            };
                        });
                    }
                    
                    payloadJson = JSON.stringify(payload);
                } catch (parseError) {
                    Logger.warn('[INVOICE] payload_json 파싱 실패 (short_name 추가)', {
                        invoice_id: invoice.invoice_id,
                        error: parseError.message
                    });
                    // 파싱 실패 시 원본 payload_json 유지
                }
            }
            
            return res.json({
                success: true,
                invoice: {
                    invoice_id: invoice.invoice_id,
                    invoice_number: invoice.invoice_number,
                    invoiceNumber: invoice.invoice_number,
                    type: invoice.type,
                    status: invoice.status,
                    currency: invoice.currency,
                    total_amount: parseFloat(invoice.total_amount),
                    totalAmount: parseFloat(invoice.total_amount),
                    tax_amount: parseFloat(invoice.tax_amount),
                    taxAmount: parseFloat(invoice.tax_amount),
                    net_amount: parseFloat(invoice.net_amount),
                    netAmount: parseFloat(invoice.net_amount),
                    billing_name: invoice.billing_name,
                    billing_email: invoice.billing_email,
                    billing_phone: invoice.billing_phone,
                    billing_address_json: invoice.billing_address_json,
                    shipping_name: invoice.shipping_name,
                    shipping_email: invoice.shipping_email,
                    shipping_phone: invoice.shipping_phone,
                    shipping_address_json: invoice.shipping_address_json,
                    payload_json: payloadJson,
                    issued_at: issuedAt,
                    issuedAt: issuedAt,
                    order_id: invoice.order_id,
                    order_number: invoice.order_number,
                    orderNumber: invoice.order_number,
                    order_status: invoice.order_status,
                    membership_id: invoice.membership_id || null,
                    membershipId: invoice.membership_id || null,
                    payment_method: paymentMethod
                }
            });
            
        } finally {
            await connection.end();
        }
        
    } catch (error) {
        Logger.error('[INVOICE] 인보이스 상세 조회 실패:', {
            message: error.message,
            code: error.code,
            invoice_id: invoiceId,
            user_id: userId
        });
        
        return res.status(500).json({
            success: false,
            message: '인보이스 상세 조회 중 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;
