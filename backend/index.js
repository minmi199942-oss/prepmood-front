const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const helmet = require('helmet');
const { body, validationResult } = require('express-validator');
const bcrypt = require('bcrypt');
const cookieParser = require('cookie-parser');
const { sendVerificationEmail, testConnection } = require('./mailer');
const { authenticateToken, optionalAuth, generateToken, setTokenCookie, clearTokenCookie, requireAdmin, isAdminEmail } = require('./auth-middleware');
const { issueCSRFToken, verifyCSRF } = require('./csrf-middleware');
const { cleanupIdempotency } = require('./idempotency-cleanup');
const Logger = require('./logger');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy 설정
// 현재 구조: Cloudflare → Nginx → Node.js
// - Nginx가 같은 서버(loopback)에서 실행되므로 'loopback'만 신뢰해도 충분
// - Nginx가 X-Forwarded-Proto 헤더를 설정하므로, 쿠키 설정 로직은 forwarded-proto를 우선적으로 사용
// 주의: req.secure/req.protocol도 체크하므로, trust proxy가 loopback이면 이 값들은 http로 인식될 수 있음
// 하지만 forwarded-proto를 우선 체크하므로 실제 동작에는 문제 없음
// 더 일관성 있게 하려면: 모든 secure 판단을 forwarded-proto 기반으로 통일하거나, trust proxy를 1/true로 설정
app.set('trust proxy', 'loopback');

// CORS 설정 (특정 도메인만 허용) - helmet보다 먼저 설정
const allowedOrigins = process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()) : 
    [
        'http://localhost:8000', 
        'http://localhost:3000', 
        'http://127.0.0.1:8000', 
        'http://127.0.0.1:3000', 
        'http://127.0.0.1:5500', 
        'http://localhost:5500', 
        'https://prepmood.kr',
        'https://www.prepmood.kr'  // www 서브도메인 추가
    ];

Logger.log('Allowed origins:', allowedOrigins);

app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Origin', 'X-Requested-With', 'X-User-Email', 'X-XSRF-TOKEN', 'X-Idempotency-Key']
}));

// 보안 미들웨어
app.use(helmet({
    contentSecurityPolicy: false, // CORS와 호환성을 위해 비활성화
    crossOriginEmbedderPolicy: false
}));

// Rate Limiting (API 남용 방지) - 완화된 설정
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 500, // 15분당 최대 500회 요청으로 증가
    message: {
        success: false,
        message: '너무 많은 요청입니다. 잠시 후 다시 시도해주세요.'
    },
    standardHeaders: true, // `RateLimit-*` 헤더 반환
    legacyHeaders: false, // `X-RateLimit-*` 헤더 비활성화
    keyGenerator: (req) => {
        // IPv6 안전하게 처리
        return ipKeyGenerator(req.ip || '');
    }
});

const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 500, // 15분당 최대 500회 요청으로 증가
    keyGenerator: (req) => {
        // IPv6 안전하게 처리
        return ipKeyGenerator(req.ip || '');
    }
});

app.use('/api/send-verification', apiLimiter); // 이메일 발송은 더 엄격하게
app.use('/api/', generalLimiter); // 다른 API는 일반적으로

app.use(express.json({ limit: '10mb' })); // JSON 크기 제한
app.use(cookieParser()); // 쿠키 파서 추가 (JWT 토큰용) - CSRF 미들웨어보다 앞에!

// CSRF 보호 설정 (cookieParser 뒤에 와야 쿠키 읽기 가능)
app.use(issueCSRFToken); // GET 요청에서 CSRF 토큰 발급

// 정적 파일 서빙 (이미지 업로드)
// 주의: 이미지는 /var/www/html/uploads/products/에 저장되므로 상위 디렉토리에서 서빙
const path = require('path');
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// QR 코드 이미지 서빙 (정품 인증용)
// 운영 환경에서는 보안상 공개하지 않음 (ZIP 다운로드로만 제공)
if (process.env.NODE_ENV !== 'production') {
    app.use('/qrcodes', express.static(path.join(__dirname, '..', 'output_qrcodes')));
}

// 정적 파일 서빙 (폰트 등)
app.use('/static', express.static(path.join(__dirname, '..', 'prep_server', 'static')));

// Nginx를 우회한 직접 접근 차단 (관리자 HTML 파일)
// 루트의 admin*.html만 차단, 서브디렉토리는 허용
app.all(/^\/admin(-[^/]+)?\.html$/, (req, res) => {
    res.status(403).send('Forbidden');
});

// EJS 템플릿 엔진 설정 (정품 인증 페이지용)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// 정품 인증 라우트 (EJS 템플릿 사용)
const authRoutes = require('./auth-routes');
app.use('/', authRoutes);

// 정품 인증 DB 초기화 (서버 시작 시)
const { initDatabase } = require('./auth-db');
initDatabase();

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

// 관리자 로그인 시도 제한
const adminLoginAttempts = new Map();
const ADMIN_MAX_LOGIN_ATTEMPTS = 5;
const ADMIN_LOCKOUT_TIME = 15 * 60 * 1000; // 15분

const adminEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(email => email.toLowerCase().trim())
    .filter(email => email.length > 0);
