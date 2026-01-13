-- ============================================================
-- 기존 warranty 확인 및 테스트 데이터 준비
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 모든 warranty 확인
-- ============================================================
SELECT '=== 1. 모든 warranty 확인 ===' AS info;

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
ORDER BY w.id DESC
LIMIT 10;

-- ============================================================
-- 2. warranty 상태별 통계
-- ============================================================
SELECT '=== 2. warranty 상태별 통계 ===' AS info;

SELECT 
    status,
    COUNT(*) as count
FROM warranties
GROUP BY status;

-- ============================================================
-- 3. 테스트용 warranty 확인 (issued 또는 issued_unassigned)
-- ============================================================
SELECT '=== 3. 테스트용 warranty 확인 ===' AS info;

SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    tm.token,
    tm.product_name
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.status IN ('issued', 'issued_unassigned')
ORDER BY w.id DESC
LIMIT 5;
