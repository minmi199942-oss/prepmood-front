-- ============================================================
-- 065_add_unique_constraints.sql
-- Phase 3 Step 4 후속: canonical_id NOT NULL 및 UNIQUE 제약 추가
-- ⚠️ 중복 확인 완료 후 실행
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인: 중복 및 NULL 체크
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- 중복 확인
SELECT 
    'canonical_id 중복 확인' AS check_type,
    COUNT(*) as duplicate_count
FROM (
    SELECT canonical_id, COUNT(*) as cnt
    FROM admin_products
    WHERE canonical_id IS NOT NULL
    GROUP BY canonical_id
    HAVING cnt > 1
) AS duplicates;

-- NULL 확인
SELECT 
    'canonical_id NULL 확인' AS check_type,
    COUNT(*) as null_count
FROM admin_products
WHERE canonical_id IS NULL;

-- ============================================================
-- 2. NOT NULL 제약 추가
-- ============================================================
-- ⚠️ GPT 최종 지적 (E): Backfill 완료 후 canonical_id는 전 행 NOT NULL이 맞다
SELECT '=== 2. NOT NULL 제약 추가 ===' AS info;

ALTER TABLE admin_products
MODIFY COLUMN canonical_id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

SELECT '=== NOT NULL 제약 추가 완료 ===' AS status;

-- ============================================================
-- 3. 임시 인덱스 제거 후 UNIQUE 인덱스 생성
-- ============================================================
SELECT '=== 3. UNIQUE 인덱스 생성 ===' AS info;

-- 임시 인덱스 제거
SET @idx_exists = (
    SELECT COUNT(*) 
    FROM information_schema.STATISTICS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'admin_products' 
      AND INDEX_NAME = 'idx_admin_products_canonical_id_temp'
);
SET @sql = IF(@idx_exists > 0,
    'DROP INDEX idx_admin_products_canonical_id_temp ON admin_products',
    'SELECT ''임시 인덱스가 존재하지 않습니다.'' AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- UNIQUE 인덱스 생성
CREATE UNIQUE INDEX uk_admin_products_canonical_id 
ON admin_products(canonical_id);

SELECT '=== UNIQUE 인덱스 생성 완료 ===' AS status;

-- ============================================================
-- 4. 결과 확인
-- ============================================================
SELECT '=== 4. 최종 확인 ===' AS info;

-- 인덱스 확인
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    INDEX_TYPE,
    NON_UNIQUE,
    COLUMN_NAME
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND INDEX_NAME = 'uk_admin_products_canonical_id';

-- 컬럼 제약 확인
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    CHARACTER_SET_NAME,
    COLLATION_NAME
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'canonical_id';

SELECT '=== NOT NULL 및 UNIQUE 제약 추가 완료 ===' AS status;