const adminPasswordHash = process.env.ADMIN_PASSWORD_HASH || null;
const adminPlainPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_KEY || null;

async function verifyAdminPassword(inputPassword) {
    if (adminPasswordHash) {
        try {
            return await bcrypt.compare(inputPassword, adminPasswordHash);
        } catch (error) {
            Logger.log('[ADMIN][LOGIN] 관리자 비밀번호 해시 비교 중 오류', { error: error.message });
            return false;
        }
    }
    if (adminPlainPassword) {
        return inputPassword === adminPlainPassword;
    }
    Logger.log('[ADMIN][LOGIN] 관리자 비밀번호가 설정되지 않았습니다.');
    return false;
}

function getAdminAttemptRecord(key) {
    const record = adminLoginAttempts.get(key);
    if (!record) return null;
    if (record.lockedUntil && record.lockedUntil <= Date.now()) {
        adminLoginAttempts.delete(key);
        return null;
    }
    return record;
}

function registerAdminFailure(key) {
    const now = Date.now();
    const record = getAdminAttemptRecord(key) || { count: 0, lockedUntil: null };
    record.count += 1;
    if (record.count >= ADMIN_MAX_LOGIN_ATTEMPTS) {
        record.lockedUntil = now + ADMIN_LOCKOUT_TIME;
        record.count = 0;
    }
    adminLoginAttempts.set(key, record);
    return record.lockedUntil;
}

