-- ============================================================
-- 048_add_stock_units_size_color.sql
-- stock_units 테이블에 size, color 컬럼 추가
-- 정석 해결 방법: 재고 배정은 stock_units에서 size/color로 필터링
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 현재 컬럼 존재 확인
-- ============================================================
SELECT '=== 사전 검증: size, color 컬럼 존재 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND COLUMN_NAME IN ('size', 'color')
ORDER BY COLUMN_NAME;

-- ============================================================
-- 2. size 컬럼 추가
-- ============================================================
SELECT '=== size 컬럼 추가 ===' AS info;

SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND COLUMN_NAME = 'size'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE stock_units ADD COLUMN size VARCHAR(10) NULL COMMENT "사이즈 (S, M, L, XL, XXL, F 등)" AFTER product_id',
    'SELECT "size 컬럼이 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. color 컬럼 추가
-- ============================================================
SELECT '=== color 컬럼 추가 ===' AS info;

SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND COLUMN_NAME = 'color'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE stock_units ADD COLUMN color VARCHAR(50) NULL COMMENT "색상 (예: Black, Light Blue 등)" AFTER size',
    'SELECT "color 컬럼이 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. 기존 데이터 백필 (serial_number 파싱)
-- ============================================================
SELECT '=== 기존 데이터 백필 시작 ===' AS info;

-- serial_number에서 size 추출하여 백필
-- 예: PM26-TeneuSolid-LightBlue-S-000001 → S
UPDATE stock_units su
INNER JOIN token_master tm ON su.token_pk = tm.token_pk
SET su.size = CASE
    WHEN tm.serial_number REGEXP '-S-[0-9]' THEN 'S'
    WHEN tm.serial_number REGEXP '-M-[0-9]' THEN 'M'
    WHEN tm.serial_number REGEXP '-L-[0-9]' THEN 'L'
    WHEN tm.serial_number REGEXP '-XL-[0-9]' THEN 'XL'
    WHEN tm.serial_number REGEXP '-XXL-[0-9]' THEN 'XXL'
    WHEN tm.serial_number REGEXP '-F-[0-9]' OR tm.serial_number LIKE '%-F' THEN 'F'
    ELSE NULL
END
WHERE su.size IS NULL
  AND tm.serial_number IS NOT NULL;

-- serial_number에서 color 추출하여 백필
-- 예: PM26-TeneuSolid-LightBlue-S-000001 → LightBlue
-- 패턴: {product}-{color}-{size}-{number}
UPDATE stock_units su
INNER JOIN token_master tm ON su.token_pk = tm.token_pk
SET su.color = CASE
    WHEN tm.serial_number REGEXP '-(LightBlue|Light-Blue|LB)-' THEN 'Light Blue'
    WHEN tm.serial_number REGEXP '-(Black|BK)-' THEN 'Black'
    WHEN tm.serial_number REGEXP '-(Navy|NV)-' THEN 'Navy'
    WHEN tm.serial_number REGEXP '-(White|WH|WT)-' THEN 'White'
    WHEN tm.serial_number REGEXP '-(Grey|GY|Gray)-' THEN 'Grey'
    WHEN tm.serial_number REGEXP '-(LightGrey|Light-Grey|LGY)-' THEN 'Light Grey'
    ELSE NULL
END
WHERE su.color IS NULL
  AND tm.serial_number IS NOT NULL;

SELECT '=== 기존 데이터 백필 완료 ===' AS info;

-- ============================================================
-- 5. 백필 결과 확인
-- ============================================================
SELECT '=== 백필 결과 확인 ===' AS info;
SELECT 
    COUNT(*) as total_stock_units,
    COUNT(size) as with_size,
    COUNT(color) as with_color,
    COUNT(CASE WHEN size IS NOT NULL AND color IS NOT NULL THEN 1 END) as with_both,
    COUNT(CASE WHEN size IS NULL AND color IS NULL THEN 1 END) as without_both
FROM stock_units;

-- ============================================================
-- 6. 인덱스 추가 (검색 성능 향상)
-- ============================================================
SELECT '=== 인덱스 추가 ===' AS info;

-- size 인덱스 추가
SET @index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND INDEX_NAME = 'idx_stock_units_size'
);

SET @sql = IF(@index_exists = 0,
    'ALTER TABLE stock_units ADD INDEX idx_stock_units_size (size)',
    'SELECT "idx_stock_units_size 인덱스가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- color 인덱스 추가
SET @index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND INDEX_NAME = 'idx_stock_units_color'
);

SET @sql = IF(@index_exists = 0,
    'ALTER TABLE stock_units ADD INDEX idx_stock_units_color (color)',
    'SELECT "idx_stock_units_color 인덱스가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 복합 인덱스 추가 (product_id, size, color, status) - 재고 배정 쿼리 최적화
SET @index_exists = (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'stock_units'
      AND INDEX_NAME = 'idx_stock_units_product_size_color_status'
);

SET @sql = IF(@index_exists = 0,
    'ALTER TABLE stock_units ADD INDEX idx_stock_units_product_size_color_status (product_id, size, color, status)',
    'SELECT "idx_stock_units_product_size_color_status 인덱스가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 7. 최종 확인
-- ============================================================
SELECT '=== 최종 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND COLUMN_NAME IN ('size', 'color')
ORDER BY ORDINAL_POSITION;

SELECT '=== 인덱스 확인 ===' AS info;
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    SEQ_IN_INDEX,
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND INDEX_NAME IN ('idx_stock_units_size', 'idx_stock_units_color', 'idx_stock_units_product_size_color_status')
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

SELECT '=== 마이그레이션 완료 ===' AS info;
