-- ============================================================
-- 026_create_stock_units_table.sql
-- Phase 1-5: stock_units 테이블 생성 (재고 관리)
-- ============================================================

USE prepmood;

CREATE TABLE IF NOT EXISTS stock_units (
    stock_unit_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    product_id VARCHAR(50) NOT NULL COMMENT 'admin_products.id 참조',
    token_pk INT NOT NULL COMMENT 'token_master.token_pk 참조',
    status ENUM('in_stock', 'reserved', 'sold', 'returned') NOT NULL DEFAULT 'in_stock',
    reserved_at DATETIME NULL,
    reserved_by_order_id INT NULL,
    sold_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT,
    FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) ON DELETE RESTRICT,
    FOREIGN KEY (reserved_by_order_id) REFERENCES orders(order_id) ON DELETE SET NULL,
    INDEX idx_product_id (product_id),
    INDEX idx_status (status),
    INDEX idx_token_pk (token_pk),
    INDEX idx_reserved_by_order_id (reserved_by_order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== stock_units 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'stock_units'
ORDER BY ORDINAL_POSITION;

SELECT '=== FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'stock_units' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;
