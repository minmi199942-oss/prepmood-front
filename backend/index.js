const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const { sendVerificationEmail, testConnection } = require('./mailer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// CORS 설정 (특정 도메인만 허용) - helmet보다 먼저 설정
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['http://localhost:8000', 'http://localhost:3000', 'http://127.0.0.1:8000', 'http://127.0.0.1:3000', 'http://127.0.0.1:5500', 'http://localhost:5500'];

console.log('Allowed origins:', allowedOrigins);

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With']
}));

// 보안 미들웨어
app.use(helmet({
    contentSecurityPolicy: false, // CORS와 호환성을 위해 비활성화
    crossOriginEmbedderPolicy: false
}));

// Rate Limiting (API 남용 방지)
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 10, // 15분당 최대 10회 요청
    message: {
        success: false,
        message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.'
    }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 100 // 15분당 최대 100회 요청
});

app.use('/api/send-verification', apiLimiter); // 이메일 발송은 더 엄격하게
app.use('/api/', generalLimiter); // 다른 API는 일반적으로

app.use(express.json({ limit: '10mb' })); // JSON 크기 제한

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// 인증 코드 저장소 (실제 환경에서는 Redis 또는 DB 사용 권장)
const verificationCodes = new Map();

// 로그인 시도 제한 (실제 환경에서는 Redis 사용 권장)
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_TIME = 15 * 60 * 1000; // 15분

// 6자리 랜덤 인증 코드 생성
const generateVerificationCode = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
};

