const express = require('express');
const router = express.Router();
const GoogleAuthService = require('./google-auth');
const rateLimit = require('express-rate-limit');
const { authenticateToken, setTokenCookie } = require('./auth-middleware');

const googleAuth = new GoogleAuthService();

// Rate limiting 미들웨어
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: process.env.NODE_ENV === 'production' ? 100 : 1000, // 프로덕션: 100회, 개발: 1000회로 증가
    message: {
        success: false,
        error: '너무 많은 요청입니다. 15분 후에 다시 시도해주세요.'
    }
});

// Google 로그인 처리
router.post('/auth/google/login', authLimiter, async (req, res) => {
    try {
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({
                success: false,
                error: 'Google ID token is required'
            });
        }

        // Google 토큰 검증
        const tokenResult = await googleAuth.verifyGoogleToken(idToken);
        
        if (!tokenResult.success) {
            return res.status(401).json({
                success: false,
                error: tokenResult.error
            });
        }

        // 사용자 찾기 또는 생성
        const userResult = await googleAuth.findOrCreateGoogleUser(tokenResult.user);
        
        if (!userResult.success) {
            return res.status(500).json({
                success: false,
                error: userResult.error
            });
        }

        // JWT 토큰 생성
        const jwtToken = googleAuth.generateJWT(userResult.user);

        // httpOnly 쿠키로 토큰 설정
        setTokenCookie(res, jwtToken);

        // 추가 정보 입력 필요 여부 확인
        const needsAdditionalInfo = !userResult.user.lastName || !userResult.user.firstName;

        res.json({
            success: true,
            message: 'Google 로그인 성공',
            user: userResult.user,
            // ✅ token은 httpOnly 쿠키로 전송되므로 응답 본문에 포함하지 않음
            needsAdditionalInfo: needsAdditionalInfo
        });

    } catch (error) {
        console.error('Google 로그인 오류:', error);
        res.status(500).json({
            success: false,
            error: 'Google 로그인 처리 중 오류가 발생했습니다.'
        });
    }
});

// Google 로그인 상태 확인 (새로운 인증 미들웨어 사용)
router.get('/auth/google/status', authenticateToken, async (req, res) => {
    let connection;
    try {
        // 사용자 정보 조회
        const mysql = require('mysql2/promise');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [users] = await connection.execute(
            'SELECT user_id, email, first_name, last_name, google_id, profile_picture FROM users WHERE user_id = ?',
            [req.user.userId]
        );

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: users[0]
        });

    } catch (error) {
        console.error('Google 로그인 상태 확인 오류:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error'
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// 추가 정보 입력 API
router.post('/auth/complete-profile', authLimiter, async (req, res) => {
    let connection;
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const jwt = require('jsonwebtoken');
        let decoded;
        
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (jwtError) {
            if (jwtError.name === 'TokenExpiredError') {
                return res.status(401).json({
                    success: false,
                    error: 'Token expired',
                    expired: true
                });
            }
            return res.status(401).json({
                success: false,
                error: 'Invalid token'
            });
        }
        
        const { lastName, firstName, phone, birth } = req.body;

        // 입력 값 검증
        if (!lastName || !firstName) {
            return res.status(400).json({
                success: false,
                error: '성과 이름은 필수 항목입니다.'
            });
        }

        // XSS 방지: HTML 태그 제거
        const sanitize = (str) => str.replace(/<[^>]*>/g, '').trim();
        const sanitizedLastName = sanitize(lastName);
        const sanitizedFirstName = sanitize(firstName);

        // 이름 길이 검증
        if (sanitizedLastName.length > 50 || sanitizedFirstName.length > 50) {
            return res.status(400).json({
                success: false,
                error: '이름이 너무 깁니다.'
            });
        }

        // 이름 형식 검증 (한글, 영문, 공백, 하이픈, 아포스트로피 허용)
        if (!/^[가-힣a-zA-Z\s'-]+$/.test(sanitizedLastName) || !/^[가-힣a-zA-Z\s'-]+$/.test(sanitizedFirstName)) {
            return res.status(400).json({
                success: false,
                error: '이름에는 한글, 영문, 하이픈(-), 아포스트로피(\')만 입력 가능합니다.'
            });
        }

        // 전화번호 형식 검증 (선택적)
        if (phone && !/^[0-9-]{10,15}$/.test(phone)) {
            return res.status(400).json({
                success: false,
                error: '유효하지 않은 전화번호 형식입니다.'
            });
        }

        // 생년월일 형식 검증 (선택적)
        if (birth) {
            const birthDate = new Date(birth);
            const today = new Date();
            today.setHours(23, 59, 59, 999); // 오늘 끝까지 허용
            const minDate = new Date('1900-01-01');
            
            if (isNaN(birthDate.getTime()) || birthDate > today || birthDate < minDate) {
                return res.status(400).json({
                    success: false,
                    error: '유효하지 않은 생년월일입니다.'
                });
            }
        }

        const mysql = require('mysql2/promise');
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // 사용자 정보 업데이트 (sanitized 값 사용)
        const [result] = await connection.execute(
            'UPDATE users SET last_name = ?, first_name = ?, phone = ?, birth = ? WHERE user_id = ?',
            [sanitizedLastName, sanitizedFirstName, phone || null, birth || null, decoded.userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                success: false,
                error: '사용자를 찾을 수 없습니다.'
            });
        }

        res.json({
            success: true,
            message: '추가 정보가 저장되었습니다.'
        });

    } catch (error) {
        console.error('추가 정보 저장 오류:', error);
        res.status(500).json({
            success: false,
            error: '정보 저장 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

module.exports = router;
