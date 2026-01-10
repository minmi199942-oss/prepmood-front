-- ============================================================
-- 044_init_token_master_with_fk_handling.sql
-- token_master 초기화 전 FK 제약 처리
-- stock_units가 token_master를 참조하므로 일시적으로 FK 제거
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: stock_units 데이터 확인
-- ============================================================
SELECT '=== 사전 검증: stock_units 데이터 확인 ===' AS info;
SELECT 
    COUNT(*) as total_stock_units,
    COUNT(CASE WHEN status = 'in_stock' THEN 1 END) as in_stock_count,
    COUNT(CASE WHEN status = 'reserved' THEN 1 END) as reserved_count,
    COUNT(CASE WHEN status = 'sold' THEN 1 END) as sold_count
FROM stock_units;

-- ============================================================
-- 2. FK 제약 확인
-- ============================================================
SELECT '=== FK 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token_pk';

-- ============================================================
-- 3. stock_units FK 제약 일시 제거
-- ============================================================
-- stock_units_ibfk_2 FK 제거 (token_pk 참조)
SET @fk_name = (
    SELECT CONSTRAINT_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND REFERENCED_TABLE_NAME = 'token_master'
      AND REFERENCED_COLUMN_NAME = 'token_pk'
    LIMIT 1
);

SET @sql = IF(@fk_name IS NOT NULL,
    CONCAT('ALTER TABLE stock_units DROP FOREIGN KEY ', @fk_name),
    'SELECT "FK가 없습니다. 건너뜁니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '=== FK 제약 제거 완료 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token_pk';

-- ============================================================
-- 4. 완료 메시지
-- ============================================================
SELECT '=== FK 제약 제거 완료 ===' AS info;
SELECT '이제 init-token-master-from-xlsx.js를 실행할 수 있습니다.' AS next_step;
SELECT '실행 후 045_restore_stock_units_fk.sql을 실행하여 FK를 복원하세요.' AS reminder;
