-- ============================================================
-- verify_migration_048_049.sql
-- 048, 049 마이그레이션 검증 쿼리
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. size, color 컬럼 확인
-- ============================================================
SELECT '=== 1. size, color 컬럼 확인 ===' AS info;
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

-- ============================================================
-- 2. 인덱스 확인
-- ============================================================
SELECT '=== 2. 인덱스 확인 ===' AS info;
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    SEQ_IN_INDEX,
    NON_UNIQUE,
    INDEX_TYPE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'stock_units'
  AND INDEX_NAME = 'idx_stock_units_product_status_size_color_stockid'
ORDER BY SEQ_IN_INDEX;

-- ============================================================
-- 3. stock_units 데이터 확인
-- ============================================================
SELECT '=== 3. stock_units 데이터 확인 ===' AS info;
SELECT 
    stock_unit_id,
    product_id,
    size,
    color,
    status,
    token_pk
FROM stock_units
ORDER BY stock_unit_id
LIMIT 10;

-- ============================================================
-- 4. color_standards 테이블 확인
-- ============================================================
SELECT '=== 4. color_standards 테이블 확인 ===' AS info;
SELECT 
    color_code,
    display_name,
    is_active
FROM color_standards
ORDER BY color_code;

-- ============================================================
-- 5. FK 제약 확인
-- ============================================================
SELECT '=== 5. FK 제약 확인 ===' AS info;
SELECT 
    kcu.CONSTRAINT_NAME,
    kcu.TABLE_NAME,
    kcu.COLUMN_NAME,
    kcu.REFERENCED_TABLE_NAME,
    kcu.REFERENCED_COLUMN_NAME,
    rc.DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE kcu
JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
  ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
  AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
WHERE kcu.TABLE_SCHEMA = 'prepmood'
  AND kcu.CONSTRAINT_NAME IN ('fk_stock_units_color_standard', 'fk_order_items_color_standard')
ORDER BY kcu.TABLE_NAME, kcu.CONSTRAINT_NAME;

-- ============================================================
-- 6. color 값 분포 확인 (표준값 준수 여부)
-- ============================================================
SELECT '=== 6. stock_units.color 값 분포 확인 ===' AS info;
SELECT 
    COALESCE(color, 'NULL') as color_value,
    COUNT(*) as count
FROM stock_units
GROUP BY color
ORDER BY color;

-- ============================================================
-- 7. size 값 분포 확인
-- ============================================================
SELECT '=== 7. stock_units.size 값 분포 확인 ===' AS info;
SELECT 
    COALESCE(size, 'NULL') as size_value,
    COUNT(*) as count
FROM stock_units
GROUP BY size
ORDER BY size;

-- ============================================================
-- 8. 재고 배정 쿼리 테스트 (정석 쿼리 시뮬레이션)
-- ============================================================
SELECT '=== 8. 재고 배정 쿼리 테스트 (예시) ===' AS info;

-- 예시 1: product_id + size + color로 정확 매칭
SELECT 
    stock_unit_id,
    product_id,
    size,
    color,
    status
FROM stock_units
WHERE product_id = 'PM-25-SH-Teneu-Solid-LB-S/M/L'
  AND status = 'in_stock'
  AND size = 'S'
  AND color = 'Light Blue'
ORDER BY stock_unit_id
LIMIT 1;

-- 예시 2: size NULL인 경우 (타이/액세서리)
SELECT 
    stock_unit_id,
    product_id,
    size,
    color,
    status
FROM stock_units
WHERE product_id = 'PM-25-ACC-Fabric-Tie-Skinny'
  AND status = 'in_stock'
  AND size IS NULL
ORDER BY stock_unit_id
LIMIT 1;

SELECT '=== 검증 완료 ===' AS info;
