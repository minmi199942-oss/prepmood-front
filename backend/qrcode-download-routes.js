/**
 * QR 코드 다운로드 라우트 (관리자 전용)
 * 
 * 역할:
 * - QR 코드 이미지들을 ZIP으로 압축해서 다운로드 제공
 * - 관리자 인증 필요
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const { rateLimit } = require('express-rate-limit');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const Logger = require('./logger');
const mysql = require('mysql2/promise');

// 관리자 다운로드 전용 rate limit (15분당 10회)
const adminDownloadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10, // 15분당 최대 10회
    message: '너무 많은 다운로드 요청입니다. 잠시 후 다시 시도해주세요.',
    standardHeaders: true,
    legacyHeaders: false,
});

// QR 코드 이미지 폴더 경로
const QR_CODES_DIR = path.join(__dirname, '..', 'output_qrcodes');

/**
 * internal_code → 다운로드용 파일명 매핑 (serial_number 우선, 없으면 internal_code)
 * @param {string} raw - serial_number 또는 internal_code
 * @returns {string} - 파일명에 사용 가능한 안전한 문자열
 */
function safeDownloadName(raw) {
    if (!raw || typeof raw !== 'string') return '';
    return raw.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120).trim() || '';
}

/**
 * GET /api/admin/qrcodes/download
 * 모든 QR 코드 이미지를 ZIP으로 다운로드 (관리자 전용)
 * - ZIP 내부 파일명: token_master.serial_number 있으면 사용, 없으면 internal_code (단일 다운로드 API와 동일 정책)
 */
