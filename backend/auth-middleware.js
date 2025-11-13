// auth-middleware.js - JWT 인증 미들웨어

const jwt = require('jsonwebtoken');
const Logger = require('./logger');

function isAdminEmail(email) {
    if (!email) return false;

    const adminEmailsString = process.env.ADMIN_EMAILS || '';
    const adminEmails = adminEmailsString
        .split(',')
        .map(e => e.toLowerCase().trim())
        .filter(e => e.length > 0);

    if (adminEmails.length === 0) {
        Logger.log('[SECURITY] ⚠️ ADMIN_EMAILS 환경변수가 설정되지 않았습니다!', {
            env: process.env.NODE_ENV
        });
    }

    return adminEmails.includes(email.toLowerCase().trim());
}

/**
 * JWT 토큰 인증 미들웨어
 * - httpOnly 쿠키에서 accessToken 추출
 * - JWT 토큰 검증
 * - 검증 성공 시 req.user에 사용자 정보 저장
 */
function authenticateToken(req, res, next) {
    // 1. 쿠키에서 토큰 추출
    const token = req.cookies?.accessToken;
    
    if (!token) {
        return res.status(401).json({
            success: false,
            message: '로그인이 필요합니다.',
            code: 'NO_TOKEN'
        });
    }

    try {
        // 2. JWT 토큰 검증
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // 3. 검증 성공 - req.user에 저장
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            name: decoded.name
        };
        
        console.log(`✅ 인증 성공: ${decoded.email} (ID: ${decoded.userId})`);
        next();
        
    } catch (error) {
        console.error('❌ JWT 검증 실패:', error.message);
        
        // 토큰 만료
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: '세션이 만료되었습니다. 다시 로그인해주세요.',
                code: 'TOKEN_EXPIRED',
                expired: true
            });
        }
        
        // 유효하지 않은 토큰
        if (error.name === 'JsonWebTokenError') {
            return res.status(403).json({
                success: false,
                message: '유효하지 않은 인증 정보입니다.',
                code: 'INVALID_TOKEN'
            });
        }
        
        // 기타 오류
        return res.status(403).json({
            success: false,
            message: '인증에 실패했습니다.',
            code: 'AUTH_FAILED'
        });
    }
}

/**
 * 선택적 인증 미들웨어
 * - 토큰이 있으면 검증하고 req.user에 저장
 * - 토큰이 없어도 next() 호출 (에러 없음)
 * - 로그인/비로그인 모두 접근 가능한 API에 사용
 */
function optionalAuth(req, res, next) {
    const token = req.cookies?.accessToken;
    
    if (!token) {
        // 토큰 없음 - 비로그인 상태로 진행
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            name: decoded.name
        };
        console.log(`✅ 선택적 인증 성공: ${decoded.email}`);
    } catch (error) {
        // 토큰이 유효하지 않아도 에러 없이 진행
        console.log(`⚠️ 선택적 인증 실패 (무시): ${error.message}`);
        req.user = null;
    }
    
    next();
}

/**
 * JWT 토큰 생성 헬퍼 함수
 * @param {Object} user - 사용자 정보 { id, email, name }
 * @param {String} expiresIn - 만료 시간 (기본: 7일)
 * @returns {String} JWT 토큰
 */
function generateToken(user, expiresIn = '7d') {
    return jwt.sign(
        {
            userId: user.id,
            email: user.email,
            name: user.name
        },
        process.env.JWT_SECRET,
        { expiresIn }
    );
}

/**
 * httpOnly 쿠키에 JWT 토큰 설정
 * @param {Object} res - Express response 객체
 * @param {String} token - JWT 토큰
 * @param {Number} maxAge - 쿠키 만료 시간 (밀리초, 기본: 7일)
 */
function setTokenCookie(res, token, maxAge = 7 * 24 * 60 * 60 * 1000) {
    res.cookie('accessToken', token, {
        httpOnly: true,      // JavaScript로 접근 불가 (XSS 방지)
        secure: process.env.NODE_ENV === 'production',  // HTTPS만 (프로덕션)
        sameSite: 'none',  // 크로스 오리진 쿠키 허용
        maxAge: maxAge,      // 쿠키 만료 시간
        path: '/'            // 모든 경로에서 사용
    });
    
    console.log(`✅ JWT 쿠키 설정 완료 (만료: ${maxAge / 1000 / 60 / 60}시간)`);
}

/**
 * JWT 토큰 쿠키 삭제 (로그아웃)
 * @param {Object} res - Express response 객체
 */
function clearTokenCookie(res) {
    res.clearCookie('accessToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
        path: '/'
    });
    
    console.log('✅ JWT 쿠키 삭제 완료 (로그아웃)');
}

/**
 * 관리자 권한 확인 미들웨어
 * - authenticateToken 이후에 사용해야 함 (req.user 필요)
 * - .env의 ADMIN_EMAILS에 등록된 이메일만 접근 허용
 * - 로그 기록으로 접근 시도 추적
 * 
 * @example
 * app.get('/api/admin/orders', authenticateToken, requireAdmin, (req, res) => {...})
 */
function requireAdmin(req, res, next) {
    // 1단계: 로그인 확인 (authenticateToken에서 설정한 req.user 확인)
    if (!req.user || !req.user.email) {
        Logger.log('[SECURITY] 관리자 페이지 접근 시도 - 미인증', {
            ip: req.ip,
            path: req.path,
            method: req.method
        });
        
        return res.status(401).json({
            success: false,
            message: '로그인이 필요합니다.',
            code: 'AUTHENTICATION_REQUIRED'
        });
    }
    
    const userEmail = req.user.email;

    if (!isAdminEmail(userEmail)) {
        Logger.log('[SECURITY] 🚫 관리자 페이지 접근 거부 - 권한 없음', {
            email: userEmail,
            ip: req.ip,
            path: req.path,
            method: req.method,
            timestamp: new Date().toISOString()
        });
        
        return res.status(403).json({
            success: false,
            message: '관리자 권한이 없습니다.',
            code: 'FORBIDDEN'
        });
    }
    
    // 4단계: 접근 허용
    Logger.log('[SECURITY] ✅ 관리자 페이지 접근 허용', {
        email: userEmail,
        ip: req.ip,
        path: req.path,
        method: req.method
    });
    
    next();
}

module.exports = {
    authenticateToken,
    optionalAuth,
    generateToken,
    setTokenCookie,
    clearTokenCookie,
    requireAdmin,
    isAdminEmail
};