function resetAdminAttempts(key) {
    if (adminLoginAttempts.has(key)) {
        adminLoginAttempts.delete(key);
    }
}

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

        // 이미 가입된 이메일인지 확인
        const connection = await mysql.createConnection(dbConfig);
        try {
            const [existingUsers] = await connection.execute(
                'SELECT user_id FROM users WHERE email = ?',
                [email]
            );

            if (existingUsers.length > 0) {
                Logger.log(`❌ 이미 가입된 이메일로 인증 코드 요청: ${email}`);
                return res.status(409).json({
                    success: false,
                    code: 'EMAIL_ALREADY_EXISTS',
                    message: '이미 가입된 이메일입니다.'
                });
            }
        } catch (dbError) {
            Logger.log('❌ DB 조회 중 오류:', dbError);
            return res.status(500).json({
                success: false,
                message: '서버 오류가 발생했습니다.'
            });
        } finally {
            await connection.end();
        }

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
            Logger.log(`✅ 인증 코드 발송 성공: ${email} -> ${verificationCode}`);
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
        
        Logger.log(`✅ 이메일 인증 성공: ${email}`);
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
        Logger.log('📋 회원가입 요청 데이터:', JSON.stringify(req.body, null, 2));
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ 유효성 검사 실패:', errors.array());
            return res.status(400).json({
                success: false,
                message: '입력 정보를 확인해주세요.',
                errors: errors.array()
            });
        }

        const { email, password, name, birthdate, phone, isUpdate } = req.body;

        // 업데이트 모드인지 확인
        if (isUpdate) {
            console.log('🔄 개인정보 업데이트 모드 - 이메일 인증 검사 건너뜀');
            // 업데이트 모드에서는 검증을 건너뛰고 바로 처리
            return await handleProfileUpdate(req, res, { email, name, birthdate, phone });
        }

        // 이메일이 인증되었는지 확인 (회원가입 모드만)
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

        // 기존 users 테이블 사용
        console.log('✅ 기존 users 테이블 사용');

        // 이메일 중복 확인
        console.log('🔍 이메일 중복 확인 중...');
        const [existingUsers] = await connection.execute(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );
        console.log('📧 기존 사용자 수:', existingUsers.length);

        if (existingUsers.length > 0) {
            console.log('❌ 이미 가입된 이메일');
            await connection.end();
            return res.status(409).json({
                success: false,
                code: 'EMAIL_ALREADY_EXISTS',
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
        const nameParts = name.split(' ');
        const lastName = nameParts[0] || '';
        const firstName = nameParts.slice(1).join(' ') || '';
        
        console.log('💾 사용자 정보 저장 중...', { email, lastName, firstName, birthdate, phone: phoneValue });
        await connection.execute(
            'INSERT INTO users (email, password_hash, last_name, first_name, birth, phone, verified) VALUES (?, ?, ?, ?, ?, ?, 1)',
            [email, hashedPassword, lastName, firstName, birthdate, phoneValue]
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

// 로그인 API
app.post('/api/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    let connection;
    try {
        console.log('📋 로그인 요청 데이터:', JSON.stringify(req.body, null, 2));
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ 유효성 검사 실패:', errors.array());
            return res.status(400).json({
                success: false,
                message: '이메일과 비밀번호를 확인해주세요.',
                errors: errors.array()
            });
        }

        const { email, password } = req.body;

        // MySQL 연결
        console.log('🔗 MySQL 연결 시도 중...');
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공');

        // 사용자 정보 조회
        console.log('🔍 사용자 정보 조회 중...');
        const [users] = await connection.execute(
            'SELECT user_id, membership_id, email, password_hash, name, phone, verified FROM users WHERE email = ?',
            [email]
        );
        console.log('📧 조회된 사용자 수:', users.length);

        if (users.length === 0) {
            console.log('❌ 사용자를 찾을 수 없음');
            return res.status(401).json({
                success: false,
                message: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }

        const user = users[0];

        // name 필드 처리 (name이 없으면 이메일 앞부분을 기본값으로)
        const userName = user.name || user.email.split('@')[0];

        // 이메일 인증 상태 확인
        if (!user.verified) {
            console.log('❌ 이메일 미인증');
            return res.status(401).json({
                success: false,
                message: '이메일 인증이 완료되지 않았습니다.'
            });
        }

        // 비밀번호 확인
        console.log('🔐 비밀번호 확인 중...');
        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        
        if (!passwordMatch) {
            console.log('❌ 비밀번호 불일치');
            return res.status(401).json({
                success: false,
                message: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }

        // JWT 토큰 생성
        const token = generateToken({
            id: user.user_id,
            email: user.email,
            name: userName
        });

        // httpOnly 쿠키로 토큰 설정
        setTokenCookie(res, token, req);

        // returnTo 처리: req.body에서 바로 검증 후 사용
        const { validateReturnTo } = require('./auth-middleware');
        const redirectTo = validateReturnTo(req.body?.returnTo) || '/';

        console.log(`✅ 로그인 성공: ${email}`);
        console.log(`📋 returnTo 처리:`, { 
            received: req.body?.returnTo, 
            validated: redirectTo 
        });
        res.json({
            success: true,
            message: '로그인에 성공했습니다.',
            redirectTo: redirectTo,  // 프론트에서 사용
            user: {
                id: user.user_id,
                membership_id: user.membership_id || null,
                email: user.email,
                name: userName,
                phone: user.phone || null
            }
            // ✅ token은 httpOnly 쿠키로 전송되므로 응답 본문에 포함하지 않음
        });

    } catch (error) {
        console.error('❌ 로그인 오류:', error.message);
        console.error('📋 에러 스택:', error.stack);
        res.status(500).json({
            success: false,
            message: '로그인 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// 관리자 로그인 API
app.post('/api/admin/login', [
    body('email').isEmail().withMessage('이메일 형식이 올바르지 않습니다.').normalizeEmail(),
    body('password').notEmpty().withMessage('비밀번호를 입력해주세요.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        if (!adminEmails.length) {
            Logger.log('[ADMIN][LOGIN] 실패 - ADMIN_EMAILS 미설정');
            return res.status(500).json({
                success: false,
                message: '관리자 계정이 설정되지 않았습니다.'
            });
        }

        const { email, password } = req.body;
        const normalizedEmail = email.toLowerCase().trim();

        if (!adminEmails.includes(normalizedEmail)) {
            Logger.log('[ADMIN][LOGIN] 실패 - 권한 없는 이메일', { email: normalizedEmail, ip: req.ip });
            return res.status(403).json({
                success: false,
                message: '관리자 권한이 없습니다.'
            });
        }

        const attemptKey = `admin:${normalizedEmail}`;
        const attemptRecord = getAdminAttemptRecord(attemptKey);
        if (attemptRecord && attemptRecord.lockedUntil) {
            const remainingMs = attemptRecord.lockedUntil - Date.now();
            if (remainingMs > 0) {
                const remainingMinutes = Math.ceil(remainingMs / 60000);
                return res.status(429).json({
                    success: false,
                    message: `로그인 시도가 잠시 제한되었습니다. ${remainingMinutes}분 후 다시 시도해주세요.`
                });
            }
        }

        const passwordValid = await verifyAdminPassword(password);
        if (!passwordValid) {
            const lockedUntil = registerAdminFailure(attemptKey);
            Logger.log('[ADMIN][LOGIN] 실패 - 비밀번호 불일치', { email: normalizedEmail, ip: req.ip });
            if (lockedUntil) {
                const remainingMinutes = Math.ceil((lockedUntil - Date.now()) / 60000);
                return res.status(429).json({
                    success: false,
                    message: `잘못된 비밀번호 입력이 반복되어 잠시 로그인할 수 없습니다. ${remainingMinutes}분 후 다시 시도해주세요.`
                });
            }
            return res.status(401).json({
                success: false,
                message: '이메일 또는 비밀번호가 올바르지 않습니다.'
            });
        }

        resetAdminAttempts(attemptKey);

        const token = generateToken({
            id: `admin:${normalizedEmail}`,
            email: normalizedEmail,
            name: 'Pre.p Mood Admin'
        }, '12h');

        // 12시간 유효한 쿠키
        setTokenCookie(res, token, req, 12 * 60 * 60 * 1000);

        Logger.log('[ADMIN][LOGIN] 성공', { email: normalizedEmail, ip: req.ip });
        res.json({
            success: true,
            message: '관리자 로그인에 성공했습니다.',
            email: normalizedEmail
        });
    } catch (error) {
        Logger.log('[ADMIN][LOGIN] 서버 오류', { error: error.message });
        res.status(500).json({
            success: false,
            message: '관리자 로그인 중 오류가 발생했습니다.'
        });
    }
});

// 개인정보 업데이트 전용 API (간단한 버전)
app.post('/api/update-profile-simple', async (req, res) => {
    try {
        console.log('📋 개인정보 업데이트 요청:', JSON.stringify(req.body, null, 2));
        
        const { email, name, birthdate } = req.body;

        // MySQL 연결
        console.log('🔗 MySQL 연결 시도 중...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공');

        // 사용자 존재 확인
        console.log('🔍 사용자 정보 조회 중...');
        const [users] = await connection.execute(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );
        console.log('👤 조회된 사용자 수:', users.length);

        if (users.length === 0) {
            console.log('❌ 사용자를 찾을 수 없음');
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        const userId = users[0].user_id;

        // 이름 분리 (성과 이름)
        const nameParts = name.split(' ');
        const lastName = nameParts[0] || '';
        const firstName = nameParts.slice(1).join(' ') || '';

        // 개인정보 업데이트
        console.log('📝 개인정보 업데이트 중...', { lastName, firstName, birthdate });
        await connection.execute(
            'UPDATE users SET last_name = ?, first_name = ?, birth = ? WHERE user_id = ?',
            [lastName, firstName, birthdate, userId]
        );
        console.log('✅ 개인정보 업데이트 완료');

        await connection.end();

        console.log(`✅ 개인정보 수정 성공: 사용자 ${userId}`);
        res.json({
            success: true,
            message: '개인정보가 성공적으로 변경되었습니다.'
        });

    } catch (error) {
        console.error('❌ 개인정보 수정 오류:', error.message);
        console.error('📋 에러 스택:', error.stack);
        res.status(500).json({
            success: false,
            message: '개인정보 변경 중 오류가 발생했습니다.'
        });
    }
});

// 개인정보 업데이트 처리 함수
async function handleProfileUpdate(req, res, { email, name, birthdate, phone }) {
    try {
        console.log('📝 개인정보 업데이트 처리 시작');
        
        // MySQL 연결
        console.log('🔗 MySQL 연결 시도 중...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공');

        // 사용자 존재 확인
        console.log('🔍 사용자 정보 조회 중...');
        const [users] = await connection.execute(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );
        console.log('👤 조회된 사용자 수:', users.length);

        if (users.length === 0) {
            console.log('❌ 사용자를 찾을 수 없음');
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        const userId = users[0].user_id;

        // 이름 분리 (성과 이름)
        const nameParts = name.split(' ');
        const lastName = nameParts[0] || '';
        const firstName = nameParts.slice(1).join(' ') || '';

        // 개인정보 업데이트
        console.log('📝 개인정보 업데이트 중...', { lastName, firstName, birthdate });
        await connection.execute(
            'UPDATE users SET last_name = ?, first_name = ?, birth = ? WHERE user_id = ?',
            [lastName, firstName, birthdate, userId]
        );
        console.log('✅ 개인정보 업데이트 완료');

        await connection.end();

        console.log(`✅ 개인정보 수정 성공: 사용자 ${userId}`);
        res.json({
            success: true,
            message: '개인정보가 성공적으로 변경되었습니다.'
        });

    } catch (error) {
        console.error('❌ 개인정보 수정 오류:', error.message);
        console.error('📋 에러 스택:', error.stack);
        res.status(500).json({
            success: false,
            message: '개인정보 변경 중 오류가 발생했습니다.'
        });
    }
}

// 이메일 수정 API
app.post('/api/update-email', [
    body('userId').isInt(),
    body('newEmail').isEmail().normalizeEmail()
], async (req, res) => {
    try {
        console.log('📋 이메일 수정 요청 데이터:', JSON.stringify(req.body, null, 2));
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ 유효성 검사 실패:', errors.array());
            return res.status(400).json({
                success: false,
                message: '올바른 이메일 주소를 입력해주세요.',
                errors: errors.array()
            });
        }

        const { userId, newEmail } = req.body;

        // MySQL 연결
        console.log('🔗 MySQL 연결 시도 중...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공');

        // 이메일 중복 확인
        console.log('🔍 이메일 중복 확인 중...');
        const [existingUsers] = await connection.execute(
            'SELECT user_id FROM users WHERE email = ? AND user_id != ?',
            [newEmail, userId]
        );
        console.log('📧 기존 사용자 수:', existingUsers.length);

        if (existingUsers.length > 0) {
            console.log('❌ 이미 사용 중인 이메일');
            await connection.end();
            return res.status(400).json({
                success: false,
                message: '이미 사용 중인 이메일입니다.'
            });
        }

        // 이메일 업데이트
        console.log('📧 이메일 업데이트 중...');
        await connection.execute(
            'UPDATE users SET email = ? WHERE user_id = ?',
            [newEmail, userId]
        );
        console.log('✅ 이메일 업데이트 완료');

        await connection.end();

        console.log(`✅ 이메일 수정 성공: 사용자 ${userId} -> ${newEmail}`);
        res.json({
            success: true,
            message: '이메일이 성공적으로 변경되었습니다.'
        });

    } catch (error) {
        console.error('❌ 이메일 수정 오류:', error.message);
        console.error('📋 에러 스택:', error.stack);
        res.status(500).json({
            success: false,
            message: '이메일 변경 중 오류가 발생했습니다.'
        });
    }
});

// 비밀번호 수정 API
app.post('/api/update-password', [
    body('userId').isInt(),
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 })
], async (req, res) => {
    try {
        console.log('📋 비밀번호 수정 요청 데이터:', JSON.stringify({...req.body, currentPassword: '[HIDDEN]', newPassword: '[HIDDEN]'}, null, 2));
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ 유효성 검사 실패:', errors.array());
            return res.status(400).json({
                success: false,
                message: '새 비밀번호는 8자 이상이어야 합니다.',
                errors: errors.array()
            });
        }

        const { userId, currentPassword, newPassword } = req.body;

        // MySQL 연결
        console.log('🔗 MySQL 연결 시도 중...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공');

        // 사용자 정보 조회
        console.log('🔍 사용자 정보 조회 중...');
        const [users] = await connection.execute(
            'SELECT user_id, password_hash FROM users WHERE user_id = ?',
            [userId]
        );
        console.log('👤 조회된 사용자 수:', users.length);

        if (users.length === 0) {
            console.log('❌ 사용자를 찾을 수 없음');
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        const user = users[0];

        // 현재 비밀번호 확인
        console.log('🔐 현재 비밀번호 확인 중...');
        const passwordMatch = await bcrypt.compare(currentPassword, user.password_hash);
        
        if (!passwordMatch) {
            console.log('❌ 현재 비밀번호 불일치');
            await connection.end();
            return res.status(401).json({
                success: false,
                message: '현재 비밀번호가 올바르지 않습니다.'
            });
        }

        // 새 비밀번호 해시화
        console.log('🔐 새 비밀번호 해시화 중...');
        const saltRounds = 10;
        const hashedNewPassword = await bcrypt.hash(newPassword, saltRounds);
        console.log('✅ 새 비밀번호 해시화 완료');

        // 비밀번호 업데이트
        console.log('🔐 비밀번호 업데이트 중...');
        await connection.execute(
            'UPDATE users SET password_hash = ? WHERE user_id = ?',
            [hashedNewPassword, userId]
        );
        console.log('✅ 비밀번호 업데이트 완료');

        await connection.end();

        console.log(`✅ 비밀번호 수정 성공: 사용자 ${userId}`);
        res.json({
            success: true,
            message: '비밀번호가 성공적으로 변경되었습니다.'
        });

    } catch (error) {
        console.error('❌ 비밀번호 수정 오류:', error.message);
        console.error('📋 에러 스택:', error.stack);
        res.status(500).json({
            success: false,
            message: '비밀번호 변경 중 오류가 발생했습니다.'
        });
    }
});

// 개인정보 수정 API
app.post('/api/update-profile', [
    body('userId').isInt(),
    body('name').notEmpty().trim(),
    body('phone').notEmpty().trim(),
    body('birthdate').isISO8601()
], async (req, res) => {
    try {
        console.log('📋 개인정보 수정 요청 데이터:', JSON.stringify(req.body, null, 2));
        
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.log('❌ 유효성 검사 실패:', errors.array());
            return res.status(400).json({
                success: false,
                message: '입력 정보를 확인해주세요.',
                errors: errors.array()
            });
        }

        const { userId, name, phone, birthdate } = req.body;

        // MySQL 연결
        console.log('🔗 MySQL 연결 시도 중...');
        const connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공');

        // 사용자 존재 확인
        console.log('🔍 사용자 존재 확인 중...');
        const [users] = await connection.execute(
            'SELECT user_id FROM users WHERE user_id = ?',
            [userId]
        );
        console.log('👤 조회된 사용자 수:', users.length);

        if (users.length === 0) {
            console.log('❌ 사용자를 찾을 수 없음');
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '사용자를 찾을 수 없습니다.'
            });
        }

        // 이름 분리 (성과 이름)
        // 개인정보 업데이트 (name, phone만 사용)
        console.log('📝 개인정보 업데이트 중...', { name, phone });
        await connection.execute(
            'UPDATE users SET name = ?, phone = ? WHERE user_id = ?',
            [name, phone, userId]
        );
        console.log('✅ 개인정보 업데이트 완료');

        await connection.end();

        console.log(`✅ 개인정보 수정 성공: 사용자 ${userId}`);
        res.json({
            success: true,
            message: '개인정보가 성공적으로 변경되었습니다.'
        });

    } catch (error) {
        console.error('❌ 개인정보 수정 오류:', error.message);
        console.error('📋 에러 스택:', error.stack);
        res.status(500).json({
            success: false,
            message: '개인정보 변경 중 오류가 발생했습니다.'
        });
    }
});

// ==================== 위시리스트 API ====================

// 위시리스트 토글 API (추가/삭제)
app.post('/api/wishlist/toggle', authenticateToken, [
    body('productId').notEmpty().trim().withMessage('상품 ID가 필요합니다.')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: errors.array()[0].msg
            });
        }

        const { productId } = req.body;
        const userEmail = req.user.email; // ✅ JWT 토큰에서 이메일 추출 (신뢰 가능)

        const connection = await mysql.createConnection(dbConfig);

        // 이미 위시리스트에 있는지 확인
        const [existing] = await connection.execute(
            'SELECT id FROM wishlists WHERE user_email = ? AND product_id = ?',
            [userEmail, productId]
        );

        let action;
        if (existing.length > 0) {
            // 제거
            await connection.execute(
                'DELETE FROM wishlists WHERE user_email = ? AND product_id = ?',
                [userEmail, productId]
            );
            action = 'removed';
            console.log(`🗑️ 위시리스트에서 제거: ${userEmail} - ${productId}`);
        } else {
            // 추가
            await connection.execute(
                'INSERT INTO wishlists (user_email, product_id) VALUES (?, ?)',
                [userEmail, productId]
            );
            action = 'added';
            console.log(`💝 위시리스트에 추가: ${userEmail} - ${productId}`);
        }

        await connection.end();

        res.json({
            success: true,
            action: action,
            message: action === 'added' ? '위시리스트에 추가되었습니다.' : '위시리스트에서 제거되었습니다.'
        });

    } catch (error) {
        console.error('❌ 위시리스트 토글 오류:', error.message);
        res.status(500).json({
            success: false,
            message: '위시리스트 처리 중 오류가 발생했습니다.'
        });
    }
});

// 위시리스트 상태 확인 API
app.get('/api/wishlist/check', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.query;
        const userEmail = req.user.email; // ✅ JWT 토큰에서 이메일 추출

        if (!productId) {
            return res.status(400).json({
                success: false,
                message: '상품 ID가 필요합니다.'
            });
        }

        const connection = await mysql.createConnection(dbConfig);

        const [existing] = await connection.execute(
            'SELECT id FROM wishlists WHERE user_email = ? AND product_id = ?',
            [userEmail, productId]
        );

        await connection.end();

        res.json({
            success: true,
            isInWishlist: existing.length > 0
        });

    } catch (error) {
        console.error('❌ 위시리스트 확인 오류:', error.message);
        res.status(500).json({
            success: false,
            message: '위시리스트 확인 중 오류가 발생했습니다.'
        });
    }
});