// 이메일 인증 코드 발송 API
app.post('/api/send-verification', [
    // 입력값 검증 미들웨어
    body('email')
        .isEmail()
        .withMessage('올바른 이메일 형식이 아닙니다.')
        .normalizeEmail()
        .isLength({ max: 254 })
        .withMessage('이메일이 너무 깁니다.')
], async (req, res) => {
    try {
        // 검증 결과 확인
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const { email } = req.body;

        // 인증 코드 생성
        const verificationCode = generateVerificationCode();
        
        // 인증 코드 저장 (10분 후 만료)
        verificationCodes.set(email, {
            code: verificationCode,
            expires: Date.now() + 10 * 60 * 1000 // 10분
        });

        // 이메일 전송
        const result = await sendVerificationEmail(email, verificationCode);
        
        if (result.success) {
            console.log(`✅ 인증 코드 발송 성공: ${email} -> ${verificationCode}`);
            res.json({ 
                success: true, 
                message: '인증 코드가 발송되었습니다.' 
            });
        } else {
            console.error(`❌ 인증 코드 발송 실패: ${email}`);
            console.error('📋 발송 실패 상세:', JSON.stringify(result, null, 2));
            res.status(500).json({ 
                success: false, 
                message: '이메일 발송에 실패했습니다.' 
            });
        }

    } catch (error) {
        console.error('❌ 서버 오류 발생:');
        console.error('📋 에러 상세:', JSON.stringify(error, null, 2));
        console.error('🔍 에러 메시지:', error.message);
        console.error('📍 에러 스택:', error.stack);
        
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// 인증 코드 확인 API
app.post('/api/verify-code', [
    // 입력값 검증 미들웨어
    body('email')
        .isEmail()
        .withMessage('올바른 이메일 형식이 아닙니다.')
        .normalizeEmail(),
    body('code')
        .isNumeric()
        .withMessage('인증 코드는 숫자만 입력 가능합니다.')
        .isLength({ min: 6, max: 6 })
        .withMessage('인증 코드는 6자리여야 합니다.')
], async (req, res) => {
    try {
        // 검증 결과 확인
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const { email, code } = req.body;

        // 저장된 인증 코드 확인
        const storedData = verificationCodes.get(email);
        
        if (!storedData) {
            return res.status(400).json({ 
                success: false, 
                message: '인증 코드를 먼저 요청해주세요.' 
            });
        }

        // 만료 시간 확인
        if (Date.now() > storedData.expires) {
            verificationCodes.delete(email);
            return res.status(400).json({ 
                success: false, 
                message: '인증 코드가 만료되었습니다.' 
            });
        }

        // 인증 코드 확인
        if (storedData.code !== code) {
            return res.status(400).json({ 
                success: false, 
                message: '인증 코드가 일치하지 않습니다.' 
            });
        }

        // 인증 성공 - 인증 상태만 표시 (코드는 회원가입 완료 시 삭제)
        storedData.verified = true;
        verificationCodes.set(email, storedData);
        
        console.log(`✅ 이메일 인증 성공: ${email}`);
        res.json({ 
            success: true, 
            message: '이메일 인증이 완료되었습니다.' 
        });

    } catch (error) {
        console.error('❌ 서버 오류:', error.message); // 민감정보 제외
        res.status(500).json({ 
            success: false, 
            message: '서버 오류가 발생했습니다.' 
        });
    }
});

// 회원가입 API
app.post('/api/register', [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }),
    body('name').notEmpty().trim(),
    body('birthdate').isISO8601(),
    body('phone').optional().trim()
], async (req, res) => {
    try {
        console.log('📋 회원가입 요청 데이터:', JSON.stringify(req.body, null, 2));
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ 유효성 검사 실패:', errors.array());
            return res.status(400).json({
                success: false,
                message: '입력 정보를 확인해주세요.',
                errors: errors.array()
            });
        }

        const { email, password, name, birthdate, phone } = req.body;

        // 이메일이 인증되었는지 확인
        console.log('📧 인증된 이메일 목록:', Array.from(verificationCodes.keys()));
        console.log('📧 요청된 이메일:', email);
        console.log('📧 인증 상태:', verificationCodes.has(email));
        
        const verificationData = verificationCodes.get(email);
        if (!verificationData || !verificationData.verified) {
            console.log('❌ 이메일 인증되지 않음');
            return res.status(400).json({
                success: false,
                message: '이메일 인증을 먼저 완료해주세요.'
            });
        }

        // MySQL 연결
        console.log('🔗 MySQL 연결 시도 중...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공');

        // users 테이블이 존재하는지 확인하고 생성
        try {
            console.log('🔨 users 테이블 확인/생성 시도 중...');
            await connection.execute(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    password VARCHAR(255) NOT NULL,
                    name VARCHAR(255) NOT NULL,
                    birthdate DATE NOT NULL,
                    phone VARCHAR(50),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            `);
            console.log('✅ users 테이블 확인/생성 완료');
        } catch (tableError) {
            console.error('❌ 테이블 생성 오류:', tableError.message);
            console.error('❌ 테이블 생성 상세 오류:', tableError);
            throw tableError; // 오류를 다시 던져서 상위에서 처리
        }

        // 이메일 중복 확인
        console.log('🔍 이메일 중복 확인 중...');
        const [existingUsers] = await connection.execute(
            'SELECT id FROM users WHERE email = ?',
            [email]
        );
        console.log('📧 기존 사용자 수:', existingUsers.length);

        if (existingUsers.length > 0) {
            console.log('❌ 이미 가입된 이메일');
            await connection.end();
            return res.status(400).json({
                success: false,
                message: '이미 가입된 이메일입니다.'
            });
        }

        // 비밀번호 해시화 (bcrypt 사용)
        console.log('🔐 비밀번호 해시화 중...');
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);
        console.log('✅ 비밀번호 해시화 완료');

        // 사용자 정보 저장 (전화번호는 선택사항)
        const phoneValue = phone || null;
        console.log('💾 사용자 정보 저장 중...', { email, name, birthdate, phone: phoneValue });
        await connection.execute(
            'INSERT INTO users (email, password, name, birthdate, phone, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
            [email, hashedPassword, name, birthdate, phoneValue]
        );
        console.log('✅ 사용자 정보 저장 완료');

        await connection.end();

        // 인증 코드 삭제
        verificationCodes.delete(email);

        console.log(`✅ 회원가입 성공: ${email}`);
        res.json({
            success: true,
            message: '회원가입이 완료되었습니다.'
        });

    } catch (error) {
        console.error('❌ 회원가입 오류:', error.message);
        console.error('📋 에러 스택:', error.stack);
        res.status(500).json({
            success: false,
            message: '회원가입 중 오류가 발생했습니다.'
        });
    }
});

// 서버 상태 확인 API
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: '서버가 정상적으로 작동 중입니다.',
        timestamp: new Date().toISOString()
    });
});

// 서버 시작
app.listen(PORT, async () => {
    console.log(`🚀 서버가 포트 ${PORT}에서 실행 중입니다.`);
    
    // SMTP 연결 테스트
    console.log('📧 SMTP 서버 연결 테스트 중...');
    const smtpConnected = await testConnection();
    
    if (smtpConnected) {
        console.log('✅ 이메일 서비스 준비 완료!');
    } else {
        console.log('❌ 이메일 서비스 연결 실패 - .env 설정을 확인해주세요.');
    }

        // MySQL 연결 테스트
        try {
            console.log('🔍 MySQL 연결 설정 디버깅:');
            console.log(`📋 DB_HOST: ${process.env.DB_HOST}`);
            console.log(`📋 DB_USER: ${process.env.DB_USER}`);
            console.log(`📋 DB_PASSWORD: ${process.env.DB_PASSWORD ? '설정됨' : '설정되지 않음'}`);
            console.log(`📋 DB_NAME: ${process.env.DB_NAME}`);
            console.log(`📋 DB_PORT: ${process.env.DB_PORT || '3306'}`);
            
            const connection = await mysql.createConnection(dbConfig);
            await connection.ping();
            console.log('✅ MySQL 연결 성공!');
            await connection.end();
        } catch (error) {
            console.log('❌ MySQL 연결 실패: 데이터베이스 연결을 확인해주세요');
            console.log('📋 에러 상세:', JSON.stringify(error, null, 2));
            console.log('🔍 에러 메시지:', error.message);
            console.log('📍 에러 스택:', error.stack);
            console.log('🔧 연결 설정:', JSON.stringify(dbConfig, null, 2));
        }
});
