-- ============================================================
-- 073_remove_color_from_id_and_name.sql
-- admin_products.id와 admin_products.name에서 색상 정보 제거
-- 
-- 목적:
-- 1. admin_products.id에서 색상 코드 제거 (예: PM-26-SH-Teneu-Solid-LB → PM-26-SH-Teneu-Solid)
-- 2. admin_products.name에서 색상 제거 (예: "... - Black" → "...")
-- 
-- 전제 조건:
-- - product_options 테이블이 색상 SSOT (이미 구현됨)
-- - 서버 중단 가능 (FK 제약 일시 해제 필요)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인: 현재 데이터 상태 ===' AS info;

-- 1-1. admin_products.id에 색상 코드가 있는 상품 확인
SELECT 
    'admin_products.id 색상 코드 포함' AS check_type,
    id,
    name,
    CASE 
        WHEN id LIKE '%-LB' THEN 'Light Blue'
        WHEN id LIKE '%-GY' THEN 'Grey'
        WHEN id LIKE '%-LGY' THEN 'Light Grey'
        WHEN id LIKE '%-BK' THEN 'Black'
        WHEN id LIKE '%-NV' THEN 'Navy'
        WHEN id LIKE '%-WH' THEN 'White'
        WHEN id LIKE '%-WT' THEN 'White'
        ELSE '색상 코드 없음'
    END AS color_code
FROM admin_products
WHERE id LIKE '%-LB' 
   OR id LIKE '%-GY'
   OR id LIKE '%-LGY'
   OR id LIKE '%-BK'
   OR id LIKE '%-NV'
   OR id LIKE '%-WH'
   OR id LIKE '%-WT'
ORDER BY id;

-- 1-2. admin_products.name에 색상이 있는 상품 확인
SELECT 
    'admin_products.name 색상 포함' AS check_type,
    id,
    name,
    CASE 
        WHEN name LIKE '% - Black' THEN 'Black'
        WHEN name LIKE '% - Navy' THEN 'Navy'
        WHEN name LIKE '% - Light Blue' THEN 'Light Blue'
        WHEN name LIKE '% - Grey' THEN 'Grey'
        WHEN name LIKE '% - Light Grey' THEN 'Light Grey'
        WHEN name LIKE '% - White' THEN 'White'
        ELSE '색상 없음'
    END AS color_in_name
FROM admin_products
WHERE name LIKE '% - Black'
   OR name LIKE '% - Navy'
   OR name LIKE '% - Light Blue'
   OR name LIKE '% - Grey'
   OR name LIKE '% - Light Grey'
   OR name LIKE '% - White'
ORDER BY id;

-- 1-3. FK 제약 확인
SELECT '=== 1-3. FK 제약 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'admin_products'
  AND REFERENCED_COLUMN_NAME = 'id'
ORDER BY TABLE_NAME;

-- ============================================================
-- 2. FK 제약 일시 제거
-- ============================================================
SELECT '=== 2. FK 제약 일시 제거 ===' AS info;

-- 2-1. stock_units FK 제거
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

-- 2-2. token_master FK 제거
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

-- 2-3. order_stock_issues FK 제거
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

