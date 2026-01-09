-- ============================================================
-- 034_create_order_stock_issues_table.sql
-- order_stock_issues 테이블 생성 (재고 부족 주문 추적)
-- ============================================================

USE prepmood;

-- ============================================================
-- order_stock_issues 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS order_stock_issues (
    issue_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL,
    event_id BIGINT NOT NULL COMMENT 'paid_events.event_id (어떤 결제 증거에서 파생)',
    product_id VARCHAR(50) NOT NULL,
    required_qty INT NOT NULL COMMENT '필요 수량',
    available_qty INT NOT NULL COMMENT '가용 수량',
    status ENUM('open', 'resolved', 'cancelled') DEFAULT 'open',
    resolved_at DATETIME NULL,
    resolution_note TEXT NULL COMMENT '해결 메모',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT,
    FOREIGN KEY (event_id) REFERENCES paid_events(event_id) ON DELETE RESTRICT,
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT,
    INDEX idx_order_id (order_id),
    INDEX idx_event_id (event_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_product_id (product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== order_stock_issues 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_stock_issues'
ORDER BY ORDINAL_POSITION;

SELECT '=== FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_stock_issues' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;