// 위시리스트 전체 조회 API
app.get('/api/wishlist', authenticateToken, async (req, res) => {
    try {
        const userEmail = req.user.email; // ✅ JWT 토큰에서 이메일 추출

        const connection = await mysql.createConnection(dbConfig);

        const [wishlists] = await connection.execute(
            'SELECT product_id, added_at FROM wishlists WHERE user_email = ? ORDER BY added_at DESC',
            [userEmail]
        );

        await connection.end();

        console.log(`📋 위시리스트 조회: ${userEmail} - ${wishlists.length}개 항목`);

        res.json({
            success: true,
            wishlists: wishlists,
            count: wishlists.length
        });

    } catch (error) {
        console.error('❌ 위시리스트 조회 오류:', error.message);
        res.status(500).json({
            success: false,
            message: '위시리스트 조회 중 오류가 발생했습니다.'
        });
    }
});

// ==================== 인증 관련 API ====================

// 로그인 상태 확인 API (JWT 토큰 검증)
app.get('/api/auth/me', authenticateToken, async (req, res) => {
    try {
        // 사용자 상세 정보 조회
        const connection = await mysql.createConnection(dbConfig);
        const [users] = await connection.execute(
            'SELECT user_id, membership_id, email, name, phone FROM users WHERE user_id = ?',
            [req.user.userId]
        );
        connection.end();

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: '사용자 정보를 찾을 수 없습니다.'
            });
        }

        const user = users[0];
        res.json({
            success: true,
            user: {
                userId: user.user_id,
                membership_id: user.membership_id || null,
                email: user.email,
                name: user.name || '',
                phone: user.phone || null
            }
        });
    } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        res.status(500).json({
            success: false,
            message: '사용자 정보 조회 중 오류가 발생했습니다.'
        });
    }
});

