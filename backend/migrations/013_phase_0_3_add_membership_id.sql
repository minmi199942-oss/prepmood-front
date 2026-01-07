-- Phase 0-3': membership_id 추가 (INT user_id 유지)
-- 외부 노출용 식별자 추가 (PM.{년도}.{랜덤6자})
-- ⚠️ user_id는 INT로 유지 (FK 건드리지 않음)

USE prepmood;

-- ============================================================
-- 1. users 테이블에 membership_id 컬럼 추가
-- ============================================================
ALTER TABLE users
  ADD COLUMN membership_id VARCHAR(20) NULL 
  COMMENT '외부 노출용 회원 ID (PM.{년도}.{랜덤6자})' 
  AFTER user_id;

-- membership_id UNIQUE 인덱스 추가
CREATE UNIQUE INDEX idx_users_membership_id ON users(membership_id);

-- ============================================================
-- 2. 기존 사용자에 membership_id 생성 및 채우기
-- ============================================================
-- ⚠️ 주의: 이 부분은 Node.js 스크립트로 실행해야 함
-- SQL만으로는 랜덤 생성 + 중복 체크가 어려움
-- 
-- Node.js 스크립트 실행:
-- node backend/migrations/013_phase_0_3_generate_membership_ids.js

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 실행 후 다음 쿼리로 확인:
-- DESCRIBE users;  -- membership_id 컬럼 확인
-- SELECT user_id, membership_id, email FROM users LIMIT 10;  -- 데이터 확인

