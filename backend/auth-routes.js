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
    updateReVerification 
} = require('./auth-db');
const Logger = require('./logger');

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
 */
router.get('/a/:token', authLimiter, async (req, res) => {
    const token = req.params.token;
    
    try {
        // 토큰 형식 검증 (20자, 영숫자만)
        if (!/^[a-zA-Z0-9]{20}$/.test(token)) {
            Logger.warn('[AUTH] 잘못된 토큰 형식:', token.substring(0, 4) + '...');
            return res.render('fake', {
                title: '가품 경고 - Pre.p Mood'
            });
        }
        
        // 토큰 일부만 로깅 (보안)
        Logger.log('[AUTH] 정품 인증 요청:', token.substring(0, 4) + '...');
        
        // DB에서 제품 조회
        const product = getProductByToken(token);
        
        // Case A: 토큰이 DB에 없음 → 가품 경고
        if (!product) {
            Logger.warn('[AUTH] 등록되지 않은 토큰:', token.substring(0, 4) + '...');
            return res.render('fake', {
                title: '가품 경고 - Pre.p Mood'
            });
        }
        
        // Case B: 첫 인증 (status = 0)
        if (product.status === 0) {
            Logger.log('[AUTH] 첫 인증 처리:', token.substring(0, 4) + '...');
            
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

