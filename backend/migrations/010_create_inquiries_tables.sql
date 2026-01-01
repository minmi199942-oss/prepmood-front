-- 문의 관리 테이블 마이그레이션
-- inquiries 및 inquiry_replies 테이블 생성
-- 
-- 실행 전 확인:
-- 1. 현재 테이블 존재 여부: SHOW TABLES LIKE 'inquiries';
-- 2. 데이터 백업 (필요 시): CREATE TABLE inquiries_backup AS SELECT * FROM inquiries;

USE prepmood;

-- ============================================================
-- 1. inquiries 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS inquiries (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inquiry_number VARCHAR(20) UNIQUE NULL, -- INQ-YYYYMMDD-000123 형식, NULL 허용 (fallback: id)
  user_id INT NULL, -- 로그인 사용자 (NULL 허용)

  -- 고객 정보
  salutation VARCHAR(10) NOT NULL,
  first_name VARCHAR(50) NOT NULL,
  last_name VARCHAR(50) NOT NULL,
  email VARCHAR(120) NOT NULL,
  region VARCHAR(10) NOT NULL,
  city VARCHAR(80) NULL,
  country_code VARCHAR(10) NULL,
  phone VARCHAR(30) NULL,

  -- 문의 내용
  category VARCHAR(80) NOT NULL,
  topic VARCHAR(120) NOT NULL,
  message TEXT NOT NULL,
  privacy_consent TINYINT(1) NOT NULL DEFAULT 0,
  age_consent TINYINT(1) NOT NULL DEFAULT 0,

  -- 관리
  status ENUM('new','in_progress','answered','closed') NOT NULL DEFAULT 'new',
  admin_memo TEXT NULL,

  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NULL DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_user_id (user_id),
  INDEX idx_status (status),
  INDEX idx_category (category),
  INDEX idx_created_at (created_at),
  INDEX idx_inquiry_number (inquiry_number),
  INDEX idx_email (email),
  INDEX idx_name (last_name, first_name),
  
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. inquiry_replies 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS inquiry_replies (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  inquiry_id BIGINT NOT NULL,
  admin_user_id INT NOT NULL,
  message TEXT NOT NULL,
  email_status ENUM('pending', 'sent', 'failed') DEFAULT 'pending',
  email_error TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (inquiry_id) REFERENCES inquiries(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  INDEX idx_inquiry_id (inquiry_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 결과 확인
-- ============================================================
DESCRIBE inquiries;
DESCRIBE inquiry_replies;
SELECT '✅ inquiries 테이블 생성 완료' AS status;
SELECT '✅ inquiry_replies 테이블 생성 완료' AS status;

