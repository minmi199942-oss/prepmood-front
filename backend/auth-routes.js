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
const { 
    getProductByToken, 
    updateFirstVerification, 
    updateReVerification 
} = require('./auth-db');
const Logger = require('./logger');

/**
 * GET /a/:token
 * 정품 인증 라우트
 * 
 * URL 예시: https://prepmood.kr/a/aB3cD5eF7gH9iJ1kL3mN5
 */
router.get('/a/:token', async (req, res) => {
    const token = req.params.token;
    
    try {
        Logger.log('[AUTH] 정품 인증 요청:', token);
        
        // DB에서 제품 조회
        const product = getProductByToken(token);
        
        // Case A: 토큰이 DB에 없음 → 가품 경고
        if (!product) {
            Logger.warn('[AUTH] 등록되지 않은 토큰:', token);
            return res.render('fake', {
                title: '가품 경고 - Pre.p Mood'
            });
        }
        
        // Case B: 첫 인증 (status = 0)
        if (product.status === 0) {
            Logger.log('[AUTH] 첫 인증 처리:', token);
            
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
        Logger.log('[AUTH] 재인증 처리:', token);
        
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

