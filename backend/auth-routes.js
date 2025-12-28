/**
 * 정품 인증 라우트 모듈
 * 
 * 역할:
 * - /a/:token 라우트 처리
 * - 3가지 케이스 처리:
 *   1. 토큰 없음 → 가품 경고 (fake.html)
 *   2. 첫 인증 (status=0) → 정품 인증 성공 (success.html)
 *   3. 재인증 (status>=1) → 이미 인증된 제품 (warning.html)
 */

const express = require('express');
const router = express.Router();
const { rateLimit } = require('express-rate-limit');
const { 
    getProductByToken, 
    updateFirstVerification, 
    updateReVerification,
    revokeToken
} = require('./auth-db');
const Logger = require('./logger');
const { requireAuthForHTML } = require('./auth-middleware');

// 이상 패턴 감지용 (메모리 기반, 운영에서는 Redis 권장)
const suspiciousPatterns = {
    failedTokens: new Map(), // IP별 가품 시도 횟수
    firstVerifications: new Map(), // 첫 인증 추적 (token -> {ip, time, count})
    recentVerifications: [] // 최근 인증 기록 (최대 1000개)
};

// 이상 패턴 감지 함수
function detectSuspiciousPattern(token, ip, isFirstVerification, isFake) {
    const now = new Date();
    const hour = now.getHours();
    
    // 1. 가품 시도 패턴 감지
    if (isFake) {
        const attempts = suspiciousPatterns.failedTokens.get(ip) || 0;
        suspiciousPatterns.failedTokens.set(ip, attempts + 1);
        
        if (attempts + 1 > 10) {
            Logger.warn(`[SECURITY-ALERT] ${ip}에서 비정상적인 가품 시도 다수 감지: ${attempts + 1}회`);
            // TODO: 관리자에게 알림 발송 (이메일/슬랙 등)
        }
    }
    
    // 2. 첫 인증 이상 패턴 감지
    if (isFirstVerification) {
        const record = suspiciousPatterns.firstVerifications.get(token) || { ip, time: now, count: 0 };
        record.count++;
        suspiciousPatterns.firstVerifications.set(token, record);
        
        // 짧은 시간 내 다른 IP에서 재인증 시도
        if (record.count > 1 && record.ip !== ip) {
            const timeDiff = (now - record.time) / 1000; // 초
            if (timeDiff < 300) { // 5분 이내
                Logger.warn(`[SECURITY-ALERT] 토큰 ${token.substring(0, 4)}...가 ${timeDiff}초 내 다른 IP(${record.ip} → ${ip})에서 재인증 시도`);
            }
        }
        
        // 새벽 시간대 대량 첫 인증 (2시~6시)
        if (hour >= 2 && hour < 6) {
            const recentCount = suspiciousPatterns.recentVerifications.filter(
                r => r.isFirst && r.hour >= 2 && r.hour < 6
            ).length;
            
            if (recentCount > 5) {
                Logger.warn(`[SECURITY-ALERT] 새벽 시간대(${hour}시) 첫 인증 다수 발생: 최근 ${recentCount}건`);
            }
        }
        
        // 최근 인증 기록에 추가
        suspiciousPatterns.recentVerifications.push({
            token: token.substring(0, 4) + '...',
            ip,
            hour,
            isFirst: true,
            time: now
        });
        
        // 최대 1000개만 유지
        if (suspiciousPatterns.recentVerifications.length > 1000) {
            suspiciousPatterns.recentVerifications.shift();
        }
    }
}

// Rate Limiting: 무차별 대입 공격 방지
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15분
    max: 50, // 15분당 최대 50회 인증 시도 (운영 환경 기준)
    message: '너무 많은 인증 요청입니다. 잠시 후 다시 시도해주세요.',
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * GET /a/:token
 * 정품 인증 라우트
 * 
 * URL 예시: https://prepmood.kr/a/aB3cD5eF7gH9iJ1kL3mN5
 * 
 * 미들웨어 순서:
 * 1. authLimiter (Rate Limiting)
 * 2. requireAuthForHTML (토큰 형식 검증 + 로그인 체크)
 * 3. 실제 페이지 렌더/처리
 */
router.get('/a/:token', authLimiter, requireAuthForHTML, async (req, res) => {
    const token = req.params.token;
    
    try {
        // ✅ 토큰 형식 검증은 requireAuthForHTML에서 이미 수행됨 (중복 제거)
        
        // 토큰 일부만 로깅 (보안)
        Logger.log('[AUTH] 정품 인증 요청:', token.substring(0, 4) + '...');
        
        // DB에서 제품 조회
        const product = getProductByToken(token);
        
        // Case A: 토큰이 DB에 없음 → 가품 경고
        if (!product) {
            Logger.warn('[AUTH] 등록되지 않은 토큰:', token.substring(0, 4) + '...');
            
            // 이상 패턴 감지
            detectSuspiciousPattern(token, req.ip || req.headers['x-real-ip'] || 'unknown', false, true);
            
            return res.render('fake', {
                title: '가품 경고 - Pre.p Mood'
            });
        }
        
        // Case A-2: 토큰이 무효화됨 (status = 3)
        if (product.status === 3) {
            Logger.warn('[AUTH] 무효화된 토큰:', token.substring(0, 4) + '...');
            return res.render('fake', {
                title: '가품 경고 - Pre.p Mood'
            });
        }
        
        // Case B: 첫 인증 (status = 0)
        if (product.status === 0) {
            Logger.log('[AUTH] 첫 인증 처리:', token.substring(0, 4) + '...');
            
            // 이상 패턴 감지 (첫 인증)
            detectSuspiciousPattern(token, req.ip || req.headers['x-real-ip'] || 'unknown', true, false);
            
            // DB 업데이트
            updateFirstVerification(token);
            
            // 업데이트된 정보 다시 조회
            const updatedProduct = getProductByToken(token);
            
            return res.render('success', {
                title: '정품 인증 성공 - Pre.p Mood',
                product: updatedProduct,
                verified_at: updatedProduct.first_verified_at
            });
        }
        
        // Case C: 재인증 (status >= 1)
        Logger.log('[AUTH] 재인증 처리:', token.substring(0, 4) + '...');
        
        // DB 업데이트 (scan_count 증가)
        updateReVerification(token);
        
        // 업데이트된 정보 다시 조회
        const updatedProduct = getProductByToken(token);
        
        return res.render('warning', {
            title: '이미 인증된 제품 - Pre.p Mood',
            product: updatedProduct,
            first_verified_at: updatedProduct.first_verified_at
        });
        
    } catch (error) {
        Logger.error('[AUTH] 정품 인증 처리 실패:', error);
        res.status(500).render('error', {
            title: '오류 발생 - Pre.p Mood',
            message: '정품 인증 처리 중 오류가 발생했습니다.'
        });
    }
});

/**
 * GET /auth/health
 * 헬스체크 엔드포인트 (모니터링용)
 */
router.get('/auth/health', (req, res) => {
    res.json({
        status: 'ok',
        service: 'prepmood-auth',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;

