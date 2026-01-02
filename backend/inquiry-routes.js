// inquiry-routes.js - 문의 관리 API 라우트

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, requireAdmin, optionalAuth } = require('./auth-middleware');
const { verifyCSRF } = require('./csrf-middleware');
const { body, validationResult } = require('express-validator');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { sendInquiryReplyEmail } = require('./mailer');
const https = require('https');
require('dotenv').config();

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// ==================== Rate Limiting ====================

// 문의 접수 Rate Limit (15분당 5회)
const inquiryLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 5, // 최대 5회
    message: {
        success: false,
        message: '너무 많은 문의 요청이 있습니다. 잠시 후 다시 시도해주세요.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        if (req.user && req.user.userId) {
            return `inquiry:user:${req.user.userId}`;
        }
        return ipKeyGenerator(req.ip || '');
    }
});

// ==================== 유틸리티 함수 ====================

/**
 * 접수번호 생성 (id 기반 패딩)
 * @param {Number} inquiryId - 문의 ID
 * @returns {String} INQ-YYYYMMDD-000123 형식
 */
function generateInquiryNumber(inquiryId) {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
    const paddedId = String(inquiryId).padStart(6, '0'); // 6자리 패딩
    return `INQ-${date}-${paddedId}`;
}

/**
 * XSS 방지: HTML 이스케이프
 */
function escapeHtml(text) {
    if (!text) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * 메시지 검증 (서버 측)
 * - 길이 <= 1000자 (trim 후)
 * - 줄 수 <= 5줄
 * - 공백만 입력 방지
 */
function validateMessage(message) {
    if (!message || typeof message !== 'string') {
        return { valid: false, error: '메시지를 입력해주세요.' };
    }
    
    const trimmed = message.trim();
    
    // 공백만 입력 방지
    if (trimmed.length === 0) {
        return { valid: false, error: '메시지를 입력해주세요.' };
    }
    
    // 길이 검증
    if (trimmed.length > 1000) {
        return { valid: false, error: '메시지는 1000자 이하여야 합니다.' };
    }
    
    // 줄 수 검증
    const lines = trimmed.split('\n');
    if (lines.length > 5) {
        return { valid: false, error: '메시지는 5줄 이하여야 합니다.' };
    }
    
    return { valid: true };
}

// ==================== reCAPTCHA 검증 ====================

/**
 * reCAPTCHA 토큰 검증
 * @param {string} token - reCAPTCHA 토큰
 * @returns {Promise<{success: boolean, hostname?: string, error?: string}>}
 */
async function verifyRecaptcha(token) {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    
    if (!secretKey) {
        console.warn('⚠️ RECAPTCHA_SECRET_KEY가 설정되지 않았습니다.');
        return { success: false, error: 'reCAPTCHA 설정 오류' };
    }

    if (!token) {
        return { success: false, error: 'reCAPTCHA 토큰이 없습니다.' };
    }

    return new Promise((resolve) => {
        const postData = `secret=${encodeURIComponent(secretKey)}&response=${encodeURIComponent(token)}`;
        
        const options = {
            hostname: 'www.google.com',
            path: '/recaptcha/api/siteverify',
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    
                    // success 확인
                    if (!result.success) {
                        return resolve({
                            success: false,
                            error: result['error-codes']?.join(', ') || 'reCAPTCHA 검증 실패'
                        });
                    }

                    // hostname 확인 (프로덕션 환경)
                    const expectedHostname = 'prepmood.kr';
                    if (result.hostname && result.hostname !== expectedHostname && result.hostname !== `www.${expectedHostname}`) {
                        // 개발 환경에서는 localhost 허용
                        if (result.hostname !== 'localhost' && !result.hostname.includes('127.0.0.1')) {
                            console.warn(`⚠️ reCAPTCHA hostname 불일치: ${result.hostname} (예상: ${expectedHostname})`);
                            // 개발 환경에서는 경고만 하고 통과
                            if (process.env.NODE_ENV === 'production') {
                                return resolve({
                                    success: false,
                                    error: 'reCAPTCHA hostname 검증 실패'
                                });
                            }
                        }
                    }

                    resolve({
                        success: true,
                        hostname: result.hostname
                    });
                } catch (error) {
                    console.error('❌ reCAPTCHA 응답 파싱 오류:', error);
                    resolve({
                        success: false,
                        error: 'reCAPTCHA 검증 응답 오류'
                    });
                }
            });
        });

        req.on('error', (error) => {
            console.error('❌ reCAPTCHA 검증 요청 오류:', error);
            resolve({
                success: false,
                error: 'reCAPTCHA 검증 서버 오류'
            });
        });

        req.setTimeout(5000, () => {
            req.destroy();
            resolve({
                success: false,
                error: 'reCAPTCHA 검증 시간 초과'
            });
        });

        req.write(postData);
        req.end();
    });
}

