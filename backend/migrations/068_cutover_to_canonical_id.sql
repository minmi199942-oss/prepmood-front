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

-- 1-1. canonical_id가 NULL인 상품 확인
SELECT 
    'canonical_id NULL 상품' AS check_type,
    COUNT(*) as count
FROM admin_products
WHERE canonical_id IS NULL;

-- 1-2. canonical_id 중복 확인 (어떤 값이 중복인지 출력)
SELECT 
    'canonical_id 중복 상세' AS check_type,
    canonical_id,
    COUNT(*) as duplicate_count,
    GROUP_CONCAT(id ORDER BY id SEPARATOR ', ') as conflicting_ids,
    GROUP_CONCAT(name ORDER BY id SEPARATOR ' | ') as conflicting_names
FROM admin_products
WHERE canonical_id IS NOT NULL
GROUP BY canonical_id
HAVING COUNT(*) > 1;

-- 1-3. admin_products(id)를 참조하는 FK 전수 목록
SELECT '=== 1-3. admin_products(id)를 참조하는 FK 전수 목록 ===' AS info;
SELECT
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'admin_products'
  AND REFERENCED_COLUMN_NAME = 'id';

-- 1-4. product_id 컬럼을 가진 테이블 전수 스캔
SELECT '=== 1-4. product_id 컬럼을 가진 테이블 전수 스캔 ===' AS info;
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND COLUMN_NAME IN ('product_id', 'product_id_canonical')
ORDER BY TABLE_NAME, COLUMN_NAME;

-- ============================================================
-- 2. FK 제약 조건 제거 (동적 - 모든 FK 제거)
-- ============================================================
SELECT '=== 2-1. FK 제약 조건 제거 (동적) ===' AS info;

-- admin_products(id)를 참조하는 모든 FK를 동적으로 제거
-- 각 테이블별로 FK를 찾아서 제거
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
    'SELECT "order_stock_issues FK 없음" AS info'
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
    'SELECT "stock_units FK 없음" AS info'
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
    'SELECT "token_master FK 없음" AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ⚠️ 추가 FK가 있는지 확인 (1-3에서 확인한 목록과 비교 필요)
SELECT '=== 2-2. 남은 FK 확인 ===' AS info;
SELECT
    TABLE_NAME,
    CONSTRAINT_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'admin_products'
  AND REFERENCED_COLUMN_NAME = 'id';

-- ============================================================
-- 3. admin_products.id를 canonical_id로 교체
-- ============================================================
SELECT '=== 3. admin_products.id를 canonical_id로 교체 ===' AS info;

-- 3-1. id_backup 컬럼 추가 (재실행 안전)
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

-- 3-2. id_backup에 기존 id 백업 (이미 값이 있으면 스킵)
UPDATE admin_products 
SET id_backup = id
WHERE id_backup IS NULL;

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
-- 5. FK 제약 조건 재생성 (동적)
-- ============================================================
SELECT '=== 5. FK 제약 조건 재생성 (동적) ===' AS info;

-- FK 재생성: 각 테이블별로 동적으로 생성
-- order_stock_issues
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

-- stock_units
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

-- token_master
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'token_master' 
      AND REFERENCED_TABLE_NAME = 'admin_products'
      AND REFERENCED_COLUMN_NAME = 'id'
);
SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE token_master ADD CONSTRAINT fk_token_master_product_id FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT',
    'SELECT "token_master FK가 이미 존재합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

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

-- 참조 무결성 확인 (모든 참조 테이블)
SELECT '=== 7-2. 참조 무결성 확인 (상세) ===' AS info;

-- stock_units orphan 확인
SELECT 
    'stock_units' AS table_name,
    COUNT(*) as orphan_count,
    GROUP_CONCAT(DISTINCT su.product_id ORDER BY su.product_id SEPARATOR ', ') as orphan_ids
FROM stock_units su
LEFT JOIN admin_products ap ON su.product_id = ap.id
WHERE su.product_id IS NOT NULL AND ap.id IS NULL;

-- order_items orphan 확인
SELECT 
    'order_items' AS table_name,
    COUNT(*) as orphan_count,
    GROUP_CONCAT(DISTINCT oi.product_id ORDER BY oi.product_id SEPARATOR ', ') as orphan_ids
FROM order_items oi
LEFT JOIN admin_products ap ON oi.product_id = ap.id
WHERE oi.product_id IS NOT NULL AND ap.id IS NULL;

-- order_stock_issues orphan 확인
SELECT 
    'order_stock_issues' AS table_name,
    COUNT(*) as orphan_count,
    GROUP_CONCAT(DISTINCT osi.product_id ORDER BY osi.product_id SEPARATOR ', ') as orphan_ids
FROM order_stock_issues osi
LEFT JOIN admin_products ap ON osi.product_id = ap.id
WHERE osi.product_id IS NOT NULL AND ap.id IS NULL;

-- token_master orphan 확인
SELECT 
    'token_master' AS table_name,
    COUNT(*) as orphan_count,
    GROUP_CONCAT(DISTINCT tm.product_id ORDER BY tm.product_id SEPARATOR ', ') as orphan_ids
FROM token_master tm
LEFT JOIN admin_products ap ON tm.product_id = ap.id
WHERE tm.product_id IS NOT NULL AND ap.id IS NULL;

-- 샘플 데이터 확인
SELECT 
    id,
    name,
    short_name
FROM admin_products
ORDER BY id
LIMIT 10;

SELECT '=== Cutover 완료 ===' AS status;
