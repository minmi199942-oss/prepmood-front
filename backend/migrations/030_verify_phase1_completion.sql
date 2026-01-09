-- ============================================================
-- 030_verify_phase1_completion.sql
-- Phase 1 완료 상태 종합 검증
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. token_master 테이블 검증
-- ============================================================
SELECT '=== 1. token_master 테이블 검증 ===' AS info;

-- 1-1. 테이블 구조 확인
SELECT '--- token_master 구조 확인 ---' AS info;
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'token_master'
ORDER BY ORDINAL_POSITION;

-- 1-2. PK 확인 (token_pk가 PK인지)
SELECT '--- PK 확인 (token_pk가 PRIMARY KEY인지) ---' AS info;
SELECT 
    tc.CONSTRAINT_NAME,
    kcu.COLUMN_NAME,
    tc.CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = 'prepmood' 
  AND tc.TABLE_NAME = 'token_master'
  AND tc.CONSTRAINT_TYPE = 'PRIMARY KEY';

-- 1-3. token UNIQUE 확인
SELECT '--- token UNIQUE 확인 ---' AS info;
SELECT 
    tc.CONSTRAINT_NAME,
    kcu.COLUMN_NAME,
    tc.CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = 'prepmood' 
  AND tc.TABLE_NAME = 'token_master'
  AND tc.CONSTRAINT_TYPE = 'UNIQUE'
  AND kcu.COLUMN_NAME = 'token';

-- 1-4. 데이터 개수 확인
SELECT '--- token_master 데이터 개수 ---' AS info;
SELECT COUNT(*) as total_count FROM token_master;
SELECT COUNT(*) as token_pk_null_count FROM token_master WHERE token_pk IS NULL;
SELECT COUNT(*) as token_null_count FROM token_master WHERE token IS NULL;

-- ============================================================
-- 2. warranties 테이블 검증
-- ============================================================
SELECT '=== 2. warranties 테이블 검증 ===' AS info;

-- 2-1. 테이블 구조 확인
SELECT '--- warranties 구조 확인 ---' AS info;
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties'
ORDER BY ORDINAL_POSITION;

-- 2-2. token_pk FK 확인
SELECT '--- token_pk FK 확인 ---' AS info;
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'token_pk'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 2-3. status 컬럼 확인
SELECT '--- status 컬럼 확인 ---' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'status';

-- 2-4. owner_user_id NULL 허용 확인
SELECT '--- owner_user_id NULL 허용 확인 ---' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'owner_user_id';

-- 2-5. UNIQUE(token_pk) 확인
SELECT '--- UNIQUE(token_pk) 확인 ---' AS info;
SELECT 
    tc.CONSTRAINT_NAME,
    kcu.COLUMN_NAME,
    tc.CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = 'prepmood' 
  AND tc.TABLE_NAME = 'warranties'
  AND tc.CONSTRAINT_TYPE = 'UNIQUE'
  AND kcu.COLUMN_NAME = 'token_pk';

-- 2-6. warranties FK 전체 확인
SELECT '--- warranties FK 전체 확인 ---' AS info;
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 2-7. 데이터 개수 확인
SELECT '--- warranties 데이터 개수 ---' AS info;
SELECT COUNT(*) as total_count FROM warranties;
SELECT COUNT(*) as token_pk_null_count FROM warranties WHERE token_pk IS NULL;

-- ============================================================
-- 3. paid_events 테이블 검증
-- ============================================================
SELECT '=== 3. paid_events 테이블 검증 ===' AS info;

-- 3-1. 테이블 존재 확인
SELECT '--- paid_events 테이블 존재 확인 ---' AS info;
SELECT 
    TABLE_NAME,
    TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'paid_events';

-- 3-2. UNIQUE(order_id, payment_key) 확인
SELECT '--- UNIQUE(order_id, payment_key) 확인 ---' AS info;
SELECT 
    tc.CONSTRAINT_NAME,
    kcu.COLUMN_NAME,
    tc.CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = 'prepmood' 
  AND tc.TABLE_NAME = 'paid_events'
  AND tc.CONSTRAINT_TYPE = 'UNIQUE'
