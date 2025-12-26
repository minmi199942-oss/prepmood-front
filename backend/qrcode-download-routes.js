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
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const Logger = require('./logger');

// QR 코드 이미지 폴더 경로
const QR_CODES_DIR = path.join(__dirname, '..', 'output_qrcodes');

/**
 * GET /api/admin/qrcodes/download
 * 모든 QR 코드 이미지를 ZIP으로 다운로드 (관리자 전용)
 */
router.get('/api/admin/qrcodes/download', authenticateToken, requireAdmin, (req, res) => {
    try {
        // QR 코드 폴더 확인
        if (!fs.existsSync(QR_CODES_DIR)) {
            return res.status(404).json({
                success: false,
                message: 'QR 코드 폴더를 찾을 수 없습니다.'
            });
        }

        // PNG 파일 목록
        const files = fs.readdirSync(QR_CODES_DIR)
            .filter(file => file.endsWith('.png'))
            .sort();

        if (files.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'QR 코드 이미지가 없습니다. 먼저 QR 코드를 생성해주세요.'
            });
        }

        Logger.log(`[QR-DOWNLOAD] 관리자 ${req.user.email}가 QR 코드 ZIP 다운로드 요청 (${files.length}개 파일)`);

        // ZIP 파일명 (타임스탬프 포함, 확장자 명확히)
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        const zipFilename = `qrcodes-${timestamp}.zip`;

        // ZIP 파일 생성
        // Content-Type을 application/octet-stream으로 설정하여 브라우저 호환성 확보
        res.setHeader('Content-Type', 'application/octet-stream');
        // 파일명 설정 (따옴표로 감싸고, ASCII만 사용)
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"; filename*=UTF-8''${encodeURIComponent(zipFilename)}`);

        const archive = archiver('zip', {
            zlib: { level: 9 } // 최대 압축
        });

        // 에러 처리
        archive.on('error', (err) => {
            Logger.error('[QR-DOWNLOAD] ZIP 생성 실패:', err);
            if (!res.headersSent) {
                res.status(500).json({
                    success: false,
                    message: 'ZIP 파일 생성 중 오류가 발생했습니다.'
                });
            }
        });

        // 스트림 연결
        archive.pipe(res);

        // 각 파일을 ZIP에 추가
        files.forEach((file) => {
            const filePath = path.join(QR_CODES_DIR, file);
            archive.file(filePath, { name: file });
        });

        // ZIP 완료
        archive.finalize();

        Logger.log(`[QR-DOWNLOAD] ZIP 파일 생성 완료: ${zipFilename} (${files.length}개 파일)`);

    } catch (error) {
        Logger.error('[QR-DOWNLOAD] 다운로드 처리 실패:', error);
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
        Logger.error('[QR-LIST] 파일 목록 조회 실패:', error);
        res.status(500).json({
            success: false,
            message: '파일 목록 조회 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;

