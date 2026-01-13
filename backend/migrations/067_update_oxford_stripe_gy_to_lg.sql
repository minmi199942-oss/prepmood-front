-- ============================================================
-- 067_update_oxford_stripe_gy_to_lg.sql
-- Oxford Stripe 셔츠의 색상 코드 GY → LG 변경
-- 이유: 실제 색상이 Light Grey인데 GY는 Grey로 매핑되어 불일치 발생
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 변경 대상 상품 확인
-- ============================================================
SELECT '=== 1. 변경 대상 상품 확인 ===' AS info;

SELECT 
    id,
    canonical_id,
    name,
    short_name
FROM admin_products
WHERE id LIKE '%Oxford-Stripe-GY%' OR canonical_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 2. FK 제약 조건 제거 (필요한 경우)
-- ============================================================
SELECT '=== 2-1. FK 제약 조건 제거 ===' AS info;

-- order_stock_issues FK 확인 및 제거
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'order_stock_issues' 
      AND CONSTRAINT_NAME = 'order_stock_issues_ibfk_3'
);

SET @sql = IF(@fk_exists > 0,
    'ALTER TABLE order_stock_issues DROP FOREIGN KEY order_stock_issues_ibfk_3',
    'SELECT "order_stock_issues_ibfk_3 FK가 존재하지 않습니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- stock_units FK 확인 및 제거
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'stock_units' 
      AND CONSTRAINT_NAME = 'stock_units_ibfk_1'
);

SET @sql = IF(@fk_exists > 0,
    'ALTER TABLE stock_units DROP FOREIGN KEY stock_units_ibfk_1',
    'SELECT "stock_units_ibfk_1 FK가 존재하지 않습니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- token_master FK 확인 및 제거
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'token_master' 
      AND CONSTRAINT_NAME = 'fk_token_master_product_id'
);

SET @sql = IF(@fk_exists > 0,
    'ALTER TABLE token_master DROP FOREIGN KEY fk_token_master_product_id',
    'SELECT "fk_token_master_product_id FK가 존재하지 않습니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. admin_products.id 업데이트
-- ============================================================
SELECT '=== 2-2. admin_products.id 업데이트 ===' AS info;

UPDATE admin_products
SET id = REPLACE(id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 4. admin_products.canonical_id 업데이트
-- ============================================================
SELECT '=== 2-3. admin_products.canonical_id 업데이트 ===' AS info;

UPDATE admin_products
SET canonical_id = REPLACE(canonical_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE canonical_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 5. stock_units.product_id 업데이트
-- ============================================================
SELECT '=== 2-4. stock_units.product_id 업데이트 ===' AS info;

UPDATE stock_units
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 6. stock_units.product_id_canonical 업데이트
-- ============================================================
SELECT '=== 2-5. stock_units.product_id_canonical 업데이트 ===' AS info;

UPDATE stock_units
SET product_id_canonical = REPLACE(product_id_canonical, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id_canonical LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 7. order_stock_issues.product_id 업데이트
-- ============================================================
SELECT '=== 2-6. order_stock_issues.product_id 업데이트 ===' AS info;

UPDATE order_stock_issues
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 8. token_master.product_id 업데이트
-- ============================================================
SELECT '=== 2-7. token_master.product_id 업데이트 ===' AS info;

UPDATE token_master
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 9. order_items.product_id 업데이트
-- ============================================================
SELECT '=== 2-8. order_items.product_id 업데이트 ===' AS info;

UPDATE order_items
SET product_id = REPLACE(product_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 10. order_items.product_id_canonical 업데이트
-- ============================================================
SELECT '=== 2-9. order_items.product_id_canonical 업데이트 ===' AS info;

UPDATE order_items
SET product_id_canonical = REPLACE(product_id_canonical, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE product_id_canonical LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 11. FK 제약 조건 재생성
-- ============================================================
SELECT '=== 2-10. FK 제약 조건 재생성 ===' AS info;

-- order_stock_issues FK 재생성
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'order_stock_issues' 
      AND CONSTRAINT_NAME = 'order_stock_issues_ibfk_3'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE order_stock_issues ADD CONSTRAINT order_stock_issues_ibfk_3 FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE CASCADE',
    'SELECT "order_stock_issues_ibfk_3 FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- stock_units FK 재생성
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'stock_units' 
      AND CONSTRAINT_NAME = 'stock_units_ibfk_1'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE stock_units ADD CONSTRAINT stock_units_ibfk_1 FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE CASCADE',
    'SELECT "stock_units_ibfk_1 FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- token_master FK 재생성
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.TABLE_CONSTRAINTS 
    WHERE CONSTRAINT_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'token_master' 
      AND CONSTRAINT_NAME = 'fk_token_master_product_id'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE token_master ADD CONSTRAINT fk_token_master_product_id FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE CASCADE',
    'SELECT "fk_token_master_product_id FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 12. product_id_mapping 업데이트
-- ============================================================
SELECT '=== 3. product_id_mapping 업데이트 ===' AS info;

UPDATE product_id_mapping
SET old_id = REPLACE(old_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG'),
    new_id = REPLACE(new_id, 'Oxford-Stripe-GY', 'Oxford-Stripe-LG')
WHERE old_id LIKE '%Oxford-Stripe-GY%' OR new_id LIKE '%Oxford-Stripe-GY%';

-- ============================================================
-- 4. 변경 결과 확인
-- ============================================================
SELECT '=== 4. 변경 결과 확인 ===' AS info;

SELECT 
    'GY 남은 상품' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE id LIKE '%Oxford-Stripe-GY%' OR canonical_id LIKE '%Oxford-Stripe-GY%'
UNION ALL
SELECT 
    'LG 변경된 상품' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE id LIKE '%Oxford-Stripe-LG%' OR canonical_id LIKE '%Oxford-Stripe-LG%';

SELECT 
    id,
    canonical_id,
    name
FROM admin_products
WHERE id LIKE '%Oxford-Stripe-LG%' OR canonical_id LIKE '%Oxford-Stripe-LG%';

-- 참조 무결성 확인
SELECT 
    '참조 무결성' AS check_type,
    COUNT(*) as orphan_count
FROM (
    SELECT su.product_id
    FROM stock_units su
    LEFT JOIN admin_products ap ON su.product_id = ap.id
    WHERE su.product_id LIKE '%Oxford-Stripe-LG%'
      AND ap.id IS NULL
    UNION ALL
    SELECT oi.product_id
    FROM order_items oi
    LEFT JOIN admin_products ap ON oi.product_id = ap.id
    WHERE oi.product_id LIKE '%Oxford-Stripe-LG%'
      AND ap.id IS NULL
) AS orphans;

SELECT '=== Oxford Stripe GY → LG 변경 완료 ===' AS status;
