// stock-routes.js - 재고 관리 API 라우트
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const Logger = require('./logger');
const { correctStockStatus } = require('./utils/stock-corrector');
require('dotenv').config();

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
 * GET /api/admin/stock
 * 재고 목록 조회 (관리자 전용)
 * 
 * 쿼리 파라미터:
 * - product_id: 상품 ID 필터
 * - status: 재고 상태 필터 (in_stock, reserved, sold, returned)
 * - limit: 페이지 크기 (기본: 50)
 * - offset: 오프셋 (기본: 0)
 */
router.get('/admin/stock', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const {
            product_id,
            status,
            limit = 50,
            offset = 0
        } = req.query;

        const limitNum = Math.min(parseInt(limit, 10) || 50, 200);
        const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

        connection = await mysql.createConnection(dbConfig);

        let query = `
            SELECT 
                su.stock_unit_id,
                su.product_id,
                su.token_pk,
                su.status,
                su.reserved_at,
                su.reserved_by_order_id,
                su.sold_at,
                su.created_at,
                su.updated_at,
                ap.name as product_name,
                tm.token,
                tm.internal_code,
                tm.serial_number,
                o.order_number,
                o.order_id
            FROM stock_units su
            INNER JOIN admin_products ap ON su.product_id = ap.id
            INNER JOIN token_master tm ON su.token_pk = tm.token_pk
            LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
            WHERE 1=1
        `;
        const params = [];

        // 필터링
        if (product_id) {
            query += ' AND su.product_id = ?';
            params.push(product_id);
        }

        if (status) {
            query += ' AND su.status = ?';
            params.push(status);
        }

        // 총 개수 조회
        const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const [countResult] = await connection.execute(countQuery, params);
        const total = countResult[0].total;

        // 데이터 조회 (정렬: 최신순)
        query += ' ORDER BY su.created_at DESC LIMIT ? OFFSET ?';
        params.push(limitNum, offsetNum);

        const [rows] = await connection.execute(query, params);

        // 토큰 마스킹 (목록 화면에서는 마스킹)
        const stockList = rows.map(row => ({
            stock_unit_id: row.stock_unit_id,
            product_id: row.product_id,
            product_name: row.product_name,
            token_pk: row.token_pk,
            token: maskToken(row.token), // 마스킹 처리
            token_full: row.token, // 전체 토큰 (필요시 사용)
            internal_code: row.internal_code,
            serial_number: row.serial_number,
            status: row.status,
            reserved_at: row.reserved_at,
            reserved_by_order_id: row.reserved_by_order_id,
            reserved_by_order_number: row.order_number,
            sold_at: row.sold_at,
            created_at: row.created_at,
            updated_at: row.updated_at
        }));

        await connection.end();

        res.json({
            success: true,
            stock: stockList,
            pagination: {
                total,
                limit: limitNum,
                offset: offsetNum,
                hasMore: offsetNum + limitNum < total
            }
        });

    } catch (error) {
        Logger.error('[STOCK] 재고 목록 조회 실패', {
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        res.status(500).json({
            success: false,
            message: '재고 목록을 불러오는데 실패했습니다.'
        });
    }
});

/**
 * GET /api/admin/stock/products/:productId/tokens
 * 특정 상품의 사용 가능한 token_pk 목록 조회
 * (재고에 등록되지 않은 token_pk만 반환)
 */
router.get('/admin/stock/products/:productId/tokens', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productId } = req.params;

        connection = await mysql.createConnection(dbConfig);

        // 해당 상품의 token_master 조회 (재고에 등록되지 않은 것만)
        const [tokens] = await connection.execute(
            `SELECT 
                tm.token_pk,
                tm.token,
                tm.internal_code,
                tm.serial_number,
                tm.product_name
            FROM token_master tm
            WHERE tm.product_name = (
                SELECT name FROM admin_products WHERE id = ?
            )
            AND tm.token_pk NOT IN (
                SELECT token_pk FROM stock_units WHERE product_id = ?
            )
            ORDER BY tm.token_pk
            LIMIT 100`,
            [productId, productId]
        );

        await connection.end();

        res.json({
            success: true,
            tokens: tokens.map(t => ({
                token_pk: t.token_pk,
                token: maskToken(t.token), // 마스킹 처리
                token_full: t.token, // 전체 토큰
                internal_code: t.internal_code,
                serial_number: t.serial_number
            }))
        });

    } catch (error) {
        Logger.error('[STOCK] 사용 가능한 토큰 조회 실패', {
            productId: req.params.productId,
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        res.status(500).json({
            success: false,
            message: '사용 가능한 토큰을 불러오는데 실패했습니다.'
        });
    }
});

