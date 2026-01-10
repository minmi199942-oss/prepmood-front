-- ============================================================
-- 047_restore_all_token_master_fks.sql
-- token_master 초기화 후 모든 FK 복원 (stock_units, order_item_units, warranties)
-- 044에서 제거되었을 수 있는 모든 FK를 복원
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 현재 FK 상태 확인
-- ============================================================
SELECT '=== 현재 token_master를 참조하는 FK 상태 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token_pk'
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- ============================================================
-- 2. 참조 무결성 확인 (각 테이블별)
-- ============================================================
SELECT '=== 참조 무결성 확인: stock_units ===' AS info;
SELECT 
    COUNT(*) as total_stock_units,
    COUNT(CASE WHEN su.token_pk IS NOT NULL THEN 1 END) as units_with_token_pk,
    COUNT(CASE WHEN su.token_pk IS NOT NULL AND tm.token_pk IS NULL THEN 1 END) as orphaned_units
FROM stock_units su
LEFT JOIN token_master tm ON su.token_pk = tm.token_pk;

SELECT '=== 참조 무결성 확인: order_item_units ===' AS info;
SELECT 
    COUNT(*) as total_order_item_units,
    COUNT(CASE WHEN oiu.token_pk IS NOT NULL THEN 1 END) as units_with_token_pk,
    COUNT(CASE WHEN oiu.token_pk IS NOT NULL AND tm.token_pk IS NULL THEN 1 END) as orphaned_units
FROM order_item_units oiu
LEFT JOIN token_master tm ON oiu.token_pk = tm.token_pk;

SELECT '=== 참조 무결성 확인: warranties ===' AS info;
SELECT 
    COUNT(*) as total_warranties,
    COUNT(CASE WHEN w.token_pk IS NOT NULL THEN 1 END) as warranties_with_token_pk,
    COUNT(CASE WHEN w.token_pk IS NOT NULL AND tm.token_pk IS NULL THEN 1 END) as orphaned_warranties
FROM warranties w
LEFT JOIN token_master tm ON w.token_pk = tm.token_pk;

-- ============================================================
-- 3. stock_units FK 복원 (045에서 이미 복원되었을 수 있음)
-- ============================================================
SELECT '=== stock_units FK 복원 ===' AS info;

SET @fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND REFERENCED_TABLE_NAME = 'token_master'
      AND REFERENCED_COLUMN_NAME = 'token_pk'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE stock_units ADD CONSTRAINT stock_units_ibfk_2 FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT',
    'SELECT "stock_units FK가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. order_item_units FK 복원
-- ============================================================
SELECT '=== order_item_units FK 복원 ===' AS info;

SET @fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'order_item_units'
      AND REFERENCED_TABLE_NAME = 'token_master'
      AND REFERENCED_COLUMN_NAME = 'token_pk'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE order_item_units ADD CONSTRAINT order_item_units_ibfk_3 FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT',
    'SELECT "order_item_units FK가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 5. warranties FK 복원
-- ============================================================
SELECT '=== warranties FK 복원 ===' AS info;

SET @fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'warranties'
      AND REFERENCED_TABLE_NAME = 'token_master'
      AND REFERENCED_COLUMN_NAME = 'token_pk'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE warranties ADD CONSTRAINT fk_warranties_token_pk FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT',
    'SELECT "warranties FK가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. 최종 확인
-- ============================================================
SELECT '=== 최종 FK 상태 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token_pk'
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

SELECT '=== 마이그레이션 완료 ===' AS info;
