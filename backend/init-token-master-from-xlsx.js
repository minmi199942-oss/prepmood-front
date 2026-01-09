/**
 * xlsx 파일에서 직접 MySQL token_master 테이블에 토큰 생성
 * 
 * 역할:
 * 1. products.xlsx 파일 읽기 (internal_code, serial_number, rot_code, product_name)
 * 2. 각 제품마다 20자 랜덤 토큰 생성
 * 3. internal_code는 보증서 하단 코드로 사용 (xlsx에서 직접 읽음)
 * 4. MySQL token_master 테이블에 직접 저장
 * 
 * 실행 방법:
 * node init-token-master-from-xlsx.js
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const Logger = require('./logger');

// 환경 변수
const BASE_URL = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/';

// xlsx 파일 경로 (프로젝트 루트)
const XLSX_PATH = path.join(__dirname, '..', 'products.xlsx');

// DB 설정
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'prepmood_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'prepmood',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

/**
 * 20자 랜덤 토큰 생성
 * 구성: 숫자(0-9) + 소문자(a-z) + 대문자(A-Z)
 * 예시: aB3cD5eF7gH9iJ1kL3mN5
 * 
 * @returns {string} 20자 랜덤 토큰
 */
function generateToken() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let token = '';
    
    // crypto.randomInt 사용 (편향 제거)
    for (let i = 0; i < 20; i++) {
        const randomIndex = crypto.randomInt(0, chars.length);
        token += chars[randomIndex];
    }
    
    return token;
}

/**
 * 중복되지 않는 고유 토큰 생성 (DB에서 확인)
 * @param {Object} connection - MySQL 연결
 * @param {Set} existingTokens - 메모리 내 기존 토큰 Set
 * @returns {Promise<string>} 고유 토큰
 */
async function generateUniqueToken(connection, existingTokens) {
    let token;
    let attempts = 0;
    const maxAttempts = 100; // 무한 루프 방지
    
    do {
        token = generateToken();
        attempts++;
        if (attempts > maxAttempts) {
            throw new Error('토큰 생성 실패: 최대 시도 횟수 초과');
        }
        
        // 메모리에서 먼저 확인
        if (existingTokens.has(token)) {
            continue;
        }
        
        // DB에서 중복 확인
        const [rows] = await connection.execute(
            'SELECT token FROM token_master WHERE token = ?',
            [token]
        );
        
        if (rows.length === 0) {
            existingTokens.add(token);
            return token;
        }
    } while (true);
}

/**
 * xlsx 파일 읽기 및 파싱
 * @returns {Array} 제품 배열 [{serial_number, rot_code, warranty_bottom_code, digital_warranty_code, product_name}, ...]
 * 주의: internal_code와 warranty_bottom_code는 별개의 컬럼입니다
 */
function readXlsxFile() {
    try {
        Logger.log('[INIT] xlsx 파일 읽는 중:', XLSX_PATH);
        
        const workbook = XLSX.readFile(XLSX_PATH);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // JSON 형식으로 변환 (헤더 기반)
        const data = XLSX.utils.sheet_to_json(worksheet);
        
        Logger.log(`[INIT] 시트 "${sheetName}"에서 ${data.length}개 행 발견`);
        
        // 데이터 정제
        const products = [];
        for (const row of data) {
            // 컬럼명에 공백이 있을 수 있으므로 trim 처리
            const serialNumber = String(row['serial_number '] || row['serial_number'] || '').trim();
            const rotCode = String(row['rot_code '] || row['rot_code'] || '').trim();
            const warrantyBottomCode = String(row['warranty_bottom_code '] || row['warranty_bottom_code'] || '').trim();
            const digitalWarrantyCode = String(row['digital_warranty_code '] || row['digital_warranty_code'] || '').trim();
            const digitalWarrantyCollection = String(row['digital_warranty_collection '] || row['digital_warranty_collection'] || '').trim();
            const productName = String(row['product_name'] || '').trim();
            
            // 필수 필드 확인 (product_name은 필수)
            if (!productName) {
                Logger.warn('[INIT] product_name이 없어 건너뜀:', row);
                continue;
            }
            
            // serial_number, rot_code, warranty_bottom_code, digital_warranty_code, digital_warranty_collection는 선택 필드 (NULL 허용)
            products.push({
                serial_number: serialNumber || null,
                rot_code: rotCode || null,
                warranty_bottom_code: warrantyBottomCode || null,
                digital_warranty_code: digitalWarrantyCode || null,
                digital_warranty_collection: digitalWarrantyCollection || null,
                product_name: productName
            });
        }
        
        Logger.log(`[INIT] 유효한 제품 데이터: ${products.length}개`);
        return products;
        
    } catch (error) {
        Logger.error('[INIT] xlsx 파일 읽기 실패:', {
            message: error.message,
            code: error.code
        });
        throw error;
    }
}

/**
 * MySQL DB 초기화 메인 함수
 */
