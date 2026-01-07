-- Phase 0-1: 새 컬럼 추가 (가장 안전한 단계)
-- 기존 데이터에 영향 없음, 롤백 가능

USE prepmood;

-- ============================================================
-- 1. orders 테이블에 guest_id 컬럼 추가
-- ============================================================
-- 비회원 주문을 위한 guest_id 컬럼 추가
-- 형식: G-{YYYYMMDD}-{랜덤6자}
ALTER TABLE orders
  ADD COLUMN guest_id VARCHAR(20) NULL COMMENT '비회원 주문 ID (G-{YYYYMMDD}-{랜덤6자})' AFTER user_id;

-- guest_id 인덱스 추가 (조회 성능 향상)
CREATE INDEX idx_orders_guest_id ON orders(guest_id);

-- ============================================================
-- 2. users 테이블에 동의 관련 컬럼 추가
-- ============================================================

-- 2-1. privacy_consent (개인정보 수집 및 이용 동의, 필수)
ALTER TABLE users
  ADD COLUMN privacy_consent TINYINT(1) NOT NULL DEFAULT 0 
  COMMENT '개인정보 수집 및 이용 동의 (필수)' 
  AFTER email_verified;

-- 2-2. marketing_consent (마케팅 정보 수신 동의, 선택, 체크 여부 기록)
ALTER TABLE users
  ADD COLUMN marketing_consent TINYINT(1) NOT NULL DEFAULT 0 
  COMMENT '마케팅 정보 수신 동의 (선택, 체크 여부 기록)' 
  AFTER privacy_consent;

-- 2-3. terms_consent (이용약관 동의, 필수)
ALTER TABLE users
  ADD COLUMN terms_consent TINYINT(1) NOT NULL DEFAULT 0 
  COMMENT '이용약관 동의 (필수)' 
  AFTER marketing_consent;

-- 2-4. privacy_policy_consent (개인정보 처리 방침 동의, 필수)
ALTER TABLE users
  ADD COLUMN privacy_policy_consent TINYINT(1) NOT NULL DEFAULT 0 
  COMMENT '개인정보 처리 방침 동의 (필수)' 
  AFTER terms_consent;

-- ============================================================
-- 3. 기존 사용자 데이터 처리 (선택사항)
-- ============================================================
-- 기존 사용자는 이미 가입했으므로 동의를 받지 않았지만,
-- 기본값이 0이므로 문제없음
-- 나중에 회원가입 시 필수로 받도록 코드 수정 필요

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 실행 후 다음 쿼리로 확인:
-- DESCRIBE orders;  -- guest_id 컬럼 확인
-- DESCRIBE users;   -- 동의 컬럼 4개 확인

