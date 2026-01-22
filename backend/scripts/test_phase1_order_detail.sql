-- ============================================================
-- Phase 1 테스트: 통합 주문 상세 페이지 구현
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 테스트 데이터 확인
-- ============================================================

-- 1-1. Claim 완료된 주문의 토큰 확인
SELECT 
    got.token_id,
    got.order_id,
    got.token,
    got.expires_at,
    got.revoked_at,
    o.order_number,
    o.user_id,
    o.guest_id,
    CASE 
        WHEN got.expires_at < NOW() THEN '만료됨'
        WHEN got.revoked_at IS NOT NULL THEN '회수됨'
        WHEN o.user_id IS NOT NULL THEN 'Claim 완료 (이제 접근 가능해야 함)'
        ELSE '정상'
    END AS status
FROM guest_order_access_tokens got
INNER JOIN orders o ON got.order_id = o.order_id
WHERE got.revoked_at IS NULL
ORDER BY got.created_at DESC
LIMIT 10;

-- 1-2. 회원 주문의 토큰 확인 (Phase 1 수정 후)
SELECT 
    got.token_id,
    got.order_id,
    got.token,
    got.expires_at,
    o.order_number,
    o.user_id,
    o.guest_id,
    CASE 
        WHEN o.user_id IS NOT NULL THEN '회원 주문 (토큰 생성됨)'
        WHEN o.guest_id IS NOT NULL THEN '비회원 주문'
        ELSE '알 수 없음'
    END AS order_type
FROM guest_order_access_tokens got
INNER JOIN orders o ON got.order_id = o.order_id
WHERE o.user_id IS NOT NULL
ORDER BY got.created_at DESC
LIMIT 10;

-- 1-3. 주문당 토큰 개수 확인 (중복 생성 확인)
SELECT 
    order_id,
    COUNT(*) as token_count,
    MAX(created_at) as latest_token_created_at,
    MIN(created_at) as earliest_token_created_at
FROM guest_order_access_tokens
WHERE expires_at > NOW()
  AND revoked_at IS NULL
GROUP BY order_id
HAVING COUNT(*) > 1
ORDER BY token_count DESC;

-- ============================================================
-- 2. 테스트용 토큰 생성 (필요시)
-- ============================================================

-- 2-1. Claim 완료된 주문의 테스트 토큰 생성
-- 주의: 실제 주문 ID로 변경 필요
/*
INSERT INTO guest_order_access_tokens (order_id, token, expires_at)
SELECT 
    order_id,
    CONCAT('test_', HEX(RANDOM_BYTES(16))),
    DATE_ADD(NOW(), INTERVAL 90 DAY)
FROM orders
WHERE user_id IS NOT NULL
  AND order_id = ? -- 실제 주문 ID로 변경
LIMIT 1;
*/

-- 2-2. 만료된 토큰 생성 (테스트용)
/*
INSERT INTO guest_order_access_tokens (order_id, token, expires_at)
SELECT 
    order_id,
    CONCAT('expired_', HEX(RANDOM_BYTES(16))),
    DATE_SUB(NOW(), INTERVAL 1 DAY)
FROM orders
WHERE order_id = ? -- 실제 주문 ID로 변경
LIMIT 1;
*/

-- ============================================================
-- 3. Claim 상태 확인
-- ============================================================

-- 3-1. Claim 가능한 주문 확인
SELECT 
    o.order_id,
    o.order_number,
    o.user_id,
    o.guest_id,
    o.status,
    CASE 
        WHEN o.user_id IS NOT NULL THEN '이미 Claim됨'
        WHEN o.guest_id IS NOT NULL THEN 'Claim 가능'
        ELSE '알 수 없음'
    END AS claim_status
FROM orders o
WHERE o.status = 'paid'
ORDER BY o.created_at DESC
LIMIT 10;

-- 3-2. Claim 토큰 확인
SELECT 
    ct.token_id,
    ct.order_id,
    ct.token,
    ct.expires_at,
    ct.used_at,
    o.user_id as current_order_user_id
FROM claim_tokens ct
INNER JOIN orders o ON ct.order_id = o.order_id
WHERE ct.expires_at > NOW()
  AND ct.used_at IS NULL
ORDER BY ct.created_at DESC
LIMIT 10;

-- ============================================================
-- 4. 세션 토큰 확인
-- ============================================================

-- 4-1. 활성 세션 확인
SELECT 
    gos.session_id,
    gos.order_id,
    gos.session_token,
    gos.expires_at,
    gos.last_access_at,
    o.order_number,
    o.user_id
FROM guest_order_sessions gos
INNER JOIN orders o ON gos.order_id = o.order_id
WHERE gos.expires_at > NOW()
ORDER BY gos.created_at DESC
LIMIT 10;

-- ============================================================
-- 5. 테스트 결과 확인
-- ============================================================

-- 5-1. 최근 생성된 토큰 확인 (회원/비회원 모두)
SELECT 
    got.token_id,
    got.order_id,
    got.token,
    got.created_at,
    got.expires_at,
    o.order_number,
    o.user_id,
    o.guest_id,
    CASE 
        WHEN o.user_id IS NOT NULL THEN '회원'
        WHEN o.guest_id IS NOT NULL THEN '비회원'
        ELSE '알 수 없음'
    END AS order_type
FROM guest_order_access_tokens got
INNER JOIN orders o ON got.order_id = o.order_id
ORDER BY got.created_at DESC
LIMIT 20;

-- 5-2. 이메일 발송용 최신 토큰 확인 (주문당 1개)
SELECT 
    order_id,
    token,
    created_at,
    expires_at,
    revoked_at
FROM (
    SELECT 
        order_id,
        token,
        created_at,
        expires_at,
        revoked_at,
        ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY created_at DESC) as rn
    FROM guest_order_access_tokens
    WHERE expires_at > NOW()
      AND revoked_at IS NULL
) ranked
WHERE rn = 1
ORDER BY created_at DESC
LIMIT 10;
