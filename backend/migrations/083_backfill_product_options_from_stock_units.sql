-- ============================================================
-- 083_backfill_product_options_from_stock_units.sql
-- Phase 16-4: 기존 stock_units 데이터를 기반으로 product_options 생성
-- 목적: product_options가 없는 상품에 대해 stock_units에서 옵션 추출 및 생성
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- product_options가 없는 상품 확인
SELECT 
    'product_options 없는 상품' AS check_type,
    COUNT(DISTINCT ap.id) as products_without_options
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
GROUP BY ap.id
HAVING COUNT(po.option_id) = 0;

-- product_options가 없는 상품의 상세 정보
SELECT 
    'product_options 없는 상품 상세' AS check_type,
    ap.id AS product_id,
    ap.name,
    COUNT(DISTINCT su.stock_unit_id) as stock_count,
    COUNT(DISTINCT CASE WHEN su.size IS NOT NULL OR su.color IS NOT NULL THEN su.stock_unit_id END) as stock_with_options
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
LEFT JOIN stock_units su ON ap.id = su.product_id
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0
ORDER BY ap.id;

-- stock_units에서 옵션 추출 가능한 상품 확인
SELECT 
    'stock_units 옵션 데이터' AS check_type,
    COUNT(DISTINCT su.product_id) as unique_products,
    COUNT(DISTINCT CONCAT(su.product_id, '||', COALESCE(su.size, ''), '||', COALESCE(su.color, ''))) as unique_options
FROM stock_units su
WHERE su.product_id IS NOT NULL
  AND (su.size IS NOT NULL OR su.color IS NOT NULL);

-- ============================================================
-- 2. product_options가 없는 상품의 stock_units에서 옵션 추출 및 삽입
-- ============================================================
SELECT '=== 2. product_options 자동 생성 (stock_units 기반) ===' AS info;

-- 색상 정규화 함수 (072_create_product_options_table.sql과 동일)
-- stock_units에서 DISTINCT (product_id, size, color) 조합 추출
-- product_options가 없는 상품에 대해서만 생성
INSERT IGNORE INTO product_options (product_id, color, size, sort_order, is_active)
SELECT DISTINCT
    su.product_id,
    CASE
        -- 색상 정규화 (072 마이그레이션과 동일한 로직)
        WHEN su.color IS NULL OR TRIM(su.color) = '' THEN ''
        WHEN UPPER(TRIM(su.color)) = 'LIGHTBLUE' 
             OR su.color LIKE '%LightBlue%' 
             OR su.color LIKE '%Light-Blue%' 
             OR UPPER(TRIM(su.color)) = 'LB' THEN 'Light Blue'
        WHEN UPPER(TRIM(su.color)) = 'LIGHTGREY' 
             OR su.color LIKE '%LightGrey%' 
             OR su.color LIKE '%Light-Grey%' 
             OR UPPER(TRIM(su.color)) IN ('LG', 'LGY') THEN 'Light Grey'
        WHEN UPPER(TRIM(su.color)) = 'BK' THEN 'Black'
        WHEN UPPER(TRIM(su.color)) = 'NV' THEN 'Navy'
        WHEN UPPER(TRIM(su.color)) IN ('WH', 'WT') THEN 'White'
        WHEN UPPER(TRIM(su.color)) = 'GY' THEN 'Grey'
        WHEN UPPER(TRIM(su.color)) = 'GRAY' THEN 'Grey'
        ELSE TRIM(su.color)
    END AS normalized_color,
    CASE
        WHEN su.size IS NULL OR TRIM(su.size) = '' THEN ''
        ELSE TRIM(su.size)
    END AS normalized_size,
    -- sort_order 계산: 사이즈 순서 (S=1, M=2, L=3, XL=4, XXL=5, F=6, 기타=99)
    CASE
        WHEN TRIM(su.size) = 'S' THEN 1
        WHEN TRIM(su.size) = 'M' THEN 2
        WHEN TRIM(su.size) = 'L' THEN 3
        WHEN TRIM(su.size) = 'XL' THEN 4
        WHEN TRIM(su.size) = 'XXL' THEN 5
        WHEN TRIM(su.size) = 'F' THEN 6
        ELSE 99
    END AS sort_order,
    1 AS is_active
FROM stock_units su
WHERE su.product_id IS NOT NULL
  AND (su.size IS NOT NULL OR su.color IS NOT NULL)
  -- product_options가 없는 상품만 대상
  AND NOT EXISTS (
      SELECT 1 
      FROM product_options po 
      WHERE po.product_id = su.product_id 
        AND po.is_active = 1
  );

-- ============================================================
-- 3. 삽입된 옵션 수 확인
-- ============================================================
SELECT '=== 3. 삽입된 옵션 수 확인 ===' AS info;

SELECT 
    '삽입된 옵션 수' AS info,
    COUNT(*) as total_options,
    COUNT(DISTINCT product_id) as unique_products
FROM product_options;

-- 상품별 옵션 수 확인
SELECT 
    '상품별 옵션 수' AS check_type,
    ap.id AS product_id,
    ap.name,
    COUNT(po.option_id) as option_count,
    CASE 
        WHEN COUNT(po.option_id) > 0 THEN '옵션 있음'
        ELSE '옵션 없음'
    END AS status
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
GROUP BY ap.id, ap.name
ORDER BY option_count, ap.id;

-- ============================================================
-- 4. 검증: 모든 상품이 product_options를 가지는지 확인
-- ============================================================
SELECT '=== 4. 검증: 모든 상품 옵션 보유 확인 ===' AS info;

SELECT 
    '옵션 없는 상품' AS check_type,
    COUNT(*) as products_without_options
FROM (
    SELECT ap.id
    FROM admin_products ap
    LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
    GROUP BY ap.id
    HAVING COUNT(po.option_id) = 0
) AS missing_options;

-- 옵션이 없는 상품 목록 (있다면)
SELECT 
    ap.id AS product_id,
    ap.name,
    COUNT(DISTINCT su.stock_unit_id) as stock_count
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
LEFT JOIN stock_units su ON ap.id = su.product_id
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0
ORDER BY ap.id;

SELECT '=== product_options 자동 생성 완료 ===' AS status;