// 로그아웃 API
app.post('/api/logout', (req, res) => {
    clearTokenCookie(res, req);
    res.json({
        success: true,
        message: '로그아웃되었습니다.'
    });
});

// ==================== 기타 API ====================

// 서버 상태 확인 API
app.get('/api/health', (req, res) => {
    res.json({ 
        success: true, 
        message: '서버가 정상적으로 작동 중입니다.',
        timestamp: new Date().toISOString()
    });
});

// Google 소셜 로그인 라우트
const googleAuthRoutes = require('./google-auth-routes');
const productRoutes = require('./product-routes');
const orderRoutes = require('./order-routes');
const paymentsRoutes = require('./payments-routes');
const inquiryRoutes = require('./inquiry-routes');
const deployWebhook = require('./deploy-webhook');

app.use('/api', googleAuthRoutes);
app.use('/api', productRoutes);
app.use('/api', deployWebhook);
app.use('/api', orderRoutes);
app.use('/api', inquiryRoutes);

// 장바구니 라우트
const cartRoutes = require('./cart-routes');
app.use('/api', cartRoutes);

// 결제 라우트
app.use('/api', paymentsRoutes);

// QR 코드 다운로드 라우트 (관리자 전용)
const qrcodeDownloadRoutes = require('./qrcode-download-routes');
app.use('/', qrcodeDownloadRoutes);

