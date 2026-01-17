-- ============================================================
-- product_options가 없는 상품의 stock_units 데이터 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. product_options가 없는 상품 목록
-- ============================================================
SELECT '=== 1. product_options가 없는 상품 목록 ===' AS info;

SELECT 
    ap.id AS product_id,
    ap.name
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0
ORDER BY ap.id;

-- ============================================================
-- 2. 해당 상품들의 stock_units 데이터 확인
-- ============================================================
SELECT '=== 2. stock_units 데이터 확인 ===' AS info;

SELECT 
    ap.id AS product_id,
    ap.name,
    COUNT(DISTINCT su.stock_unit_id) as stock_count,
    COUNT(DISTINCT CASE WHEN su.size IS NOT NULL OR su.color IS NOT NULL THEN su.stock_unit_id END) as stock_with_options,
    COUNT(DISTINCT CONCAT(COALESCE(su.size, ''), '||', COALESCE(su.color, ''))) as unique_option_combinations,
    GROUP_CONCAT(DISTINCT CONCAT('size:', COALESCE(su.size, 'NULL'), ', color:', COALESCE(su.color, 'NULL')) SEPARATOR ' | ') as sample_options
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
LEFT JOIN stock_units su ON ap.id = su.product_id
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0
ORDER BY ap.id;

-- ============================================================
-- 3. stock_units에 재고가 없는 상품 확인
-- ============================================================
SELECT '=== 3. stock_units에 재고가 없는 상품 ===' AS info;

SELECT 
    ap.id AS product_id,
    ap.name,
    COUNT(DISTINCT su.stock_unit_id) as stock_count
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
LEFT JOIN stock_units su ON ap.id = su.product_id
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0
   AND COUNT(DISTINCT su.stock_unit_id) = 0
ORDER BY ap.id;

-- ============================================================
-- 4. stock_units에 재고는 있지만 size/color가 NULL인 경우
-- ============================================================
SELECT '=== 4. 재고는 있지만 size/color가 NULL인 경우 ===' AS info;

SELECT 
    ap.id AS product_id,
    ap.name,
    COUNT(DISTINCT su.stock_unit_id) as stock_count,
    COUNT(DISTINCT CASE WHEN su.size IS NULL AND su.color IS NULL THEN su.stock_unit_id END) as stock_without_options
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
LEFT JOIN stock_units su ON ap.id = su.product_id
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0
   AND COUNT(DISTINCT su.stock_unit_id) > 0
   AND COUNT(DISTINCT CASE WHEN su.size IS NULL AND su.color IS NULL THEN su.stock_unit_id END) > 0
ORDER BY ap.id;

SELECT '=== 확인 완료 ===' AS status;
