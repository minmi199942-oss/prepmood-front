-- ============================================================
-- 052_update_pm25_to_pm26.sql
-- PM-25 → PM-26 변경 (2026년 컬렉션)
-- ⚠️ 마이그레이션 전에 실행 필요
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. PM-25 상품 확인 ===' AS info;
SELECT 
    COUNT(*) as total_pm25_products,
    GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as pm25_ids
FROM admin_products
WHERE id LIKE 'PM-25-%';

-- ============================================================
-- 2. admin_products.id 업데이트
-- ============================================================
-- ⚠️ FK 제약 때문에 직접 UPDATE 불가 → FK 일시 제거 후 변경
-- 하지만 이미 050번에서 FK를 제거했다가 다시 추가했으므로,
-- 여기서는 FK를 다시 제거하고 업데이트 후 재생성

-- 2-1. FK 제약 조건 제거
-- ⚠️ FK 이름을 동적으로 찾아서 제거 (050번과 동일한 방식)
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
    'SELECT ''order_stock_issues FK 없음'' AS info'
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
    'SELECT ''stock_units FK 없음'' AS info'
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
    'SELECT ''token_master FK 없음'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2-2. admin_products.id 업데이트
SELECT '=== 2-2. admin_products.id 업데이트 ===' AS info;
UPDATE admin_products
SET id = REPLACE(id, 'PM-25-', 'PM-26-')
WHERE id LIKE 'PM-25-%';

-- 2-3. 참조 테이블 업데이트
SELECT '=== 2-3. stock_units.product_id 업데이트 ===' AS info;
UPDATE stock_units
SET product_id = REPLACE(product_id, 'PM-25-', 'PM-26-')
WHERE product_id LIKE 'PM-25-%';

SELECT '=== 2-4. order_stock_issues.product_id 업데이트 ===' AS info;
UPDATE order_stock_issues
SET product_id = REPLACE(product_id, 'PM-25-', 'PM-26-')
WHERE product_id LIKE 'PM-25-%';

SELECT '=== 2-5. token_master.product_id 업데이트 ===' AS info;
UPDATE token_master
SET product_id = REPLACE(product_id, 'PM-25-', 'PM-26-')
WHERE product_id LIKE 'PM-25-%';

SELECT '=== 2-6. order_items.product_id 업데이트 ===' AS info;
UPDATE order_items
SET product_id = REPLACE(product_id, 'PM-25-', 'PM-26-')
WHERE product_id LIKE 'PM-25-%';

-- 2-7. FK 제약 조건 재생성
-- ⚠️ FK 이름은 동적으로 생성되므로, 기본 이름 사용
SELECT '=== 2-7. FK 제약 조건 재생성 ===' AS info;

-- order_stock_issues FK 재생성
ALTER TABLE order_stock_issues 
ADD CONSTRAINT order_stock_issues_ibfk_3 
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

-- stock_units FK 재생성
ALTER TABLE stock_units 
ADD CONSTRAINT stock_units_ibfk_1 
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

-- token_master FK 재생성 (실제 FK 이름 확인 필요)
ALTER TABLE token_master 
ADD CONSTRAINT token_master_ibfk_product_id 
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

-- ============================================================
-- 3. product_id_mapping 업데이트 (이미 생성된 경우)
-- ============================================================
SELECT '=== 3. product_id_mapping 업데이트 ===' AS info;

-- 매핑 테이블이 존재하는지 확인
SET @mapping_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLES 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'product_id_mapping'
);

SET @sql = IF(@mapping_exists > 0,
    'UPDATE product_id_mapping SET old_id = REPLACE(old_id, ''PM-25-'', ''PM-26-''), new_id = REPLACE(new_id, ''PM-25-'', ''PM-26-'') WHERE old_id LIKE ''PM-25-%'' OR new_id LIKE ''PM-25-%''',
    'SELECT ''product_id_mapping 테이블이 아직 생성되지 않았습니다.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. 결과 확인
-- ============================================================
SELECT '=== 4. 변경 결과 확인 ===' AS info;

-- PM-25 남아있는지 확인
SELECT 
    'PM-25 남은 상품' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE id LIKE 'PM-25-%';

-- PM-26 상품 확인
SELECT 
    'PM-26 상품' AS check_type,
    COUNT(*) as count,
    GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as pm26_ids
FROM admin_products
WHERE id LIKE 'PM-26-%';

-- 참조 무결성 확인
SELECT 
    '참조 무결성' AS check_type,
    COUNT(*) as orphan_count
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id = ap.id
WHERE su.product_id IS NOT NULL AND ap.id IS NULL;

SELECT '=== PM-25 → PM-26 변경 완료 ===' AS status;