// 서버 시작
app.listen(PORT, async () => {
    // 프로덕션 환경 validation (서버 시작 후 즉시 체크)
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.WEBHOOK_SHARED_SECRET || process.env.WEBHOOK_SHARED_SECRET === 'your_webhook_secret_here') {
            console.error('❌ PRODUCTION 환경에서는 WEBHOOK_SHARED_SECRET이 필수입니다!');
            console.error('❌ .env 파일에 WEBHOOK_SHARED_SECRET을 설정해주세요.');
            console.error('⚠️  개발 모드로 계속 실행합니다...');
        } else {
            console.log('✅ 프로덕션 환경 validation 통과');
        }
    }
    
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

    // Idempotency 정리 배치 (매일 자정에 실행)
    setInterval(async () => {
        try {
            await cleanupIdempotency();
        } catch (error) {
            console.error('❌ Idempotency 정리 배치 실행 오류:', error.message);
        }
    }, 24 * 60 * 60 * 1000); // 24시간마다 실행
    
    console.log('✅ Idempotency 정리 배치 스케줄러 등록 완료 (24시간마다 실행)');
});

// ============================================
// 관리자 API
// ============================================

/**
 * GET /api/admin/check
 * 관리자 권한 확인 API
 * - 프론트엔드에서 페이지 로드 시 권한 체크용
 */
