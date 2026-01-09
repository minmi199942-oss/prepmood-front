/**
 * 디지털 인보이스 API 라우트
 * 
 * 엔드포인트:
 * - GET /api/invoices/me - 사용자 인보이스 목록 조회
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
            // 1. 사용자별 인보이스 목록 조회 (orders와 조인)
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
                    i.issued_at,
                    o.order_id,
                    o.order_number,
                    o.status as order_status
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

module.exports = router;
