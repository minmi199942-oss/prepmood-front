-- ============================================================
-- 051_cleanup_orphan_products.sql
-- orphan 상품 정리: order_items의 존재하지 않는 product_id 처리
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 정리 전 orphan 상품 확인 ===' AS info;
SELECT 
    product_id,
    COUNT(*) as count
FROM order_items
WHERE product_id NOT IN (SELECT id FROM admin_products)
GROUP BY product_id;

-- ============================================================
-- 2. orphan 상품 정리 옵션
-- ============================================================
-- 옵션 A: product_id를 NULL로 변경 (주문 데이터 보존)
-- 옵션 B: product_id를 'DELETED-{원본ID}' 형식으로 변경 (추적 가능)
-- 옵션 C: 해당 order_items 레코드 삭제 (위험 - 주문 이력 손실)

-- ⚠️ 권장: 옵션 B (추적 가능하면서도 정리)
-- 주문 이력은 보존하되, product_id를 명확히 표시

-- ============================================================
-- 3. orphan 상품 product_id 변경 (옵션 B)
-- ============================================================
UPDATE order_items
SET product_id = CONCAT('DELETED-', product_id)
WHERE product_id NOT IN (SELECT id FROM admin_products)
  AND product_id NOT LIKE 'DELETED-%';

SELECT '=== orphan 상품 정리 완료 ===' AS status;

-- ============================================================
-- 4. 정리 후 확인
-- ============================================================
SELECT '=== 2. 정리 후 확인 ===' AS info;
SELECT 
    CASE 
        WHEN product_id LIKE 'DELETED-%' THEN 'DELETED 상품'
        WHEN product_id NOT IN (SELECT id FROM admin_products) THEN 'orphan (미처리)'
        ELSE '정상'
    END AS status,
    COUNT(*) as count
FROM order_items
GROUP BY status;

-- DELETED 상품 상세
SELECT '=== 3. DELETED 상품 상세 ===' AS info;
SELECT 
    product_id,
    product_name,
    COUNT(*) as order_item_count,
    GROUP_CONCAT(DISTINCT order_id ORDER BY order_id SEPARATOR ', ') as order_ids
FROM order_items
WHERE product_id LIKE 'DELETED-%'
GROUP BY product_id, product_name
ORDER BY product_id;

SELECT '=== orphan 상품 정리 완료 ===' AS status;
