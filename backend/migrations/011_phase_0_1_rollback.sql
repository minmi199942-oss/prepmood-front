-- Phase 0-1 롤백 스크립트
-- 새로 추가한 컬럼들을 제거합니다

USE prepmood;

-- ============================================================
-- 1. orders 테이블에서 guest_id 컬럼 제거
-- ============================================================
-- 인덱스 먼저 제거
DROP INDEX idx_orders_guest_id ON orders;

-- 컬럼 제거
ALTER TABLE orders
  DROP COLUMN guest_id;

-- ============================================================
-- 2. users 테이블에서 동의 관련 컬럼 제거
-- ============================================================
ALTER TABLE users
  DROP COLUMN privacy_policy_consent,
  DROP COLUMN terms_consent,
  DROP COLUMN marketing_consent,
  DROP COLUMN privacy_consent;

-- ============================================================
-- 롤백 완료
-- ============================================================

