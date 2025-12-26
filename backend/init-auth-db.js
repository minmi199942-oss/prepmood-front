/**
 * 정품 인증 DB 초기화 스크립트
 * 
 * 역할:
 * 1. products.xlsx 파일 읽기
 * 2. 각 제품마다 20자 랜덤 토큰 생성
 * 3. SQLite DB에 저장
 * 
 * 실행 방법:
 * node init-auth-db.js
 */

require('dotenv').config();
const XLSX = require('xlsx');
const path = require('path');
const crypto = require('crypto');
const { initDatabase, insertProducts } = require('./auth-db');
const Logger = require('./logger');

// 환경 변수
const BASE_URL = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/';

// xlsx 파일 경로 (프로젝트 루트)
const XLSX_PATH = path.join(__dirname, '..', 'products.xlsx');

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
    
    // crypto.randomBytes를 사용하여 안전한 랜덤 생성
    const randomBytes = crypto.randomBytes(20);
    
    for (let i = 0; i < 20; i++) {
        token += chars[randomBytes[i] % chars.length];
    }
    
    return token;
}

/**
 * xlsx 파일 읽기 및 파싱
 * @returns {Array} 제품 배열 [{internal_code, product_name}, ...]
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
            const internalCode = String(row['internal_code '] || row['internal_code'] || '').trim();
            const productName = String(row['product_name'] || '').trim();
            
            // 빈 값 제외
            if (!internalCode || !productName) {
                Logger.warn('[INIT] 빈 값 발견, 건너뜀:', row);
                continue;
            }
            
            products.push({
                internal_code: internalCode,
                product_name: productName
            });
        }
        
        Logger.log(`[INIT] 유효한 제품 데이터: ${products.length}개`);
        return products;
        
    } catch (error) {
        Logger.error('[INIT] xlsx 파일 읽기 실패:', error);
        throw error;
    }
}

/**
 * DB 초기화 메인 함수
 */
async function initializeDatabase() {
    try {
        Logger.log('='.repeat(50));
        Logger.log('정품 인증 DB 초기화 시작');
        Logger.log('='.repeat(50));
        
        // 1. DB 초기화
        initDatabase();
        
        // 2. xlsx 파일 읽기
        const products = readXlsxFile();
        
        if (products.length === 0) {
            Logger.warn('[INIT] 처리할 제품이 없습니다.');
            return;
        }
        
        // 3. 각 제품마다 토큰 생성
        Logger.log('[INIT] 토큰 생성 중...');
        const productsWithToken = products.map(product => ({
            ...product,
            token: generateToken()
        }));
        
        // 4. DB에 삽입
        Logger.log('[INIT] DB에 데이터 삽입 중...');
        insertProducts(productsWithToken);
        
        Logger.log('='.repeat(50));
        Logger.log('✅ DB 초기화 완료!');
        Logger.log(`   - 처리된 제품: ${productsWithToken.length}개`);
        Logger.log(`   - DB 파일: ${path.join(__dirname, 'prep.db')}`);
        Logger.log('='.repeat(50));
        
        // 샘플 토큰 출력 (테스트용)
        if (productsWithToken.length > 0) {
            Logger.log('\n📋 샘플 토큰 (테스트용):');
            Logger.log(`   제품: ${productsWithToken[0].product_name}`);
            Logger.log(`   토큰: ${productsWithToken[0].token}`);
            Logger.log(`   URL: ${BASE_URL}${productsWithToken[0].token}`);
        }
        
    } catch (error) {
        Logger.error('[INIT] 초기화 실패:', error);
        process.exit(1);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    initializeDatabase()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            Logger.error('[INIT] 오류:', error);
            process.exit(1);
        });
}

module.exports = {
    initializeDatabase,
    generateToken
};

