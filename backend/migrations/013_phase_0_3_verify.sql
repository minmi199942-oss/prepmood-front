-- Phase 0-3' 검증 스크립트
-- membership_id 추가 후 정상적으로 적용되었는지 확인

USE prepmood;

-- ============================================================
-- 1. users 테이블 membership_id 컬럼 확인
-- ============================================================
SELECT '=== users.membership_id 컬럼 확인 ===' AS info;

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
  AND COLUMN_NAME = 'membership_id';

-- ============================================================
-- 2. membership_id 인덱스 확인
-- ============================================================
SELECT '=== membership_id 인덱스 확인 ===' AS info;

SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE,
    CASE 
        WHEN NON_UNIQUE = 0 THEN '✅ UNIQUE 인덱스'
        ELSE '❌ 일반 인덱스 (UNIQUE 아님)'
    END AS index_status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND INDEX_NAME = 'idx_users_membership_id';

-- ============================================================
-- 3. 데이터 확인 (샘플)
-- ============================================================
SELECT '=== 데이터 샘플 확인 ===' AS info;

SELECT 
    user_id,
    membership_id,
    email,
    CASE 
        WHEN membership_id IS NULL THEN '❌ membership_id 없음'
        WHEN membership_id REGEXP '^PM\\.20[0-9]{2}\\.[A-Z0-9]{6}$' THEN '✅ 형식 정상'
        ELSE '⚠️  형식 이상'
    END AS membership_id_status
FROM users
ORDER BY user_id
LIMIT 10;

-- ============================================================
-- 4. 데이터 통계
-- ============================================================
SELECT '=== 데이터 통계 ===' AS info;

SELECT 
    COUNT(*) AS total_users,
    COUNT(membership_id) AS users_with_membership_id,
    COUNT(*) - COUNT(membership_id) AS users_without_membership_id,
    CASE 
        WHEN COUNT(*) = COUNT(membership_id) THEN '✅ 모든 사용자가 membership_id 보유'
        ELSE '⚠️  일부 사용자가 membership_id 없음'
    END AS status
FROM users;

-- ============================================================
-- 5. 중복 확인 (UNIQUE 제약 검증)
-- ============================================================
SELECT '=== 중복 확인 (UNIQUE 제약 검증) ===' AS info;

SELECT 
    membership_id,
    COUNT(*) AS count,
    GROUP_CONCAT(user_id) AS user_ids
FROM users
WHERE membership_id IS NOT NULL
GROUP BY membership_id
HAVING COUNT(*) > 1;

-- 중복이 없으면 결과가 없어야 함

-- ============================================================
-- 6. user_id와 membership_id 매핑 확인
-- ============================================================
SELECT '=== user_id와 membership_id 매핑 샘플 ===' AS info;

SELECT 
    user_id,
    membership_id,
    email,
    created_at
FROM users
WHERE membership_id IS NOT NULL
ORDER BY user_id
LIMIT 5;

-- ============================================================
-- 검증 완료
-- ============================================================

