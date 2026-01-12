-- ============================================================
-- 050_extend_admin_products_id_to_128.sql
-- Phase 1 사전 작업: admin_products.id를 VARCHAR(128)로 확장
-- GPT 최종 지적 (A): 신규 상품 규칙이 커지면 VARCHAR(50)으로는 부족
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 현재 admin_products.id 스펙 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_SET_NAME,
    COLLATION_NAME,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'id';

-- 현재 가장 긴 id 확인
SELECT '=== 현재 가장 긴 id 확인 ===' AS info;
SELECT 
    id,
    LENGTH(id) as id_length
FROM admin_products
ORDER BY LENGTH(id) DESC
LIMIT 5;

-- ============================================================
-- 2. admin_products.id를 VARCHAR(128)로 확장
-- ============================================================
-- ⚠️ GPT 최종 지적 (A): Phase 1 시작 전 필수
-- 신규 상품이 id 컬럼에 들어가는데 50이면 부족할 수 있음
-- ⚠️ FK 제약 때문에 직접 MODIFY 불가 → FK 일시 제거 후 변경

-- 2-1. admin_products.id를 참조하는 FK 조회
SELECT '=== admin_products.id를 참조하는 FK 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'admin_products'
  AND REFERENCED_COLUMN_NAME = 'id';

-- 2-2. FK 일시 제거 (admin_products.id를 참조하는 모든 FK)
-- order_stock_issues
SET @fk_name = (
    SELECT CONSTRAINT_NAME 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'order_stock_issues' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
    LIMIT 1
);
SET @sql = IF(@fk_name IS NOT NULL, 
    CONCAT('ALTER TABLE order_stock_issues DROP FOREIGN KEY ', @fk_name),
    'SELECT ''order_stock_issues FK 없음'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- stock_units
SET @fk_name = (
    SELECT CONSTRAINT_NAME 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'stock_units' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
    LIMIT 1
);
SET @sql = IF(@fk_name IS NOT NULL, 
    CONCAT('ALTER TABLE stock_units DROP FOREIGN KEY ', @fk_name),
    'SELECT ''stock_units FK 없음'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- token_master
SET @fk_name = (
    SELECT CONSTRAINT_NAME 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'token_master' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
    LIMIT 1
);
SET @sql = IF(@fk_name IS NOT NULL, 
    CONCAT('ALTER TABLE token_master DROP FOREIGN KEY ', @fk_name),
    'SELECT ''token_master FK 없음'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2-3. 컬럼 변경
ALTER TABLE admin_products
MODIFY COLUMN id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- 2-4. 참조 테이블의 product_id 컬럼도 VARCHAR(128)로 변경
ALTER TABLE order_stock_issues
MODIFY COLUMN product_id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE stock_units
MODIFY COLUMN product_id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

ALTER TABLE token_master
MODIFY COLUMN product_id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NULL;

-- 2-5. FK 재생성
ALTER TABLE order_stock_issues
ADD CONSTRAINT order_stock_issues_ibfk_3
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

ALTER TABLE stock_units
ADD CONSTRAINT stock_units_ibfk_product_id
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

ALTER TABLE token_master
ADD CONSTRAINT token_master_ibfk_product_id
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

-- ============================================================
-- 3. 결과 확인
-- ============================================================
SELECT '=== 변경 후 admin_products.id 스펙 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_SET_NAME,
    COLLATION_NAME,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'id';

SELECT '=== admin_products.id 확장 완료 ===' AS status;
