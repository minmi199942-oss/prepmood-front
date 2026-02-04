/**
 * QR 코드 단건 생성 유틸 (토큰 추가 시 온디맨드 생성용)
 * - generate-qr-codes.js와 동일한 qr-config.json / output_qrcodes 경로 규칙 사용
 */

const path = require('path');
const fs = require('fs');
const Logger = require('../logger');

const BACKEND_DIR = path.join(__dirname, '..');
const QR_CONFIG_PATH = path.join(BACKEND_DIR, 'qr-config.json');
const DEFAULT_OUTPUT_DIR = path.join(BACKEND_DIR, '..', 'output_qrcodes');

/**
 * QR 설정 로드 (generate-qr-codes.js와 동일 로직)
 * @param {string} preset - 'default' 또는 samples 내 키
 * @returns {object} QR 옵션
 */
function loadQRConfig(preset = 'default') {
    try {
        if (!fs.existsSync(QR_CONFIG_PATH)) {
            return {
                width: 400,
                margin: 4,
                errorCorrectionLevel: 'H',
                color: { dark: '#000000', light: '#FFFFFF' }
            };
        }
        const configData = JSON.parse(fs.readFileSync(QR_CONFIG_PATH, 'utf8'));
        if (preset === 'default') {
            return configData.default || (configData.samples && configData.samples.medium) || {};
        }
        if (configData.samples && configData.samples[preset]) {
            return configData.samples[preset];
        }
        return configData.default || (configData.samples && configData.samples.medium) || {};
    } catch (error) {
        Logger.error('[QR-UTIL] 설정 로드 실패:', error.message);
        return {
            width: 400,
            margin: 4,
            errorCorrectionLevel: 'H',
            color: { dark: '#000000', light: '#FFFFFF' }
        };
    }
}

/**
 * 토큰 1개에 대한 QR PNG 1개 생성
 * @param {object} opts
 * @param {string} opts.token - 20자 토큰
 * @param {string} opts.internal_code - 파일명에 사용 (파일명: {internal_code}.png)
 * @param {string} [opts.outputDir] - 출력 디렉터리 (기본: project-root/output_qrcodes)
 * @param {string} [opts.baseUrl] - AUTH_BASE_URL (끝에 / 없으면 자동 보정)
 * @param {string} [opts.preset] - qr-config 프리셋 (기본: 'default')
 * @returns {Promise<string>} 생성된 파일 경로
 */
async function generateOneQR(opts) {
    const {
        token,
        internal_code,
        outputDir = DEFAULT_OUTPUT_DIR,
        baseUrl = process.env.AUTH_BASE_URL || 'https://prepmood.kr/a/',
        preset = 'default'
    } = opts;

    if (!token || !internal_code) {
        throw new Error('token과 internal_code는 필수입니다.');
    }

    const qrOptions = loadQRConfig(preset);
    const url = baseUrl.endsWith('/') ? baseUrl + token : baseUrl + '/' + token;
    const filename = `${internal_code}.png`;
    const filepath = path.join(outputDir, filename);

    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true, mode: 0o755 });
    }

    const QRCode = require('qrcode');
    await QRCode.toFile(filepath, url, {
        errorCorrectionLevel: qrOptions.errorCorrectionLevel || 'H',
        type: 'png',
        width: qrOptions.width || 400,
        margin: qrOptions.margin || 4,
        color: qrOptions.color || { dark: '#000000', light: '#FFFFFF' }
    });

    try {
        fs.chmodSync(filepath, 0o644);
    } catch (e) {
        if (process.platform !== 'win32') {
            Logger.warn('[QR-UTIL] chmod 실패 (무시):', filepath);
        }
    }

    return filepath;
}

module.exports = { loadQRConfig, generateOneQR };
