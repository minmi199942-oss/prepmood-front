-- ============================================================
-- 022_token_pk_migration_phase1_token_master.sql
-- Phase 1-1: token_master 테이블 PK 교체 (token → token_pk)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증
-- ============================================================
SELECT '=== 사전 검증: token 중복 확인 ===' AS info;
SELECT COUNT(*) as duplicate_count FROM (
  SELECT token, COUNT(*) as cnt FROM token_master GROUP BY token HAVING cnt > 1
) AS duplicates;
-- 결과가 0이어야 함

-- ============================================================
-- 2. 기존 FK 제약 확인 및 제거
-- ============================================================
SELECT '=== 기존 FK 제약 확인 ===' AS info;
SELECT 
  TABLE_NAME, CONSTRAINT_NAME, COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'token_master'
  AND REFERENCED_COLUMN_NAME = 'token';

-- warranties.token FK 제거 (있는 경우)
-- ALTER TABLE warranties DROP FOREIGN KEY warranties_ibfk_token;

-- ============================================================
-- 3. 새 테이블 생성 (token_pk가 PK)
-- ============================================================
CREATE TABLE token_master_new (
  token_pk INT AUTO_INCREMENT PRIMARY KEY,
  token VARCHAR(20) NOT NULL UNIQUE,
  internal_code VARCHAR(100) NOT NULL,
  product_name VARCHAR(255) NOT NULL,
  serial_number VARCHAR(100) NULL,
  rot_code VARCHAR(100) NULL,
  warranty_bottom_code VARCHAR(100) NULL,
  digital_warranty_code VARCHAR(100) NULL,
  digital_warranty_collection VARCHAR(100) NULL,
  is_blocked TINYINT(1) DEFAULT 0,
  owner_user_id INT NULL,
  scan_count INT DEFAULT 0,
  first_scanned_at DATETIME NULL,
  last_scanned_at DATETIME NULL,
  created_at DATETIME NOT NULL,
  updated_at DATETIME NOT NULL,
  INDEX idx_token (token),
  INDEX idx_internal_code (internal_code),
  INDEX idx_is_blocked (is_blocked),
  INDEX idx_owner_user_id (owner_user_id),
  INDEX idx_serial_number (serial_number),
  INDEX idx_rot_code (rot_code),
  INDEX idx_warranty_bottom_code (warranty_bottom_code),
  INDEX idx_digital_warranty_code (digital_warranty_code),
  INDEX idx_digital_warranty_collection (digital_warranty_collection),
  INDEX idx_first_scanned_at (first_scanned_at),
  FOREIGN KEY (owner_user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. 데이터 복사 (token_pk는 AUTO_INCREMENT로 자동 생성)
-- ============================================================
INSERT INTO token_master_new 
  (token, internal_code, product_name, serial_number, rot_code, 
   warranty_bottom_code, digital_warranty_code, digital_warranty_collection,
   is_blocked, owner_user_id, scan_count, 
   first_scanned_at, last_scanned_at, created_at, updated_at)
SELECT 
  token, internal_code, product_name, serial_number, rot_code,
  warranty_bottom_code, digital_warranty_code, digital_warranty_collection,
  is_blocked, owner_user_id, scan_count,
  first_scanned_at, last_scanned_at, created_at, updated_at
FROM token_master
ORDER BY token;

-- ============================================================
-- 5. 기존 테이블 백업 및 교체
-- ============================================================
RENAME TABLE token_master TO token_master_backup;
RENAME TABLE token_master_new TO token_master;

-- ============================================================
-- 6. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: token_pk NULL 확인 ===' AS info;
SELECT COUNT(*) as null_count FROM token_master WHERE token_pk IS NULL;
-- 결과: 0

SELECT '=== 사후 검증: token UNIQUE 확인 ===' AS info;
SELECT COUNT(*) as duplicate_count FROM (
  SELECT token, COUNT(*) as cnt FROM token_master GROUP BY token HAVING cnt > 1
) AS duplicates;
-- 결과: 0

SELECT '=== 사후 검증: 데이터 개수 확인 ===' AS info;
SELECT 
  (SELECT COUNT(*) FROM token_master) as new_count,
  (SELECT COUNT(*) FROM token_master_backup) as backup_count;
-- new_count = backup_count 여야 함

SELECT '=== 사후 검증: AUTO_INCREMENT 값 확인 ===' AS info;
SELECT 
  (SELECT MAX(token_pk) FROM token_master) as max_token_pk,
  (SELECT AUTO_INCREMENT FROM information_schema.TABLES 
   WHERE TABLE_SCHEMA = 'prepmood' AND TABLE_NAME = 'token_master') as auto_increment_value;
-- auto_increment_value > max_token_pk 여야 함

SELECT '=== 마이그레이션 완료 ===' AS info;
