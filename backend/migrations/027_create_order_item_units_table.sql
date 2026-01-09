-- ============================================================
-- 027_create_order_item_units_table.sql
-- Phase 1-6: order_item_units 테이블 생성 (active_lock 포함, 이중 판매 방지)
-- ============================================================

USE prepmood;

CREATE TABLE IF NOT EXISTS order_item_units (
    order_item_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    order_item_id INT NOT NULL,
    unit_seq INT NOT NULL COMMENT '같은 order_item_id 내 순서 (1부터 시작)',
    stock_unit_id BIGINT NULL COMMENT '재고 단위 연결 (재고 배정 후 설정)',
    token_pk INT NOT NULL COMMENT 'token_master.token_pk 참조',
    unit_status ENUM('reserved', 'shipped', 'delivered', 'refunded') NOT NULL DEFAULT 'reserved',
    current_shipment_id BIGINT NULL COMMENT '현재 유효 송장 (shipments 테이블 생성 후 FK 추가)',
    active_lock INT GENERATED ALWAYS AS (
        CASE WHEN unit_status IN ('reserved', 'shipped', 'delivered') THEN 1 ELSE NULL END
    ) VIRTUAL COMMENT 'Active 상태 집합 (이중 판매 방지용)',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_item_id) REFERENCES order_items(order_item_id) ON DELETE RESTRICT,
    FOREIGN KEY (stock_unit_id) REFERENCES stock_units(stock_unit_id) ON DELETE SET NULL,
    FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT,
    UNIQUE KEY uk_order_item_unit_seq (order_item_id, unit_seq),
    UNIQUE KEY uk_stock_unit_active (stock_unit_id, active_lock),
    INDEX idx_order_item_id (order_item_id),
    INDEX idx_stock_unit_id (stock_unit_id),
    INDEX idx_token_pk (token_pk),
    INDEX idx_unit_status (unit_status),
    INDEX idx_current_shipment_id (current_shipment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== order_item_units 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
ORDER BY ORDINAL_POSITION;

SELECT '=== active_lock generated column 확인 ===' AS info;
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE,
    GENERATION_EXPRESSION,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units' 
  AND COLUMN_NAME = 'active_lock';

SELECT '=== UNIQUE 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units' 
  AND CONSTRAINT_NAME IN ('uk_order_item_unit_seq', 'uk_stock_unit_active');