/**
 * POST /api/admin/stock
 * 재고 추가 (관리자 전용)
 * 
 * Body:
 * - product_id: 상품 ID
 * - token_pk: 토큰 PK (배열 가능, 여러 개 한 번에 추가)
 */
router.post('/admin/stock', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { product_id, token_pk } = req.body;

        // 유효성 검증
        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: '상품 ID는 필수입니다.'
            });
        }

        if (!token_pk) {
            return res.status(400).json({
                success: false,
                message: '토큰 PK는 필수입니다.'
            });
        }

        // token_pk를 배열로 변환 (단일 값이면 배열로)
        const tokenPkArray = Array.isArray(token_pk) ? token_pk : [token_pk];

        if (tokenPkArray.length === 0) {
            return res.status(400).json({
                success: false,
                message: '최소 1개 이상의 토큰 PK가 필요합니다.'
            });
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 상품 존재 확인
            const [products] = await connection.execute(
                'SELECT id, name FROM admin_products WHERE id = ?',
                [product_id]
            );

            if (products.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '상품을 찾을 수 없습니다.'
                });
            }

            // token_pk 유효성 확인 및 중복 체크
            const placeholders = tokenPkArray.map(() => '?').join(',');
            const [tokens] = await connection.execute(
                `SELECT token_pk, token, product_name 
                 FROM token_master 
                 WHERE token_pk IN (${placeholders})`,
                tokenPkArray
            );

            if (tokens.length !== tokenPkArray.length) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '일부 토큰을 찾을 수 없습니다.'
                });
            }

            // token_master의 product_name과 admin_products의 name이 일치하는지 확인
            const productName = products[0].name;
            const invalidTokens = tokens.filter(t => t.product_name !== productName);
            if (invalidTokens.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `일부 토큰이 해당 상품(${productName})과 일치하지 않습니다.`
                });
            }

            // 이미 재고에 등록된 token_pk 확인
            const [existingStock] = await connection.execute(
                `SELECT token_pk FROM stock_units WHERE token_pk IN (${placeholders})`,
                tokenPkArray
            );

            if (existingStock.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `일부 토큰은 이미 재고에 등록되어 있습니다. (${existingStock.length}개)`
                });
            }

            // 재고 추가
            const insertValues = tokenPkArray.map(tpk => [
                product_id,
                tpk,
                'in_stock',
                new Date(),
                new Date()
            ]);

            await connection.query(
                `INSERT INTO stock_units 
                 (product_id, token_pk, status, created_at, updated_at) 
                 VALUES ?`,
                [insertValues]
            );

            await connection.commit();
            await connection.end();

            Logger.log('[STOCK] 재고 추가 완료', {
                product_id,
                token_count: tokenPkArray.length,
                admin: req.user.email
            });

            res.json({
                success: true,
                message: `${tokenPkArray.length}개의 재고가 추가되었습니다.`,
                added_count: tokenPkArray.length
            });

        } catch (error) {
            await connection.rollback();
            await connection.end();
            throw error;
        }

    } catch (error) {
        Logger.error('[STOCK] 재고 추가 실패', {
            error: error.message,
            stack: error.stack,
            admin: req.user?.email
        });

        res.status(500).json({
            success: false,
            message: '재고 추가에 실패했습니다.'
        });
    }
});

/**
 * GET /api/admin/stock/:stockUnitId
 * 재고 상세 조회 (관리자 전용)
 */
