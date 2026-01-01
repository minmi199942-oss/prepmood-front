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
            fs.mkdirSync(OUTPUT_DIR, { 
                recursive: true,
                mode: 0o755 // rwxr-xr-x (소유자: 읽기/쓰기/실행, 그룹/기타: 읽기/실행)
            });
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
                // URL 생성 (BASE_URL 끝에 슬래시가 있는지 확인)
                const baseUrl = BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/';
                const url = baseUrl + product.token;
                const filename = `${product.internal_code}.png`;
                const filepath = path.join(OUTPUT_DIR, filename);

                // 첫 번째 제품의 URL을 로그로 출력 (디버깅용)
                if (successCount === 0) {
                    Logger.log(`[QR] 샘플 URL 생성: ${url}`);
                    Logger.log(`[QR] BASE_URL: ${BASE_URL}`);
                    Logger.log(`[QR] Token: ${product.token}`);
                }

                // QR 코드 생성 옵션 (환경 변수로 조정 가능)
                const qrOptions = {
                    errorCorrectionLevel: process.env.QR_ERROR_CORRECTION_LEVEL || 'H', // L, M, Q, H (기본: H)
                    type: 'png',
                    width: parseInt(process.env.QR_WIDTH) || 400, // 전체 이미지 크기 (픽셀, 기본: 400)
                    margin: parseInt(process.env.QR_MARGIN) || 4, // 여백 (모듈 단위, 기본: 4)
                    color: {
                        dark: process.env.QR_COLOR_DARK || '#000000', // QR 코드 색상 (기본: 검정)
                        light: process.env.QR_COLOR_LIGHT || '#FFFFFF' // 배경 색상 (기본: 흰색)
                    }
                };
                
                // scale 옵션 (각 모듈의 크기, width와 함께 사용 가능)
                // scale을 지정하면 width는 무시됨
                if (process.env.QR_SCALE) {
                    qrOptions.scale = parseInt(process.env.QR_SCALE);
                    // scale 사용 시 width 제거 (충돌 방지)
                    delete qrOptions.width;
                }
                
                await QRCode.toFile(filepath, url, qrOptions);
                
                // 파일 권한 설정 (소유자: 읽기/쓰기, 그룹/기타: 읽기: 644)
                // Windows에서는 chmod가 동작하지 않으므로 try-catch로 감쌈
                try {
                    fs.chmodSync(filepath, 0o644);
                } catch (error) {
                    // Windows 환경에서는 무시 (권한 시스템이 다름)
                    if (process.platform !== 'win32') {
                        Logger.warn(`[QR] 파일 권한 설정 실패 (무시됨): ${filepath}`);
                    }
                }

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
        Logger.error('[QR] QR 코드 생성 실패:', {
            message: error.message,
            code: error.code
        });
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
            Logger.error('[QR] 오류:', {
                message: error.message,
                code: error.code
            });
            process.exit(1);
        });
}

module.exports = { generateQRCodes };

