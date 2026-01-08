-- Phase 0-4: inquiries 테이블 name 필드 통합
-- first_name, last_name → name 단일 필드로 변경

USE prepmood;

-- ============================================================
-- 1. name 컬럼 추가 (단일 필드)
-- ============================================================
ALTER TABLE inquiries
  ADD COLUMN name VARCHAR(100) NULL COMMENT '이름 (단일 필드)' 
  AFTER salutation;

-- ============================================================
-- 2. 기존 데이터 마이그레이션 (last_name + first_name → name)
-- ============================================================
-- 기존 문의의 last_name과 first_name을 name으로 통합
UPDATE inquiries 
SET name = TRIM(
  CONCAT(
    COALESCE(last_name, ''), 
    CASE 
      WHEN last_name IS NOT NULL AND first_name IS NOT NULL THEN ' '
      ELSE ''
    END,
    COALESCE(first_name, '')
  )
)
WHERE name IS NULL;

-- name이 비어있는 경우 처리 (NULL 또는 빈 문자열)
UPDATE inquiries 
SET name = COALESCE(email, '고객')
WHERE name IS NULL OR TRIM(name) = '';

-- ============================================================
-- 3. name 컬럼 필수로 변경
-- ============================================================
ALTER TABLE inquiries
  MODIFY COLUMN name VARCHAR(100) NOT NULL COMMENT '이름 (단일 필드)';

-- ============================================================
-- 4. 기존 인덱스 제거 및 새 인덱스 생성
-- ============================================================
-- 기존 (last_name, first_name) 인덱스 제거
DROP INDEX idx_name ON inquiries;

-- name 컬럼에 인덱스 생성
CREATE INDEX idx_name ON inquiries(name);

-- ============================================================
-- 5. last_name, first_name 컬럼 제거
-- ============================================================
-- ⚠️ 주의: name으로 데이터가 마이그레이션된 후에만 실행
ALTER TABLE inquiries
  DROP COLUMN last_name,
  DROP COLUMN first_name;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 실행 후 다음 쿼리로 확인:
-- DESCRIBE inquiries;  -- name 컬럼 확인, last_name/first_name 제거 확인
-- SELECT id, inquiry_number, name, email FROM inquiries LIMIT 5;  -- 데이터 확인
