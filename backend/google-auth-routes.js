const express = require('express');
const router = express.Router();
const GoogleAuthService = require('./google-auth');

const googleAuth = new GoogleAuthService();

// Google 로그인 처리
router.post('/auth/google/login', async (req, res) => {
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

        // 추가 정보 입력 필요 여부 확인
        const needsAdditionalInfo = !userResult.user.lastName || !userResult.user.firstName;

        res.json({
            success: true,
            message: 'Google 로그인 성공',
            user: userResult.user,
            token: jwtToken,
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

// Google 로그인 상태 확인
router.get('/auth/google/status', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 사용자 정보 조회
        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        const [users] = await connection.execute(
            'SELECT user_id, email, first_name, last_name, google_id, profile_picture FROM users WHERE user_id = ?',
            [decoded.userId]
        );

        await connection.end();

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
        res.status(401).json({
            success: false,
            error: 'Invalid token'
        });
    }
});

// 추가 정보 입력 API
router.post('/auth/complete-profile', async (req, res) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');
        
        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'No token provided'
            });
        }

        const jwt = require('jsonwebtoken');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        const { lastName, firstName, phone, birth } = req.body;

        if (!lastName || !firstName) {
            return res.status(400).json({
                success: false,
                error: '성과 이름은 필수 항목입니다.'
            });
        }

        const mysql = require('mysql2/promise');
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        // 사용자 정보 업데이트
        await connection.execute(
            'UPDATE users SET last_name = ?, first_name = ?, phone = ?, birth = ? WHERE user_id = ?',
            [lastName, firstName, phone || null, birth || null, decoded.userId]
        );

        await connection.end();

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
    }
});

module.exports = router;
