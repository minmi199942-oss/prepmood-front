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
const mysql = require('mysql2/promise');
const { 
    getProductByToken, 
    updateFirstVerification, 
    updateReVerification,
    revokeToken
} = require('./auth-db');
const Logger = require('./logger');
const { requireAuthForHTML, authenticateToken } = require('./auth-middleware');
require('dotenv').config();

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
        Logger.error('[AUTH] 정품 인증 처리 실패:', {
            message: error.message,
            code: error.code,
            route: req.path,
            method: req.method,
            ip: req.ip || req.headers['x-real-ip'] || 'unknown',
            token_prefix: token ? token.substring(0, 4) : null
        });
        res.status(500).render('error', {
            title: '오류 발생 - Pre.p Mood',
            message: '정품 인증 처리 중 오류가 발생했습니다.'
        });
    }
});

/**
 * POST /a/:token
 * 디지털 보증서 발급 엔드포인트
 * 
 * 역할:
 * - 로그인한 사용자가 QR 토큰으로 보증서를 발급받음
 * - warranties 테이블에 INSERT
 * 
 * 미들웨어 순서:
 * 1. authLimiter (Rate Limiting)
 * 2. authenticateToken (JWT 인증 - JSON 응답용)
 * 3. 실제 보증서 발급 처리
 */
router.post('/a/:token', authLimiter, authenticateToken, async (req, res) => {
    const token = req.params.token;
    const userId = req.user.userId;
    
    try {
            // ✅ 토큰 형식 검증 (20자 영숫자)
            if (!token || !/^[a-zA-Z0-9]{20}$/.test(token)) {
                Logger.warn('[WARRANTY] 잘못된 토큰 형식:', token ? token.substring(0, 4) + '...' : 'null');
                return res.status(400).json({
                    success: false,
                    message: '잘못된 토큰 형식입니다.',
                    code: 'INVALID_TOKEN'
                });
            }
        
        // 토큰 일부만 로깅 (보안)
        Logger.log('[WARRANTY] 보증서 발급 요청:', {
            token_prefix: token.substring(0, 4) + '...',
            user_id: userId
        });
        
        // MySQL 연결
        const dbConfig = {
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            port: process.env.DB_PORT || 3306,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
        };
        
        const connection = await mysql.createConnection(dbConfig);
        
        try {
            // 1. 토큰 중복 확인 (이미 발급된 보증서인지)
            const [existing] = await connection.execute(
                'SELECT id, user_id, token, verified_at, created_at FROM warranties WHERE token = ?',
                [token]
            );
            
            if (existing.length > 0) {
                const warranty = existing[0];
                Logger.warn('[WARRANTY] 이미 발급된 토큰:', {
                    token_prefix: token.substring(0, 4) + '...',
                    existing_user_id: warranty.user_id,
                    request_user_id: userId
                });
                
                await connection.end();
                
                // 다른 사용자가 이미 발급받은 경우
                if (warranty.user_id !== userId) {
                    return res.status(409).json({
                        success: false,
                        message: '이미 다른 사용자가 발급받은 토큰입니다.',
                        code: 'TOKEN_ALREADY_USED'
                    });
                }
                
                // 같은 사용자가 이미 발급받은 경우 (중복 요청)
                return res.status(200).json({
                    success: true,
                    message: '이미 발급받은 보증서입니다.',
                    code: 'TOKEN_ALREADY_USED',
                    warranty: {
                        id: warranty.id,
                        token: warranty.token.substring(0, 4) + '...',
                        verified_at: warranty.verified_at,
                        created_at: warranty.created_at
                    }
                });
            }
            
            // 2. UTC 시간 생성 (정책 준수: 'YYYY-MM-DD HH:MM:SS' 형식)
            const now = new Date();
            const utcDateTime = now.toISOString().replace('T', ' ').substring(0, 19); // 'YYYY-MM-DD HH:MM:SS'
            
            // 3. warranties 테이블에 INSERT
            const [result] = await connection.execute(
                'INSERT INTO warranties (user_id, token, verified_at, created_at) VALUES (?, ?, ?, ?)',
                [userId, token, utcDateTime, utcDateTime]
            );
            
            Logger.log('[WARRANTY] 보증서 발급 성공:', {
                warranty_id: result.insertId,
                token_prefix: token.substring(0, 4) + '...',
                user_id: userId,
                verified_at: utcDateTime
            });
            
            await connection.end();
            
            // 4. 성공 응답
            return res.status(201).json({
                success: true,
                message: '보증서가 발급되었습니다.',
                warranty: {
                    id: result.insertId,
                    token: token.substring(0, 4) + '...',
                    verified_at: utcDateTime,
                    created_at: utcDateTime
                }
            });
            
        } catch (dbError) {
            await connection.end();
            
            // UNIQUE 제약 위반 (동시 요청 등)
            if (dbError.code === 'ER_DUP_ENTRY' || dbError.errno === 1062) {
                Logger.warn('[WARRANTY] 토큰 중복 (동시 요청 가능성):', {
                    token_prefix: token.substring(0, 4) + '...',
                    message: dbError.message
                });
                
                return res.status(409).json({
                    success: false,
                    message: '이미 발급된 토큰입니다.',
                    code: 'TOKEN_ALREADY_USED'
                });
            }
            
            // FK 제약 위반 (user_id가 존재하지 않음 - 드문 경우)
            if (dbError.code === 'ER_NO_REFERENCED_ROW_2' || dbError.errno === 1452) {
                Logger.error('[WARRANTY] FK 제약 위반 (user_id 없음):', {
                    user_id: userId,
                    message: dbError.message
                });
                
                return res.status(400).json({
                    success: false,
                    message: '유효하지 않은 사용자입니다.',
                    code: 'INVALID_USER'
                });
            }
            
            // 기타 DB 오류
            throw dbError;
        }
        
    } catch (error) {
        Logger.error('[WARRANTY] 보증서 발급 실패:', {
            message: error.message,
            code: error.code,
            route: req.path,
            method: req.method,
            ip: req.ip || req.headers['x-real-ip'] || 'unknown',
            token_prefix: token ? token.substring(0, 4) : null,
            user_id: userId
        });
        
        return res.status(500).json({
            success: false,
            message: '보증서 발급 중 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
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

