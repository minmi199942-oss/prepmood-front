-- digital_warranty_collection 컬럼 추가 검증 스크립트
USE prepmood;

-- ============================================================
-- 1. 컬럼 존재 확인
-- ============================================================
SELECT '=== digital_warranty_collection 컬럼 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME = 'digital_warranty_collection';

-- ============================================================
-- 2. 인덱스 확인
-- ============================================================
SELECT '=== 인덱스 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    NON_UNIQUE,
    INDEX_NAME,
    SEQ_IN_INDEX,
    COLUMN_NAME,
    COLLATION,
    CARDINALITY,
    SUB_PART,
    PACKED,
    NULLABLE,
    INDEX_TYPE,
    COMMENT,
    INDEX_COMMENT
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND INDEX_NAME = 'idx_digital_warranty_collection';

-- ============================================================
-- 3. 데이터 상태 확인
-- ============================================================
SELECT '=== 데이터 상태 확인 ===' AS info;
SELECT 
    COUNT(*) AS total_tokens,
    COUNT(digital_warranty_collection) AS tokens_with_collection,
    COUNT(*) - COUNT(digital_warranty_collection) AS tokens_without_collection
FROM token_master;

-- ============================================================
-- 4. 샘플 데이터 확인
-- ============================================================
SELECT '=== 샘플 데이터 확인 ===' AS info;
SELECT 
    token,
    product_name,
    digital_warranty_code,
    digital_warranty_collection
FROM token_master
WHERE digital_warranty_collection IS NOT NULL
LIMIT 5;
