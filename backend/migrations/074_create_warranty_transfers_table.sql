-- ============================================================
-- 074_create_warranty_transfers_table.sql
-- Phase 2-3: warranty_transfers 테이블 생성
-- 문서 스펙: COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md Phase 2-3
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- warranties 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties';

-- users 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'users';

-- ============================================================
-- 2. warranty_transfers 테이블 생성
-- ============================================================
SELECT '=== 2. warranty_transfers 테이블 생성 ===' AS info;

CREATE TABLE IF NOT EXISTS warranty_transfers (
    transfer_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    warranty_id INT NOT NULL COMMENT '양도 대상 보증서',
    from_user_id INT NOT NULL COMMENT '양도 요청자 (현재 소유자)',
    to_email VARCHAR(255) NOT NULL COMMENT '수령자 이메일',
    to_user_id INT NULL COMMENT '수령자 user_id (수락 시점에 설정)',
    transfer_code VARCHAR(7) NOT NULL UNIQUE COMMENT '랜덤 7자 코드',
    status ENUM('requested', 'accepted', 'completed', 'cancelled', 'expired') DEFAULT 'requested',
    expires_at DATETIME NOT NULL COMMENT '72시간 후 만료 시각',
    requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    accepted_at DATETIME NULL,
    completed_at DATETIME NULL,
    cancelled_at DATETIME NULL,
    cancelled_by_user_id INT NULL COMMENT '취소한 사용자 (요청자 또는 수령자)',
    FOREIGN KEY (warranty_id) REFERENCES warranties(id) ON DELETE RESTRICT,
    FOREIGN KEY (from_user_id) REFERENCES users(user_id) ON DELETE RESTRICT,
    FOREIGN KEY (to_user_id) REFERENCES users(user_id) ON DELETE SET NULL,
    INDEX idx_warranty_id (warranty_id),
    INDEX idx_from_user_id (from_user_id),
    INDEX idx_to_email (to_email),
    INDEX idx_transfer_code (transfer_code),
    INDEX idx_status (status),
    INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. 사후 검증
-- ============================================================
SELECT '=== 3. 사후 검증 ===' AS info;

-- 테이블 구조 확인
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_DEFAULT,
    EXTRA,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranty_transfers'
ORDER BY ORDINAL_POSITION;

-- FK 확인
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranty_transfers' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 인덱스 확인
SELECT 
    INDEX_NAME, 
    COLUMN_NAME, 
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranty_transfers'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

SELECT '=== warranty_transfers 테이블 생성 완료 ===' AS status;
