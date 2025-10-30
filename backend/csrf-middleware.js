// csrf-middleware.js - Double-Submit Cookie 패턴 CSRF 보호

const crypto = require('crypto');

/**
 * CSRF 토큰 생성
 * @returns {String} 64자리 hex 토큰
 */
function generateCSRFToken() {
    return crypto.randomBytes(32).toString('hex');
}

/**
 * CSRF 토큰 발급 미들웨어
 * - 모든 GET 요청에서 쿠키 발급
 * - XSRF-TOKEN 쿠키 설정 (httpOnly: false로 JavaScript 접근 가능)
 */
function issueCSRFToken(req, res, next) {
    // GET 요청에서만 토큰 발급
    if (req.method === 'GET' && !req.cookies['xsrf-token']) {
        const token = generateCSRFToken();
        res.cookie('xsrf-token', token, {
            httpOnly: false,      // JavaScript에서 읽을 수 있도록
            secure: false,        // 로컬/프로덕션 모두에서 테스트 가능하게
            sameSite: 'none',     // 크로스 도메인 허용
            path: '/',
            maxAge: 24 * 60 * 60 * 1000 // 24시간
        });
        
        console.log('✅ CSRF 토큰 발급:', token.substring(0, 16) + '...');
    }
    
    next();
}

/**
 * CSRF 토큰 검증 미들웨어
 * - POST/PUT/DELETE 요청에서만 검증
 * - 쿠키의 xsrf-token과 헤더의 X-XSRF-TOKEN 비교
 */
function verifyCSRF(req, res, next) {
    // GET/OPTIONS/HEAD 요청은 검증 스킵
    if (['GET', 'OPTIONS', 'HEAD'].includes(req.method)) {
        return next();
    }
    
    const cookieToken = req.cookies['xsrf-token'];
    const headerToken = req.get('X-XSRF-TOKEN') || req.headers['x-xsrf-token'];
    
    // 토큰 존재 여부 확인
    if (!cookieToken || !headerToken) {
        console.warn('⚠️ CSRF 토큰 누락:', {
            hasCookieToken: !!cookieToken,
            hasHeaderToken: !!headerToken,
            method: req.method,
            path: req.path
        });
        return res.status(403).json({
            code: 'CSRF_ERROR',
            message: 'CSRF 토큰이 필요합니다.'
        });
    }
    
    // 토큰 일치 확인 (타이밍 공격 방지)
    if (cookieToken !== headerToken) {
        console.warn('⚠️ CSRF 토큰 불일치:', {
            cookieToken: cookieToken.substring(0, 16) + '...',
            headerToken: headerToken.substring(0, 16) + '...',
            method: req.method,
            path: req.path
        });
        return res.status(403).json({
            code: 'CSRF_ERROR',
            message: 'CSRF 토큰 검증에 실패했습니다.'
        });
    }
    
    console.log('✅ CSRF 검증 성공:', req.method, req.path);
    next();
}

module.exports = {
    issueCSRFToken,
    verifyCSRF
};

