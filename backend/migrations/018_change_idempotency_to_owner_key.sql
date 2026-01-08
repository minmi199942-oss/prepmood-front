-- orders_idempotency를 owner_key 방식으로 변경
-- 비회원 주문 지원을 위해 user_id 기반 → owner_key 기반으로 변경
--
-- 변경 사항:
-- - user_id INT NOT NULL → owner_key VARCHAR(100) NOT NULL
-- - UNIQUE(user_id, idem_key) → UNIQUE(owner_key, idem_key)
-- - owner_key 형식: 'u:123' (회원), 'g:abcdef' (비회원)
--
-- 실행 전 확인:
-- 1. 백업 필수
-- 2. 기존 데이터 마이그레이션 필요 (user_id → owner_key 변환)
--
-- 실행 순서:
-- 1. 이 스크립트 실행
-- 2. 018_change_idempotency_to_owner_key_verify.sql 실행하여 검증

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 기존 데이터 확인
-- ============================================================
SELECT '=== 사전 검증: 기존 데이터 확인 ===' AS info;
SELECT 
    COUNT(*) AS total_records,
    COUNT(DISTINCT user_id) AS distinct_user_ids
FROM orders_idempotency;

-- ============================================================
-- 2. owner_key 컬럼 추가 (NULL 허용, 임시)
-- ============================================================
ALTER TABLE orders_idempotency
  ADD COLUMN owner_key VARCHAR(100) NULL COMMENT 'u:{user_id} 또는 g:{guest_id}' AFTER user_id;

-- ============================================================
-- 3. 기존 데이터 마이그레이션 (user_id → owner_key)
-- ============================================================
UPDATE orders_idempotency
SET owner_key = CONCAT('u:', user_id)
WHERE owner_key IS NULL;

-- ============================================================
-- 4. owner_key NOT NULL로 변경
-- ============================================================
ALTER TABLE orders_idempotency
  MODIFY COLUMN owner_key VARCHAR(100) NOT NULL COMMENT 'u:{user_id} 또는 g:{guest_id}';

-- ============================================================
-- 5. 기존 UNIQUE 제약 제거
-- ============================================================
ALTER TABLE orders_idempotency
  DROP INDEX uniq_user_idem;

-- ============================================================
-- 6. 새 UNIQUE 제약 추가 (owner_key, idem_key)
-- ============================================================
ALTER TABLE orders_idempotency
  ADD UNIQUE KEY uniq_owner_idem (owner_key, idem_key);

-- ============================================================
-- 7. user_id 컬럼 제거 (선택사항, 하위 호환성을 위해 유지할 수도 있음)
-- ============================================================
-- 주의: 기존 코드가 user_id를 사용할 수 있으므로, 
-- 일단 유지하고 나중에 제거하는 것을 권장
-- 
-- ALTER TABLE orders_idempotency
--   DROP COLUMN user_id;

-- ============================================================
-- 8. 인덱스 확인
-- ============================================================
SELECT '=== 인덱스 확인 ===' AS info;
SHOW INDEX FROM orders_idempotency;

-- 기대 결과:
-- - uniq_owner_idem (owner_key, idem_key) UNIQUE 인덱스 존재
-- - user_id 인덱스는 유지 (컬럼이 남아있으므로)
