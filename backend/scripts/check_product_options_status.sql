-- ============================================================
-- product_options 현재 상태 확인 스크립트
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 전체 통계
-- ============================================================
SELECT '=== 1. product_options 전체 통계 ===' AS info;

SELECT 
    COUNT(*) as total_options,
    COUNT(DISTINCT product_id) as unique_products,
    COUNT(DISTINCT color) as unique_colors,
    COUNT(DISTINCT size) as unique_sizes
FROM product_options
WHERE is_active = 1;

-- ============================================================
-- 2. 상품별 옵션 수
-- ============================================================
SELECT '=== 2. 상품별 옵션 수 ===' AS info;

SELECT 
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
-- 3. 옵션이 없는 상품 목록
-- ============================================================
SELECT '=== 3. 옵션이 없는 상품 목록 ===' AS info;

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

-- ============================================================
-- 4. 상품별 옵션 상세 정보
-- ============================================================
SELECT '=== 4. 상품별 옵션 상세 정보 ===' AS info;

SELECT 
    po.product_id,
    ap.name AS product_name,
    po.size,
    po.color,
    po.sort_order,
    po.is_active,
    COUNT(DISTINCT su.stock_unit_id) as stock_count,
    COUNT(DISTINCT CASE WHEN su.status = 'in_stock' THEN su.stock_unit_id END) as in_stock_count
FROM product_options po
LEFT JOIN admin_products ap ON po.product_id = ap.id
LEFT JOIN stock_units su ON po.product_id = su.product_id
    AND TRIM(COALESCE(po.size, '')) = TRIM(COALESCE(su.size, ''))
    AND po.color = CASE
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
WHERE po.is_active = 1
GROUP BY po.product_id, ap.name, po.size, po.color, po.sort_order, po.is_active
ORDER BY po.product_id, po.sort_order, po.color;

-- ============================================================
-- 5. 옵션별 재고 상태 요약
-- ============================================================
SELECT '=== 5. 옵션별 재고 상태 요약 ===' AS info;

SELECT 
    po.product_id,
    po.size,
    po.color,
    COUNT(DISTINCT su.stock_unit_id) as total_stock,
    COUNT(DISTINCT CASE WHEN su.status = 'in_stock' THEN su.stock_unit_id END) as in_stock,
    COUNT(DISTINCT CASE WHEN su.status = 'sold' THEN su.stock_unit_id END) as sold,
    CASE 
        WHEN COUNT(DISTINCT CASE WHEN su.status = 'in_stock' THEN su.stock_unit_id END) = 0 THEN '품절'
        ELSE '재고 있음'
    END AS availability
FROM product_options po
LEFT JOIN stock_units su ON po.product_id = su.product_id
    AND TRIM(COALESCE(po.size, '')) = TRIM(COALESCE(su.size, ''))
    AND po.color = CASE
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
WHERE po.is_active = 1
GROUP BY po.product_id, po.size, po.color
ORDER BY po.product_id, po.sort_order, po.color;

SELECT '=== product_options 상태 확인 완료 ===' AS status;
