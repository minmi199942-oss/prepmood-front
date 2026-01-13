-- ============================================================
-- 073_add_warranties_active_key.sql
-- Phase 2-1 보완: warranties.active_key generated column 추가
-- 문서 스펙: COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md Phase 2-1
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인: warranties 구조 ===' AS info;

SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    EXTRA
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME IN ('id', 'status', 'token_pk', 'active_key')
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 2. active_key generated column 추가
-- ============================================================
SELECT '=== 2. active_key generated column 추가 ===' AS info;

-- active_key 컬럼이 이미 있는지 확인
SET @col_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'warranties' 
      AND COLUMN_NAME = 'active_key'
);

SET @sql = IF(@col_exists = 0,
    'ALTER TABLE warranties ADD COLUMN active_key VARCHAR(50) GENERATED ALWAYS AS (CASE WHEN status IN (\'issued\', \'issued_unassigned\', \'active\', \'suspended\') THEN CONCAT(\'token_\', token_pk) ELSE NULL END) VIRTUAL COMMENT \'유효 보증서 키 (active_key 패턴)\' AFTER revoked_at',
    'SELECT "active_key 컬럼이 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. UNIQUE 인덱스 추가
-- ============================================================
SELECT '=== 3. UNIQUE 인덱스 추가 ===' AS info;

-- 기존 인덱스 확인
SET @idx_exists = (
    SELECT COUNT(*) 
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'warranties' 
      AND INDEX_NAME = 'uk_warranties_active_key'
);

SET @sql = IF(@idx_exists = 0,
    'CREATE UNIQUE INDEX uk_warranties_active_key ON warranties(active_key)',
    'SELECT "uk_warranties_active_key 인덱스가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. 사후 검증
-- ============================================================
SELECT '=== 4. 사후 검증 ===' AS info;

-- active_key 컬럼 확인
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    EXTRA,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'active_key';

-- UNIQUE 인덱스 확인
SELECT 
    INDEX_NAME, 
    COLUMN_NAME, 
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND INDEX_NAME = 'uk_warranties_active_key';

-- 샘플 데이터 확인 (active_key 값 확인)
SELECT 
    id,
    status,
    token_pk,
    active_key
FROM warranties
ORDER BY id
LIMIT 5;

SELECT '=== warranties.active_key 추가 완료 ===' AS status;