app.get('/api/admin/check', authenticateToken, requireAdmin, (req, res) => {
    res.json({
        success: true,
        admin: true,
        email: req.user.email,
        name: req.user.name
    });
});

app.get('/api/admin/status', optionalAuth, (req, res) => {
    const email = req.user?.email || null;
    const admin = isAdminEmail(email);

    res.json({
        success: true,
        authenticated: !!email,
        admin
    });
});

app.get('/api/auth/status', optionalAuth, (req, res) => {
    if (req.user) {
        return res.json({
            success: true,
            authenticated: true,
            user: {
                userId: req.user.userId,
                email: req.user.email,
                name: req.user.name
            }
        });
    }

    return res.json({
        success: true,
        authenticated: false,
        user: null
    });
});

/**
 * GET /api/admin/orders
 * 주문 목록 조회 (관리자 전용)
 * 
 * 쿼리 파라미터:
 * - status: 주문 상태 필터 (pending, confirmed, processing, shipping, delivered, cancelled)
 * - search: 주문번호 또는 고객명 검색
 * - date_from: 시작 날짜 (YYYY-MM-DD)
 * - date_to: 종료 날짜 (YYYY-MM-DD)
 * - limit: 페이지 크기 (기본: 50)
 * - offset: 오프셋 (기본: 0)
 */
app.get('/api/admin/orders', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    let query;
    let params;
    let countQuery;
    let countParams;
    try {
        const { 
            status, 
            search, 
            date_from, 
            date_to, 
            limit = 50, 
            offset = 0 
        } = req.query;

        const limitParsed = parseInt(limit, 10);
        const offsetParsed = parseInt(offset, 10);
        const limitNum = Number.isInteger(limitParsed) && limitParsed > 0 ? Math.min(limitParsed, 200) : 50;
        const offsetNum = Number.isInteger(offsetParsed) && offsetParsed >= 0 ? offsetParsed : 0;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 기본 쿼리 (실제 DB 컬럼명에 맞춤)
        query = `
            SELECT 
                o.order_id,
                o.order_number,
                o.user_id,
                o.total_price,
                o.status,
                CONCAT(COALESCE(o.shipping_first_name, ''), ' ', COALESCE(o.shipping_last_name, '')) as shipping_name,
                o.shipping_phone,
                o.shipping_address,
                o.shipping_postal_code as shipping_zipcode,
                o.shipping_country,
                o.order_date as created_at,
                o.order_date as updated_at,
                u.email as customer_email,
                u.first_name,
                u.last_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.user_id
            WHERE 1=1
        `;
        
        params = [];
        
        // 필터링
        if (status) {
            query += ' AND o.status = ?';
            params.push(status);
        }
        
        if (search) {
            query += ' AND (o.order_number LIKE ? OR o.shipping_first_name LIKE ? OR o.shipping_last_name LIKE ? OR u.email LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        
        if (date_from) {
            query += ' AND DATE(o.order_date) >= ?';
            params.push(date_from);
        }
        
        if (date_to) {
            query += ' AND DATE(o.order_date) <= ?';
            params.push(date_to);
        }
        
        // 정렬 및 페이지네이션
        query += ` ORDER BY o.order_date DESC LIMIT ${limitNum} OFFSET ${offsetNum}`;
        
        const [orders] = await connection.execute(query, params);
        
        // 각 주문의 상품 정보 가져오기 (실제 DB 컬럼명 사용)
        for (let order of orders) {
            const [items] = await connection.execute(
                `SELECT 
                    product_id,
                    product_name,
                    size,
                    color,
                    quantity,
                    unit_price as price
                FROM order_items
                WHERE order_id = ?`,
                [order.order_id]
            );
            order.items = items;
        }
        
        // 전체 주문 수 (페이지네이션용)
        countQuery = 'SELECT COUNT(*) as total FROM orders o LEFT JOIN users u ON o.user_id = u.user_id WHERE 1=1';
        countParams = [];
        
        if (status) {
            countQuery += ' AND o.status = ?';
            countParams.push(status);
        }
        
        if (search) {
            countQuery += ' AND (o.order_number LIKE ? OR o.shipping_first_name LIKE ? OR o.shipping_last_name LIKE ? OR u.email LIKE ?)';
            const searchPattern = `%${search}%`;
            countParams.push(searchPattern, searchPattern, searchPattern, searchPattern);
        }
        
        if (date_from) {
            countQuery += ' AND DATE(o.order_date) >= ?';
            countParams.push(date_from);
        }
        
        if (date_to) {
            countQuery += ' AND DATE(o.order_date) <= ?';
            countParams.push(date_to);
        }
        
        const [countResult] = await connection.execute(countQuery, countParams);
        await connection.end();
        connection = null;
        
        res.json({
            success: true,
            orders,
            pagination: {
                total: countResult[0].total,
                limit: limitNum,
                offset: offsetNum,
                hasMore: offsetNum + orders.length < countResult[0].total
            }
        });
        
    } catch (error) {
        if (connection) await connection.end();
        Logger.error('[ADMIN] 주문 목록 조회 실패', { 
            error: error.message,
            query,
            params,
            countQuery,
            countParams
        });
        res.status(500).json({ 
            success: false, 
            message: '주문 목록을 불러오는데 실패했습니다.' 
        });
    }
});

