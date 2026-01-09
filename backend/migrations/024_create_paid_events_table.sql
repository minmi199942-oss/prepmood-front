-- ============================================================
-- 024_create_paid_events_table.sql
-- Phase 1-3: paid_events 테이블 생성 (결제 SSOT)
-- ============================================================

USE prepmood;

CREATE TABLE IF NOT EXISTS paid_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    payment_key VARCHAR(255) NOT NULL,
    event_source ENUM('webhook', 'redirect', 'manual_verify') NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
    raw_payload_json JSON COMMENT '원본 결제 응답',
    confirmed_at DATETIME NULL COMMENT '확정 시각',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_paid_events_order_payment (order_id, payment_key),
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_payment_key (payment_key),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== paid_events 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'paid_events'
ORDER BY ORDINAL_POSITION;

SELECT '=== UNIQUE 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'paid_events' 
  AND CONSTRAINT_NAME = 'uk_paid_events_order_payment';
