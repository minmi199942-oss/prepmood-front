-- ============================================================
-- 078_create_shipment_units_table.sql
-- Phase 2-7: shipment_units 테이블 생성
-- 문서 스펙: COMPREHENSIVE_IMPLEMENTATION_ROADMAP.md Phase 2-7
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- shipments 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'shipments';

-- order_item_units 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units';

-- ============================================================
-- 2. shipment_units 테이블 생성
-- ============================================================
SELECT '=== 2. shipment_units 테이블 생성 ===' AS info;

CREATE TABLE IF NOT EXISTS shipment_units (
    shipment_id BIGINT NOT NULL COMMENT '송장 ID',
    order_item_unit_id BIGINT NOT NULL COMMENT '주문 항목 단위 ID',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (shipment_id, order_item_unit_id),
    FOREIGN KEY (shipment_id) REFERENCES shipments(shipment_id) ON DELETE RESTRICT,
    FOREIGN KEY (order_item_unit_id) REFERENCES order_item_units(order_item_unit_id) ON DELETE RESTRICT,
    INDEX idx_shipment_id (shipment_id),
    INDEX idx_order_item_unit_id (order_item_unit_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. order_item_units.current_shipment_id FK 추가
-- ============================================================
SELECT '=== 3. order_item_units.current_shipment_id FK 추가 ===' AS info;

-- current_shipment_id FK가 이미 있는지 확인
SET @fk_exists = (
    SELECT COUNT(*)
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'order_item_units'
      AND COLUMN_NAME = 'current_shipment_id'
      AND REFERENCED_TABLE_NAME = 'shipments'
);

SET @sql = IF(@fk_exists = 0,
    'ALTER TABLE order_item_units ADD CONSTRAINT fk_order_item_units_current_shipment FOREIGN KEY (current_shipment_id) REFERENCES shipments(shipment_id) ON DELETE RESTRICT',
    'SELECT "fk_order_item_units_current_shipment FK가 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. 사후 검증
-- ============================================================
SELECT '=== 4. 사후 검증 ===' AS info;

-- shipment_units 테이블 구조 확인
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
  AND TABLE_NAME = 'shipment_units'
ORDER BY ORDINAL_POSITION;

-- shipment_units FK 확인
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'shipment_units' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- order_item_units.current_shipment_id FK 확인
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units' 
  AND COLUMN_NAME = 'current_shipment_id'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

SELECT '=== shipment_units 테이블 생성 및 FK 추가 완료 ===' AS status;