/**
 * GET /api/admin/orders/:orderId
 * 주문 상세 조회 (관리자 전용)
 */
app.get('/api/admin/orders/:orderId', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        
        connection = await mysql.createConnection(dbConfig);
        
        // 주문 기본 정보
        const [orders] = await connection.execute(
            `SELECT 
                o.*,
                u.email as customer_email,
                u.first_name,
                u.last_name,
                u.phone as customer_phone
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.user_id
            WHERE o.order_id = ?`,
            [orderId]
        );
        
        if (orders.length === 0) {
            await connection.end();
            return res.status(404).json({ 
                success: false, 
                message: '주문을 찾을 수 없습니다.' 
            });
        }
        
        const order = orders[0];
        
        // 주문 상품 정보 (실제 DB 컬럼명 사용)
        const [items] = await connection.execute(
            `SELECT 
                product_id,
                product_name,
                size,
                color,
                quantity,
                unit_price as price
            FROM order_items 
            WHERE order_id = ?`,
            [orderId]
        );
        
        order.items = items;
        
        // 결제 정보
        const [payments] = await connection.execute(
            `SELECT * FROM payments WHERE order_number = ? ORDER BY created_at DESC LIMIT 1`,
            [order.order_number]
        );
        
        if (payments.length > 0) {
            order.payment = payments[0];
        }
        
        await connection.end();
        
        res.json({ 
            success: true, 
            order 
        });
        
    } catch (error) {
        if (connection) await connection.end();
        Logger.error('[ADMIN] 주문 상세 조회 실패', { 
            orderId: req.params.orderId, 
            error: error.message 
        });
        res.status(500).json({ 
            success: false, 
            message: '주문 정보를 불러오는데 실패했습니다.' 
        });
    }
});

/**
 * PUT /api/admin/orders/:orderId/status
 * 주문 상태 변경 (관리자 전용)
 * 
 * Body:
 * - status: 변경할 상태 (pending, confirmed, processing, shipping, delivered, cancelled)
 * - notes: 관리자 메모 (선택사항)
 */
app.put('/api/admin/orders/:orderId/status', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        const { status, notes } = req.body;
        
        // 허용된 상태 값 검증
        const allowedStatuses = ['pending', 'confirmed', 'processing', 'shipping', 'delivered', 'cancelled'];
        if (!status || !allowedStatuses.includes(status)) {
            return res.status(400).json({ 
                success: false, 
                message: '유효하지 않은 상태 값입니다.',
                allowedStatuses 
            });
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // 주문 존재 확인
        const [orders] = await connection.execute(
            'SELECT order_id, status FROM orders WHERE order_id = ?',
            [orderId]
        );
        
        if (orders.length === 0) {
            await connection.end();
            return res.status(404).json({ 
                success: false, 
                message: '주문을 찾을 수 없습니다.' 
            });
        }
        
        const oldStatus = orders[0].status;
        
        // 상태 업데이트
        await connection.execute(
            `UPDATE orders 
             SET status = ?
             WHERE order_id = ?`,
            [status, orderId]
        );
        
        await connection.end();
        
        Logger.log('[ADMIN] 주문 상태 변경', {
            orderId,
            oldStatus,
            newStatus: status,
            admin: req.user.email,
            notes
        });
        
        // TODO: 상태에 따라 고객에게 이메일 발송 (Phase 2)
        
        res.json({ 
            success: true, 
            message: '주문 상태가 변경되었습니다.',
            oldStatus,
            newStatus: status
        });
        
    } catch (error) {
        if (connection) await connection.end();
        Logger.error('[ADMIN] 주문 상태 변경 실패', { 
            orderId: req.params.orderId, 
            error: error.message 
        });
        res.status(500).json({ 
            success: false, 
            message: '주문 상태 변경에 실패했습니다.' 
        });
    }
});
