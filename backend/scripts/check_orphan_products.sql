-- ============================================================
-- check_orphan_products.sql
-- order_items의 orphan 상품 상세 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. orphan 상품 상세 정보
-- ============================================================
SELECT '=== 1. orphan 상품 상세 정보 ===' AS info;

SELECT 
    oi.product_id,
    COUNT(*) as order_item_count,
    GROUP_CONCAT(DISTINCT oi.order_id ORDER BY oi.order_id SEPARATOR ', ') as order_ids,
    MIN(oi.created_at) as first_used_at,
    MAX(oi.created_at) as last_used_at
FROM order_items oi
WHERE oi.product_id NOT IN (SELECT id FROM admin_products)
GROUP BY oi.product_id
ORDER BY oi.product_id;

-- ============================================================
-- 2. 해당 상품이 실제로 admin_products에 없는지 확인
-- ============================================================
SELECT '=== 2. admin_products에서 orphan 상품 검색 ===' AS info;

SELECT 
    'bg-002' AS product_id,
    CASE WHEN EXISTS (SELECT 1 FROM admin_products WHERE id = 'bg-002') THEN '존재함' ELSE '없음' END AS status
UNION ALL
SELECT 
    'cp-001' AS product_id,
    CASE WHEN EXISTS (SELECT 1 FROM admin_products WHERE id = 'cp-001') THEN '존재함' ELSE '없음' END AS status
UNION ALL
SELECT 
    'jk-002' AS product_id,
    CASE WHEN EXISTS (SELECT 1 FROM admin_products WHERE id = 'jk-002') THEN '존재함' ELSE '없음' END AS status;

-- ============================================================
-- 3. order_items에서 해당 상품 사용 내역
-- ============================================================
SELECT '=== 3. order_items에서 orphan 상품 사용 내역 ===' AS info;

SELECT 
    oi.order_id,
    oi.product_id,
    oi.product_name,
    oi.quantity,
    oi.unit_price,
    oi.subtotal,
    o.created_at as order_date,
    o.status as order_status
FROM order_items oi
JOIN orders o ON oi.order_id = o.order_id
WHERE oi.product_id IN ('bg-002', 'cp-001', 'jk-002')
ORDER BY oi.product_id, o.created_at DESC;

-- ============================================================
-- 4. 해결 방안 제시
-- ============================================================
SELECT '=== 4. 해결 방안 ===' AS info;
SELECT 
    '옵션 1: admin_products에 해당 상품 추가 (실제 상품인 경우)' AS solution_1,
    '옵션 2: order_items에서 해당 product_id를 NULL 또는 삭제된 상품 ID로 변경' AS solution_2,
    '옵션 3: 마이그레이션 전에 해당 상품 처리 결정 필요' AS solution_3;

SELECT '=== 확인 완료 ===' AS status;
