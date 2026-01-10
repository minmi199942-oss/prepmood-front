-- ============================================================
-- 045_restore_stock_units_fk.sql
-- token_master 초기화 후 stock_units FK 복원
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: FK가 없는지 확인
-- ============================================================
SELECT '=== 사전 검증: FK 상태 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token_pk';

-- ============================================================
-- 2. 참조 무결성 확인
-- ============================================================
SELECT '=== 참조 무결성 확인 ===' AS info;
SELECT 
    COUNT(*) as total_stock_units,
    COUNT(CASE WHEN su.token_pk IS NOT NULL THEN 1 END) as units_with_token_pk,
    COUNT(CASE WHEN su.token_pk IS NOT NULL AND tm.token_pk IS NULL THEN 1 END) as orphaned_units
FROM stock_units su
LEFT JOIN token_master tm ON su.token_pk = tm.token_pk;

-- orphaned_units가 0이어야 FK를 추가할 수 있습니다.

-- ============================================================
-- 3. FK 제약 복원
-- ============================================================
-- 기존 FK가 있는지 확인
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
    'SELECT "FK가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. 복원 확인
-- ============================================================
SELECT '=== FK 복원 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token_pk';

SELECT '=== FK 복원 완료 ===' AS info;
