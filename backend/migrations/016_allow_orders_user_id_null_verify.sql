-- orders.user_id NULL 허용 마이그레이션 검증
-- 실행: mysql -u prepmood_user -p prepmood < backend/migrations/016_allow_orders_user_id_null_verify.sql

USE prepmood;

-- ============================================================
-- 1. user_id NULL 허용 확인
-- ============================================================
SELECT '=== user_id NULL 허용 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME = 'user_id';

-- 기대 결과: IS_NULLABLE = 'YES'

-- ============================================================
-- 2. 데이터 상태 확인
-- ============================================================
SELECT '=== 데이터 상태 확인 ===' AS info;
SELECT 
    COUNT(*) AS total_orders,
    COUNT(user_id) AS orders_with_user_id,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS orders_with_null_user_id,
    COUNT(guest_id) AS orders_with_guest_id,
    COUNT(CASE WHEN guest_id IS NULL THEN 1 END) AS orders_with_null_guest_id
FROM orders;

-- 기대 결과: 
-- - orders_with_null_user_id = 0 (현재는 모두 회원 주문)
-- - orders_with_null_guest_id = 43 (아직 비회원 주문 없음)

-- ============================================================
-- 3. 인덱스 확인
-- ============================================================
SELECT '=== 인덱스 확인 ===' AS info;
SHOW INDEX FROM orders WHERE Column_name = 'user_id';

-- 기대 결과: user_id 인덱스가 여전히 존재

-- ============================================================
-- 4. 테스트: NULL 값 삽입 가능 여부 확인 (실제 삽입은 하지 않음)
-- ============================================================
SELECT '=== NULL 값 삽입 가능 여부 확인 ===' AS info;
SELECT 
    'user_id에 NULL 삽입 가능' AS test_name,
    CASE 
        WHEN (SELECT IS_NULLABLE FROM information_schema.COLUMNS 
              WHERE TABLE_SCHEMA = 'prepmood' 
                AND TABLE_NAME = 'orders' 
                AND COLUMN_NAME = 'user_id') = 'YES'
        THEN '✅ 가능'
        ELSE '❌ 불가능'
    END AS result;
