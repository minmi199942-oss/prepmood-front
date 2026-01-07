-- Phase 0-2: users 테이블 구조 변경
-- name 필드 통합, birth 제거, phone 필수화
-- ⚠️ user_id는 아직 INT 유지 (Phase 0-3에서 변경)

USE prepmood;

-- ============================================================
-- 1. name 컬럼 추가 (단일 필드)
-- ============================================================
ALTER TABLE users
  ADD COLUMN name VARCHAR(100) NULL COMMENT '이름 (단일 필드)' 
  AFTER password_hash;

-- ============================================================
-- 2. 기존 데이터 마이그레이션 (last_name + first_name → name)
-- ============================================================
-- 기존 사용자의 last_name과 first_name을 name으로 통합
UPDATE users 
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
UPDATE users 
SET name = COALESCE(email, '사용자')
WHERE name IS NULL OR TRIM(name) = '';

-- ============================================================
-- 3. name 컬럼 필수로 변경
-- ============================================================
ALTER TABLE users
  MODIFY COLUMN name VARCHAR(100) NOT NULL COMMENT '이름 (단일 필드)';

-- ============================================================
-- 4. phone 컬럼 필수화 (NULL인 경우 기본값 설정)
-- ============================================================
-- 먼저 NULL인 phone에 기본값 설정 (기존 사용자)
UPDATE users 
SET phone = ''
WHERE phone IS NULL;

-- phone 컬럼을 NOT NULL로 변경
ALTER TABLE users
  MODIFY COLUMN phone VARCHAR(30) NOT NULL DEFAULT '' COMMENT '전화번호 (필수)';

-- ============================================================
-- 5. last_name, first_name 컬럼 제거
-- ============================================================
-- ⚠️ 주의: name으로 데이터가 마이그레이션된 후에만 실행
ALTER TABLE users
  DROP COLUMN last_name,
  DROP COLUMN first_name;

-- ============================================================
-- 6. birth 컬럼 제거
-- ============================================================
ALTER TABLE users
  DROP COLUMN birth;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 실행 후 다음 쿼리로 확인:
-- DESCRIBE users;  -- name 컬럼 확인, last_name/first_name/birth 제거 확인
-- SELECT user_id, email, name, phone FROM users LIMIT 5;  -- 데이터 확인

