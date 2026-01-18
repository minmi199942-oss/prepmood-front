-- orders_idempotency.user_id NULL 허용 마이그레이션
-- 비회원 주문 지원을 위해 user_id를 NULL 허용으로 변경
-- 
-- 배경:
-- - owner_key 방식으로 변경되었지만, user_id는 하위 호환성을 위해 유지
-- - 비회원 주문 시 user_id가 NULL이므로 NULL 허용 필요
-- 
-- 실행 전 확인:
-- 1. 백업 필수
-- 2. owner_key 컬럼이 존재하는지 확인
--
-- 실행 순서:
-- 1. 이 스크립트 실행
-- 2. 019_allow_orders_idempotency_user_id_null_verify.sql 실행하여 검증

USE prepmood;

-- ============================================================
-- 1. 사전 검증: owner_key 컬럼 존재 확인
-- ============================================================
SELECT '=== 사전 검증: owner_key 컬럼 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders_idempotency'
  AND COLUMN_NAME = 'owner_key';

-- owner_key가 없으면 마이그레이션 중단
-- (018_change_idempotency_to_owner_key.sql 먼저 실행 필요)

-- ============================================================
-- 2. user_id NULL 허용으로 변경
-- ============================================================
ALTER TABLE orders_idempotency
  MODIFY COLUMN user_id INT NULL COMMENT '회원 주문: user_id, 비회원 주문: NULL (owner_key로 실제 구분)';

-- ============================================================
-- 3. 인덱스 확인 (user_id 인덱스는 NULL 허용 후에도 유지됨)
-- ============================================================
SELECT '=== 인덱스 확인 ===' AS info;
SHOW INDEX FROM orders_idempotency WHERE Column_name = 'user_id';

-- ============================================================
-- 4. 검증: NULL 값 삽입 가능 여부 확인
-- ============================================================
SELECT '=== NULL 값 삽입 가능 여부 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders_idempotency'
  AND COLUMN_NAME = 'user_id';

-- 기대 결과: IS_NULLABLE = 'YES'

SELECT '✅ orders_idempotency.user_id NULL 허용 마이그레이션 완료' AS status;
