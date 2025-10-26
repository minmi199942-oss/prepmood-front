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
            console.log('🔍 Google 토큰 검증 성공:', {
                googleId: payload.sub,
                email: payload.email,
                name: payload.name,
                emailVerified: payload.email_verified
            });
            
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
        let connection;
        
        try {
            connection = await mysql.createConnection({
                host: process.env.DB_HOST,
                user: process.env.DB_USER,
                password: process.env.DB_PASSWORD,
                database: process.env.DB_NAME
            });

            // 기존 사용자 찾기 (Google ID와 이메일 모두 확인)
            console.log('🔍 사용자 검색:', {
                googleId: googleUser.googleId,
                email: googleUser.email
            });
            
            const [existingUsers] = await connection.execute(
                'SELECT user_id, email, first_name, last_name, phone, birth, google_id, profile_picture FROM users WHERE google_id = ? OR email = ?',
                [googleUser.googleId, googleUser.email]
            );
            
            console.log('📋 검색 결과:', existingUsers);

            if (existingUsers.length > 0) {
                const user = existingUsers[0];
                console.log('👤 기존 사용자 발견:', {
                    userId: user.user_id,
                    email: user.email,
                    googleId: user.google_id,
                    firstName: user.first_name,
                    lastName: user.last_name
                });
                
                // 이메일이 일치하는 경우에만 기존 사용자 사용
                if (user.email === googleUser.email) {
                    console.log('✅ 이메일 일치 - 기존 사용자 사용');
                    // Google ID가 없으면 업데이트
                    if (!user.google_id) {
                        await connection.execute(
                            'UPDATE users SET google_id = ?, profile_picture = ? WHERE user_id = ?',
                            [googleUser.googleId, googleUser.picture, user.user_id]
                        );
                    }

                    return {
                        success: true,
                        user: {
                            id: user.user_id,
                            email: user.email,
                            name: user.first_name || user.last_name || googleUser.name,
                            firstName: user.first_name,
                            lastName: user.last_name,
                            phone: user.phone || null,
                            birthdate: user.birth || null,
                            googleId: googleUser.googleId,
                            profilePicture: googleUser.picture
                        }
                    };
                } else {
                    // 이메일이 다르면 새 사용자로 처리
                    console.log(`⚠️ Google ID 충돌: 기존 사용자 ${user.email}, 새 사용자 ${googleUser.email}`);
                    console.log('🔄 새 사용자로 처리');
                }
            } else {
                console.log('🆕 기존 사용자 없음 - 새 사용자 생성');
            }
            
            // 새 사용자 생성 (기존 사용자가 없거나 이메일이 다른 경우)
            console.log('📝 새 사용자 생성 중:', {
                email: googleUser.email,
                name: googleUser.name,
                googleId: googleUser.googleId
            });
            
            const hashedPassword = await bcrypt.hash(googleUser.googleId, 10);
            
            const [result] = await connection.execute(
                'INSERT INTO users (email, first_name, password_hash, google_id, profile_picture, email_verified, verified) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [
                    googleUser.email,
                    googleUser.name,
                    hashedPassword,
                    googleUser.googleId,
                    googleUser.picture,
                    googleUser.emailVerified ? 1 : 0,
                    1  // Google 로그인 사용자는 자동으로 인증됨
                ]
            );

            return {
                success: true,
                user: {
                    id: result.insertId,
                    email: googleUser.email,
                    name: googleUser.name,
                    phone: null,
                    birthdate: null,
                    googleId: googleUser.googleId,
                    profilePicture: googleUser.picture
                }
            };
        } catch (error) {
            console.error('Google 사용자 처리 실패:', error);
            return {
                success: false,
                error: '사용자 정보 처리 중 오류가 발생했습니다.'
            };
        } finally {
            if (connection) {
                await connection.end();
            }
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
