-- ============================================================
-- 066_add_order_items_canonical_id.sql
-- order_items에 product_id_canonical 컬럼 추가 (dual-write 지원)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. order_items.product_id_canonical 컬럼 추가
-- ============================================================
SET @col_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'order_items' 
      AND COLUMN_NAME = 'product_id_canonical'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE order_items ADD COLUMN product_id_canonical VARCHAR(128) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL AFTER product_id',
    'SELECT ''product_id_canonical 컬럼이 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '=== order_items.product_id_canonical 컬럼 추가 완료 ===' AS status;

-- ============================================================
-- 2. 인덱스 추가 (조회 성능)
-- ============================================================
SET @idx_exists = (
    SELECT COUNT(*) 
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'order_items' 
      AND INDEX_NAME = 'idx_order_items_product_id_canonical'
);

SET @sql = IF(@idx_exists = 0,
    'CREATE INDEX idx_order_items_product_id_canonical ON order_items(product_id_canonical)',
    'SELECT ''idx_order_items_product_id_canonical 인덱스가 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '=== 인덱스 추가 완료 ===' AS status;

-- ============================================================
-- 3. 결과 확인
-- ============================================================
SELECT '=== 컬럼 추가 결과 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_SET_NAME,
    COLLATION_NAME,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'order_items'
  AND COLUMN_NAME = 'product_id_canonical';

SELECT '=== 인덱스 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    INDEX_TYPE,
    NON_UNIQUE,
    COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'order_items'
  AND INDEX_NAME = 'idx_order_items_product_id_canonical';

SELECT '=== order_items.product_id_canonical 컬럼 추가 완료 ===' AS status;
