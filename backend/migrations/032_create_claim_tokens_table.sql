-- ============================================================
-- 032_create_claim_tokens_table.sql
-- Phase 1-11: claim_tokens 테이블 생성 (계정 연동용, 3-Factor Atomic Check)
-- ============================================================

USE prepmood;

CREATE TABLE IF NOT EXISTS claim_tokens (
    claim_token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    user_id INT NOT NULL COMMENT '로그인한 user_id 바인딩',
    token_hash VARCHAR(64) NOT NULL COMMENT '토큰 해시 (보안)',
    expires_at DATETIME NOT NULL COMMENT '만료 시각 (10~30분)',
    used_at DATETIME NULL COMMENT '사용 시각 (1회성 확인)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY uk_token_hash (token_hash),
    INDEX idx_order_id (order_id),
    INDEX idx_user_id (user_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_used_at (used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== claim_tokens 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'claim_tokens'
ORDER BY ORDINAL_POSITION;

SELECT '=== UNIQUE 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'claim_tokens' 
  AND CONSTRAINT_NAME = 'uk_token_hash';

SELECT '=== FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'claim_tokens' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;
