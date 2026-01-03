/**
 * QR 코드 샘플 생성 스크립트
 * 
 * 역할:
 * 1. qr-config.json의 모든 샘플 프리셋으로 QR 코드 생성
 * 2. 샘플용 테스트 URL 사용
 * 3. output_qrcodes/samples/ 폴더에 저장
 * 
 * 실행 방법:
 * node generate-qr-samples.js
 */

require('dotenv').config();
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const Logger = require('./logger');

// 출력 폴더
const OUTPUT_DIR = path.join(__dirname, '..', 'output_qrcodes', 'samples');
const QR_CONFIG_PATH = path.join(__dirname, 'qr-config.json');
const BASE_URL = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/';

// 샘플용 테스트 토큰
const SAMPLE_TOKEN = 'sample-test-token-12345';

/**
 * QR 설정 로드
 */
function loadQRConfig() {
    try {
        if (!fs.existsSync(QR_CONFIG_PATH)) {
            Logger.error('[QR] 설정 파일이 없습니다: qr-config.json');
            process.exit(1);
        }

        const configData = JSON.parse(fs.readFileSync(QR_CONFIG_PATH, 'utf8'));
        return configData;
    } catch (error) {
        Logger.error('[QR] 설정 파일 로드 실패:', error.message);
        process.exit(1);
    }
}

/**
 * 샘플 QR 코드 생성
 */
async function generateQRSamples() {
    try {
        Logger.log('='.repeat(50));
        Logger.log('QR 코드 샘플 생성 시작');
        Logger.log('='.repeat(50));

        // 출력 폴더 생성
        if (!fs.existsSync(OUTPUT_DIR)) {
            fs.mkdirSync(OUTPUT_DIR, { 
                recursive: true,
                mode: 0o755
            });
            Logger.log('[QR] 샘플 출력 폴더 생성:', OUTPUT_DIR);
        }

        // 설정 로드
        const config = loadQRConfig();
        const samples = config.samples || {};
        
        if (Object.keys(samples).length === 0) {
            Logger.error('[QR] 샘플 프리셋이 설정 파일에 없습니다.');
            process.exit(1);
        }

        Logger.log(`[QR] ${Object.keys(samples).length}개의 샘플 프리셋 발견`);
        Logger.log('');

        // URL 생성
        const baseUrl = BASE_URL.endsWith('/') ? BASE_URL : BASE_URL + '/';
        const url = baseUrl + SAMPLE_TOKEN;

        let successCount = 0;
        let failCount = 0;

        // 각 샘플 프리셋으로 QR 코드 생성
        for (const [presetName, presetConfig] of Object.entries(samples)) {
            try {
                const filename = `sample-${presetName}.png`;
                const filepath = path.join(OUTPUT_DIR, filename);

                Logger.log(`[QR] 생성 중: ${presetName} (${presetConfig.description || ''})`);

                // QR 코드 생성
                await QRCode.toFile(filepath, url, {
                    errorCorrectionLevel: presetConfig.errorCorrectionLevel || 'H',
                    type: 'png',
                    width: presetConfig.width || 400,
                    margin: presetConfig.margin || 4,
                    color: presetConfig.color || {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });

                // 파일 권한 설정
                try {
                    fs.chmodSync(filepath, 0o644);
                } catch (error) {
                    if (process.platform !== 'win32') {
                        Logger.warn(`[QR] 파일 권한 설정 실패 (무시됨): ${filepath}`);
                    }
                }

                successCount++;
                Logger.log(`   ✅ 생성 완료: ${filename} (${presetConfig.width}x${presetConfig.width}px)`);
                Logger.log('');

            } catch (error) {
                failCount++;
                Logger.error(`[QR] ${presetName} 생성 실패:`, error.message);
            }
        }

        Logger.log('='.repeat(50));
        Logger.log('✅ QR 코드 샘플 생성 완료!');
        Logger.log(`   - 성공: ${successCount}개`);
        if (failCount > 0) {
            Logger.log(`   - 실패: ${failCount}개`);
        }
        Logger.log(`   - 저장 위치: ${OUTPUT_DIR}`);
        Logger.log(`   - 테스트 URL: ${url}`);
        Logger.log('='.repeat(50));

        Logger.log('\n📋 생성된 샘플 파일:');
        const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
        files.forEach(file => {
            const filepath = path.join(OUTPUT_DIR, file);
            const stats = fs.statSync(filepath);
            const sizeKB = (stats.size / 1024).toFixed(2);
            Logger.log(`   - ${file} (${sizeKB} KB)`);
        });

    } catch (error) {
        Logger.error('[QR] 샘플 생성 실패:', {
            message: error.message,
            code: error.code
        });
        process.exit(1);
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    generateQRSamples()
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

module.exports = { generateQRSamples };

