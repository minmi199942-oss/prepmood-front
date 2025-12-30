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
function setTokenCookie(res, token, req = null, maxAge = 7 * 24 * 60 * 60 * 1000) {
    // 프로덕션 환경 감지
    const isProduction = process.env.NODE_ENV === 'production';
    
    // HTTPS 감지 (프록시 환경 고려)
    let isSecure = isProduction;
    if (req) {
        const forwardedProto = req.get('x-forwarded-proto');
        isSecure = isSecure || 
                   req.protocol === 'https' || 
                   forwardedProto === 'https' ||
                   req.secure;
    }
    
    // 쿠키 옵션 설정
    // sameSite: 'lax' - 같은 사이트 요청에 적합 (cross-site 불필요)
    const cookieOptions = {
        httpOnly: true,      // JavaScript로 접근 불가 (XSS 방지)
        secure: isSecure,   // HTTPS에서만 전송 (프로덕션)
        sameSite: 'lax',    // 같은 사이트 요청에 적합
        maxAge: maxAge,     // 쿠키 만료 시간
        path: '/'           // 모든 경로에서 사용
    };
    
    // www/non-www 호환성을 위해 도메인 범위 확대 (프로덕션에서만)
    // 주의: domain: '.prepmood.kr'는 "엄격화"가 아니라 "범위 확대" (보안/범위 트레이드오프)
    if (isProduction && req) {
        const host = req.get('host') || '';
        if (host === 'prepmood.kr' || host === 'www.prepmood.kr') {
            cookieOptions.domain = '.prepmood.kr';
        }
    }
    
    res.cookie('accessToken', token, cookieOptions);
    
    console.log(`✅ JWT 쿠키 설정 완료 (만료: ${maxAge / 1000 / 60 / 60}시간, secure: ${isSecure})`);
}

/**
 * JWT 토큰 쿠키 삭제 (로그아웃)
 * @param {Object} res - Express response 객체
 */
function clearTokenCookie(res, req = null) {
    const isProduction = process.env.NODE_ENV === 'production';
    
    let isSecure = isProduction;
    if (req) {
        const forwardedProto = req.get('x-forwarded-proto');
        isSecure = isSecure || 
                   req.protocol === 'https' || 
                   forwardedProto === 'https' ||
                   req.secure;
    }
    
    const cookieOptions = {
        httpOnly: true,
        secure: isSecure,
        sameSite: 'lax',
        path: '/'
    };
    
    if (isProduction && req) {
        const host = req.get('host') || '';
        if (host === 'prepmood.kr' || host === 'www.prepmood.kr') {
            cookieOptions.domain = '.prepmood.kr';
        }
    }
    
    res.clearCookie('accessToken', cookieOptions);
    
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

/**
 * returnTo 검증 함수 (Open Redirect 방지)
 * - 내부 경로만 허용
 * - 화이트리스트 기반 검증
 * 
 * @param {String} returnTo - 리다이렉트할 경로
 * @returns {String|null} - 검증된 경로 또는 null
 */
function validateReturnTo(returnTo) {
    if (!returnTo || typeof returnTo !== 'string') return null;
    if (returnTo.length > 200) return null;

    // 내부 경로만 허용
    if (!returnTo.startsWith('/')) return null;
    if (returnTo.startsWith('//')) return null;     // protocol-relative 차단
    if (returnTo.includes('\\')) return null;       // windows path 차단
    if (returnTo.includes('\0')) return null;        // 널 바이트 차단
    if (returnTo.includes('://')) return null;       // 명시적 외부 스킴 차단

    // ✅ MVP 화이트리스트 (의도치 않은 내부 이동 방지)
    const allowed =
        returnTo === '/' ||
        returnTo === '/index.html' ||
        returnTo === '/my-profile.html' ||
        returnTo === '/my-warranties.html' ||
        returnTo === '/my-orders.html' ||
        returnTo === '/my-reservations.html' ||
        returnTo.startsWith('/a/');  // /a/:token 형식 (쿼리 포함 가능)

    return allowed ? returnTo : null;
}

/**
 * HTML 페이지용 인증 미들웨어
 * - 토큰 형식 검증 먼저 수행 (returnTo에 이상한 값 방지)
 * - 비로그인 시 login.html로 리다이렉트 (returnTo 포함)
 * - 로그인 상태면 next() 호출
 * 
 * @param {Object} req - Express request 객체
 * @param {Object} res - Express response 객체
 * @param {Function} next - Express next 함수
 */
function requireAuthForHTML(req, res, next) {
    // ✅ 1. 토큰 파싱: req.path에서 직접 파싱 (정규식에서 \? 제거)
    if (req.path.startsWith('/a/')) {
        const pathMatch = req.path.match(/^\/a\/([a-zA-Z0-9]{20})(?:\/|$)/);
        const token = pathMatch ? pathMatch[1] : null;
        
        if (!token || !/^[a-zA-Z0-9]{20}$/.test(token)) {
            Logger.warn('[AUTH] 잘못된 토큰 형식:', token ? token.substring(0, 4) + '...' : 'null');
            // ✅ 3. status code 400 추가
            return res.status(400).render('fake', {
                title: '가품 경고 - Pre.p Mood'
            });
        }
    }
    
    const jwtToken = req.cookies?.accessToken;
    
    if (!jwtToken) {
        // ✅ returnTo: req.originalUrl 그대로 사용 (쿼리 포함)
        const returnTo = req.originalUrl || req.path;
        
        // ✅ URLSearchParams로 안전하게 조립
        const isQrAuth = req.path.startsWith('/a/');
        const loginParams = new URLSearchParams();
        loginParams.set('returnTo', returnTo);
        if (isQrAuth) {
            loginParams.set('reason', 'qr_auth');
        }
        
        console.log('📋 [AUTH] 비로그인 리다이렉트:', { 
            returnTo, 
            originalUrl: req.originalUrl, 
            path: req.path,
            reason: isQrAuth ? 'qr_auth' : null
        });
        
        return res.redirect(`/login.html?${loginParams.toString()}`);
    }
    
    try {
        const decoded = jwt.verify(jwtToken, process.env.JWT_SECRET);
        req.user = {
            userId: decoded.userId,
            email: decoded.email,
            name: decoded.name
        };
        next();
    } catch (error) {
        // ✅ 토큰 만료 시에도 동일하게 처리
        const returnTo = req.originalUrl || req.path;
        
        const isQrAuth = req.path.startsWith('/a/');
        const loginParams = new URLSearchParams();
        loginParams.set('returnTo', returnTo);
        if (isQrAuth) {
            loginParams.set('reason', 'qr_auth');
        }
        
        Logger.log('[AUTH] 토큰 만료 리다이렉트:', { 
            returnTo, 
            originalUrl: req.originalUrl, 
            path: req.path,
            reason: isQrAuth ? 'qr_auth' : null
        });
        
        return res.redirect(`/login.html?${loginParams.toString()}`);
    }
}

module.exports = {
    authenticateToken,
    optionalAuth,
    generateToken,
    setTokenCookie,
    clearTokenCookie,
    requireAdmin,
    isAdminEmail,
    validateReturnTo,
    requireAuthForHTML
};

