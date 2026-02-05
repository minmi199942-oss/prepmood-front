-- admin_products 테이블에 어떤 상품이 등록되어 있는지 확인
-- 사용: mysql -u 사용자 -p prepmood < backend/scripts/list_admin_products.sql

USE prepmood;

SELECT '=== admin_products 목록 (id, name, category) ===' AS info;
SELECT id, name, category, collection_year, created_at
FROM admin_products
ORDER BY created_at DESC;

SELECT CONCAT('총 ', COUNT(*), '개 상품') AS summary FROM admin_products;
