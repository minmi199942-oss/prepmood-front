-- ============================================================
-- 테스트용 재고 생성 스크립트
-- ============================================================
-- 
-- 주의: 이 스크립트는 테스트 목적으로만 사용됩니다.
-- 실제 운영 환경에서는 product_name 매칭 또는 다른 방법으로
-- admin_products와 token_master를 연결해야 합니다.
--
-- ============================================================

USE prepmood;

-- ============================================================
-- 방법 1: 각 상품에 대해 token_master의 token_pk를 사용하여 재고 생성
-- ============================================================
-- 
-- 이 방법은 각 admin_products.id에 대해 token_master의 token_pk를
-- 순서대로 할당하여 재고를 생성합니다.
-- 
-- 테스트 목적: 각 상품당 3개씩 재고 생성

-- 1. 상품별로 재고 생성 (각 상품당 3개)
INSERT INTO stock_units (product_id, token_pk, status, created_at, updated_at)
SELECT 
    ap.id as product_id,
    tm.token_pk,
    'in_stock' as status,
    NOW() as created_at,
    NOW() as updated_at
FROM admin_products ap
CROSS JOIN (
    SELECT token_pk 
    FROM token_master 
    ORDER BY token_pk 
    LIMIT 3
) tm
LIMIT 30; -- 최대 30개 재고 생성 (10개 상품 × 3개)

-- ============================================================
-- 방법 2: 특정 상품에 대해 재고 생성 (더 정확한 매칭)
-- ============================================================
-- 
-- 특정 상품 ID를 지정하여 재고를 생성합니다.
-- 
-- 예시: 'PM-25-ACC-Fabric-Tie-Skinny' 상품에 대해 5개 재고 생성

-- INSERT INTO stock_units (product_id, token_pk, status, created_at, updated_at)
-- SELECT 
--     'PM-25-ACC-Fabric-Tie-Skinny' as product_id,
--     tm.token_pk,
--     'in_stock' as status,
--     NOW() as created_at,
--     NOW() as updated_at
-- FROM token_master tm
-- ORDER BY tm.token_pk
-- LIMIT 5;

-- ============================================================
-- 재고 확인
-- ============================================================
SELECT '=== 생성된 재고 확인 ===' AS info;
SELECT 
    stock_unit_id,
    product_id,
    token_pk,
    status,
    created_at
FROM stock_units
WHERE status = 'in_stock'
ORDER BY product_id, stock_unit_id
LIMIT 20;

SELECT '=== 상품별 재고 개수 ===' AS info;
SELECT 
    product_id,
    COUNT(*) as stock_count
FROM stock_units
WHERE status = 'in_stock'
GROUP BY product_id
ORDER BY product_id;

SELECT '=== 전체 재고 통계 ===' AS info;
SELECT 
    status,
    COUNT(*) as count
FROM stock_units
GROUP BY status;
