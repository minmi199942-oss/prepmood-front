/**
 * QR 코드 생성 스크립트
 * 
 * 역할:
 * 1. DB에서 모든 토큰 조회
 * 2. 각 토큰마다 QR 코드 이미지 생성
 * 3. output_qrcodes/ 폴더에 저장
 * 
 * 실행 방법:
 * node generate-qr-codes.js
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const Logger = require('./logger');

// DB 파일 경로
const DB_PATH = path.join(__dirname, 'prep.db');
const OUTPUT_DIR = path.join(__dirname, '..', 'output_qrcodes');
const BASE_URL = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/';

/**
 * QR 코드 생성
 */
async function generateQRCodes() {
    try {
        Logger.log('='.repeat(50));
        Logger.log('QR 코드 생성 시작');
        Logger.log('='.repeat(50));

        // 출력 폴더 생성
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { recursive: true });
            Logger.log('[QR] 출력 폴더 생성:', OUTPUT_DIR);
        }

        // DB 연결
        const db = new Database(DB_PATH);
        
        // 모든 제품 조회
        const products = db.prepare(`
            SELECT token, internal_code, product_name
            FROM products
            ORDER BY internal_code
        `).all();

        Logger.log(`[QR] ${products.length}개 제품의 QR 코드 생성 시작...`);

        let successCount = 0;
        let failCount = 0;

        // 각 제품마다 QR 코드 생성
        for (const product of products) {
            try {
                const url = BASE_URL + product.token;
                const filename = `${product.internal_code}.png`;
                const filepath = path.join(OUTPUT_DIR, filename);

                // QR 코드 생성 (400x400 이상, ERROR_CORRECT_H)
                await QRCode.toFile(filepath, url, {
                    errorCorrectionLevel: 'H',
                    type: 'png',
                    width: 400,
                    margin: 4,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });

                successCount++;
                
                // 진행 상황 표시 (10개마다)
                if (successCount % 10 === 0) {
                    process.stdout.write('.');
                }
            } catch (error) {
                failCount++;
                Logger.error(`[QR] ${product.internal_code} 생성 실패:`, error.message);
            }
        }

        db.close();

        Logger.log('\n' + '='.repeat(50));
        Logger.log('✅ QR 코드 생성 완료!');
        Logger.log(`   - 성공: ${successCount}개`);
        if (failCount > 0) {
            Logger.log(`   - 실패: ${failCount}개`);
        }
        Logger.log(`   - 저장 위치: ${OUTPUT_DIR}`);
        Logger.log('='.repeat(50));

        // 샘플 QR 코드 정보
        if (products.length > 0) {
            const sample = products[0];
            Logger.log('\n📋 샘플 QR 코드:');
            Logger.log(`   제품: ${sample.product_name}`);
            Logger.log(`   파일: ${OUTPUT_DIR}/${sample.internal_code}.png`);
            Logger.log(`   URL: ${BASE_URL}${sample.token}`);
        }

    } catch (error) {
        Logger.error('[QR] QR 코드 생성 실패:', error);
        process.exit(1);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    generateQRCodes()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            Logger.error('[QR] 오류:', error);
            process.exit(1);
        });
}

module.exports = { generateQRCodes };

