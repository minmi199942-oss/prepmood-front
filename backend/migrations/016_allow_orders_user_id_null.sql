-- orders.user_id NULL 허용 마이그레이션
-- 비회원 주문 지원을 위해 user_id를 NULL 허용으로 변경
-- 
-- 실행 전 확인:
-- 1. 모든 주문이 user_id를 가지고 있는지 확인 (현재 43개 모두 user_id 보유)
-- 2. 백업 필수
--
-- 실행 순서:
-- 1. 이 스크립트 실행
-- 2. 016_allow_orders_user_id_null_verify.sql 실행하여 검증

USE prepmood;

-- ============================================================
-- 1. 사전 검증: NULL인 user_id가 있는지 확인 (있으면 안 됨)
-- ============================================================
SELECT '=== 사전 검증: NULL인 user_id 확인 ===' AS info;
SELECT 
    COUNT(*) AS total_orders,
    COUNT(user_id) AS orders_with_user_id,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS orders_with_null_user_id
FROM orders;

-- NULL인 user_id가 있으면 마이그레이션 중단
-- (현재는 모두 user_id를 가지고 있어야 함)

-- ============================================================
-- 2. user_id NULL 허용으로 변경
-- ============================================================
ALTER TABLE orders
  MODIFY COLUMN user_id INT NULL COMMENT '회원 주문: user_id, 비회원 주문: NULL';

-- ============================================================
-- 3. 인덱스 확인 (user_id 인덱스는 NULL 허용 후에도 유지됨)
-- ============================================================
SELECT '=== 인덱스 확인 ===' AS info;
SHOW INDEX FROM orders WHERE Column_name = 'user_id';

-- ============================================================
-- 4. FK 제약 확인 (user_id FK가 있다면 확인 필요)
-- ============================================================
SELECT '=== FK 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME = 'user_id'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 주의: user_id FK가 있다면 ON DELETE 정책 확인 필요
-- NULL 허용 후에도 FK는 유지되지만, NULL 값은 FK 검증에서 제외됨
