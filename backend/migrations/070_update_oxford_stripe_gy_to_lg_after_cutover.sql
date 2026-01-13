-- ============================================================
-- 070_update_oxford_stripe_gy_to_lg_after_cutover.sql
-- Cutover 후 Oxford Stripe 셔츠의 색상 코드 GY → LG 변경
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 변경 대상 확인
-- ============================================================
SELECT '=== 1. 변경 대상 확인 ===' AS info;

SELECT 
    id,
    name
FROM admin_products
WHERE id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 2. FK 제약 조건 제거
-- ============================================================
SELECT '=== 2. FK 제약 조건 제거 ===' AS info;

-- order_stock_issues FK 제거
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
    'SELECT "order_stock_issues FK 없음" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- stock_units FK 제거
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
    'SELECT "stock_units FK 없음" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- token_master FK 제거
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
    'SELECT "token_master FK 없음" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. admin_products.id 업데이트
-- ============================================================
SELECT '=== 3. admin_products.id 업데이트 ===' AS info;

-- id_backup에 현재 id 저장 (이미 있으면 스킵)
SET @column_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'admin_products' 
      AND COLUMN_NAME = 'id_backup'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE admin_products ADD COLUMN id_backup VARCHAR(128) NULL AFTER id',
    'SELECT "id_backup 컬럼이 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- id_backup에 현재 id 저장 (이미 값이 있으면 스킵)
UPDATE admin_products 
SET id_backup = id
WHERE id_backup IS NULL AND id LIKE '%Oxford-Stripe-GY%';

-- id 업데이트: GY → LG
UPDATE admin_products
SET id = REPLACE(id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 4. 참조 테이블 업데이트
-- ============================================================
SELECT '=== 4-1. stock_units.product_id 업데이트 ===' AS info;

UPDATE stock_units
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

-- product_id_canonical도 업데이트
UPDATE stock_units
SET product_id_canonical = REPLACE(product_id_canonical, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id_canonical LIKE '%Oxford-Stripe-GY%';

SELECT '=== 4-2. order_stock_issues.product_id 업데이트 ===' AS info;

UPDATE order_stock_issues
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

SELECT '=== 4-3. token_master.product_id 업데이트 ===' AS info;

UPDATE token_master
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

SELECT '=== 4-4. order_items.product_id 업데이트 ===' AS info;

UPDATE order_items
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

-- product_id_canonical도 업데이트
UPDATE order_items
SET product_id_canonical = REPLACE(product_id_canonical, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id_canonical LIKE '%Oxford-Stripe-GY%';

SELECT '=== 4-5. cart_items.product_id 업데이트 ===' AS info;

UPDATE cart_items
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

SELECT '=== 4-6. wishlists.product_id 업데이트 ===' AS info;

UPDATE wishlists
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 5. FK 제약 조건 재생성
-- ============================================================
SELECT '=== 5. FK 제약 조건 재생성 ===' AS info;

-- order_stock_issues FK 재생성
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'order_stock_issues' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE order_stock_issues ADD CONSTRAINT order_stock_issues_ibfk_3 FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT',
    'SELECT "order_stock_issues FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- stock_units FK 재생성
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'stock_units' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE stock_units ADD CONSTRAINT stock_units_ibfk_1 FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT',
    'SELECT "stock_units FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- token_master FK 재생성
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'token_master' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE token_master ADD CONSTRAINT token_master_ibfk_product_id FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT',
    'SELECT "token_master FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. 최종 확인
-- ============================================================
SELECT '=== 6. 최종 확인 ===' AS info;

-- GY 남아있는지 확인
SELECT 
    'GY 남은 상품' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE id LIKE '%Oxford-Stripe-GY%';

-- LG 변경된 상품 확인
SELECT 
    id,
    name
FROM admin_products
WHERE id LIKE '%Oxford-Stripe-LG%';

-- 참조 무결성 확인
SELECT 
    'stock_units' AS table_name,
    COUNT(*) as orphan_count
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id = ap.id
WHERE su.product_id IS NOT NULL AND ap.id IS NULL
UNION ALL
SELECT 
    'token_master' AS table_name,
    COUNT(*) as orphan_count
FROM token_master tm
LEFT JOIN admin_products ap ON tm.product_id = ap.id
WHERE tm.product_id IS NOT NULL AND ap.id IS NULL;

SELECT '=== Oxford Stripe GY → LG 변경 완료 ===' AS status;
