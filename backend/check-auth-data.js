/**
 * 정품 인증 데이터 확인 스크립트
 * 
 * 역할:
 * - DB에 저장된 토큰 목록 확인
 * - QR 코드 이미지 파일 확인
 * - 토큰과 제품 정보 매핑 확인
 * 
 * 실행 방법:
 * node check-auth-data.js
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

// 경로 설정
const DB_PATH = path.join(__dirname, 'prep.db');
const OUTPUT_DIR = path.join(__dirname, '..', 'output_qrcodes');
const BASE_URL = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/';

/**
 * DB에서 모든 제품 정보 조회
 */
function getAllProducts() {
    const db = new Database(DB_PATH);
    const products = db.prepare(`
        SELECT token, internal_code, product_name, status, scan_count,
               first_verified_at, last_verified_at
        FROM products
        ORDER BY internal_code
    `).all();
    db.close();
    return products;
}

/**
 * QR 코드 이미지 파일 목록 확인
 */
function getQRCodeFiles() {
    if (!fs.existsSync(OUTPUT_DIR)) {
        return [];
    }
    return fs.readdirSync(OUTPUT_DIR)
        .filter(file => file.endsWith('.png'))
        .sort();
}

/**
 * 데이터 확인 메인 함수
 */
function checkAuthData() {
    try {
        Logger.log('='.repeat(60));
        Logger.log('정품 인증 데이터 확인');
        Logger.log('='.repeat(60));

        // 1. DB에서 제품 정보 조회
        Logger.log('\n📊 DB 데이터 확인:');
        const products = getAllProducts();
        Logger.log(`   총 제품 수: ${products.length}개`);

        if (products.length === 0) {
            Logger.warn('   ⚠️  DB에 제품 데이터가 없습니다.');
            Logger.log('   → node init-auth-db.js 실행 필요');
            return;
        }

        // 샘플 데이터 출력 (최대 5개)
        Logger.log('\n📋 샘플 제품 데이터 (최대 5개):');
        products.slice(0, 5).forEach((product, index) => {
            Logger.log(`\n   [${index + 1}] ${product.product_name}`);
            Logger.log(`       제품 코드: ${product.internal_code}`);
            Logger.log(`       토큰: ${product.token}`);
            Logger.log(`       URL: ${BASE_URL}${product.token}`);
            Logger.log(`       상태: ${product.status === 0 ? '미인증' : '인증됨'}`);
            Logger.log(`       스캔 횟수: ${product.scan_count}회`);
            if (product.first_verified_at) {
                Logger.log(`       최초 인증일: ${product.first_verified_at}`);
            }
        });

        if (products.length > 5) {
            Logger.log(`\n   ... 외 ${products.length - 5}개 제품`);
        }

        // 2. QR 코드 이미지 파일 확인
        Logger.log('\n📷 QR 코드 이미지 파일 확인:');
        const qrFiles = getQRCodeFiles();
        Logger.log(`   총 QR 코드 파일: ${qrFiles.length}개`);
        Logger.log(`   저장 위치: ${OUTPUT_DIR}`);

        if (qrFiles.length === 0) {
            Logger.warn('   ⚠️  QR 코드 이미지가 없습니다.');
            Logger.log('   → node generate-qr-codes.js 실행 필요');
        } else {
            Logger.log('\n   샘플 파일 (최대 5개):');
            qrFiles.slice(0, 5).forEach((file, index) => {
                const filePath = path.join(OUTPUT_DIR, file);
                const stats = fs.statSync(filePath);
                Logger.log(`   [${index + 1}] ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
            });
            if (qrFiles.length > 5) {
                Logger.log(`   ... 외 ${qrFiles.length - 5}개 파일`);
            }
        }

        // 3. 매핑 확인
        Logger.log('\n🔗 데이터 매핑 확인:');
        const dbCodes = new Set(products.map(p => p.internal_code));
        const qrCodes = new Set(qrFiles.map(f => f.replace('.png', '')));
        
        const missingQR = [...dbCodes].filter(code => !qrCodes.has(code));
        const missingDB = [...qrCodes].filter(code => !dbCodes.has(code));

        if (missingQR.length === 0 && missingDB.length === 0) {
            Logger.log('   ✅ 모든 제품에 QR 코드가 생성되어 있습니다.');
        } else {
            if (missingQR.length > 0) {
                Logger.warn(`   ⚠️  QR 코드가 없는 제품: ${missingQR.length}개`);
                Logger.log(`      예: ${missingQR.slice(0, 3).join(', ')}`);
            }
            if (missingDB.length > 0) {
                Logger.warn(`   ⚠️  DB에 없는 QR 코드 파일: ${missingDB.length}개`);
            }
        }

        // 4. 인증 통계
        Logger.log('\n📈 인증 통계:');
        const verified = products.filter(p => p.status > 0).length;
        const totalScans = products.reduce((sum, p) => sum + p.scan_count, 0);
        Logger.log(`   미인증: ${products.length - verified}개`);
        Logger.log(`   인증됨: ${verified}개`);
        Logger.log(`   총 스캔 횟수: ${totalScans}회`);

        Logger.log('\n' + '='.repeat(60));
        Logger.log('✅ 데이터 확인 완료!');
        Logger.log('='.repeat(60));

    } catch (error) {
        Logger.error('❌ 데이터 확인 실패:', {
            message: error.message,
            code: error.code
        });
        process.exit(1);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    checkAuthData();
}

module.exports = { checkAuthData, getAllProducts, getQRCodeFiles };

