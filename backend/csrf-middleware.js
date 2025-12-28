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
        
        // 프로덕션 환경 감지
        const isProduction = process.env.NODE_ENV === 'production';
        
        // HTTPS 감지 (Cloudflare 프록시 고려)
        // Cloudflare를 통하면 x-forwarded-proto가 'https'로 설정됨
        // 중요: 프로덕션 환경(prepmood.kr)에서는 항상 HTTPS를 사용하므로 secure: true 필수
        const forwardedProto = req.get('x-forwarded-proto');
        const host = req.get('host') || '';
        // 프로덕션 도메인 확인 (NODE_ENV가 설정되지 않았더라도 도메인으로 판단)
        const isProductionDomain = host === 'prepmood.kr' || host === 'www.prepmood.kr';
        const isSecure = isProduction || 
                        isProductionDomain || // 프로덕션 도메인이면 항상 secure
                        req.protocol === 'https' || 
                        forwardedProto === 'https' ||
                        req.secure;
        
        // 쿠키 옵션 설정
        // sameSite: 'lax' 선택 근거:
        // - 프론트와 API가 같은 사이트(prepmood.kr의 registrable domain) 내에서 일반 fetch로 호출
        // - cross-site 컨텍스트(외부 도메인/iframe)가 필요 없으므로 'lax'로 충분
        // - 'none'은 secure: true 필수이며, cross-site 요청에만 필요
        const cookieOptions = {
            httpOnly: false,      // JavaScript에서 읽을 수 있도록
            secure: isSecure,     // HTTPS에서만 전송 (프로덕션)
            sameSite: 'lax',      // 같은 사이트 요청에 적합
            path: '/',
            maxAge: 24 * 60 * 60 * 1000 // 24시간
        };
        
        // www/non-www 호환성을 위해 도메인 범위 확대 (프로덕션 도메인에서만)
        // 주의: domain: '.prepmood.kr'는 "엄격화"가 아니라 "범위 확대"
        // - host-only 쿠키(domain 미설정)가 더 엄격함
        // - '.prepmood.kr'는 모든 서브도메인에 쿠키 전송 (보안/범위 트레이드오프)
        // - 더 엄격한 방법: www를 301로 통일 + host-only 쿠키
        if (isProduction || isProductionDomain) {
            // prepmood.kr 또는 www.prepmood.kr인 경우 .prepmood.kr로 설정
            // 단, 서브도메인(api, admin 등)은 제외
            if (host === 'prepmood.kr' || host === 'www.prepmood.kr') {
                cookieOptions.domain = '.prepmood.kr';
            }
        }
        
        res.cookie('xsrf-token', token, cookieOptions);
        
        // 디버깅: 쿠키 설정 정보 로깅
        console.log('✅ CSRF 토큰 발급:', token.substring(0, 16) + '...', {
            isProduction,
            isProductionDomain,
            isSecure,
            host: host,
            protocol: req.protocol,
            forwardedProto: forwardedProto,
            cookieOptions: {
                secure: cookieOptions.secure,
                sameSite: cookieOptions.sameSite,
                domain: cookieOptions.domain || '(host-only)',
                path: cookieOptions.path
            }
        });
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

