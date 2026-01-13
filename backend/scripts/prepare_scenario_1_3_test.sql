-- ============================================================
-- Phase 7 시나리오 1, 3 테스트 데이터 준비
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 시나리오 1: warranty가 있는 경우 (정상 조회)
-- ============================================================
SELECT '=== 1. 시나리오 1: warranty가 있는 토큰 확인 ===' AS info;

-- 기존 warranty 확인
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    w.owner_user_id,
    w.source_order_item_unit_id,
    w.created_at,
    tm.token,
    tm.product_name
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.status IN ('issued', 'issued_unassigned', 'active')
ORDER BY w.id DESC
LIMIT 5;

-- ============================================================
-- 2. 시나리오 3: revoked 상태 warranty 확인
-- ============================================================
SELECT '=== 2. 시나리오 3: revoked 상태 warranty 확인 ===' AS info;

-- 기존 revoked warranty 확인
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    w.revoked_at,
    tm.token,
    tm.product_name
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.status = 'revoked'
ORDER BY w.id DESC
LIMIT 5;

-- ============================================================
-- 3. 테스트용 revoked warranty 생성 (필요시)
-- ============================================================
SELECT '=== 3. 테스트용 revoked warranty 생성 (필요시) ===' AS info;

-- 주의: 실제 데이터를 변경하므로 주의해서 실행
-- 아래 쿼리는 실행하지 말고 참고용으로만 사용

-- 방법 1: 기존 warranty 중 하나를 revoked로 변경
-- UPDATE warranties 
-- SET status = 'revoked', revoked_at = NOW()
-- WHERE id = (
--     SELECT id FROM (
--         SELECT w.id 
--         FROM warranties w
--         WHERE w.status IN ('issued', 'issued_unassigned')
--         LIMIT 1
--     ) AS temp
-- );

-- 방법 2: 특정 warranty_id를 직접 지정
-- UPDATE warranties 
-- SET status = 'revoked', revoked_at = NOW()
-- WHERE id = ? AND status IN ('issued', 'issued_unassigned');

-- ============================================================
-- 4. 테스트용 토큰 목록 정리
-- ============================================================
SELECT '=== 4. 테스트용 토큰 목록 ===' AS info;

-- 시나리오 1: warranty 있는 토큰
SELECT 
    '시나리오 1 (warranty 있음)' AS scenario,
    tm.token,
    tm.token_pk,
    w.status as warranty_status,
    w.id as warranty_id
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status IN ('issued', 'issued_unassigned', 'active')
LIMIT 1;

-- 시나리오 3: revoked 상태 warranty
SELECT 
    '시나리오 3 (revoked)' AS scenario,
    tm.token,
    tm.token_pk,
    w.status as warranty_status,
    w.id as warranty_id
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status = 'revoked'
LIMIT 1;