// ==================== 공개 API ====================

/**
 * POST /api/inquiries
 * 문의 접수
 */
router.post('/inquiries', 
    inquiryLimiter,
    optionalAuth,
    verifyCSRF,
    [
        body('salutation').notEmpty().withMessage('호칭을 선택해주세요.'),
        body('first_name').trim().notEmpty().withMessage('이름을 입력해주세요.').isLength({ max: 50 }).withMessage('이름은 50자 이하여야 합니다.'),
        body('last_name').trim().notEmpty().withMessage('성을 입력해주세요.').isLength({ max: 50 }).withMessage('성은 50자 이하여야 합니다.'),
        body('email').isEmail().withMessage('올바른 이메일 형식이 아닙니다.').normalizeEmail(),
        body('region').notEmpty().withMessage('선호 지역을 선택해주세요.'),
        body('city').optional().trim().isLength({ max: 80 }).withMessage('도시는 80자 이하여야 합니다.'),
        body('country_code').optional().trim().isLength({ max: 10 }).withMessage('국가 코드는 10자 이하여야 합니다.'),
        body('phone').optional().trim().isLength({ max: 30 }).withMessage('전화번호는 30자 이하여야 합니다.'),
        body('category').notEmpty().withMessage('관심 분야를 선택해주세요.').isLength({ max: 80 }).withMessage('관심 분야는 80자 이하여야 합니다.'),
        body('topic').notEmpty().withMessage('주제를 선택해주세요.').isLength({ max: 120 }).withMessage('주제는 120자 이하여야 합니다.'),
        body('message').notEmpty().withMessage('메시지를 입력해주세요.'),
        body('privacy_consent').equals('true').withMessage('개인정보 수집·이용에 동의해주세요.'),
        body('age_consent').equals('true').withMessage('만 14세 이상임을 확인해주세요.'),
        body('recaptcha_token').notEmpty().withMessage('reCAPTCHA 검증이 필요합니다.'),
        body('honeypot').optional().equals('').withMessage('스팸 방지 검증에 실패했습니다.')
    ],
    async (req, res) => {
        let connection;
        try {
            // Validation 결과 확인
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            // 허니팟 필드 체크
            if (req.body.honeypot && req.body.honeypot !== '') {
                return res.status(400).json({
                    success: false,
                    message: '스팸 방지 검증에 실패했습니다.'
                });
            }

            // reCAPTCHA 검증
            const recaptchaResult = await verifyRecaptcha(req.body.recaptcha_token);
            if (!recaptchaResult.success) {
                return res.status(400).json({
                    success: false,
                    message: recaptchaResult.error || 'reCAPTCHA 검증에 실패했습니다.'
                });
            }

            // 메시지 검증 (서버 측)
            const messageValidation = validateMessage(req.body.message);
            if (!messageValidation.valid) {
                return res.status(400).json({
                    success: false,
                    message: messageValidation.error
                });
            }

            connection = await mysql.createConnection(dbConfig);
            await connection.beginTransaction();

            try {
                // 1. INSERT inquiries
                const [result] = await connection.execute(
                    `INSERT INTO inquiries (
                        user_id, salutation, first_name, last_name, email, 
                        region, city, country_code, phone,
                        category, topic, message, privacy_consent, age_consent, status
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new')`,
                    [
                        req.user?.userId || null,
                        req.body.salutation,
                        escapeHtml(req.body.first_name.trim()),
                        escapeHtml(req.body.last_name.trim()),
                        req.body.email.toLowerCase().trim(),
                        req.body.region,
                        req.body.city ? escapeHtml(req.body.city.trim()) : null,
                        req.body.country_code ? escapeHtml(req.body.country_code.trim()) : null,
                        req.body.phone ? escapeHtml(req.body.phone.trim()) : null,
                        escapeHtml(req.body.category),
                        escapeHtml(req.body.topic),
                        escapeHtml(req.body.message.trim()),
                        req.body.privacy_consent === 'true' ? 1 : 0,
                        req.body.age_consent === 'true' ? 1 : 0
                    ]
                );

                const inquiryId = result.insertId;

                // 2. inquiry_number 생성 및 UPDATE (같은 트랜잭션 내)
                const inquiryNumber = generateInquiryNumber(inquiryId);
                await connection.execute(
                    'UPDATE inquiries SET inquiry_number = ? WHERE id = ?',
                    [inquiryNumber, inquiryId]
                );

                await connection.commit();

                res.json({
                    success: true,
                    message: '문의가 접수되었습니다.',
                    inquiry: {
                        id: inquiryId,
                        inquiry_number: inquiryNumber
                    }
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            }

        } catch (error) {
            console.error('❌ 문의 접수 오류:', error);
            res.status(500).json({
                success: false,
                message: '문의 접수 중 오류가 발생했습니다.'
            });
        } finally {
            if (connection) await connection.end();
        }
    }
);

// ==================== 관리자 API ====================

/**
 * GET /api/admin/inquiries
 * 문의 목록 조회 (필터/검색/페이지네이션)
 */
router.get('/admin/inquiries', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const {
            status,
            category,
            search,
            date_from,
            date_to,
            limit = 20,
            offset = 0
        } = req.query;

        const limitNum = Math.min(parseInt(limit, 10) || 20, 200);
        const offsetNum = Math.max(parseInt(offset, 10) || 0, 0);

        connection = await mysql.createConnection(dbConfig);

        let query = `
            SELECT 
                id, inquiry_number, user_id,
                salutation, first_name, last_name, email, region, city, country_code, phone,
                category, topic, message, privacy_consent, age_consent,
                status, admin_memo,
                created_at, updated_at
            FROM inquiries
            WHERE 1=1
        `;
        const params = [];

        // 필터링
        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (category) {
            query += ' AND category = ?';
            params.push(category);
        }

        if (date_from) {
            query += ' AND DATE(created_at) >= ?';
            params.push(date_from);
        }

        if (date_to) {
            query += ' AND DATE(created_at) <= ?';
            params.push(date_to);
        }

        if (search) {
            query += ' AND (email LIKE ? OR inquiry_number LIKE ? OR CONCAT(last_name, first_name) LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern);
        }

        // 총 개수 조회
        const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM');
        const [countResult] = await connection.execute(countQuery, params);
        const total = countResult[0].total;

        // 목록 조회
        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limitNum, offsetNum);

        const [inquiries] = await connection.execute(query, params);

        res.json({
            success: true,
            inquiries: inquiries,
            pagination: {
                total: total,
                limit: limitNum,
                offset: offsetNum,
                hasMore: offsetNum + limitNum < total
            }
        });

    } catch (error) {
        console.error('❌ 문의 목록 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '문의 목록을 불러오는데 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * GET /api/admin/inquiries/:id
 * 문의 상세 조회
 */
router.get('/admin/inquiries/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const inquiryId = parseInt(req.params.id, 10);

        if (isNaN(inquiryId)) {
            return res.status(400).json({
                success: false,
                message: '올바른 문의 ID가 아닙니다.'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        const [inquiries] = await connection.execute(
            `SELECT 
                id, inquiry_number, user_id,
                salutation, first_name, last_name, email, region, city, country_code, phone,
                category, topic, message, privacy_consent, age_consent,
                status, admin_memo,
                created_at, updated_at
            FROM inquiries
            WHERE id = ?`,
            [inquiryId]
        );

        if (inquiries.length === 0) {
            return res.status(404).json({
                success: false,
                message: '문의를 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            inquiry: inquiries[0]
        });

    } catch (error) {
        console.error('❌ 문의 상세 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '문의 상세를 불러오는데 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * GET /api/admin/inquiries/:id/replies
 * 답변 이력 조회
 */
router.get('/admin/inquiries/:id/replies', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const inquiryId = parseInt(req.params.id, 10);

        if (isNaN(inquiryId)) {
            return res.status(400).json({
                success: false,
                message: '올바른 문의 ID가 아닙니다.'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        const [replies] = await connection.execute(
            `SELECT 
                ir.id, ir.inquiry_id, ir.admin_user_id, ir.message,
                ir.email_status, ir.email_error, ir.created_at,
                u.email as admin_email, u.first_name as admin_first_name, u.last_name as admin_last_name
            FROM inquiry_replies ir
            LEFT JOIN users u ON ir.admin_user_id = u.user_id
            WHERE ir.inquiry_id = ?
            ORDER BY ir.created_at DESC`,
            [inquiryId]
        );

        res.json({
            success: true,
            replies: replies
        });

    } catch (error) {
        console.error('❌ 답변 이력 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '답변 이력을 불러오는데 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

/**
 * POST /api/admin/inquiries/:id/reply
 * 답변 전송 (A안: 커밋 후 이메일 발송)
 */
router.post('/admin/inquiries/:id/reply',
    authenticateToken,
    requireAdmin,
    verifyCSRF,
    [
        body('message').trim().notEmpty().withMessage('답변 내용을 입력해주세요.')
    ],
    async (req, res) => {
        let connection;
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const inquiryId = parseInt(req.params.id, 10);
            const replyMessage = escapeHtml(req.body.message.trim());

            if (isNaN(inquiryId)) {
                return res.status(400).json({
                    success: false,
                    message: '올바른 문의 ID가 아닙니다.'
                });
            }

            connection = await mysql.createConnection(dbConfig);
            await connection.beginTransaction();

            try {
                // 1. 문의 존재 확인
                const [inquiries] = await connection.execute(
                    'SELECT id, email, first_name, last_name, inquiry_number FROM inquiries WHERE id = ?',
                    [inquiryId]
                );

                if (inquiries.length === 0) {
                    await connection.rollback();
                    return res.status(404).json({
                        success: false,
                        message: '문의를 찾을 수 없습니다.'
                    });
                }

                const inquiry = inquiries[0];

                // 2. 답변 저장 (email_status='pending')
                const [replyResult] = await connection.execute(
                    `INSERT INTO inquiry_replies (inquiry_id, admin_user_id, message, email_status)
                    VALUES (?, ?, ?, 'pending')`,
                    [inquiryId, req.user.userId, replyMessage]
                );

                const replyId = replyResult.insertId;

                // 3. 문의 상태를 'answered'로 변경
                await connection.execute(
                    'UPDATE inquiries SET status = ?, updated_at = NOW() WHERE id = ?',
                    ['answered', inquiryId]
                );

                // 4. 커밋 (트랜잭션 종료)
                await connection.commit();

                // 5. 이메일 발송 (트랜잭션 외부)
                let emailResult = { success: false, error: '이메일 발송 실패' };
                try {
                    emailResult = await sendInquiryReplyEmail(inquiry.email, {
                        customerName: `${inquiry.last_name} ${inquiry.first_name}`.trim(),
                        inquiryNumber: inquiry.inquiry_number || `#${inquiryId}`,
                        replyMessage: replyMessage
                    });
                } catch (emailError) {
                    console.error('❌ 이메일 발송 오류:', emailError);
                    emailResult = { success: false, error: emailError.message };
                }

                // 6. 이메일 결과 기록
                connection = await mysql.createConnection(dbConfig);
                await connection.execute(
                    `UPDATE inquiry_replies 
                    SET email_status = ?, email_error = ? 
                    WHERE id = ?`,
                    [
                        emailResult.success ? 'sent' : 'failed',
                        emailResult.success ? null : (emailResult.error || '이메일 발송 실패'),
                        replyId
                    ]
                );
                await connection.end();

                res.json({
                    success: true,
                    message: '답변이 전송되었습니다.',
                    reply: {
                        id: replyId,
                        email_status: emailResult.success ? 'sent' : 'failed'
                    }
                });

            } catch (error) {
                await connection.rollback();
                throw error;
            }

        } catch (error) {
            console.error('❌ 답변 전송 오류:', error);
            res.status(500).json({
                success: false,
                message: '답변 전송 중 오류가 발생했습니다.'
            });
        } finally {
            if (connection) await connection.end();
        }
    }
);

/**
 * PUT /api/admin/inquiries/:id/status
 * 상태 변경
 */
router.put('/admin/inquiries/:id/status',
    authenticateToken,
    requireAdmin,
    verifyCSRF,
    [
        body('status').isIn(['new', 'in_progress', 'answered', 'closed']).withMessage('올바른 상태가 아닙니다.')
    ],
    async (req, res) => {
        let connection;
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const inquiryId = parseInt(req.params.id, 10);
            const status = req.body.status;

            if (isNaN(inquiryId)) {
                return res.status(400).json({
                    success: false,
                    message: '올바른 문의 ID가 아닙니다.'
                });
            }

            connection = await mysql.createConnection(dbConfig);

            const [result] = await connection.execute(
                'UPDATE inquiries SET status = ?, updated_at = NOW() WHERE id = ?',
                [status, inquiryId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: '문의를 찾을 수 없습니다.'
                });
            }

            res.json({
                success: true,
                message: '상태가 변경되었습니다.'
            });

        } catch (error) {
            console.error('❌ 상태 변경 오류:', error);
            res.status(500).json({
                success: false,
                message: '상태 변경 중 오류가 발생했습니다.'
            });
        } finally {
            if (connection) await connection.end();
        }
    }
);

/**
 * PUT /api/admin/inquiries/:id/memo
 * 관리자 메모 저장
 */
router.put('/admin/inquiries/:id/memo',
    authenticateToken,
    requireAdmin,
    verifyCSRF,
    [
        body('memo').optional().trim().isLength({ max: 5000 }).withMessage('메모는 5000자 이하여야 합니다.')
    ],
    async (req, res) => {
        let connection;
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    message: errors.array()[0].msg
                });
            }

            const inquiryId = parseInt(req.params.id, 10);
            const memo = req.body.memo ? escapeHtml(req.body.memo.trim()) : null;

            if (isNaN(inquiryId)) {
                return res.status(400).json({
                    success: false,
                    message: '올바른 문의 ID가 아닙니다.'
                });
            }

            connection = await mysql.createConnection(dbConfig);

            const [result] = await connection.execute(
                'UPDATE inquiries SET admin_memo = ?, updated_at = NOW() WHERE id = ?',
                [memo, inquiryId]
            );

            if (result.affectedRows === 0) {
                return res.status(404).json({
                    success: false,
                    message: '문의를 찾을 수 없습니다.'
                });
            }

            res.json({
                success: true,
                message: '메모가 저장되었습니다.'
            });

        } catch (error) {
            console.error('❌ 메모 저장 오류:', error);
            res.status(500).json({
                success: false,
                message: '메모 저장 중 오류가 발생했습니다.'
            });
        } finally {
            if (connection) await connection.end();
        }
    }
);

/**
 * GET /api/admin/inquiries/stats
 * 통계 조회
 */
router.get('/admin/inquiries/stats', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        const [stats] = await connection.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
                SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress_count,
                SUM(CASE WHEN status = 'answered' THEN 1 ELSE 0 END) as answered_count,
                SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_count,
                SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as today_count
            FROM inquiries`
        );

        res.json({
            success: true,
            stats: stats[0]
        });

    } catch (error) {
        console.error('❌ 통계 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '통계를 불러오는데 실패했습니다.'
        });
    } finally {
        if (connection) await connection.end();
    }
});

module.exports = router;

