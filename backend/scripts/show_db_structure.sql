-- ============================================================
-- 데이터베이스 전체 구조 확인 스크립트
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 모든 테이블 목록
-- ============================================================
SELECT '=== 1. 모든 테이블 목록 ===' AS info;

SELECT 
    TABLE_NAME,
    TABLE_TYPE,
    ENGINE,
    TABLE_ROWS,
    DATA_LENGTH,
    INDEX_LENGTH,
    CREATE_TIME,
    UPDATE_TIME
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_TYPE = 'BASE TABLE'
ORDER BY TABLE_NAME;

-- ============================================================
-- 2. 각 테이블의 컬럼 구조
-- ============================================================
SELECT '=== 2. 각 테이블의 컬럼 구조 ===' AS info;

SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_DEFAULT,
    EXTRA,
    COLUMN_COMMENT,
    ORDINAL_POSITION
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
ORDER BY TABLE_NAME, ORDINAL_POSITION;

-- ============================================================
-- 3. 모든 인덱스 정보
-- ============================================================
SELECT '=== 3. 모든 인덱스 정보 ===' AS info;

SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    SEQ_IN_INDEX,
    NON_UNIQUE,
    INDEX_TYPE,
    INDEX_COMMENT
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- ============================================================
-- 4. 모든 외래키 정보
-- ============================================================
SELECT '=== 4. 모든 외래키 정보 ===' AS info;

SELECT 
    TABLE_NAME,
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME,
    UPDATE_RULE,
    DELETE_RULE
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY TABLE_NAME, CONSTRAINT_NAME;

-- ============================================================
-- 5. 테이블별 요약 (컬럼 수, 인덱스 수, FK 수)
-- ============================================================
SELECT '=== 5. 테이블별 요약 ===' AS info;

SELECT 
    t.TABLE_NAME,
    COUNT(DISTINCT c.COLUMN_NAME) AS column_count,
    COUNT(DISTINCT s.INDEX_NAME) AS index_count,
    COUNT(DISTINCT k.CONSTRAINT_NAME) AS fk_count,
    t.TABLE_ROWS AS row_count
FROM information_schema.TABLES t
LEFT JOIN information_schema.COLUMNS c 
    ON t.TABLE_SCHEMA = c.TABLE_SCHEMA 
    AND t.TABLE_NAME = c.TABLE_NAME
LEFT JOIN information_schema.STATISTICS s
    ON t.TABLE_SCHEMA = s.TABLE_SCHEMA 
    AND t.TABLE_NAME = s.TABLE_NAME
LEFT JOIN information_schema.KEY_COLUMN_USAGE k
    ON t.TABLE_SCHEMA = k.TABLE_SCHEMA 
    AND t.TABLE_NAME = k.TABLE_NAME
    AND k.REFERENCED_TABLE_NAME IS NOT NULL
WHERE t.TABLE_SCHEMA = 'prepmood'
  AND t.TABLE_TYPE = 'BASE TABLE'
GROUP BY t.TABLE_NAME, t.TABLE_ROWS
ORDER BY t.TABLE_NAME;