ORDER BY kcu.ORDINAL_POSITION;

-- ============================================================
-- 4. orders.paid_at 컬럼 검증
-- ============================================================
SELECT '=== 4. orders.paid_at 컬럼 검증 ===' AS info;

-- 4-1. paid_at 컬럼 확인
SELECT '--- paid_at 컬럼 확인 ---' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders' 
  AND COLUMN_NAME = 'paid_at';

-- 4-2. idx_paid_at 인덱스 확인
SELECT '--- idx_paid_at 인덱스 확인 ---' AS info;
SELECT 
    INDEX_NAME,
    COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders' 
  AND INDEX_NAME = 'idx_paid_at';

-- ============================================================
-- 5. stock_units 테이블 검증
-- ============================================================
SELECT '=== 5. stock_units 테이블 검증 ===' AS info;

-- 5-1. 테이블 존재 확인
SELECT '--- stock_units 테이블 존재 확인 ---' AS info;
SELECT 
    TABLE_NAME,
    TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'stock_units';

-- 5-2. FK 확인
SELECT '--- stock_units FK 확인 ---' AS info;
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'stock_units' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 5-3. product_id 타입 확인 (VARCHAR(50)인지)
SELECT '--- product_id 타입 확인 (VARCHAR(50)이어야 함) ---' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'stock_units' 
  AND COLUMN_NAME = 'product_id';

-- ============================================================
-- 6. order_item_units 테이블 검증
-- ============================================================
SELECT '=== 6. order_item_units 테이블 검증 ===' AS info;

-- 6-1. 테이블 존재 확인
SELECT '--- order_item_units 테이블 존재 확인 ---' AS info;
SELECT 
    TABLE_NAME,
    TABLE_ROWS
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units';

-- 6-2. active_lock generated column 확인
SELECT '--- active_lock generated column 확인 ---' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    GENERATION_EXPRESSION,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units' 
  AND COLUMN_NAME = 'active_lock';

-- 6-3. UNIQUE 제약 확인
SELECT '--- order_item_units UNIQUE 제약 확인 ---' AS info;
SELECT 
    tc.CONSTRAINT_NAME,
    kcu.COLUMN_NAME,
    tc.CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
WHERE tc.TABLE_SCHEMA = 'prepmood' 
  AND tc.TABLE_NAME = 'order_item_units'
  AND tc.CONSTRAINT_TYPE = 'UNIQUE'
ORDER BY tc.CONSTRAINT_NAME, kcu.ORDINAL_POSITION;

-- 6-4. FK 확인
SELECT '--- order_item_units FK 확인 ---' AS info;
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- ============================================================
-- 7. 참조 무결성 검증
-- ============================================================
SELECT '=== 7. 참조 무결성 검증 ===' AS info;

-- 7-1. warranties.token_pk → token_master.token_pk
SELECT '--- warranties.token_pk 참조 무결성 확인 ---' AS info;
SELECT COUNT(*) as orphan_count
FROM warranties w
LEFT JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.token_pk IS NOT NULL AND tm.token_pk IS NULL;
-- 결과: 0이어야 함

-- ============================================================
-- 8. 전체 요약
-- ============================================================
SELECT '=== 8. 전체 요약 ===' AS info;

SELECT 
    'token_master' AS table_name,
    COUNT(*) AS row_count
FROM token_master
UNION ALL
SELECT 
    'warranties' AS table_name,
    COUNT(*) AS row_count
FROM warranties
UNION ALL
SELECT 
    'paid_events' AS table_name,
    COUNT(*) AS row_count
FROM paid_events
UNION ALL
SELECT 
    'stock_units' AS table_name,
    COUNT(*) AS row_count
FROM stock_units
UNION ALL
SELECT 
    'order_item_units' AS table_name,
    COUNT(*) AS row_count
FROM order_item_units;

SELECT '=== Phase 1 검증 완료 ===' AS info;