async function initializeTokenMaster() {
    let connection;
    try {
        Logger.log('='.repeat(50));
        Logger.log('token_master 테이블 초기화 시작 (xlsx → MySQL)');
        Logger.log('='.repeat(50));
        
        // 1. MySQL 연결
        connection = await mysql.createConnection(dbConfig);
        Logger.log('[INIT] ✅ MySQL 연결 성공');
        
        // 2. 기존 데이터 삭제 (재생성 모드)
        const [countRows] = await connection.execute('SELECT COUNT(*) as count FROM token_master');
        const existingCount = countRows[0].count;
        
        if (existingCount > 0) {
            Logger.warn('[INIT] ⚠️  token_master 테이블에 기존 데이터가 있습니다!');
            Logger.warn(`[INIT] 기존 토큰 수: ${existingCount}개`);
            Logger.warn('[INIT] 재생성 모드: 기존 데이터를 삭제합니다...');
            await connection.execute('DELETE FROM token_master');
            Logger.log(`[INIT] ✅ 기존 데이터 ${existingCount}개 삭제 완료`);
        }
        
        // 3. xlsx 파일 읽기
        const products = readXlsxFile();
        
        if (products.length === 0) {
            Logger.warn('[INIT] 처리할 제품이 없습니다.');
            return;
        }
        
        // 4. 각 제품마다 고유 토큰 생성 (중복 방지)
        Logger.log('[INIT] 토큰 생성 중...');
        const existingTokens = new Set();
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        
        // internal_code는 자동 생성 (serial_number 기반 또는 자동 번호)
        let internalCodeCounter = 1;
        
        const productsWithToken = [];
        for (const product of products) {
            const token = await generateUniqueToken(connection, existingTokens);
            
            // internal_code 생성 (serial_number가 있으면 사용, 없으면 자동 생성)
            const internalCode = product.serial_number 
                ? `SN-${product.serial_number}` 
                : `AUTO-${String(internalCodeCounter++).padStart(6, '0')}`;
            
            productsWithToken.push({
                ...product,
                token,
                internal_code: internalCode
            });
        }
        
        // 5. product_id 매핑 (product_name으로 admin_products 조회)
        Logger.log('[INIT] product_id 매핑 중...');
        const productsWithProductId = [];
        let unmappedCount = 0;
        
        for (const product of productsWithToken) {
            // product_name으로 admin_products 조회 (부분 매칭)
            const [adminProducts] = await connection.execute(
                `SELECT id, name 
                 FROM admin_products 
                 WHERE name = ? 
                    OR name LIKE CONCAT(?, '%')
                    OR ? LIKE CONCAT(name, '%')
                 LIMIT 1`,
                [product.product_name, product.product_name, product.product_name]
            );
            
            if (adminProducts.length === 0) {
                Logger.warn(`[INIT] ⚠️  product_id를 찾을 수 없음: ${product.product_name}`);
                unmappedCount++;
                // 매핑 실패 시 에러 (product_id는 NOT NULL이므로)
                throw new Error(`admin_products에서 상품을 찾을 수 없습니다: ${product.product_name}`);
            }
            
            const productId = adminProducts[0].id;
            productsWithProductId.push({
                ...product,
                product_id: productId
            });
        }
        
        if (unmappedCount > 0) {
            Logger.warn(`[INIT] ⚠️  매핑 실패한 제품: ${unmappedCount}개`);
        }
        
        // 6. DB에 삽입
        Logger.log('[INIT] DB에 데이터 삽입 중...');
        let inserted = 0;
        let skipped = 0;
        
        for (const product of productsWithProductId) {
            try {
                await connection.execute(
                    `INSERT INTO token_master 
                     (token, internal_code, product_name, product_id, serial_number, rot_code, warranty_bottom_code, digital_warranty_code, digital_warranty_collection,
                      is_blocked, scan_count, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
                    [
                        product.token,
                        product.internal_code, // 자동 생성된 internal_code
                        product.product_name,
                        product.product_id, // admin_products에서 조회한 product_id
                        product.serial_number,
                        product.rot_code,
                        product.warranty_bottom_code, // xlsx에서 읽은 보증서 하단 코드
                        product.digital_warranty_code, // xlsx에서 읽은 디지털 보증서 코드
                        product.digital_warranty_collection, // xlsx에서 읽은 디지털 보증서 컬렉션명
                        now,
                        now
                    ]
                );
                inserted++;
            } catch (error) {
                if (error.code === 'ER_DUP_ENTRY') {
                    Logger.warn(`[INIT] 토큰 중복 (건너뜀): ${product.token}`);
                    skipped++;
                } else {
                    throw error;
                }
            }
        }
        
        Logger.log('='.repeat(50));
        Logger.log('✅ token_master 초기화 완료!');
        Logger.log(`   - 처리된 제품: ${productsWithToken.length}개`);
        Logger.log(`   - 삽입 성공: ${inserted}개`);
        Logger.log(`   - 건너뜀: ${skipped}개`);
        Logger.log('='.repeat(50));
        
        // 샘플 토큰 출력 (테스트용)
        if (productsWithToken.length > 0) {
            Logger.log('\n📋 샘플 토큰 (테스트용):');
            const sample = productsWithToken[0];
            Logger.log(`   제품명: ${sample.product_name}`);
            Logger.log(`   Internal Code: ${sample.internal_code}`);
            Logger.log(`   시리얼 넘버: ${sample.serial_number || '(없음)'}`);
            Logger.log(`   ROT 코드: ${sample.rot_code || '(없음)'}`);
            Logger.log(`   보증서 하단 코드: ${sample.warranty_bottom_code || '(없음)'}`);
            Logger.log(`   디지털 보증서 코드: ${sample.digital_warranty_code || '(없음)'}`);
            Logger.log(`   디지털 보증서 컬렉션명: ${sample.digital_warranty_collection || '(없음)'}`);
            Logger.log(`   토큰: ${sample.token}`);
            Logger.log(`   URL: ${BASE_URL}${sample.token}`);
        }
        
    } catch (error) {
        Logger.error('[INIT] 초기화 실패:', {
            message: error.message,
            code: error.code
        });
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    initializeTokenMaster()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            Logger.error('[INIT] 오류:', {
                message: error.message,
                code: error.code
            });
            process.exit(1);
        });
}

module.exports = {
    initializeTokenMaster,
    generateToken,
    readXlsxFile
};