router.get('/api/admin/qrcodes/download', authenticateToken, requireAdmin, adminDownloadLimiter, async (req, res) => {
    let connection = null;
    try {
        // QR 코드 폴더 확인
        if (!fs.existsSync(QR_CODES_DIR)) {
            return res.status(404).json({
                success: false,
                message: 'QR 코드 폴더를 찾을 수 없습니다.'
            });
        }

        // PNG 파일 목록 (디스크 파일명 = internal_code.png)
        const files = fs.readdirSync(QR_CODES_DIR)
            .filter(file => file.endsWith('.png'))
            .sort();

        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'QR 코드 이미지가 없습니다. 먼저 QR 코드를 생성해주세요.'
            });
        }

        // internal_code 목록 (확장자 제거)
        const internalCodes = files.map(f => => f.replace(/\.png$/i, ''));

        // DB에서 internal_code → serial_number, product_name 매핑 조회 (ZIP 내부 파일명용)
        // 파일명 우선순위: serial_number > product_name > internal_code (AUTO-001 등 대신 읽기 쉬운 이름)
        const dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        };
        connection = await mysql.createConnection(dbConfig);
        const placeholders = internalCodes.map(() => '?').join(',');
        const [rows] = await connection.execute(
            `SELECT internal_code, serial_number, product_name FROM token_master WHERE internal_code IN (${placeholders})`,
            internalCodes
        );
        await connection.end();
        connection = null;

        const nameByInternalCode = {};
        for (const row of rows) {
            const serial = (row.serial_number && String(row.serial_number).trim()) ? String(row.serial_number).trim() : '';
            const productName = (row.product_name && String(row.product_name).trim()) ? String(row.product_name).trim() : '';
            const name = safeDownloadName(serial) || safeDownloadName(productName) || safeDownloadName(row.internal_code) || row.internal_code;
            nameByInternalCode[row.internal_code] = name;
        }

        // 감사 로그 (IP, 시간, 관리자, 파일 개수)
        const auditInfo = {
            admin_email: req.user.email,
            admin_id: req.user.id || 'unknown',
            ip: req.ip || req.headers['x-real-ip'] || 'unknown',
            user_agent: req.headers['user-agent'] || 'unknown',
            file_count: files.length,
            timestamp: new Date().toISOString()
        };
        Logger.log(`[QR-DOWNLOAD-AUDIT] ${JSON.stringify(auditInfo)}`);
        Logger.log(`[QR-DOWNLOAD] 관리자 ${req.user.email}가 QR 코드 ZIP 다운로드 요청 (${files.length}개 파일)`);

        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const zipFilename = `qrcodes-${timestamp}.zip`;

        res.setHeader('Content-Type', 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`);

        const archive = archiver('zip', { zlib: { level: 9 } });

        archive.on('error', (err) => {
            Logger.error('[QR-DOWNLOAD] ZIP 생성 실패:', { message: err.message, code: err.code, admin_email: req.user?.email });
            if (!res.headersSent) {
                res.status(500).json({ success: false, message: 'ZIP 파일 생성 중 오류가 발생했습니다.' });
            }
        });

        archive.pipe(res);

        // ZIP 내부 파일명: serial_number 우선, 없으면 internal_code (중복 방지: 동일 이름이면 internal_code 사용)
        const usedNames = new Set();
        for (const file of files) {
            const filePath = path.join(QR_CODES_DIR, file);
            const internalCode = file.replace(/\.png$/i, '');
            let entryName = nameByInternalCode[internalCode] || safeDownloadName(internalCode) || internalCode;
            entryName = entryName.endsWith('.png') ? entryName : entryName + '.png';
            if (usedNames.has(entryName)) {
                entryName = (safeDownloadName(internalCode) || internalCode) + '.png';
            }
            usedNames.add(entryName);
            archive.file(filePath, { name: entryName });
        }

        archive.finalize();
        Logger.log(`[QR-DOWNLOAD] ZIP 파일 생성 완료: ${zipFilename} (${files.length}개 파일)`);
    } catch (error) {
        if (connection) {
            try { await connection.end(); } catch (e) { /* ignore */ }
        }
        Logger.error('[QR-DOWNLOAD] 다운로드 처리 실패:', {
            message: error.message,
            code: error.code,
            route: req.path,
            method: req.method,
            ip: req.ip || req.headers['x-real-ip'] || 'unknown'
        });
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'QR 코드 다운로드 중 오류가 발생했습니다.'
            });
        }
    }
});

/**
 * GET /api/admin/qrcodes/list
 * QR 코드 파일 목록 조회 (관리자 전용)
 */
router.get('/api/admin/qrcodes/list', authenticateToken, requireAdmin, (req, res) => {
    try {
        if (!fs.existsSync(QR_CODES_DIR)) {
            return res.json({
                success: true,
                files: [],
                count: 0
            });
        }

        const files = fs.readdirSync(QR_CODES_DIR)
            .filter(file => file.endsWith('.png'))
            .map(file => {
                const filePath = path.join(QR_CODES_DIR, file);
                const stats = fs.statSync(filePath);
                return {
                    filename: file,
                    size: stats.size,
                    sizeKB: (stats.size / 1024).toFixed(2),
                    created: stats.birthtime.toISOString()
                };
            })
            .sort((a, b) => a.filename.localeCompare(b.filename));

        res.json({
            success: true,
            files: files,
            count: files.length
        });

    } catch (error) {
        Logger.error('[QR-LIST] 파일 목록 조회 실패:', {
            message: error.message,
            code: error.code,
            route: req.path,
            method: req.method,
            ip: req.ip || req.headers['x-real-ip'] || 'unknown'
        });
        res.status(500).json({
            success: false,
            message: '파일 목록 조회 중 오류가 발생했습니다.'
        });
    }
});

/**
 * GET /api/admin/qrcode/download?public_id=xxx
 * 보증서 public_id로 단일 QR 코드 PNG 다운로드 (관리자 전용)
 * - warranty.public_id → token_master.internal_code → output_qrcodes/{internal_code}.png
 */
router.get('/api/admin/qrcode/download', authenticateToken, requireAdmin, adminDownloadLimiter, async (req, res) => {
    let connection;
    try {
        const publicId = req.query.public_id;
        if (!publicId || typeof publicId !== 'string' || !/^[a-zA-Z0-9-_]{1,64}$/.test(publicId.trim())) {
            return res.status(400).json({
                success: false,
                message: '유효한 public_id가 필요합니다.'
            });
        }

        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        });

        const [rows] = await connection.execute(
            `SELECT tm.internal_code, tm.serial_number, tm.product_name
             FROM warranties w
             INNER JOIN token_master tm ON w.token_pk = tm.token_pk
             WHERE w.public_id = ? AND w.deleted_at IS NULL`,
            [publicId.trim()]
        );
        await connection.end();
        connection = null;

        if (rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: '해당 보증서를 찾을 수 없습니다.'
            });
        }

        const internalCode = rows[0].internal_code;
        const serialNumber = rows[0].serial_number;
        const productName = rows[0].product_name;
        if (!internalCode || /[\\/]/.test(internalCode)) {
            return res.status(500).json({
                success: false,
                message: 'QR 코드 파일명을 확인할 수 없습니다.'
            });
        }

        const filePath = path.join(QR_CODES_DIR, `${internalCode}.png`);
        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                message: 'QR 코드 이미지가 아직 생성되지 않았습니다. 일괄 생성 스크립트를 실행해주세요.'
            });
        }

        // 다운로드 파일명: serial_number > product_name > internal_code (읽기 쉬운 이름 우선)
        const rawName = (serialNumber && String(serialNumber).trim())
            ? String(serialNumber).trim()
            : (productName && String(productName).trim())
                ? String(productName).trim()
                : internalCode;
        const safeName = `${rawName.replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || internalCode}.png`;
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
        res.sendFile(path.resolve(filePath));

        Logger.log('[QR-DOWNLOAD-SINGLE] 단일 QR 다운로드', {
            public_id: publicId,
            internal_code: internalCode,
            download_filename: safeName,
            admin_email: req.user?.email
        });
    } catch (error) {
        if (connection) {
            try {
                await connection.end();
            } catch (e) {
                // ignore
            }
        }
        Logger.error('[QR-DOWNLOAD-SINGLE] 단일 QR 다운로드 실패', {
            message: error.message,
            public_id: req.query?.public_id,
            route: req.path
        });
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: 'QR 코드 다운로드 중 오류가 발생했습니다.'
            });
        }
    }
});

/**
 * POST /api/admin/auth/revoke
 * 토큰 무효화 (관리자 전용)
 * - SSOT: QR 스캔은 MySQL token_master.is_blocked를 사용하므로 MySQL 반영 필수
 * - SQLite(legacy)도 동기화해 두면 이전 도구/스크립트와의 일관성 유지
 */
const { revokeToken } = require('./auth-db');

router.post('/api/admin/auth/revoke', authenticateToken, requireAdmin, async (req, res) => {
    let connection = null;
    try {
        const { token } = req.body;

        if (!token || !/^[a-zA-Z0-9]{20}$/.test(token)) {
            return res.status(400).json({
                success: false,
                message: '유효한 토큰을 입력해주세요.'
            });
        }

        const dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        };
        connection = await mysql.createConnection(dbConfig);
        const [result] = await connection.execute(
            'UPDATE token_master SET is_blocked = 1, updated_at = NOW() WHERE token = ?',
            [token]
        );
        await connection.end();
        connection = null;

        const mysqlUpdated = result.affectedRows >= 1;
        if (mysqlUpdated) {
            try {
                revokeToken(token);
            } catch (sqliteErr) {
                Logger.warn('[AUTH-REVOKE] SQLite 동기화 실패(무시)', { message: sqliteErr.message });
            }
        }

        if (mysqlUpdated) {
            const auditInfo = {
                admin_email: req.user.email,
                ip: req.ip || req.headers['x-real-ip'] || 'unknown',
                token: token.substring(0, 4) + '...',
                timestamp: new Date().toISOString()
            };
            Logger.log(`[AUTH-REVOKE-AUDIT] ${JSON.stringify(auditInfo)}`);
            return res.json({
                success: true,
                message: '토큰이 무효화되었습니다.'
            });
        }
        return res.status(404).json({
            success: false,
            message: '토큰을 찾을 수 없습니다.'
        });
    } catch (error) {
        if (connection) {
            try { await connection.end(); } catch (_) {}
        }
        Logger.error('[AUTH-REVOKE] 토큰 무효화 실패:', {
            message: error.message,
            code: error.code,
            route: req.path,
            method: req.method,
            ip: req.ip || req.headers['x-real-ip'] || 'unknown'
        });
        return res.status(500).json({
            success: false,
            message: '토큰 무효화 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;

