-- ============================================================
-- Phase 7 테스트를 위한 warranty 데이터 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 기존 warranty 확인 (시나리오 1용)
-- ============================================================
SELECT '=== 1. 기존 warranty 확인 (시나리오 1용) ===' AS info;

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
LIMIT 10;

-- ============================================================
-- 2. revoked 상태 warranty 확인 (시나리오 3용)
-- ============================================================
SELECT '=== 2. revoked 상태 warranty 확인 (시나리오 3용) ===' AS info;

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
LIMIT 10;

-- ============================================================
-- 3. 테스트용 revoked warranty 생성 (필요시)
-- ============================================================
SELECT '=== 3. 테스트용 revoked warranty 생성 (필요시) ===' AS info;

-- 기존 warranty 중 하나를 revoked로 변경 (테스트용)
-- 주의: 실제 데이터를 변경하므로 주의해서 실행
-- 아래 쿼리는 실행하지 말고 참고용으로만 사용

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

-- 변경 후 확인
-- SELECT 
--     w.id as warranty_id,
--     w.token_pk,
--     w.status,
--     w.revoked_at,
--     tm.token
-- FROM warranties w
-- JOIN token_master tm ON w.token_pk = w.token_pk
-- WHERE w.status = 'revoked'
-- ORDER BY w.id DESC
-- LIMIT 1;
