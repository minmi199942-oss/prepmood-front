-- Phase 0-4 롤백 스크립트
-- ⚠️ 주의: 데이터 손실 가능성이 있으므로 신중하게 실행
-- name → last_name, first_name으로 분리 불가능 (정보 손실)

USE prepmood;

-- ============================================================
-- 1. last_name, first_name 컬럼 복구 (name에서 추출 불가능하므로 빈 값)
-- ============================================================
ALTER TABLE inquiries
  ADD COLUMN last_name VARCHAR(50) NULL COMMENT '성' AFTER name,
  ADD COLUMN first_name VARCHAR(50) NULL COMMENT '이름' AFTER last_name;

-- name을 first_name으로 복사 (last_name은 빈 값)
UPDATE inquiries 
SET first_name = name,
    last_name = '';

-- ============================================================
-- 2. name 컬럼 제거
-- ============================================================
ALTER TABLE inquiries
  DROP COLUMN name;

-- ============================================================
-- 3. 인덱스 복구
-- ============================================================
DROP INDEX idx_name ON inquiries;
CREATE INDEX idx_name ON inquiries(last_name, first_name);

-- ============================================================
-- ⚠️ 주의사항
-- ============================================================
-- name → last_name, first_name 분리 시 정보 손실 발생
-- 기존 name 값은 first_name으로만 복사됨
-- last_name은 빈 값으로 설정됨
