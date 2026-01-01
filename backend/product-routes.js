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

// 특정 상품 조회
router.get('/products/:id', async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        const [products] = await connection.execute(
            'SELECT * FROM admin_products WHERE id = ?',
            [id]
        );
        
        if (products.length === 0) {
            return res.status(404).json({
                success: false,
                message: '상품을 찾을 수 없습니다.'
            });
        }
        
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
        
        // 상품 추가
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

