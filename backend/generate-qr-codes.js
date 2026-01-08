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
const mysql = require('mysql2/promise');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const Logger = require('./logger');

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

const OUTPUT_DIR = path.join(__dirname, '..', 'output_qrcodes');
const BASE_URL = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/';

// QR 설정 파일 경로
const QR_CONFIG_PATH = path.join(__dirname, 'qr-config.json');

/**
 * QR 설정 로드
 * @param {string} preset - 사용할 프리셋 이름 ('default' 또는 'samples' 내의 키)
 * @returns {object} QR 코드 생성 옵션
 */
function loadQRConfig(preset = 'default') {
    try {
        if (!fs.existsSync(QR_CONFIG_PATH)) {
            Logger.warn('[QR] 설정 파일이 없습니다. 기본 설정을 사용합니다.');
            return {
                width: 400,
                margin: 4,
                errorCorrectionLevel: 'H',
                color: { dark: '#000000', light: '#FFFFFF' }
            };
        }

        const configData = JSON.parse(fs.readFileSync(QR_CONFIG_PATH, 'utf8'));
        
        // 'default' 프리셋 사용
        if (preset === 'default') {
            return configData.default || configData.samples.medium;
        }
        
        // 'samples' 내의 프리셋 사용
        if (configData.samples && configData.samples[preset]) {
            return configData.samples[preset];
        }
        
        Logger.warn(`[QR] 프리셋 '${preset}'을 찾을 수 없습니다. 기본 설정을 사용합니다.`);
        return configData.default || configData.samples.medium;
    } catch (error) {
        Logger.error('[QR] 설정 파일 로드 실패:', error.message);
        return {
            width: 400,
            margin: 4,
            errorCorrectionLevel: 'H',
            color: { dark: '#000000', light: '#FFFFFF' }
        };
    }
}

/**
 * QR 코드 생성
 * @param {string} preset - 사용할 프리셋 이름 (기본값: 'default')
 */
async function generateQRCodes(preset = 'default') {
    try {
        Logger.log('='.repeat(50));
        Logger.log('QR 코드 생성 시작');
        Logger.log('='.repeat(50));
        
        // QR 설정 로드
        const qrOptions = loadQRConfig(preset);
        Logger.log(`[QR] 프리셋: ${preset}`);
        Logger.log(`[QR] 설정: ${JSON.stringify(qrOptions, null, 2)}`);

        // 출력 폴더 생성
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { 
                recursive: true,
                mode: 0o755 // rwxr-xr-x (소유자: 읽기/쓰기/실행, 그룹/기타: 읽기/실행)
            });
            Logger.log('[QR] 출력 폴더 생성:', OUTPUT_DIR);
        }

        // MySQL DB 연결
        const connection = await mysql.createConnection(dbConfig);
        Logger.log('[QR] ✅ MySQL 연결 성공');
        
        // 모든 토큰 조회
        const [products] = await connection.execute(`
            SELECT token, internal_code, product_name
            FROM token_master
            ORDER BY internal_code
        `);

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

                // QR 코드 생성 (설정 파일에서 옵션 로드)
                await QRCode.toFile(filepath, url, {
                    errorCorrectionLevel: qrOptions.errorCorrectionLevel || 'H',
                    type: 'png',
                    width: qrOptions.width || 400,
                    margin: qrOptions.margin || 4,
                    color: qrOptions.color || {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                
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

        await connection.end();

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
    // 명령줄 인자로 프리셋 지정 가능
    // 예: node generate-qr-codes.js large
    const preset = process.argv[2] || 'default';
    
    generateQRCodes(preset)
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

