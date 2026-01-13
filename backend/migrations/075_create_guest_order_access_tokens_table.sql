-- ============================================================
-- 075_create_guest_order_access_tokens_table.sql
-- Phase 2-4: guest_order_access_tokens 테이블 생성
-- 문서 스펙: COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md Phase 2-4
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- orders 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders';

-- ============================================================
-- 2. guest_order_access_tokens 테이블 생성
-- ============================================================
SELECT '=== 2. guest_order_access_tokens 테이블 생성 ===' AS info;

CREATE TABLE IF NOT EXISTS guest_order_access_tokens (
    token_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT '주문 ID',
    token VARCHAR(100) NOT NULL UNIQUE COMMENT '접근 토큰 (90일 유효)',
    expires_at DATETIME NOT NULL COMMENT '만료 시각 (90일 후)',
    revoked_at DATETIME NULL COMMENT '회수 시각 (claim 시 회수)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_token (token),
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
  AND TABLE_NAME = 'guest_order_access_tokens'
ORDER BY ORDINAL_POSITION;

-- FK 확인
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'guest_order_access_tokens' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- 인덱스 확인
SELECT 
    INDEX_NAME, 
    COLUMN_NAME, 
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'guest_order_access_tokens'
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

SELECT '=== guest_order_access_tokens 테이블 생성 완료 ===' AS status;
