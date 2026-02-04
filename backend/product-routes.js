// product-routes.js - 상품 관리 API 라우트
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const Logger = require('./logger');
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
 * @param {Object} connection - MySQL connection (트랜잭션 컨텍스트 유지)
 * @returns {Promise<string|null>} - canonical_id (없으면 null)
 */
async function resolveProductId(productId, connection) {
    if (!productId) return null;
    
    // ⚠️ Cutover 후: id가 이미 canonical_id이므로 단순 조회
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

// 모니터링 카운터
let legacyHitCount = 0;
let totalResolveCount = 0;

/**
 * product_id를 canonical_id로 정규화 (모니터링 포함)
 * @param {string} productId - 입력 product_id (legacy 또는 canonical)
 * @param {Object} connection - MySQL connection
 * @returns {Promise<string|null>} - canonical_id (없으면 null)
 */
async function resolveProductIdWithLogging(productId, connection) {
    totalResolveCount++;
    
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

// 이미지 업로드 설정
const storage = multer.diskStorage({
    destination: async function (req, file, cb) {
        const uploadDir = path.join(__dirname, '..', 'uploads', 'products');
        try {
            await fs.mkdir(uploadDir, { recursive: true });
            cb(null, uploadDir);
        } catch (error) {
            cb(error);
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB 제한
    fileFilter: function (req, file, cb) {
        const filetypes = /jpeg|jpg|png|gif|webp/;
        const mimetype = filetypes.test(file.mimetype);
        const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
        
        if (mimetype && extname) {
            return cb(null, true);
        }
        cb(new Error('이미지 파일만 업로드 가능합니다 (JPEG, PNG, GIF, WebP)'));
    }
});

// ==================== 상품 조회 API (공개) ====================

// 전체 상품 목록 조회 (공개 API)
router.get('/products', async (req, res) => {
    let connection;
    try {
        const { collection_year, category } = req.query;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 기본 동작: collection_year 미지정 시 현재 컬렉션(2026)만 반환
        const CURRENT_COLLECTION_YEAR = 2026;
        const collectionYear = collection_year ? parseInt(collection_year) : CURRENT_COLLECTION_YEAR;
        
        let query = 'SELECT * FROM admin_products WHERE collection_year = ?';
        const params = [collectionYear];
        
        // 카테고리 필터
        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }
        
        query += ' ORDER BY created_at DESC';
        
        const [products] = await connection.execute(query, params);
        
        res.json({
            success: true,
            products: products,
            count: products.length
        });
        
    } catch (error) {
        console.error('❌ 상품 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '상품 목록을 불러오는데 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 상품별 사용 가능한 색상/사이즈 조회 (공개 API)
// Query 방식으로 변경: /products/options?product_id=...
router.get('/products/options', async (req, res) => {
    let connection;
    try {
        const { product_id } = req.query;
        
        // product_id 필수 검증
        if (!product_id) {
            return res.status(400).json({
                success: false,
                message: 'product_id 파라미터가 필요합니다.'
            });
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // ⚠️ Dual-read: canonical_id 또는 id로 상품 조회
        const canonicalId = await resolveProductId(product_id, connection);
        
        if (!canonicalId) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        // ⚠️ Phase 16-4: extractColorFromProductId() 함수 제거 (색상 코드 제거 A안)
        // product_options 테이블이 SSOT이므로 product_id 파싱 불필요
        // 색상 정보는 product_options 테이블에서만 조회
        /**
         * @deprecated Phase 16-4: product_options 테이블이 SSOT이므로 더 이상 사용하지 않음
         * 색상 정보는 product_options 테이블에서만 조회해야 함
         * 이 함수는 제거 예정이며, 현재는 사용하지 않음
         */
        function extractColorFromProductId(productId) {
            // ⚠️ DEPRECATED: 이 함수는 더 이상 사용하지 않음
            // 색상 정보는 product_options 테이블에서만 조회
            return null;
        }
        
        // ⚠️ Phase 15: product_options 테이블에서 옵션 라인업 조회 (재고 상태와 관계없이)
        // product_options가 없으면 stock_units에서 fallback (하위 호환성)
        // ⚠️ 옵션 마스터 SSOT: product_options가 진짜 기준
        // available 계산은 stock_units에서만 수행
        const [optionRows] = await connection.execute(
            `SELECT 
                po.size,
                po.color,
                po.sort_order,
                po.is_active
            FROM product_options po
            WHERE po.product_id = ?
              AND po.is_active = 1
            ORDER BY po.sort_order, po.size, po.color`,
            [canonicalId]
        );
        
        // Fallback: product_options가 없으면 stock_units에서 조회
        // ⚠️ 수정: size가 NULL인 액세서리도 포함 (size IS NULL 허용)
        let allSizeColorRows = optionRows;
        if (optionRows.length === 0) {
            const [fallbackRows] = await connection.execute(
                `SELECT DISTINCT 
                    su.size,
                    su.color
                FROM stock_units su
                WHERE su.product_id = ?
                  AND su.color IS NOT NULL
                ORDER BY su.size, su.color`,
                [canonicalId]
            );
            allSizeColorRows = fallbackRows;
        }
        
        // 재고가 있는 사이즈/색상 조회 (in_stock만)
        // stock_units에서 재고 상태만 조회
        // ⚠️ 수정: size가 NULL인 액세서리도 포함 (size IS NULL 허용)
        const [inStockRows] = await connection.execute(
            `SELECT DISTINCT 
                su.size,
                su.color
            FROM stock_units su
            WHERE su.product_id = ?
              AND su.status = 'in_stock'
              AND su.color IS NOT NULL
            ORDER BY su.size, su.color`,
            [canonicalId]
        );
        
        // 색상 정규화 함수 (SIZE_COLOR_STANDARDIZATION_POLICY.md 참고)
        // GPT 제안: trim 필수 (공백, 대소문자 정규화)
        function normalizeColor(color) {
            if (!color) return null;
            const normalized = String(color).trim();
            const colorMap = {
                'LightBlue': 'Light Blue',
                'Light-Blue': 'Light Blue',
                'LB': 'Light Blue',
                'LightGrey': 'Light Grey',
                'Light-Grey': 'Light Grey',
                'LG': 'Light Grey',  // Oxford Stripe 등에서 사용
                'LGY': 'Light Grey',
                'BK': 'Black',
                'NV': 'Navy',
                'WH': 'White',
                'WT': 'White',
                'GY': 'Grey',
                'Gray': 'Grey'
            };
            return colorMap[normalized] || normalized;
        }
        
        // GPT 제안: size+color 조합을 키로 사용하여 O(1) 조회
        const keyOf = (size, color) => `${(size || '').trim()}||${(color || '').trim()}`;
        
        // in_stock 조합을 Set으로 변환 (정규화 적용)
        // ⚠️ 수정: size가 없어도 color만으로 재고 확인 가능 (액세서리 등)
        const inStockSet = new Set();
        inStockRows.forEach(row => {
            const normalizedSize = (row.size || '').trim();
            const normalizedColor = normalizeColor(row.color);
            if (normalizedColor) {
                // size가 없어도 color만으로 재고 확인
                inStockSet.add(keyOf(normalizedSize, normalizedColor));
            }
        });
        
        // ⚠️ 사이즈별 available 계산 (GPT 제안: 사이즈 단위로 하나라도 in_stock이면 true)
        const allSizes = new Set();
        const sizeAvailableMap = new Map(); // {size: boolean}
        
        // ⚠️ 옵션 마스터 SSOT: product_options의 모든 옵션을 기준으로 처리
        // 빈 문자열('') 옵션은 일반 상품에서는 제외 (UI 깔끔함)
        allSizeColorRows.forEach(row => {
            const normalizedSize = (row.size || '').trim();
            const normalizedColor = normalizeColor(row.color);
            
            // 빈 문자열 옵션 제외 (단일 옵션 상품이 아닌 경우)
            if (!normalizedSize && !normalizedColor) {
                return; // 둘 다 빈 문자열이면 스킵
            }
            
            // 사이즈가 있으면 추가
            if (normalizedSize) {
                allSizes.add(normalizedSize);
                
                // 해당 사이즈+색상 조합이 in_stock인지 확인
                const isAvailable = inStockSet.has(keyOf(normalizedSize, normalizedColor || ''));
                
                // 사이즈별로 하나라도 available이면 true
                if (isAvailable) {
                    sizeAvailableMap.set(normalizedSize, true);
                } else if (!sizeAvailableMap.has(normalizedSize)) {
                    // 아직 false로 설정되지 않았으면 false로 설정
                    sizeAvailableMap.set(normalizedSize, false);
                }
            }
        });
        
        // ⚠️ sort_order 기반 정렬 (product_options의 sort_order가 SSOT)
        // product_options에서 sort_order를 가져와서 정렬
        const sizeSortMap = new Map();
        optionRows.forEach(row => {
            const normalizedSize = (row.size || '').trim();
            if (normalizedSize && !sizeSortMap.has(normalizedSize)) {
                sizeSortMap.set(normalizedSize, row.sort_order || 99);
            }
        });
        
        // Fallback: sort_order가 없으면 기존 로직 사용
        const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
        const sizesWithStock = Array.from(allSizes).sort((a, b) => {
            const aSort = sizeSortMap.get(a) ?? (sizeOrder.indexOf(a) !== -1 ? sizeOrder.indexOf(a) + 1 : 99);
            const bSort = sizeSortMap.get(b) ?? (sizeOrder.indexOf(b) !== -1 ? sizeOrder.indexOf(b) + 1 : 99);
            return aSort - bSort;
        }).map(size => ({
            size: size,
            available: sizeAvailableMap.get(size) || false
        }));
        
        // ⚠️ 색상별 available 계산 (GPT 제안: 색상 단위로 하나라도 in_stock이면 true)
        const allColors = new Set();
        const colorAvailableMap = new Map(); // {color: boolean}
        
        // ⚠️ 색상별 available 계산 (옵션 마스터 SSOT 기준)
        allSizeColorRows.forEach(row => {
            const normalizedSize = (row.size || '').trim();
            const normalizedColor = normalizeColor(row.color);
            
            // 빈 문자열 옵션 제외 (단일 옵션 상품이 아닌 경우)
            if (!normalizedSize && !normalizedColor) {
                return; // 둘 다 빈 문자열이면 스킵
            }
            
            // 색상이 있으면 추가
            if (normalizedColor) {
                allColors.add(normalizedColor);
                
                // 해당 사이즈+색상 조합이 in_stock인지 확인
                // ⚠️ 수정: size가 없어도 color만으로 재고 확인 (액세서리 등)
                const isAvailable = inStockSet.has(keyOf(normalizedSize || '', normalizedColor));
                
                // 색상별로 하나라도 available이면 true
                if (isAvailable) {
                    colorAvailableMap.set(normalizedColor, true);
                } else if (!colorAvailableMap.has(normalizedColor)) {
                    // 아직 false로 설정되지 않았으면 false로 설정
                    colorAvailableMap.set(normalizedColor, false);
                }
            }
        });
        
        // ⚠️ Phase 16-4: product_id에서 색상 추출 로직 제거
        // product_options 테이블이 SSOT이므로 product_id 파싱 불필요
        // product_options 또는 stock_units에 없는 색상은 표시하지 않음 (일관성 유지)
        
        // ⚠️ 특수 케이스: GY는 Grey로 매핑되지만, 실제 재고는 Light Grey일 수 있음
        // Oxford Stripe 같은 경우 GY가 Light Grey를 의미할 수 있음
        // GY → Grey 매핑이지만 재고에 Light Grey가 있는 경우 Light Grey로 표시
        if (allColors.has('Grey') && allColors.has('Light Grey')) {
            allColors.delete('Grey'); // Grey 제거하고 Light Grey만 표시
            colorAvailableMap.delete('Grey');
        }
        
        const colorsWithStock = Array.from(allColors).sort().map(color => ({
            color: color,
            available: colorAvailableMap.get(color) || false
        }));
        
        // 디버깅: 최종 결과 확인
        Logger.log('✅ 상품 옵션 조회 완료 (product_options 기반):', {
            product_id: product_id,
            canonical_id: canonicalId,
            sizes_with_stock: sizesWithStock,
            colors_with_stock: colorsWithStock,
            product_options_count: optionRows.length,
            all_size_color_rows_count: allSizeColorRows.length,
            in_stock_rows_count: inStockRows.length,
            in_stock_rows_detail: inStockRows.map(r => ({ size: r.size, color: r.color })),
            using_fallback: optionRows.length === 0
        });
        
        await connection.end();
        
        res.json({
            success: true,
            options: {
                colors: colorsWithStock.sort((a, b) => {
                    // 색상 알파벳 순서로 정렬
                    return a.color.localeCompare(b.color);
                }),
                sizes: sizesWithStock.sort((a, b) => {
                    const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
                    const aIndex = sizeOrder.indexOf(a.size);
                    const bIndex = sizeOrder.indexOf(b.size);
                    if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
                    if (aIndex !== -1) return -1;
                    if (bIndex !== -1) return 1;
                    return a.size.localeCompare(b.size);
                })
            }
        });
        
    } catch (error) {
        console.error('❌ 상품 옵션 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '상품 옵션을 불러오는데 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 특정 상품 조회
router.get('/products/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // admin_products 단일 조회 (db_structure_actual 기준: canonical_id 컬럼 없음)
        const [products] = await connection.execute(
            'SELECT * FROM admin_products WHERE id = ? LIMIT 1',
            [id]
        );
        
        if (products.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        await connection.end();
        res.json({
            success: true,
            product: products[0]
        });
        
    } catch (error) {
        console.error('❌ 상품 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '상품을 불러오는데 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==================== 관리자 API (인증 필요) ====================

// 이미지 업로드
router.post('/admin/upload-image', authenticateToken, requireAdmin, upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: '이미지 파일이 없습니다.'
            });
        }
        
        // 이미지 URL 생성
        const imageUrl = `/uploads/products/${req.file.filename}`;
        
        console.log('✅ 이미지 업로드 성공:', imageUrl);
        
        res.json({
            success: true,
            imageUrl: imageUrl,
            filename: req.file.filename
        });
        
    } catch (error) {
        console.error('❌ 이미지 업로드 오류:', error);
        res.status(500).json({
            success: false,
            message: '이미지 업로드에 실패했습니다.'
        });
    }
});

// 상품 추가
router.post('/admin/products', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id, name, price, image, collection_year, category, type, description } = req.body;
        
        // 필수 필드 검증
        if (!id || !name || !price || !category) {
            return res.status(400).json({
                success: false,
                message: '필수 필드가 누락되었습니다. (id, name, price, category 필수)'
            });
        }
        
        // ⚠️ Phase 1: 상품 ID 유효성 검증 (슬래시 제거 규칙)
        // 슬래시(/) 포함 검증
        if (id.includes('/')) {
            return res.status(400).json({
                success: false,
                message: '상품 ID에 슬래시(/)를 포함할 수 없습니다. 사이즈는 재고 관리에서 별도 관리됩니다.'
            });
        }
        
        // 길이 검증 (128자)
        if (id.length > 128) {
            return res.status(400).json({
                success: false,
                message: '상품 ID는 최대 128자까지 입력 가능합니다.'
            });
        }
        
        // 형식 검증 (영문 대문자, 숫자, 하이픈만 허용)
        const validPattern = /^[A-Z0-9-]+$/;
        if (!validPattern.test(id)) {
            return res.status(400).json({
                success: false,
                message: '상품 ID는 영문 대문자, 숫자, 하이픈(-)만 사용 가능합니다.'
            });
        }
        
        // 카테고리 검증
        const VALID_CATEGORIES = ['tops', 'bottoms', 'outer', 'bags', 'accessories'];
        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: '유효하지 않은 카테고리입니다.'
            });
        }
        
        // collection_year 처리 (기본값 2026)
        const CURRENT_COLLECTION_YEAR = 2026;
        const COLLECTION_YEAR_MIN = 2000;
        const COLLECTION_YEAR_MAX = 2100;
        const collectionYear = collection_year ? parseInt(collection_year) : CURRENT_COLLECTION_YEAR;
        
        if (isNaN(collectionYear) || collectionYear < COLLECTION_YEAR_MIN || collectionYear > COLLECTION_YEAR_MAX) {
            return res.status(400).json({
                success: false,
                message: `collection_year는 ${COLLECTION_YEAR_MIN}~${COLLECTION_YEAR_MAX} 사이의 숫자여야 합니다.`
            });
        }
        
        // type 검증 및 정규화
        const ACCESSORY_TYPES = ['cap', 'wallet', 'tie', 'scarf', 'belt'];
        let normalizedType = null;
        
        if (category === 'accessories') {
            // accessories는 type 필수
            if (!type || !ACCESSORY_TYPES.includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: '액세서리 카테고리는 유효한 타입이 필수입니다. (cap, wallet, tie, scarf, belt)'
                });
            }
            normalizedType = type;
        } else {
            // non-accessories는 type을 NULL로 정규화 (입력되어도 무시)
            normalizedType = null;
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // 중복 ID 확인
        const [existing] = await connection.execute(
            'SELECT id FROM admin_products WHERE id = ?',
            [id]
        );
        
        if (existing.length > 0) {
            return res.status(400).json({
                success: false,
                message: '이미 존재하는 상품 ID입니다.'
            });
        }
        
        // admin_products INSERT (db_structure_actual 기준: canonical_id 없음, short_name은 선택 Phase 4)
        await connection.execute(
            'INSERT INTO admin_products (id, name, price, image, collection_year, category, type, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [id, name, price, image || null, collectionYear, category, normalizedType, description || null]
        );
        
        console.log('✅ 상품 추가 성공:', id, name);
        
        res.json({
            success: true,
            message: '상품이 추가되었습니다.',
            productId: id
        });
        
    } catch (error) {
        console.error('❌ 상품 추가 오류:', error);
        res.status(500).json({
            success: false,
            message: '상품 추가에 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 상품 수정
router.put('/admin/products/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { name, price, image, collection_year, category, type, description } = req.body;
        
        // 필수 필드 검증
        if (!name || !price || !category) {
            return res.status(400).json({
                success: false,
                message: '필수 필드가 누락되었습니다. (name, price, category 필수)'
            });
        }
        
        // 가격 검증 (보안 강화)
        const priceNum = parseInt(price);
        if (isNaN(priceNum) || priceNum < 0 || priceNum > 1000000000) {
            return res.status(400).json({
                success: false,
                message: '가격은 0원 이상 10억원 이하여야 합니다.'
            });
        }
        
        // 상품명 길이 검증
        if (name.length > 255) {
            return res.status(400).json({
                success: false,
                message: '상품명은 최대 255자입니다.'
            });
        }
        
        // Description 길이 검증
        if (description && description.length > 5000) {
            return res.status(400).json({
                success: false,
                message: '상품 설명은 최대 5000자입니다.'
            });
        }
        
        // 카테고리 검증
        const VALID_CATEGORIES = ['tops', 'bottoms', 'outer', 'bags', 'accessories'];
        if (!VALID_CATEGORIES.includes(category)) {
            return res.status(400).json({
                success: false,
                message: '유효하지 않은 카테고리입니다.'
            });
        }
        
        // collection_year 처리 (기본값 2026)
        const CURRENT_COLLECTION_YEAR = 2026;
        const COLLECTION_YEAR_MIN = 2000;
        const COLLECTION_YEAR_MAX = 2100;
        const collectionYear = collection_year ? parseInt(collection_year) : CURRENT_COLLECTION_YEAR;
        
        if (isNaN(collectionYear) || collectionYear < COLLECTION_YEAR_MIN || collectionYear > COLLECTION_YEAR_MAX) {
            return res.status(400).json({
                success: false,
                message: `collection_year는 ${COLLECTION_YEAR_MIN}~${COLLECTION_YEAR_MAX} 사이의 숫자여야 합니다.`
            });
        }
        
        // type 검증 및 정규화
        const ACCESSORY_TYPES = ['cap', 'wallet', 'tie', 'scarf', 'belt'];
        let normalizedType = null;
        
        if (category === 'accessories') {
            // accessories는 type 필수
            if (!type || !ACCESSORY_TYPES.includes(type)) {
                return res.status(400).json({
                    success: false,
                    message: '액세서리 카테고리는 유효한 타입이 필수입니다. (cap, wallet, tie, scarf, belt)'
                });
            }
            normalizedType = type;
        } else {
            // non-accessories는 type을 NULL로 정규화 (입력되어도 무시)
            normalizedType = null;
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // 상품 존재 확인
        const [existing] = await connection.execute(
            'SELECT id FROM admin_products WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        // 상품 수정
        await connection.execute(
            'UPDATE admin_products SET name = ?, price = ?, image = ?, collection_year = ?, category = ?, type = ?, description = ?, updated_at = NOW() WHERE id = ?',
            [name, price, image || null, collectionYear, category, normalizedType, description || null, id]
        );
        
        console.log('✅ 상품 수정 성공:', id, name);
        
        res.json({
            success: true,
            message: '상품이 수정되었습니다.'
        });
        
    } catch (error) {
        console.error('❌ 상품 수정 오류:', error);
        res.status(500).json({
            success: false,
            message: '상품 수정에 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// 상품 삭제
router.delete('/admin/products/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 상품 존재 확인 및 이미지 URL 가져오기
        const [existing] = await connection.execute(
            'SELECT id, image FROM admin_products WHERE id = ?',
            [id]
        );
        
        if (existing.length === 0) {
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        // 상품 삭제
        await connection.execute(
            'DELETE FROM admin_products WHERE id = ?',
            [id]
        );
        
        // 이미지 파일 삭제 (선택적)
        const imageUrl = existing[0].image;
        if (imageUrl && imageUrl.startsWith('/uploads/products/')) {
            try {
                const imagePath = path.join(__dirname, '..', imageUrl);
                await fs.unlink(imagePath);
                console.log('🗑️ 이미지 파일 삭제:', imageUrl);
            } catch (error) {
                console.warn('⚠️ 이미지 파일 삭제 실패:', error.message);
            }
        }
        
        console.log('✅ 상품 삭제 성공:', id);
        
        res.json({
            success: true,
            message: '상품이 삭제되었습니다.'
        });
        
    } catch (error) {
        console.error('❌ 상품 삭제 오류:', error);
        res.status(500).json({
            success: false,
            message: '상품 삭제에 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

// ==================== 관리자: 상품 옵션 관리 API ====================
// Phase 15-3: 관리자 페이지 옵션 관리 기능

// 옵션 조회 (재고 상태 포함)
router.get('/admin/products/:productId/options', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productId } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 상품 존재 확인
        const canonicalId = await resolveProductId(productId, connection);
        if (!canonicalId) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        // 옵션 목록 조회 (재고 상태 + 옵션 메타 포함, 토큰 관리 UI용)
        const [options] = await connection.execute(
            `SELECT 
                po.option_id,
                po.product_id,
                po.color,
                po.size,
                po.sort_order,
                po.is_active,
                po.rot_code,
                po.warranty_bottom_prefix,
                po.serial_prefix,
                po.digital_warranty_code,
                po.digital_warranty_collection,
                po.season_code,
                po.created_at,
                po.updated_at,
                COUNT(CASE WHEN su.status = 'in_stock' THEN 1 END) as in_stock_count
            FROM product_options po
            LEFT JOIN stock_units su 
                ON su.product_id = po.product_id 
                AND (su.color = po.color OR (su.color IS NULL AND po.color = ''))
                AND (su.size = po.size OR (su.size IS NULL AND po.size = ''))
            WHERE po.product_id = ?
            GROUP BY po.option_id, po.product_id, po.color, po.size, po.sort_order, po.is_active,
                     po.created_at, po.updated_at,
                     po.rot_code, po.warranty_bottom_prefix, po.serial_prefix,
                     po.digital_warranty_code, po.digital_warranty_collection, po.season_code
            ORDER BY po.sort_order, po.size, po.color`,
            [canonicalId]
        );
        
        await connection.end();
        
        Logger.log('[ADMIN_OPTIONS] 옵션 조회 완료', {
            productId: canonicalId,
            optionsCount: options.length
        });
        
        res.json({
            success: true,
            options: options.map(opt => ({
                option_id: opt.option_id,
                product_id: opt.product_id,
                color: opt.color || '',
                size: opt.size || '',
                sort_order: opt.sort_order,
                is_active: opt.is_active === 1,
                in_stock_count: parseInt(opt.in_stock_count) || 0,
                created_at: opt.created_at,
                updated_at: opt.updated_at,
                rot_code: opt.rot_code ?? null,
                warranty_bottom_prefix: opt.warranty_bottom_prefix ?? null,
                serial_prefix: opt.serial_prefix ?? null,
                digital_warranty_code: opt.digital_warranty_code ?? null,
                digital_warranty_collection: opt.digital_warranty_collection ?? null,
                season_code: opt.season_code ?? null
            }))
        });
        
    } catch (error) {
        if (connection) await connection.end();
        Logger.error('[ADMIN_OPTIONS] 옵션 조회 실패', {
            productId: req.params.productId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: '옵션 조회에 실패했습니다.'
        });
    }
});

// 옵션 추가
router.post('/admin/products/:productId/options', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productId } = req.params;
        const { color = '', size = '', sort_order } = req.body;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 상품 존재 확인
        const canonicalId = await resolveProductId(productId, connection);
        if (!canonicalId) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        // 최대 sort_order 조회 (새 옵션은 마지막에 추가)
        let finalSortOrder = sort_order;
        if (finalSortOrder === undefined || finalSortOrder === null) {
            const [maxRows] = await connection.execute(
                'SELECT COALESCE(MAX(sort_order), -1) as max_sort FROM product_options WHERE product_id = ?',
                [canonicalId]
            );
            finalSortOrder = (maxRows[0].max_sort || 0) + 1;
        }
        
        // 옵션 추가
        const [result] = await connection.execute(
            `INSERT INTO product_options (product_id, color, size, sort_order, is_active)
             VALUES (?, ?, ?, ?, 1)`,
            [canonicalId, color || '', size || '', finalSortOrder]
        );
        
        // 생성된 옵션 조회
        const [newOptions] = await connection.execute(
            'SELECT * FROM product_options WHERE option_id = ?',
            [result.insertId]
        );
        
        await connection.end();
        
        Logger.log('[ADMIN_OPTIONS] 옵션 추가 완료', {
            productId: canonicalId,
            optionId: result.insertId,
            color,
            size
        });
        
        res.json({
            success: true,
            option: {
                option_id: newOptions[0].option_id,
                product_id: newOptions[0].product_id,
                color: newOptions[0].color || '',
                size: newOptions[0].size || '',
                sort_order: newOptions[0].sort_order,
                is_active: newOptions[0].is_active === 1,
                created_at: newOptions[0].created_at,
                updated_at: newOptions[0].updated_at
            },
            message: '옵션이 추가되었습니다.'
        });
        
    } catch (error) {
        if (connection) await connection.end();
        
        // UNIQUE 제약 위반 (중복 옵션)
        if (error.code === 'ER_DUP_ENTRY') {
            Logger.warn('[ADMIN_OPTIONS] 중복 옵션 추가 시도', {
                productId: req.params.productId,
                color: req.body.color,
                size: req.body.size
            });
            return res.status(409).json({
                success: false,
                message: '이미 존재하는 옵션입니다. (같은 사이즈/색상 조합)'
            });
        }
        
        Logger.error('[ADMIN_OPTIONS] 옵션 추가 실패', {
            productId: req.params.productId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: '옵션 추가에 실패했습니다.'
        });
    }
});

// 옵션 수정 (is_active, sort_order)
router.put('/admin/products/:productId/options/:optionId', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productId, optionId } = req.params;
        const { is_active, sort_order } = req.body;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 상품 존재 확인
        const canonicalId = await resolveProductId(productId, connection);
        if (!canonicalId) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        // 옵션 존재 확인
        const [existing] = await connection.execute(
            'SELECT * FROM product_options WHERE option_id = ? AND product_id = ?',
            [optionId, canonicalId]
        );
        
        if (existing.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '옵션을 찾을 수 없습니다.'
            });
        }
        
        // 업데이트할 필드 구성
        const updates = [];
        const params = [];
        
        if (is_active !== undefined && is_active !== null) {
            updates.push('is_active = ?');
            params.push(is_active ? 1 : 0);
        }
        
        if (sort_order !== undefined && sort_order !== null) {
            updates.push('sort_order = ?');
            params.push(sort_order);
        }
        
        if (updates.length === 0) {
            await connection.end();
            return res.status(400).json({
                success: false,
                message: '수정할 필드가 없습니다.'
            });
        }
        
        params.push(optionId, canonicalId);
        
        // 옵션 수정
        await connection.execute(
            `UPDATE product_options 
             SET ${updates.join(', ')} 
             WHERE option_id = ? AND product_id = ?`,
            params
        );
        
        // 수정된 옵션 조회
        const [updated] = await connection.execute(
            'SELECT * FROM product_options WHERE option_id = ?',
            [optionId]
        );
        
        await connection.end();
        
        Logger.log('[ADMIN_OPTIONS] 옵션 수정 완료', {
            productId: canonicalId,
            optionId,
            updates: updates.join(', ')
        });
        
        res.json({
            success: true,
            option: {
                option_id: updated[0].option_id,
                product_id: updated[0].product_id,
                color: updated[0].color || '',
                size: updated[0].size || '',
                sort_order: updated[0].sort_order,
                is_active: updated[0].is_active === 1,
                created_at: updated[0].created_at,
                updated_at: updated[0].updated_at
            },
            message: '옵션이 수정되었습니다.'
        });
        
    } catch (error) {
        if (connection) await connection.end();
        Logger.error('[ADMIN_OPTIONS] 옵션 수정 실패', {
            productId: req.params.productId,
            optionId: req.params.optionId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: '옵션 수정에 실패했습니다.'
        });
    }
});

/**
 * PUT /api/admin/product-options/:optionId/meta
 * 옵션 메타 편집 (rot_code, warranty_bottom_prefix, serial_prefix, digital_warranty_code, digital_warranty_collection, season_code)
 * 설계: ADMIN_TOKEN_PRODUCT_STOCK_DESIGN.md §3.2.4
 */
router.put('/admin/product-options/:optionId/meta', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const optionId = req.params.optionId;
        const {
            rot_code,
            warranty_bottom_prefix,
            serial_prefix,
            digital_warranty_code,
            digital_warranty_collection,
            season_code
        } = req.body || {};

        const optId = parseInt(optionId, 10);
        if (Number.isNaN(optId) || optId <= 0) {
            return res.status(400).json({ success: false, message: '유효하지 않은 option_id입니다.' });
        }

        // 검증: 길이 제한 (자동 자르기 금지)
        if (rot_code !== undefined && rot_code !== null && String(rot_code).length > 100) {
            return res.status(400).json({ success: false, message: 'rot_code는 100자 이하여야 합니다.' });
        }
        if (season_code !== undefined && season_code !== null && String(season_code).length > 20) {
            return res.status(400).json({ success: false, message: 'season_code는 20자 이하여야 합니다.' });
        }
        if (digital_warranty_code !== undefined && digital_warranty_code !== null && String(digital_warranty_code).length > 100) {
            return res.status(400).json({ success: false, message: 'digital_warranty_code는 100자 이하여야 합니다.' });
        }
        if (digital_warranty_collection !== undefined && digital_warranty_collection !== null && String(digital_warranty_collection).length > 100) {
            return res.status(400).json({ success: false, message: 'digital_warranty_collection은 100자 이하여야 합니다.' });
        }

        // prefix: 비어 있지 않으면 끝 구분자(_ 또는 -) 포함 검사
        const allowSeparators = /[_\-\s]$/;
        if (warranty_bottom_prefix !== undefined && warranty_bottom_prefix !== null) {
            const s = String(warranty_bottom_prefix).trim();
            if (s.length > 0 && !allowSeparators.test(s)) {
                return res.status(400).json({
                    success: false,
                    message: 'warranty_bottom_prefix는 끝에 구분자(_, -, 공백)를 포함해야 합니다.'
                });
            }
        }
        if (serial_prefix !== undefined && serial_prefix !== null) {
            const s = String(serial_prefix).trim();
            if (s.length > 0 && !allowSeparators.test(s)) {
                return res.status(400).json({
                    success: false,
                    message: 'serial_prefix는 끝에 구분자(_, -, 공백)를 포함해야 합니다.'
                });
            }
        }

        connection = await mysql.createConnection(dbConfig);
        const [existing] = await connection.execute(
            'SELECT option_id, product_id FROM product_options WHERE option_id = ? LIMIT 1',
            [optId]
        );
        if (existing.length === 0) {
            await connection.end();
            return res.status(404).json({ success: false, message: '옵션을 찾을 수 없습니다.' });
        }

        const updates = [];
        const params = [];
        if (rot_code !== undefined) { updates.push('rot_code = ?'); params.push(rot_code === '' || rot_code === null ? null : String(rot_code).trim()); }
        if (warranty_bottom_prefix !== undefined) { updates.push('warranty_bottom_prefix = ?'); params.push(warranty_bottom_prefix === '' || warranty_bottom_prefix === null ? null : String(warranty_bottom_prefix).trim()); }
        if (serial_prefix !== undefined) { updates.push('serial_prefix = ?'); params.push(serial_prefix === '' || serial_prefix === null ? null : String(serial_prefix).trim()); }
        if (digital_warranty_code !== undefined) { updates.push('digital_warranty_code = ?'); params.push(digital_warranty_code === '' || digital_warranty_code === null ? null : String(digital_warranty_code).trim()); }
        if (digital_warranty_collection !== undefined) { updates.push('digital_warranty_collection = ?'); params.push(digital_warranty_collection === '' || digital_warranty_collection === null ? null : String(digital_warranty_collection).trim()); }
        if (season_code !== undefined) { updates.push('season_code = ?'); params.push(season_code === '' || season_code === null ? null : String(season_code).trim()); }

        if (updates.length === 0) {
            await connection.end();
            return res.status(400).json({ success: false, message: '수정할 메타 필드가 없습니다.' });
        }
        params.push(optId);
        await connection.execute(
            `UPDATE product_options SET ${updates.join(', ')} WHERE option_id = ?`,
            params
        );
        const [updated] = await connection.execute(
            'SELECT option_id, product_id, color, size, rot_code, warranty_bottom_prefix, serial_prefix, digital_warranty_code, digital_warranty_collection, season_code FROM product_options WHERE option_id = ?',
            [optId]
        );
        await connection.end();

        Logger.log('[ADMIN_OPTIONS_META] 옵션 메타 수정', { optionId: optId, userId: req.user?.user_id });
        res.json({
            success: true,
            option: updated[0],
            message: '옵션 메타가 저장되었습니다.'
        });
    } catch (error) {
        if (connection) await connection.end();
        Logger.error('[ADMIN_OPTIONS_META] 실패', { optionId: req.params.optionId, error: error.message });
        res.status(500).json({ success: false, message: '옵션 메타 저장에 실패했습니다.' });
    }
});

// 옵션 삭제 (is_active = 0으로 비활성화)
router.delete('/admin/products/:productId/options/:optionId', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { productId, optionId } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 상품 존재 확인
        const canonicalId = await resolveProductId(productId, connection);
        if (!canonicalId) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
        // 옵션 존재 확인
        const [existing] = await connection.execute(
            'SELECT * FROM product_options WHERE option_id = ? AND product_id = ?',
            [optionId, canonicalId]
        );
        
        if (existing.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '옵션을 찾을 수 없습니다.'
            });
        }
        
        // 옵션 비활성화 (is_active = 0)
        await connection.execute(
            'UPDATE product_options SET is_active = 0 WHERE option_id = ? AND product_id = ?',
            [optionId, canonicalId]
        );
        
        await connection.end();
        
        Logger.log('[ADMIN_OPTIONS] 옵션 삭제 완료', {
            productId: canonicalId,
            optionId
        });
        
        res.json({
            success: true,
            message: '옵션이 삭제되었습니다.'
        });
        
    } catch (error) {
        if (connection) await connection.end();
        Logger.error('[ADMIN_OPTIONS] 옵션 삭제 실패', {
            productId: req.params.productId,
            optionId: req.params.optionId,
            error: error.message
        });
        res.status(500).json({
            success: false,
            message: '옵션 삭제에 실패했습니다.'
        });
    }
});

module.exports = router;

