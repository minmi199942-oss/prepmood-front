// product-routes.js - 상품 관리 API 라우트
const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { authenticateToken, requireAdmin } = require('./auth-middleware');
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
        
        // product_id에서 색상 추출 (예: PM-25-SH-Teneu-Solid-LB-S/M/L → Light Blue)
        function extractColorFromProductId(productId) {
            if (!productId) return null;
            
            // 색상 코드 매핑 (SSOT: SIZE_COLOR_STANDARDIZATION_POLICY.md 참고)
            const colorCodeMap = {
                'LB': 'Light Blue',
                'GY': 'Grey',
                'LG': 'Light Grey',  // Oxford Stripe 등에서 사용
                'LGY': 'Light Grey',
                'BK': 'Black',
                'NV': 'Navy',
                'WH': 'White',
                'WT': 'White'
            };
            
            // product_id에서 색상 코드 찾기
            // 예: PM-25-SH-Teneu-Solid-LB-S/M/L → LB
            // 예: PM-25-SH-Oxford-Stripe-GY-S/M/L → GY
            const parts = productId.split('-');
            
            // 각 부분에서 색상 코드 검색
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i].toUpperCase();
                
                // 직접 매칭
                if (colorCodeMap[part]) {
                    return colorCodeMap[part];
                }
                
                // 슬래시로 분리된 경우 (예: BK/GY → GY)
                if (part.includes('/')) {
                    const subParts = part.split('/');
                    for (const subPart of subParts) {
                        if (colorCodeMap[subPart]) {
                            return colorCodeMap[subPart];
                        }
                    }
                }
            }
            
            return null;
        }
        
        // product_id에서 색상 추출
        const extractedColor = extractColorFromProductId(product_id);
        
        // ⚠️ 해당 상품에 존재하는 모든 사이즈/색상 조회 (재고 상태와 관계없이)
        // GPT 제안: DISTINCT만 사용 (GROUP BY 불필요)
        const [allSizeColorRows] = await connection.execute(
            `SELECT DISTINCT 
                su.size,
                su.color
            FROM stock_units su
            WHERE su.product_id = ?
              AND su.size IS NOT NULL 
              AND su.color IS NOT NULL
            ORDER BY su.size, su.color`,
            [canonicalId]
        );
        
        // 재고가 있는 사이즈/색상 조회 (in_stock만)
        // GPT 제안: 동일한 구조로 조회하여 비교 용이하게
        const [inStockRows] = await connection.execute(
            `SELECT DISTINCT 
                su.size,
                su.color
            FROM stock_units su
            WHERE su.product_id = ?
              AND su.status = 'in_stock'
              AND su.size IS NOT NULL 
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
        const inStockSet = new Set();
        inStockRows.forEach(row => {
            const normalizedSize = (row.size || '').trim();
            const normalizedColor = normalizeColor(row.color);
            if (normalizedSize && normalizedColor) {
                inStockSet.add(keyOf(normalizedSize, normalizedColor));
            }
        });
        
        // ⚠️ 사이즈별 available 계산 (GPT 제안: 사이즈 단위로 하나라도 in_stock이면 true)
        const allSizes = new Set();
        const sizeAvailableMap = new Map(); // {size: boolean}
        
        allSizeColorRows.forEach(row => {
            const normalizedSize = (row.size || '').trim();
            const normalizedColor = normalizeColor(row.color);
            
            if (normalizedSize && normalizedColor) {
                allSizes.add(normalizedSize);
                
                // 해당 사이즈+색상 조합이 in_stock인지 확인
                const isAvailable = inStockSet.has(keyOf(normalizedSize, normalizedColor));
                
                // 사이즈별로 하나라도 available이면 true
                if (isAvailable) {
                    sizeAvailableMap.set(normalizedSize, true);
                } else if (!sizeAvailableMap.has(normalizedSize)) {
                    // 아직 false로 설정되지 않았으면 false로 설정
                    sizeAvailableMap.set(normalizedSize, false);
                }
            }
        });
        
        // 표준 사이즈 순서 정의
        const sizeOrder = ['S', 'M', 'L', 'XL', 'XXL', 'F'];
        const sizesWithStock = Array.from(allSizes).sort((a, b) => {
            const aIndex = sizeOrder.indexOf(a);
            const bIndex = sizeOrder.indexOf(b);
            if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
            if (aIndex !== -1) return -1;
            if (bIndex !== -1) return 1;
            return a.localeCompare(b);
        }).map(size => ({
            size: size,
            available: sizeAvailableMap.get(size) || false
        }));
        
        // ⚠️ 색상별 available 계산 (GPT 제안: 색상 단위로 하나라도 in_stock이면 true)
        const allColors = new Set();
        const colorAvailableMap = new Map(); // {color: boolean}
        
        allSizeColorRows.forEach(row => {
            const normalizedSize = (row.size || '').trim();
            const normalizedColor = normalizeColor(row.color);
            
            if (normalizedSize && normalizedColor) {
                allColors.add(normalizedColor);
                
                // 해당 사이즈+색상 조합이 in_stock인지 확인
                const isAvailable = inStockSet.has(keyOf(normalizedSize, normalizedColor));
                
                // 색상별로 하나라도 available이면 true
                if (isAvailable) {
                    colorAvailableMap.set(normalizedColor, true);
                } else if (!colorAvailableMap.has(normalizedColor)) {
                    // 아직 false로 설정되지 않았으면 false로 설정
                    colorAvailableMap.set(normalizedColor, false);
                }
            }
        });
        
        // product_id에서 추출한 색상도 포함 (해당 상품에 존재하지 않더라도)
        if (extractedColor) {
            const normalizedExtractedColor = normalizeColor(extractedColor);
            if (normalizedExtractedColor && !allColors.has(normalizedExtractedColor)) {
                allColors.add(normalizedExtractedColor);
                // product_id에서 추출한 색상은 available 여부를 확인할 수 없으므로 false
                colorAvailableMap.set(normalizedExtractedColor, false);
            }
        }
        
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
        console.log('✅ 상품 옵션 조회 완료:', {
            product_id: product_id,
            extracted_color: extractedColor,
            all_possible_sizes: allPossibleSizes,
            sizes_with_stock: sizesWithStock,
            colors_with_stock: colorsWithStock,
            available_colors: Array.from(availableColors),
            stock_map: stockMap
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
        
        // ⚠️ Dual-read: canonical_id 또는 id로 상품 조회
        const [products] = await connection.execute(
            'SELECT * FROM admin_products WHERE canonical_id = ? OR id = ? LIMIT 1',
            [id, id]
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
        
        // ⚠️ Dual-write: 상품 추가 (canonical_id 자동 설정)
        // 신규 상품은 슬래시 없으므로 canonical_id = id
        await connection.execute(
            'INSERT INTO admin_products (id, canonical_id, name, price, image, collection_year, category, type, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [id, id, name, price, image || null, collectionYear, category, normalizedType, description || null]
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

module.exports = router;

