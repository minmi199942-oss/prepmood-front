-- ============================================================
-- 031_create_guest_order_access_tokens_table.sql
-- Phase 1-10: guest_order_access_tokens 테이블 생성 (비회원 조회용)
-- ============================================================

USE prepmood;

CREATE TABLE IF NOT EXISTS guest_order_access_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    token_hash VARCHAR(64) NOT NULL COMMENT '토큰 해시 (보안)',
    expires_at DATETIME NOT NULL COMMENT '만료 시각 (90일)',
    revoked_at DATETIME NULL COMMENT '회수 시각 (Claim 완료 시)',
    last_access_at DATETIME NULL COMMENT '마지막 접근 시각',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE CASCADE,
    UNIQUE KEY uk_token_hash (token_hash),
    INDEX idx_order_id (order_id),
    INDEX idx_expires_at (expires_at),
    INDEX idx_revoked_at (revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== guest_order_access_tokens 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'guest_order_access_tokens'
ORDER BY ORDINAL_POSITION;

SELECT '=== UNIQUE 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'guest_order_access_tokens' 
  AND CONSTRAINT_NAME = 'uk_token_hash';
