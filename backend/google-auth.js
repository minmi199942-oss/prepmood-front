const { OAuth2Client } = require('google-auth-library');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

class GoogleAuthService {
    constructor() {
        this.client = new OAuth2Client(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET,
            process.env.GOOGLE_CALLBACK_URL
        );
    }

    // Google ID 토큰 검증
    async verifyGoogleToken(idToken) {
        try {
            const ticket = await this.client.verifyIdToken({
                idToken: idToken,
                audience: process.env.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();
            return {
                success: true,
                user: {
                    googleId: payload.sub,
                    email: payload.email,
                    name: payload.name,
                    picture: payload.picture,
                    emailVerified: payload.email_verified
                }
            };
        } catch (error) {
            console.error('Google 토큰 검증 실패:', error);
            return {
                success: false,
                error: 'Invalid Google token'
            };
        }
    }

    // Google 사용자를 데이터베이스에서 찾거나 생성
    async findOrCreateGoogleUser(googleUser) {
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME
        });

        try {
            // 기존 사용자 찾기
            const [existingUsers] = await connection.execute(
                'SELECT * FROM users WHERE google_id = ? OR email = ?',
                [googleUser.googleId, googleUser.email]
            );

            if (existingUsers.length > 0) {
                const user = existingUsers[0];
                
                // Google ID가 없으면 업데이트
                if (!user.google_id) {
                    await connection.execute(
                        'UPDATE users SET google_id = ? WHERE id = ?',
                        [googleUser.googleId, user.id]
                    );
                }

                await connection.end();
                return {
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        googleId: googleUser.googleId,
                        profilePicture: googleUser.picture
                    }
                };
            } else {
                // 새 사용자 생성
                const hashedPassword = await bcrypt.hash(googleUser.googleId, 10);
                
                const [result] = await connection.execute(
                    'INSERT INTO users (email, name, password, google_id, profile_picture, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
                    [
                        googleUser.email,
                        googleUser.name,
                        hashedPassword,
                        googleUser.googleId,
                        googleUser.picture,
                        googleUser.emailVerified ? 1 : 0
                    ]
                );

                await connection.end();
                return {
                    success: true,
                    user: {
                        id: result.insertId,
                        email: googleUser.email,
                        name: googleUser.name,
                        googleId: googleUser.googleId,
                        profilePicture: googleUser.picture
                    }
                };
            }
        } catch (error) {
            console.error('Google 사용자 처리 실패:', error);
            await connection.end();
            return {
                success: false,
                error: 'Database error'
            };
        }
    }

    // JWT 토큰 생성 (기존 시스템과 호환)
    generateJWT(user) {
        const jwt = require('jsonwebtoken');
        return jwt.sign(
            {
                userId: user.id,
                email: user.email,
                name: user.name
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );
    }
}

module.exports = GoogleAuthService;
