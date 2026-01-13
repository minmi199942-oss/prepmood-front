-- ============================================================
-- 071_cleanup_after_cutover.sql
-- Cutover 완료 후 불필요한 컬럼 및 테이블 제거
-- ⚠️ 서버 중지 후 실행
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- canonical_id 컬럼 확인
SELECT 
    'admin_products.canonical_id' AS column_name,
    COUNT(*) as total_rows,
    COUNT(canonical_id) as not_null_count
FROM admin_products;

-- product_id_canonical 컬럼 확인
SELECT 
    'stock_units.product_id_canonical' AS column_name,
    COUNT(*) as total_rows,
    COUNT(product_id_canonical) as not_null_count
FROM stock_units
UNION ALL
SELECT 
    'order_items.product_id_canonical' AS column_name,
    COUNT(*) as total_rows,
    COUNT(product_id_canonical) as not_null_count
FROM order_items;

-- id_backup 컬럼 확인
SELECT 
    'admin_products.id_backup' AS column_name,
    COUNT(*) as total_rows,
    COUNT(id_backup) as not_null_count
FROM admin_products;

-- product_id_mapping 테이블 확인
SELECT 
    'product_id_mapping' AS table_name,
    COUNT(*) as total_rows
FROM product_id_mapping;

-- ============================================================
-- 2. 인덱스 제거
-- ============================================================
SELECT '=== 2. 인덱스 제거 ===' AS info;

-- admin_products.canonical_id 인덱스 제거
DROP INDEX IF EXISTS uk_admin_products_canonical_id ON admin_products;
DROP INDEX IF EXISTS idx_admin_products_canonical_id_temp ON admin_products;

-- stock_units.product_id_canonical 인덱스 제거
DROP INDEX IF EXISTS idx_stock_units_product_id_canonical ON stock_units;

-- order_items.product_id_canonical 인덱스 제거
DROP INDEX IF EXISTS idx_order_items_product_id_canonical ON order_items;

-- ============================================================
-- 3. 컬럼 제거
-- ============================================================
SELECT '=== 3. 컬럼 제거 ===' AS info;

-- admin_products.canonical_id 제거
ALTER TABLE admin_products DROP COLUMN IF EXISTS canonical_id;

-- admin_products.id_backup 제거
ALTER TABLE admin_products DROP COLUMN IF EXISTS id_backup;

-- stock_units.product_id_canonical 제거
ALTER TABLE stock_units DROP COLUMN IF EXISTS product_id_canonical;

-- order_items.product_id_canonical 제거
ALTER TABLE order_items DROP COLUMN IF EXISTS product_id_canonical;

-- ============================================================
-- 4. 테이블 제거
-- ============================================================
SELECT '=== 4. 테이블 제거 ===' AS info;

-- product_id_mapping 테이블 제거 (더 이상 필요 없음)
DROP TABLE IF EXISTS product_id_mapping;

-- ============================================================
-- 5. 최종 확인
-- ============================================================
SELECT '=== 5. 최종 확인 ===' AS info;

-- 컬럼 제거 확인
SELECT 
    TABLE_NAME,
    COLUMN_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME IN ('admin_products', 'stock_units', 'order_items')
  AND COLUMN_NAME IN ('canonical_id', 'product_id_canonical', 'id_backup')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- 테이블 제거 확인
SELECT 
    TABLE_NAME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'product_id_mapping';

SELECT '=== 정리 완료 ===' AS status;
