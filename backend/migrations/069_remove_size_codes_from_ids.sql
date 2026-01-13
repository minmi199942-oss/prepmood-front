-- ============================================================
-- 069_remove_size_codes_from_ids.sql
-- Cutover 후 사이즈 코드 제거 (예: -S, -M, -L, -F)
-- ⚠️ 서버 중지 후 실행
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사이즈 코드가 포함된 ID 확인 ===' AS info;

SELECT 
    id,
    name,
    CASE 
        WHEN id REGEXP '-S$' THEN 'S'
        WHEN id REGEXP '-M$' THEN 'M'
        WHEN id REGEXP '-L$' THEN 'L'
        WHEN id REGEXP '-XL$' THEN 'XL'
        WHEN id REGEXP '-XXL$' THEN 'XXL'
        WHEN id REGEXP '-F$' THEN 'F'
        ELSE '없음'
    END AS size_code
FROM admin_products
WHERE id REGEXP '-(S|M|L|XL|XXL|F)$'
ORDER BY id;

-- ============================================================
-- 2. FK 제약 조건 제거
-- ============================================================
SELECT '=== 2-1. FK 제약 조건 제거 ===' AS info;

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
-- 3. admin_products.id에서 사이즈 코드 제거
-- ============================================================
SELECT '=== 3. admin_products.id에서 사이즈 코드 제거 ===' AS info;

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
WHERE id_backup IS NULL;

-- 사이즈 코드 제거: -S, -M, -L, -XL, -XXL, -F 제거
-- MySQL 버전 호환성을 위해 각 사이즈 코드별로 처리
UPDATE admin_products
SET id = CASE
    WHEN id LIKE '%-XXL' THEN SUBSTRING(id, 1, LENGTH(id) - 4)
    WHEN id LIKE '%-XL' THEN SUBSTRING(id, 1, LENGTH(id) - 3)
    WHEN id LIKE '%-F' THEN SUBSTRING(id, 1, LENGTH(id) - 2)
    WHEN id LIKE '%-M' THEN SUBSTRING(id, 1, LENGTH(id) - 2)
    WHEN id LIKE '%-L' THEN SUBSTRING(id, 1, LENGTH(id) - 2)
    WHEN id LIKE '%-S' THEN SUBSTRING(id, 1, LENGTH(id) - 2)
    ELSE id
END
WHERE id REGEXP '-(S|M|L|XL|XXL|F)$';

-- ============================================================
-- 4. 참조 테이블 업데이트
-- ============================================================
SELECT '=== 4-1. stock_units.product_id 업데이트 ===' AS info;

UPDATE stock_units su
JOIN admin_products ap ON su.product_id = ap.id_backup
SET su.product_id = ap.id
WHERE su.product_id = ap.id_backup;

-- product_id_canonical도 업데이트
UPDATE stock_units su
JOIN admin_products ap ON su.product_id_canonical = ap.id_backup
SET su.product_id_canonical = ap.id
WHERE su.product_id_canonical = ap.id_backup;

SELECT '=== 4-2. order_stock_issues.product_id 업데이트 ===' AS info;

UPDATE order_stock_issues osi
JOIN admin_products ap ON osi.product_id = ap.id_backup
SET osi.product_id = ap.id
WHERE osi.product_id = ap.id_backup;

SELECT '=== 4-3. token_master.product_id 업데이트 ===' AS info;

UPDATE token_master tm
JOIN admin_products ap ON tm.product_id = ap.id_backup
SET tm.product_id = ap.id
WHERE tm.product_id = ap.id_backup;

SELECT '=== 4-4. order_items.product_id 업데이트 ===' AS info;

UPDATE order_items oi
JOIN admin_products ap ON oi.product_id = ap.id_backup
SET oi.product_id = ap.id
WHERE oi.product_id = ap.id_backup;

-- product_id_canonical도 업데이트
UPDATE order_items oi
JOIN admin_products ap ON oi.product_id_canonical = ap.id_backup
SET oi.product_id_canonical = ap.id
WHERE oi.product_id_canonical = ap.id_backup;

SELECT '=== 4-5. cart_items.product_id 업데이트 ===' AS info;

UPDATE cart_items ci
JOIN admin_products ap ON ci.product_id = ap.id_backup
SET ci.product_id = ap.id
WHERE ci.product_id = ap.id_backup;

SELECT '=== 4-6. wishlists.product_id 업데이트 ===' AS info;

UPDATE wishlists w
JOIN admin_products ap ON w.product_id = ap.id_backup
SET w.product_id = ap.id
WHERE w.product_id = ap.id_backup;

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

-- 사이즈 코드가 남아있는지 확인
SELECT 
    '사이즈 코드 남은 ID' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE id REGEXP '-(S|M|L|XL|XXL|F)$';

-- 샘플 확인
SELECT 
    id,
    id_backup,
    name
FROM admin_products
ORDER BY id
LIMIT 10;

-- 참조 무결성 확인
SELECT 
    'stock_units' AS table_name,
    COUNT(*) as orphan_count
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id = ap.id
WHERE su.product_id IS NOT NULL AND ap.id IS NULL
UNION ALL
SELECT 
    'order_items' AS table_name,
    COUNT(*) as orphan_count
FROM order_items oi
LEFT JOIN admin_products ap ON oi.product_id = ap.id
WHERE oi.product_id IS NOT NULL AND ap.id IS NULL;

SELECT '=== 사이즈 코드 제거 완료 ===' AS status;
