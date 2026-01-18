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

// ============================================================
// 정규화 함수 (Dual-read 지원)
// ============================================================

/**
 * product_id를 canonical_id로 정규화
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection
 * @returns {Promise<string|null>} - canonical_id (없으면 null)
 */
async function resolveProductId(productId, connection) {
    if (!productId) return null;
    
    // ⚠️ Cutover 후: id가 이미 canonical이므로 단순 조회
    const [products] = await connection.execute(
        `SELECT id
         FROM admin_products 
         WHERE id = ? 
         LIMIT 1`,
        [productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    return products[0].id;
}

/**
 * product_id를 legacy_id와 canonical_id 둘 다 반환
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection
 * @returns {Promise<Object|null>} - {legacy_id, canonical_id} 또는 null
 */
async function resolveProductIdBoth(productId, connection) {
    if (!productId) return null;
    
    // ⚠️ Cutover 후: id가 이미 canonical_id이므로 둘 다 같은 값
    const [products] = await connection.execute(
        `SELECT id
         FROM admin_products
         WHERE id = ?
         LIMIT 1`,
        [productId]
    );
    
    if (products.length === 0) {
        return null;
    }
    
    const canonicalId = products[0].id;
    return {
        legacy_id: canonicalId,  // cutover 후 id가 canonical
        canonical_id: canonicalId  // cutover 후 id가 canonical
    };
}

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
                su.size,
                su.color,
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
        const total = countResult[0]?.total || 0;

        // 데이터 조회 (정렬: 최신순)
        // 주의: LIMIT과 OFFSET은 파라미터로 바인딩할 수 없으므로 직접 숫자로 넣어야 함
        query += ` ORDER BY su.created_at DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;

        const [rows] = await connection.execute(query, params);

        // 토큰 마스킹 (목록 화면에서는 마스킹)
        const stockList = rows.map(row => ({
            stock_unit_id: row.stock_unit_id,
            product_id: row.product_id,
            product_name: row.product_name,
            token_pk: row.token_pk,
            token: maskToken(row.token), // 마스킹 처리
            token_full: row.token, // 전체 토큰 (필요시 사용)
            size: row.size, // size 추가
            color: row.color, // color 추가
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

        // ⚠️ Dual-read: canonical_id 또는 id로 상품 조회
        const canonicalId = await resolveProductId(productId, connection);
        
        if (!canonicalId) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }

        // 상품 정보 조회 (short_name도 포함)
        const [products] = await connection.execute(
            'SELECT id, name, short_name FROM admin_products WHERE id = ? LIMIT 1',
            [productId]
        );

        if (products.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }

        // token_master 조회
        const [tokens] = await connection.execute(
            `SELECT 
                tm.token_pk,
                tm.token,
                tm.internal_code,
                tm.serial_number,
                tm.product_name
            FROM token_master tm
            WHERE tm.product_id = ?
              AND tm.token_pk NOT IN (
                  SELECT COALESCE(token_pk, 0) FROM stock_units 
                  WHERE product_id = ?
              )
            ORDER BY tm.token_pk
            LIMIT 100`,
            [productId, productId]
        );

        await connection.end();

        const product = products[0];
        
        res.json({
            success: true,
            product: {
                id: product.id,
                name: product.name,
                short_name: product.short_name // 프론트엔드 매칭용
            },
            tokens: tokens.map(t => ({
                token_pk: t.token_pk,
                token: maskToken(t.token), // 마스킹 처리
                token_full: t.token, // 전체 토큰
                internal_code: t.internal_code,
                serial_number: t.serial_number,
                product_name: t.product_name // 확인 UX용
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
        const { product_id, token_pk, size, color } = req.body;

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
            const productIds = await resolveProductIdBoth(product_id, connection);
            
            if (!productIds) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '상품을 찾을 수 없습니다.'
                });
            }
            
            // 상품 정보 조회 (name 등)
            const [products] = await connection.execute(
                'SELECT id, name FROM admin_products WHERE id = ?',
                [productIds.legacy_id]
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

            // token_master의 product_id 조회 (단계적 마이그레이션 대응)
            const [tokenWithProductId] = await connection.execute(
                `SELECT 
                    tm.token_pk,
                    tm.product_id as token_product_id,
                    tm.product_name as token_product_name
                FROM token_master tm
                WHERE tm.token_pk IN (${placeholders})`,
                tokenPkArray
            );

            // 교차 정합성 검증: token_master.product_id와 요청 product_id 일치 확인
            // product_id는 NOT NULL이므로 항상 검증
            const mismatchedTokens = tokenWithProductId.filter(t => 
                t.token_product_id !== product_id
            );

            if (mismatchedTokens.length > 0) {
                await connection.rollback();
                await connection.end();
                const mismatchedInfo = mismatchedTokens.map(t => 
                    `token_pk=${t.token_pk} (token의 product_id=${t.token_product_id}, 요청 product_id=${product_id})`
                ).join(', ');
                
                Logger.error('[STOCK] 교차 정합성 검증 실패', {
                    product_id,
                    mismatched_tokens: mismatchedTokens.map(t => t.token_pk),
                    admin: req.user.email
                });

                return res.status(400).json({
                    success: false,
                    message: `선택한 토큰의 상품과 일치하지 않습니다. (${mismatchedTokens.length}개)`,
                    details: mismatchedInfo
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

            // product_id가 NULL인 토큰이 있는 경우 경고 (단계적 마이그레이션 중)
            const nullProductIdTokens = tokenWithProductId.filter(t => t.token_product_id === null);
            if (nullProductIdTokens.length > 0) {
                Logger.warn('[STOCK] product_id가 NULL인 토큰 입고 (단계적 마이그레이션)', {
                    product_id,
                    null_count: nullProductIdTokens.length,
                    admin: req.user.email
                });
                // 경고만 하고 계속 진행 (단계적 마이그레이션 허용)
            }

            // === normalizeColor 함수 정의 (INSERT 전으로 이동, null 반환으로 통일) ===
            function normalizeColor(color) {
                if (!color) return null;  // ✅ '' 대신 null 반환
                const normalized = String(color).trim();
                if (!normalized) return null;  // 빈 문자열도 null 반환
                
                const upper = normalized.toUpperCase();
                
                // 정확 매칭 우선 (안전성 향상)
                if (upper === 'LIGHTBLUE' || 
                    /^LightBlue$/i.test(normalized) || 
                    /^Light-Blue$/i.test(normalized) || 
                    upper === 'LB') {
                    return 'Light Blue';
                }
                if (upper === 'LIGHTGREY' || 
                    /^LightGrey$/i.test(normalized) || 
                    /^Light-Grey$/i.test(normalized) || 
                    upper === 'LG' || upper === 'LGY') {
                    return 'Light Grey';
                }
                if (upper === 'BK') return 'Black';
                if (upper === 'NV') return 'Navy';
                if (upper === 'WH' || upper === 'WT') return 'White';
                if (upper === 'GY') return 'Grey';
                if (upper === 'GRAY') return 'Grey';
                
                return normalized;  // 이미 표준값이면 그대로 반환
            }

            // size, color 결정 로직 (정석: 입력값 우선, 파싱은 fallback)
            // 입력값이 있으면 우선 사용, 없으면 serial_number 파싱, 둘 다 없으면 NULL (레거시)
            const finalSize = size || null;
            const finalColor = color || null;
            
            // 입력값이 없을 때만 파싱 시도 (fallback)
            let tokenSizeColorMap = {};
            if (!finalSize || !finalColor) {
                const [tokenDetails] = await connection.execute(
                    `SELECT 
                        token_pk,
                        serial_number
                    FROM token_master
                    WHERE token_pk IN (${placeholders})`,
                    tokenPkArray
                );
                
                // serial_number에서 size, color 추출하는 함수 (fallback용)
                const extractSizeColor = (serialNumber) => {
                    if (!serialNumber) return { size: null, color: null };
                    
                    // size 추출: -S-, -M-, -L-, -XL-, -XXL-, -F-
                    let extractedSize = null;
                    const sizePatterns = [
                        { pattern: /-S-[0-9]/, value: 'S' },
                        { pattern: /-M-[0-9]/, value: 'M' },
                        { pattern: /-L-[0-9]/, value: 'L' },
                        { pattern: /-XL-[0-9]/, value: 'XL' },
                        { pattern: /-XXL-[0-9]/, value: 'XXL' },
                        { pattern: /-F-[0-9]|-[0-9]+-F/, value: 'F' }
                    ];
                    for (const { pattern, value } of sizePatterns) {
                        if (pattern.test(serialNumber)) {
                            extractedSize = value;
                            break;
                        }
                    }
                    
                    // color 추출: -LightBlue-, -Black-, -Navy-, -White-, -Grey-
                    let extractedColor = null;
                    const colorPatterns = [
                        { pattern: /-(LightBlue|Light-Blue|LB)-/i, value: 'Light Blue' },
                        { pattern: /-(Black|BK)-/i, value: 'Black' },
                        { pattern: /-(Navy|NV)-/i, value: 'Navy' },
                        { pattern: /-(White|WH|WT)-/i, value: 'White' },
                        { pattern: /-(Grey|GY|Gray)-/i, value: 'Grey' },
                        { pattern: /-(LightGrey|Light-Grey|LGY)-/i, value: 'Light Grey' }
                    ];
                    for (const { pattern, value } of colorPatterns) {
                        if (pattern.test(serialNumber)) {
                            extractedColor = value;
                            break;
                        }
                    }
                    
                    return { size: extractedSize, color: extractedColor };
                };
                
                // token_pk별 size, color 매핑 생성 (fallback용)
                for (const token of tokenDetails) {
                    const extracted = extractSizeColor(token.serial_number);
                    tokenSizeColorMap[token.token_pk] = {
                        size: extracted.size,
                        color: extracted.color
                    };
                }
            }
            
            // === (1) 실제 저장될 값 계산 (파싱 fallback 포함) 및 유니크 셋 추출 ===
            const uniqueCombinations = new Set();
            const stockValuesMap = new Map(); // token_pk별 최종값 저장

            tokenPkArray.forEach(tpk => {
                const rawSize = finalSize || (tokenSizeColorMap[tpk]?.size || null);
                const rawColor = finalColor || (tokenSizeColorMap[tpk]?.color || null);
                
                // 정규화 적용
                const stockSize = rawSize ? rawSize.trim() : null;
                const stockColor = rawColor ? normalizeColor(rawColor) : null;  // null 반환 가능
                
                // 유니크 조합 추출
                const comboKey = `${stockColor || ''}@@${stockSize || ''}`;
                if (stockSize || stockColor) {
                    uniqueCombinations.add(comboKey);
                }
                
                stockValuesMap.set(tpk, { stockSize, stockColor });
            });

            // === (2) 옵션 검증 (A-1/A-2 통합, 파싱 fallback 포함) ===
            const needsOptionValidation = uniqueCombinations.size > 0;

            if (needsOptionValidation) {
                // 활성 옵션들 1번 조회 (중복 쿼리 제거)
                const [rows] = await connection.execute(
                    `SELECT option_id, color, size
                     FROM product_options
                     WHERE product_id = ? AND is_active = 1`,
                    [productIds.canonical_id]
                );

                if (rows.length === 0) {
                    await connection.rollback();
                    await connection.end();
                    return res.status(400).json({
                        success: false,
                        code: 'PRODUCT_OPTIONS_REQUIRED',
                        message: '해당 상품에 활성화된 옵션이 없습니다. 먼저 옵션을 등록해주세요.',
                        details: { product_id: productIds.canonical_id }
                    });
                }

                // 옵션을 Set으로 변환 (빠른 매칭)
                const optionSet = new Set();
                rows.forEach(opt => {
                    const optColor = normalizeColor(opt.color) || '';  // null이면 ''로 변환
                    const optSize = (opt.size || '').trim();
                    optionSet.add(`${optColor}@@${optSize}`);
                });

                // 각 유니크 조합이 옵션에 존재하는지 검사
                for (const comboKey of uniqueCombinations) {
                    if (!optionSet.has(comboKey)) {
                        await connection.rollback();
                        await connection.end();
                        const [color, size] = comboKey.split('@@');
                        return res.status(400).json({
                            success: false,
                            code: 'INVALID_OPTION',
                            message: '해당 상품에 요청한 옵션 조합이 등록되어 있지 않습니다.',
                            details: {
                                product_id: productIds.canonical_id,
                                size: size || null,
                                color: color || null
                            }
                        });
                    }
                }
            }

            // === (3) INSERT VALUES 생성: 정규화 적용 (B) ===
            const insertValues = tokenPkArray.map(tpk => {
                const { stockSize, stockColor } = stockValuesMap.get(tpk);
                
                // stock_units는 NULL 허용이므로, null은 null로 유지
                // normalizeColor는 이미 null 반환하므로 추가 처리 불필요
                
                return [
                    productIds.canonical_id,
                    stockSize,  // null 또는 trim된 문자열
                    stockColor,  // null 또는 정규화된 문자열
                    tpk,
                    'in_stock',
                    new Date(),
                    new Date()
                ];
            });

            await connection.query(
                `INSERT INTO stock_units 
                 (product_id, size, color, token_pk, status, created_at, updated_at) 
                 VALUES ?`,
                [insertValues]
            );

            // === (4) product_options 자동 생성 ===
            // 재고 추가 시 해당 (product_id, size, color) 조합이 product_options에 없으면 자동 추가
            // normalizeColor 함수는 이미 위에서 정의됨 (재사용)

            function calculateSortOrder(size) {
                if (!size) return 99;
                const trimmed = String(size).trim();
                const sizeOrder = { 'S': 1, 'M': 2, 'L': 3, 'XL': 4, 'XXL': 5, 'F': 6 };
                return sizeOrder[trimmed] || 99;
            }

            // 추가된 재고의 고유한 (size, color) 조합 추출
            const uniqueOptions = new Set();
            insertValues.forEach(row => {
                const size = row[1] || '';
                const color = row[2] || '';
                const key = `${(size || '').trim()}||${(color || '').trim()}`;
                if (size || color) {
                    uniqueOptions.add(key);
                }
            });

            // 각 고유 옵션에 대해 product_options 생성
            for (const optionKey of uniqueOptions) {
                const [size, color] = optionKey.split('||');
                const normalizedSize = (size || '').trim();
                const normalizedColor = normalizeColor(color) || '';  // ✅ null이면 ''로 변환 (product_options는 NOT NULL)
                const sortOrder = calculateSortOrder(normalizedSize);

                // INSERT IGNORE로 중복 방지
                await connection.execute(
                    `INSERT IGNORE INTO product_options (product_id, color, size, sort_order, is_active)
                     VALUES (?, ?, ?, ?, 1)`,
                    [productIds.canonical_id, normalizedColor, normalizedSize, sortOrder]
                );
            }

            Logger.log('[STOCK] product_options 자동 생성 완료', {
                product_id: productIds.canonical_id,
                unique_options_count: uniqueOptions.size,
                admin: req.user.email
            });

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
 * GET /api/admin/stock/stats
 * 재고 통계 조회 (상품별, 상태별)
 * 주의: /admin/stock/:stockUnitId보다 먼저 정의해야 함
 */
router.get('/admin/stock/stats', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        // 상품별 재고 통계 (stock_units가 비어있어도 빈 배열 반환)
        let productStats = [];
        try {
            const [result] = await connection.execute(
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
            productStats = result || [];
        } catch (err) {
            // stock_units가 비어있거나 JOIN 실패 시 빈 배열 반환
            Logger.warn('[STOCK] 상품별 통계 조회 실패 (빈 배열 반환)', {
                error: err.message
            });
        }

        // 전체 통계 (stock_units가 비어있어도 빈 배열 반환)
        let totalStats = [];
        try {
            const [result] = await connection.execute(
                `SELECT 
                    status,
                    COUNT(*) as count
                FROM stock_units
                GROUP BY status`
            );
            totalStats = result || [];
        } catch (err) {
            // stock_units가 비어있을 때 빈 배열 반환
            Logger.warn('[STOCK] 전체 통계 조회 실패 (빈 배열 반환)', {
                error: err.message
            });
        }

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
                su.size,
                su.color,
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
                size: stock.size, // size 추가
                color: stock.color, // color 추가
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
