-- ============================================================
-- test_product_options.sql
-- GPT 제안: 테스트를 한 방에 끝내는 쿼리 세트
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 옵션 마스터가 실제로 들어갔는지 확인
-- ============================================================
SELECT '=== 1. 옵션 마스터 확인 ===' AS info;

SELECT 
    product_id, 
    size, 
    color, 
    is_active, 
    sort_order
FROM product_options
WHERE product_id = 'PM-26-SH-Oxford-Stripe-LG'
ORDER BY sort_order, color;

-- ============================================================
-- 2. 재고 매핑이 제대로 되는지 확인
-- ============================================================
SELECT '=== 2. 재고 매핑 확인 ===' AS info;

SELECT 
    su.product_id, 
    su.size, 
    su.color,
    SUM(su.status = 'in_stock') AS in_stock_count
FROM stock_units su
WHERE su.product_id = 'PM-26-SH-Oxford-Stripe-LG'
GROUP BY su.product_id, su.size, su.color;

-- ============================================================
-- 3. "옵션은 있는데 재고가 0인 케이스" 확인 (핵심)
-- 이 쿼리에서 in_stock_count=0인 옵션이 한 줄이라도 나오면
-- "품절 옵션 표시"가 가능한 데이터 상태
-- ============================================================
SELECT '=== 3. 품절 옵션 확인 (핵심) ===' AS info;

SELECT 
    po.product_id, 
    po.size, 
    po.color,
    COALESCE(SUM(su.status = 'in_stock'), 0) AS in_stock_count,
    CASE 
        WHEN COALESCE(SUM(su.status = 'in_stock'), 0) = 0 THEN '품절'
        ELSE '재고 있음'
    END AS status
FROM product_options po
LEFT JOIN stock_units su
  ON su.product_id = po.product_id
 AND TRIM(COALESCE(su.size, '')) = TRIM(COALESCE(po.size, ''))
 AND su.color = CASE
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
    END
WHERE po.product_id = 'PM-26-SH-Oxford-Stripe-LG'
  AND po.is_active = 1
GROUP BY po.product_id, po.size, po.color
ORDER BY po.sort_order, po.color;

-- ============================================================
-- 4. 모든 상품의 옵션 마스터 통계
-- ============================================================
SELECT '=== 4. 전체 옵션 마스터 통계 ===' AS info;

SELECT 
    COUNT(*) AS total_options,
    COUNT(DISTINCT product_id) AS unique_products,
    COUNT(CASE WHEN size = '' AND color = '' THEN 1 END) AS empty_options,
    COUNT(CASE WHEN size != '' AND color != '' THEN 1 END) AS full_options
FROM product_options
WHERE is_active = 1;
