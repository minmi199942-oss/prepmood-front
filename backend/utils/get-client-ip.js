/**
 * 클라이언트 IP 주소 추출 유틸리티
 * 
 * Cloudflare → Nginx → Node.js 환경에서 정확한 클라이언트 IP 추출
 * 우선순위: CF-Connecting-IP > X-Forwarded-For (첫 번째) > X-Real-IP > req.ip
 * 
 * @param {Object} req - Express request 객체
 * @returns {string} 클라이언트 IP 주소
 */
function getClientIp(req) {
    // 1. Cloudflare 헤더 (최우선)
    if (req.headers['cf-connecting-ip']) {
        return req.headers['cf-connecting-ip'].trim();
    }
    
    // 2. X-Forwarded-For (첫 번째 IP만 사용)
    // 형식: "client_ip, proxy1_ip, proxy2_ip"
    if (req.headers['x-forwarded-for']) {
        const ips = req.headers['x-forwarded-for'].split(',');
        const firstIp = ips[0].trim();
        if (firstIp) {
            return firstIp;
        }
    }
    
    // 3. X-Real-IP (Nginx 설정)
    if (req.headers['x-real-ip']) {
        return req.headers['x-real-ip'].trim();
    }
    
    // 4. Express req.ip (fallback)
    if (req.ip) {
        return req.ip;
    }
    
    // 5. 최종 fallback
    return 'unknown';
}

module.exports = { getClientIp };

