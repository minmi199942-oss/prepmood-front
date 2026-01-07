-- Phase 0-2 검증 스크립트
-- 마이그레이션 후 실행하여 정상적으로 적용되었는지 확인

USE prepmood;

-- ============================================================
-- 1. users 테이블 구조 확인
-- ============================================================
SELECT '=== users 테이블 구조 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
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
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'name';

-- ============================================================
-- 3. 제거된 컬럼 확인 (없어야 함)
-- ============================================================
SELECT '=== 제거된 컬럼 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    CASE 
        WHEN COLUMN_NAME IN ('last_name', 'first_name', 'birth') THEN '❌ 제거되어야 하는 컬럼이 아직 존재함'
        ELSE '✅ 정상'
    END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME IN ('last_name', 'first_name', 'birth');

-- ============================================================
-- 4. phone 컬럼 필수 여부 확인
-- ============================================================
SELECT '=== phone 컬럼 필수 여부 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    CASE 
        WHEN IS_NULLABLE = 'NO' THEN '✅ 필수로 설정됨'
        ELSE '❌ NULL 허용 (필수로 변경 필요)'
    END AS phone_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'phone';

-- ============================================================
-- 5. 데이터 확인 (샘플)
-- ============================================================
SELECT '=== 데이터 샘플 확인 ===' AS info;

SELECT 
    user_id,
    email,
    name,
    phone,
    CASE 
        WHEN name IS NULL OR TRIM(name) = '' THEN '❌ name이 비어있음'
        ELSE '✅ 정상'
    END AS name_data_status,
    CASE 
        WHEN phone IS NULL OR TRIM(phone) = '' THEN '⚠️ phone이 비어있음'
        ELSE '✅ 정상'
    END AS phone_data_status
FROM users
LIMIT 10;

-- ============================================================
-- 6. 데이터 통계
-- ============================================================
SELECT '=== 데이터 통계 ===' AS info;

SELECT 
    COUNT(*) AS total_users,
    COUNT(name) AS users_with_name,
    COUNT(CASE WHEN TRIM(name) = '' THEN 1 END) AS users_with_empty_name,
    COUNT(phone) AS users_with_phone,
    COUNT(CASE WHEN TRIM(phone) = '' THEN 1 END) AS users_with_empty_phone
FROM users;

-- ============================================================
-- 검증 완료
-- ============================================================

