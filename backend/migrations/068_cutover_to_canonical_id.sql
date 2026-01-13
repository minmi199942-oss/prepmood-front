-- ============================================================
-- 068_cutover_to_canonical_id.sql
-- 최종 전환: legacy ID → canonical_id로 완전 전환
-- ⚠️ 서버 중지 후 실행 (운영 중단 방식)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- canonical_id가 NULL인 상품 확인
SELECT 
    'canonical_id NULL 상품' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE canonical_id IS NULL;

-- canonical_id 중복 확인
SELECT 
    'canonical_id 중복' AS check_type,
    COUNT(*) as duplicate_count
FROM (
    SELECT canonical_id, COUNT(*) as cnt
    FROM admin_products
    WHERE canonical_id IS NOT NULL
    GROUP BY canonical_id
    HAVING cnt > 1
) AS duplicates;

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

-- ============================================================
-- 3. admin_products.id를 canonical_id로 교체
-- ============================================================
SELECT '=== 3. admin_products.id를 canonical_id로 교체 ===' AS info;

-- 임시 컬럼에 기존 id 백업 (확인용)
ALTER TABLE admin_products 
ADD COLUMN id_backup VARCHAR(128) NULL AFTER id;

UPDATE admin_products 
SET id_backup = id;

-- id를 canonical_id 값으로 교체
UPDATE admin_products
SET id = COALESCE(canonical_id, id)
WHERE canonical_id IS NOT NULL;

-- ============================================================
-- 4. 참조 테이블 업데이트
-- ============================================================
SELECT '=== 4-1. stock_units.product_id 업데이트 ===' AS info;

-- product_id_canonical이 있는 경우 그것을 사용
UPDATE stock_units
SET product_id = product_id_canonical
WHERE product_id_canonical IS NOT NULL;

-- product_id_canonical이 없는 경우 admin_products의 새 id로 업데이트
UPDATE stock_units su
JOIN admin_products ap ON su.product_id = ap.id_backup
SET su.product_id = ap.id
WHERE su.product_id_canonical IS NULL;

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

-- product_id_canonical이 있는 경우 그것을 사용
UPDATE order_items
SET product_id = product_id_canonical
WHERE product_id_canonical IS NOT NULL;

-- product_id_canonical이 없는 경우 admin_products의 새 id로 업데이트
UPDATE order_items oi
JOIN admin_products ap ON oi.product_id = ap.id_backup
SET oi.product_id = ap.id
WHERE oi.product_id_canonical IS NULL;

-- ============================================================
-- 5. FK 제약 조건 재생성
-- ============================================================
SELECT '=== 5. FK 제약 조건 재생성 ===' AS info;

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
-- 6. 백업 컬럼 제거 (선택사항)
-- ============================================================
SELECT '=== 6. 백업 컬럼 제거 ===' AS info;

-- 확인 후 제거 (필요시 주석 해제)
-- ALTER TABLE admin_products DROP COLUMN id_backup;

-- ============================================================
-- 7. 최종 확인
-- ============================================================
SELECT '=== 7. 최종 확인 ===' AS info;

-- admin_products 확인
SELECT 
    'admin_products' AS table_name,
    COUNT(*) as total,
    COUNT(CASE WHEN id LIKE '%/%' THEN 1 END) as legacy_id_count,
    COUNT(CASE WHEN id NOT LIKE '%/%' THEN 1 END) as canonical_id_count
FROM admin_products;

-- 참조 무결성 확인
SELECT 
    '참조 무결성' AS check_type,
    COUNT(*) as orphan_count
FROM (
    SELECT su.product_id
    FROM stock_units su
    LEFT JOIN admin_products ap ON su.product_id = ap.id
    WHERE su.product_id IS NOT NULL AND ap.id IS NULL
    UNION ALL
    SELECT oi.product_id
    FROM order_items oi
    LEFT JOIN admin_products ap ON oi.product_id = ap.id
    WHERE oi.product_id IS NOT NULL AND ap.id IS NULL
) AS orphans;

-- 샘플 데이터 확인
SELECT 
    id,
    name,
    short_name
FROM admin_products
ORDER BY id
LIMIT 10;

SELECT '=== Cutover 완료 ===' AS status;
