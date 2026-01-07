-- Phase 0-1 검증 스크립트
-- 마이그레이션 후 실행하여 정상적으로 적용되었는지 확인

USE prepmood;

-- ============================================================
-- 1. orders 테이블 guest_id 컬럼 확인
-- ============================================================
SELECT '=== orders.guest_id 컬럼 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME = 'guest_id';

-- guest_id 인덱스 확인
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND INDEX_NAME = 'idx_orders_guest_id';

-- ============================================================
-- 2. users 테이블 동의 컬럼 확인
-- ============================================================
SELECT '=== users 동의 컬럼 확인 ===' AS info;

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
  AND COLUMN_NAME IN ('privacy_consent', 'marketing_consent', 'terms_consent', 'privacy_policy_consent')
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 3. 기존 데이터 확인
-- ============================================================
SELECT '=== 기존 데이터 확인 ===' AS info;

-- orders 테이블의 guest_id NULL 확인 (모두 NULL이어야 함)
SELECT 
    COUNT(*) AS total_orders,
    COUNT(guest_id) AS orders_with_guest_id,
    COUNT(*) - COUNT(guest_id) AS orders_without_guest_id
FROM orders;

-- users 테이블의 동의 컬럼 기본값 확인 (모두 0이어야 함)
SELECT 
    COUNT(*) AS total_users,
    SUM(privacy_consent) AS privacy_consent_count,
    SUM(marketing_consent) AS marketing_consent_count,
    SUM(terms_consent) AS terms_consent_count,
    SUM(privacy_policy_consent) AS privacy_policy_consent_count
FROM users;

-- ============================================================
-- 검증 완료
-- ============================================================

