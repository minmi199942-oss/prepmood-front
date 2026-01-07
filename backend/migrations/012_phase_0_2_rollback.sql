-- Phase 0-2 롤백 스크립트
-- ⚠️ 주의: 데이터 손실 가능성이 있으므로 신중하게 실행
-- name → last_name, first_name으로 분리 불가능 (정보 손실)

USE prepmood;

-- ============================================================
-- 1. last_name, first_name 컬럼 복구 (name에서 추출 불가능하므로 빈 값)
-- ============================================================
ALTER TABLE users
  ADD COLUMN last_name VARCHAR(50) NULL COMMENT '성' AFTER name,
  ADD COLUMN first_name VARCHAR(50) NULL COMMENT '이름' AFTER last_name;

-- name을 first_name으로 복사 (last_name은 빈 값)
UPDATE users 
SET first_name = name,
    last_name = '';

-- ============================================================
-- 2. birth 컬럼 복구
-- ============================================================
ALTER TABLE users
  ADD COLUMN birth DATE NULL COMMENT '생년월일' AFTER first_name;

-- ============================================================
-- 3. phone 컬럼 NULL 허용으로 변경
-- ============================================================
ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(30) NULL COMMENT '전화번호';

-- ============================================================
-- 4. name 컬럼 제거
-- ============================================================
ALTER TABLE users
  DROP COLUMN name;

-- ============================================================
-- ⚠️ 주의사항
-- ============================================================
-- name → last_name, first_name 분리 시 정보 손실 발생
-- 기존 name 값은 first_name으로만 복사됨
-- last_name은 빈 값으로 설정됨