router.get('/admin/stock/:stockUnitId', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { stockUnitId } = req.params;

        connection = await mysql.createConnection(dbConfig);

        const [rows] = await connection.execute(
            `SELECT 
                su.stock_unit_id,
                su.product_id,
                su.token_pk,
                su.status,
                su.reserved_at,
                su.reserved_by_order_id,
                su.sold_at,
                su.created_at,
                su.updated_at,
                ap.name as product_name,
                tm.token,
                tm.internal_code,
                tm.serial_number,
                tm.rot_code,
                tm.warranty_bottom_code,
                o.order_number,
                o.order_id
            FROM stock_units su
            INNER JOIN admin_products ap ON su.product_id = ap.id
            INNER JOIN token_master tm ON su.token_pk = tm.token_pk
            LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
            WHERE su.stock_unit_id = ?`,
            [stockUnitId]
        );

        await connection.end();

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '재고를 찾을 수 없습니다.'
            });
        }

        const stock = rows[0];

        res.json({
            success: true,
            stock: {
                stock_unit_id: stock.stock_unit_id,
                product_id: stock.product_id,
                product_name: stock.product_name,
                token_pk: stock.token_pk,
                token: stock.token, // 상세 화면에서는 전체 토큰 표시
                internal_code: stock.internal_code,
                serial_number: stock.serial_number,
                rot_code: stock.rot_code,
                warranty_bottom_code: stock.warranty_bottom_code,
                status: stock.status,
                reserved_at: stock.reserved_at,
                reserved_by_order_id: stock.reserved_by_order_id,
                reserved_by_order_number: stock.order_number,
                sold_at: stock.sold_at,
                created_at: stock.created_at,
                updated_at: stock.updated_at
            }
        });

    } catch (error) {
        Logger.error('[STOCK] 재고 상세 조회 실패', {
            stockUnitId: req.params.stockUnitId,
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        res.status(500).json({
            success: false,
            message: '재고 상세 정보를 불러오는데 실패했습니다.'
        });
    }
});

/**
 * GET /api/admin/stock/stats
 * 재고 통계 조회 (상품별, 상태별)
 */
router.get('/admin/stock/stats', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        // 상품별 재고 통계
        const [productStats] = await connection.execute(
            `SELECT 
                su.product_id,
                ap.name as product_name,
                su.status,
                COUNT(*) as count
            FROM stock_units su
            INNER JOIN admin_products ap ON su.product_id = ap.id
            GROUP BY su.product_id, su.status
            ORDER BY su.product_id, su.status`
        );

        // 전체 통계
        const [totalStats] = await connection.execute(
            `SELECT 
                status,
                COUNT(*) as count
            FROM stock_units
            GROUP BY status`
        );

        await connection.end();

        res.json({
            success: true,
            stats: {
                by_product: productStats,
                by_status: totalStats
            }
        });

    } catch (error) {
        Logger.error('[STOCK] 재고 통계 조회 실패', {
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        res.status(500).json({
            success: false,
            message: '재고 통계를 불러오는데 실패했습니다.'
        });
    }
});

/**
 * POST /api/admin/stock/:stockUnitId/correct
 * 재고 상태 정정 (관리자 전용, 안전장치 포함)
 * 
 * Body:
 * - new_status: 변경할 상태 ('in_stock', 'returned' 등)
 * - reason: 변경 사유 (필수)
 */
router.post('/admin/stock/:stockUnitId/correct', authenticateToken, requireAdmin, async (req, res) => {
    try {
        const { stockUnitId } = req.params;
        const { new_status, reason } = req.body;
        const adminId = req.user.userId || req.user.id;

        // 유효성 검증
        if (!new_status) {
            return res.status(400).json({
                success: false,
                message: '변경할 상태는 필수입니다.'
            });
        }

        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '변경 사유는 필수입니다.'
            });
        }

        const allowedStatuses = ['in_stock', 'returned'];
        if (!allowedStatuses.includes(new_status)) {
            return res.status(400).json({
                success: false,
                message: `유효하지 않은 상태입니다: ${new_status}`
            });
        }

        const result = await correctStockStatus(
            parseInt(stockUnitId, 10),
            new_status,
            reason,
            adminId
        );

        res.json({
            success: true,
            message: result.message,
            stockUnitId: result.stockUnitId,
            oldStatus: result.oldStatus,
            newStatus: result.newStatus
        });

    } catch (error) {
        Logger.error('[STOCK] 재고 상태 정정 실패', {
            stockUnitId: req.params.stockUnitId,
            error: error.message,
            stack: error.stack,
            admin: req.user?.email
        });

        res.status(500).json({
            success: false,
            message: error.message || '재고 상태 정정에 실패했습니다.'
        });
    }
});

/**
 * 토큰 마스킹 함수
 * 목록 화면: 앞 4자 + ... + 뒤 4자
 */
function maskToken(token) {
    if (!token || token.length < 8) return token;
    return token.substring(0, 4) + '...' + token.substring(token.length - 4);
}

module.exports = router;
