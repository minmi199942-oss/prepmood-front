-- Phase 0-4 검증 스크립트
-- 마이그레이션 후 실행하여 정상적으로 적용되었는지 확인

USE prepmood;

-- ============================================================
-- 1. inquiries 테이블 구조 확인
-- ============================================================
SELECT '=== inquiries 테이블 구조 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'inquiries'
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 2. name 컬럼 확인
-- ============================================================
SELECT '=== name 컬럼 확인 ===' AS info;

SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'name 컬럼 존재함 ✅'
        ELSE 'name 컬럼 없음 ❌'
    END AS name_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'inquiries'
  AND COLUMN_NAME = 'name';

-- ============================================================
-- 3. 제거된 컬럼 확인 (없어야 함)
-- ============================================================
SELECT '=== 제거된 컬럼 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    CASE 
        WHEN COLUMN_NAME IN ('last_name', 'first_name') THEN '❌ 제거되어야 하는 컬럼이 아직 존재함'
        ELSE '✅ 정상'
    END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'inquiries'
  AND COLUMN_NAME IN ('last_name', 'first_name');

-- ============================================================
-- 4. 데이터 샘플 확인
-- ============================================================
SELECT '=== 데이터 샘플 확인 ===' AS info;

SELECT 
    id,
    inquiry_number,
    name,
    email,
    created_at
FROM inquiries
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================
-- 5. 인덱스 확인
-- ============================================================
SELECT '=== 인덱스 확인 ===' AS info;

SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'inquiries'
  AND INDEX_NAME = 'idx_name';
