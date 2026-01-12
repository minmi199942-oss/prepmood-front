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
SELECT '=== 2-1. FK 제약 조건 제거 ===' AS info;
ALTER TABLE order_stock_issues DROP FOREIGN KEY IF EXISTS order_stock_issues_ibfk_3;
ALTER TABLE stock_units DROP FOREIGN KEY IF EXISTS stock_units_ibfk_1;
ALTER TABLE token_master DROP FOREIGN KEY IF EXISTS fk_token_master_product_id;

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
SELECT '=== 2-7. FK 제약 조건 재생성 ===' AS info;
ALTER TABLE order_stock_issues 
ADD CONSTRAINT order_stock_issues_ibfk_3 
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

ALTER TABLE stock_units 
ADD CONSTRAINT stock_units_ibfk_1 
FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;

ALTER TABLE token_master 
ADD CONSTRAINT fk_token_master_product_id 
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