-- 2-4. product_options FK 제거
SET @fk_name = (
    SELECT CONSTRAINT_NAME 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'product_options' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
    LIMIT 1
);
SET @sql = IF(@fk_name IS NOT NULL, 
    CONCAT('ALTER TABLE product_options DROP FOREIGN KEY ', @fk_name),
    'SELECT ''product_options FK 없음'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2-5. cart_items FK 제거 (있는 경우)
SET @fk_name = (
    SELECT CONSTRAINT_NAME 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'cart_items' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
    LIMIT 1
);
SET @sql = IF(@fk_name IS NOT NULL, 
    CONCAT('ALTER TABLE cart_items DROP FOREIGN KEY ', @fk_name),
    'SELECT ''cart_items FK 없음'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. admin_products.id에서 색상 코드 제거
-- ============================================================
SELECT '=== 3. admin_products.id에서 색상 코드 제거 ===' AS info;

-- 3-1. 매핑 테이블 생성 (old_id → new_id)
CREATE TEMPORARY TABLE IF NOT EXISTS product_id_mapping (
    old_id VARCHAR(128) PRIMARY KEY,
    new_id VARCHAR(128) NOT NULL
);

-- 3-2. 매핑 데이터 생성
INSERT INTO product_id_mapping (old_id, new_id)
SELECT 
    id AS old_id,
    CASE 
        WHEN id LIKE '%-LB' THEN SUBSTRING(id, 1, LENGTH(id) - 3)
        WHEN id LIKE '%-GY' THEN SUBSTRING(id, 1, LENGTH(id) - 3)
        WHEN id LIKE '%-LGY' THEN SUBSTRING(id, 1, LENGTH(id) - 4)
        WHEN id LIKE '%-BK' THEN SUBSTRING(id, 1, LENGTH(id) - 3)
        WHEN id LIKE '%-NV' THEN SUBSTRING(id, 1, LENGTH(id) - 3)
        WHEN id LIKE '%-WH' THEN SUBSTRING(id, 1, LENGTH(id) - 3)
        WHEN id LIKE '%-WT' THEN SUBSTRING(id, 1, LENGTH(id) - 3)
        ELSE id
    END AS new_id
FROM admin_products
WHERE id LIKE '%-LB' 
   OR id LIKE '%-GY'
   OR id LIKE '%-LGY'
   OR id LIKE '%-BK'
   OR id LIKE '%-NV'
   OR id LIKE '%-WH'
   OR id LIKE '%-WT';

-- 3-3. 매핑 확인
SELECT '=== 3-3. ID 매핑 확인 ===' AS info;
SELECT * FROM product_id_mapping ORDER BY old_id;

-- 3-4. 중복 확인 (new_id가 중복되는지)
SELECT '=== 3-4. new_id 중복 확인 ===' AS info;
SELECT 
    new_id,
    COUNT(*) as count,
    GROUP_CONCAT(old_id ORDER BY old_id) as old_ids
FROM product_id_mapping
GROUP BY new_id
HAVING count > 1;

-- ⚠️ 중복이 있으면 여기서 중단하고 수동 처리 필요
-- 중복이 없으면 계속 진행

-- 3-5. 참조 테이블 업데이트 (admin_products.id 업데이트 전에)
-- stock_units
UPDATE stock_units su
INNER JOIN product_id_mapping m ON su.product_id = m.old_id
SET su.product_id = m.new_id;

-- token_master
UPDATE token_master tm
INNER JOIN product_id_mapping m ON tm.product_id = m.old_id
SET tm.product_id = m.new_id;

-- order_stock_issues
UPDATE order_stock_issues osi
INNER JOIN product_id_mapping m ON osi.product_id = m.old_id
SET osi.product_id = m.new_id;

-- product_options
UPDATE product_options po
INNER JOIN product_id_mapping m ON po.product_id = m.old_id
SET po.product_id = m.new_id;

-- cart_items
UPDATE cart_items ci
INNER JOIN product_id_mapping m ON ci.product_id = m.old_id
SET ci.product_id = m.new_id;

-- order_items (FK 없지만 참조하므로 업데이트)
UPDATE order_items oi
INNER JOIN product_id_mapping m ON oi.product_id = m.old_id
SET oi.product_id = m.new_id;

-- 3-6. admin_products.id 업데이트
UPDATE admin_products ap
INNER JOIN product_id_mapping m ON ap.id = m.old_id
SET ap.id = m.new_id;

-- ============================================================
-- 4. admin_products.name에서 색상 제거
-- ============================================================
SELECT '=== 4. admin_products.name에서 색상 제거 ===' AS info;

UPDATE admin_products
SET name = TRIM(SUBSTRING_INDEX(name, ' - Black', 1))
WHERE name LIKE '% - Black';

UPDATE admin_products
SET name = TRIM(SUBSTRING_INDEX(name, ' - Navy', 1))
WHERE name LIKE '% - Navy';

UPDATE admin_products
SET name = TRIM(SUBSTRING_INDEX(name, ' - Light Blue', 1))
WHERE name LIKE '% - Light Blue';

UPDATE admin_products
SET name = TRIM(SUBSTRING_INDEX(name, ' - Grey', 1))
WHERE name LIKE '% - Grey';

UPDATE admin_products
SET name = TRIM(SUBSTRING_INDEX(name, ' - Light Grey', 1))
WHERE name LIKE '% - Light Grey';

UPDATE admin_products
SET name = TRIM(SUBSTRING_INDEX(name, ' - White', 1))
WHERE name LIKE '% - White';

-- ============================================================
-- 5. FK 제약 재설정
-- ============================================================
SELECT '=== 5. FK 제약 재설정 ===' AS info;

-- 5-1. stock_units FK 재설정
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'stock_units' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE stock_units ADD CONSTRAINT stock_units_ibfk_product_id FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT',
    'SELECT "stock_units FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5-2. token_master FK 재설정
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

-- 5-3. order_stock_issues FK 재설정
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

-- 5-4. product_options FK 재설정
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'product_options' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE product_options ADD CONSTRAINT product_options_ibfk_product_id FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT',
    'SELECT "product_options FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 5-5. cart_items FK 재설정 (원래 있었다면)
-- ⚠️ 원래 FK가 있었는지 확인 필요, 없었다면 생략
-- SET @fk_exists = (
--     SELECT COUNT(*) 
--     FROM information_schema.KEY_COLUMN_USAGE 
--     WHERE TABLE_SCHEMA = 'prepmood' 
--       AND TABLE_NAME = 'cart_items' 
--       AND REFERENCED_TABLE_NAME = 'admin_products'
--       AND REFERENCED_COLUMN_NAME = 'id'
-- );
-- SET @sql = IF(@fk_exists = 0,
--     'ALTER TABLE cart_items ADD CONSTRAINT cart_items_ibfk_product_id FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE CASCADE',
--     'SELECT "cart_items FK가 이미 존재합니다." AS info'
-- );
-- PREPARE stmt FROM @sql;
-- EXECUTE stmt;
-- DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. 정합성 검증
-- ============================================================
SELECT '=== 6. 정합성 검증 ===' AS info;

-- 6-1. admin_products.id에 색상 코드가 남아있는지 확인
SELECT 
    'admin_products.id 색상 코드 잔존 확인' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE id LIKE '%-LB' 
   OR id LIKE '%-GY'
   OR id LIKE '%-LGY'
   OR id LIKE '%-BK'
   OR id LIKE '%-NV'
   OR id LIKE '%-WH'
   OR id LIKE '%-WT';

-- 6-2. admin_products.name에 색상이 남아있는지 확인
SELECT 
    'admin_products.name 색상 잔존 확인' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE name LIKE '% - Black'
   OR name LIKE '% - Navy'
   OR name LIKE '% - Light Blue'
   OR name LIKE '% - Grey'
   OR name LIKE '% - Light Grey'
   OR name LIKE '% - White';

-- 6-3. 참조 무결성 확인 (고아 레코드 확인)
SELECT 
    'stock_units 고아 레코드' AS check_type,
    COUNT(*) as orphan_count
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id = ap.id
WHERE ap.id IS NULL;

SELECT 
    'token_master 고아 레코드' AS check_type,
    COUNT(*) as orphan_count
FROM token_master tm
LEFT JOIN admin_products ap ON tm.product_id = ap.id
WHERE ap.id IS NULL;

SELECT 
    'order_stock_issues 고아 레코드' AS check_type,
    COUNT(*) as orphan_count
FROM order_stock_issues osi
LEFT JOIN admin_products ap ON osi.product_id = ap.id
WHERE ap.id IS NULL;

SELECT 
    'product_options 고아 레코드' AS check_type,
    COUNT(*) as orphan_count
FROM product_options po
LEFT JOIN admin_products ap ON po.product_id = ap.id
WHERE ap.id IS NULL;

SELECT 
    'order_items 고아 레코드' AS check_type,
    COUNT(*) as orphan_count
FROM order_items oi
LEFT JOIN admin_products ap ON oi.product_id = ap.id
WHERE ap.id IS NULL;

-- 6-4. 최종 결과 확인
SELECT '=== 6-4. 최종 결과 확인 ===' AS info;
SELECT 
    id,
    name,
    short_name
FROM admin_products
ORDER BY id;

-- ============================================================
-- 7. 임시 테이블 정리
-- ============================================================
DROP TEMPORARY TABLE IF EXISTS product_id_mapping;

SELECT '=== 마이그레이션 완료 ===' AS status;
