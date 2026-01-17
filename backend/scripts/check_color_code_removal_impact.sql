-- ============================================================
-- 색상 코드 제거 A안 영향도 확인 스크립트
-- Phase 16-4: extractColorFromProductId() 제거 후 영향 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. product_options 테이블 데이터 확인
-- ============================================================
SELECT '=== 1. product_options 테이블 데이터 확인 ===' AS info;

-- 모든 상품이 product_options를 가지고 있는지 확인
SELECT 
    'product_options 보유 상품' AS check_type,
    COUNT(DISTINCT product_id) as products_with_options
FROM product_options
WHERE is_active = 1;

-- admin_products와 product_options 비교
SELECT 
    '상품별 옵션 보유 여부' AS check_type,
    ap.id AS product_id,
    ap.name,
    COUNT(po.option_id) as option_count,
    CASE 
        WHEN COUNT(po.option_id) > 0 THEN '옵션 있음'
        ELSE '옵션 없음 (fallback 필요)'
    END AS status
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
GROUP BY ap.id, ap.name
ORDER BY option_count, ap.id;

-- ============================================================
-- 2. stock_units fallback 확인
-- ============================================================
SELECT '=== 2. stock_units fallback 확인 ===' AS info;

-- product_options가 없는 상품의 stock_units 확인
SELECT 
    '옵션 없음 상품의 재고' AS check_type,
    ap.id AS product_id,
    ap.name,
    COUNT(DISTINCT su.stock_unit_id) as stock_count,
    COUNT(DISTINCT CONCAT(COALESCE(su.size, ''), '||', COALESCE(su.color, ''))) as unique_options
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
LEFT JOIN stock_units su ON ap.id = su.product_id
GROUP BY ap.id, ap.name
HAVING COUNT(po.option_id) = 0;

-- ============================================================
-- 3. 주문 데이터에서 색상 정보 확인
-- ============================================================
SELECT '=== 3. 주문 데이터 색상 정보 확인 ===' AS info;

-- order_items에서 색상 정보가 제대로 저장되어 있는지 확인
SELECT 
    '주문 항목 색상 정보' AS check_type,
    COUNT(*) as total_items,
    COUNT(CASE WHEN color IS NOT NULL AND color != '' THEN 1 END) as items_with_color,
    COUNT(CASE WHEN color IS NULL OR color = '' THEN 1 END) as items_without_color,
    COUNT(DISTINCT CASE WHEN color IS NOT NULL AND color != '' THEN color END) as unique_colors
FROM order_items;

-- 색상별 주문 통계
SELECT 
    color,
    COUNT(*) as order_count
FROM order_items
WHERE color IS NOT NULL AND color != ''
GROUP BY color
ORDER BY order_count DESC;

-- ============================================================
-- 4. product_id에 색상 코드가 포함된 상품 확인
-- ============================================================
SELECT '=== 4. 색상 코드 포함 상품 확인 ===' AS info;

SELECT 
    id,
    name,
    CASE 
        WHEN id LIKE '%-LB' OR id LIKE '%-LB-%' THEN 'Light Blue'
        WHEN id LIKE '%-GY' OR id LIKE '%-GY-%' THEN 'Grey'
        WHEN id LIKE '%-BK' OR id LIKE '%-BK-%' THEN 'Black'
        WHEN id LIKE '%-NV' OR id LIKE '%-NV-%' THEN 'Navy'
        WHEN id LIKE '%-WH' OR id LIKE '%-WH-%' THEN 'White'
        WHEN id LIKE '%-WT' OR id LIKE '%-WT-%' THEN 'White'
        WHEN id LIKE '%-LGY' OR id LIKE '%-LGY-%' THEN 'Light Grey'
        WHEN id LIKE '%-LG' OR id LIKE '%-LG-%' THEN 'Light Grey'
        ELSE '색상 코드 없음'
    END AS extracted_color_code,
    (SELECT COUNT(*) FROM product_options WHERE product_id = ap.id AND is_active = 1) as option_count
FROM admin_products ap
WHERE id LIKE '%-LB' OR id LIKE '%-LB-%'
   OR id LIKE '%-GY' OR id LIKE '%-GY-%'
   OR id LIKE '%-BK' OR id LIKE '%-BK-%'
   OR id LIKE '%-NV' OR id LIKE '%-NV-%'
   OR id LIKE '%-WH' OR id LIKE '%-WH-%'
   OR id LIKE '%-WT' OR id LIKE '%-WT-%'
   OR id LIKE '%-LGY' OR id LIKE '%-LGY-%'
   OR id LIKE '%-LG' OR id LIKE '%-LG-%'
ORDER BY id;

-- ============================================================
-- 5. product_options와 product_id 색상 코드 일치 확인
-- ============================================================
SELECT '=== 5. product_options와 product_id 색상 코드 일치 확인 ===' AS info;

-- product_id에 색상 코드가 있는 상품의 product_options 확인
SELECT 
    ap.id AS product_id,
    ap.name,
    CASE 
        WHEN ap.id LIKE '%-LB' OR ap.id LIKE '%-LB-%' THEN 'Light Blue'
        WHEN ap.id LIKE '%-GY' OR ap.id LIKE '%-GY-%' THEN 'Grey'
        WHEN ap.id LIKE '%-BK' OR ap.id LIKE '%-BK-%' THEN 'Black'
        WHEN ap.id LIKE '%-NV' OR ap.id LIKE '%-NV-%' THEN 'Navy'
        WHEN ap.id LIKE '%-WH' OR ap.id LIKE '%-WH-%' THEN 'White'
        WHEN ap.id LIKE '%-WT' OR ap.id LIKE '%-WT-%' THEN 'White'
        WHEN ap.id LIKE '%-LGY' OR ap.id LIKE '%-LGY-%' THEN 'Light Grey'
        WHEN ap.id LIKE '%-LG' OR ap.id LIKE '%-LG-%' THEN 'Light Grey'
        ELSE NULL
    END AS product_id_color_code,
    GROUP_CONCAT(DISTINCT po.color ORDER BY po.color SEPARATOR ', ') as product_options_colors
FROM admin_products ap
LEFT JOIN product_options po ON ap.id = po.product_id AND po.is_active = 1
WHERE ap.id LIKE '%-LB' OR ap.id LIKE '%-LB-%'
   OR ap.id LIKE '%-GY' OR ap.id LIKE '%-GY-%'
   OR ap.id LIKE '%-BK' OR ap.id LIKE '%-BK-%'
   OR ap.id LIKE '%-NV' OR ap.id LIKE '%-NV-%'
   OR ap.id LIKE '%-WH' OR ap.id LIKE '%-WH-%'
   OR ap.id LIKE '%-WT' OR ap.id LIKE '%-WT-%'
   OR ap.id LIKE '%-LGY' OR ap.id LIKE '%-LGY-%'
   OR ap.id LIKE '%-LG' OR ap.id LIKE '%-LG-%'
GROUP BY ap.id, ap.name
ORDER BY ap.id;

SELECT '=== 색상 코드 제거 A안 영향도 확인 완료 ===' AS status;
