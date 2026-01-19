-- 사용자 정보 조회 스크립트
-- 현재 users 테이블의 구조와 데이터를 확인합니다.

USE prepmood;

-- ============================================================
-- 1. users 테이블 구조 확인
-- ============================================================
SELECT '=== 1. users 테이블 구조 ===' AS info;

DESCRIBE users;

-- ============================================================
-- 2. 전체 사용자 목록 (기본 정보만)
-- ============================================================
SELECT '=== 2. 전체 사용자 목록 ===' AS info;

SELECT 
    user_id,
    membership_id,
    email,
    name,
    phone,
    verified,
    email_verified,
    created_at
FROM users
ORDER BY created_at DESC;

-- ============================================================
-- 3. 전체 사용자 상세 정보 (모든 필드)
-- ============================================================
SELECT '=== 3. 전체 사용자 상세 정보 ===' AS info;

SELECT 
    user_id,
    membership_id,
    email,
    name,
    phone,
    verified,
    email_verified,
    google_id,
    profile_picture,
    privacy_consent,
    marketing_consent,
    terms_consent,
    privacy_policy_consent,
    created_at
FROM users
ORDER BY created_at DESC;

-- ============================================================
-- 4. 특정 사용자 조회 (이메일로 검색)
-- ============================================================
-- 사용법: 아래 WHERE 절의 'your-email@example.com'을 실제 이메일로 변경
-- SELECT '=== 4. 특정 사용자 조회 (이메일) ===' AS info;
-- 
-- SELECT 
--     user_id,
--     membership_id,
--     email,
--     name,
--     phone,
--     verified,
--     email_verified,
--     privacy_consent,
--     marketing_consent,
--     terms_consent,
--     privacy_policy_consent,
--     created_at
-- FROM users
-- WHERE email = 'your-email@example.com';

-- ============================================================
-- 5. 통계 정보
-- ============================================================
SELECT '=== 5. 사용자 통계 ===' AS info;

SELECT 
    COUNT(*) AS total_users,
    COUNT(membership_id) AS users_with_membership_id,
    COUNT(CASE WHEN verified = 1 THEN 1 END) AS verified_users,
    COUNT(CASE WHEN email_verified = 1 THEN 1 END) AS email_verified_users,
    COUNT(CASE WHEN privacy_consent = 1 THEN 1 END) AS privacy_consent_users,
    COUNT(CASE WHEN marketing_consent = 1 THEN 1 END) AS marketing_consent_users
FROM users;
