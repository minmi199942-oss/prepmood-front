-- ============================================================
-- 041_add_shipment_indexes.sql
-- 출고/배송 관련 인덱스 추가
-- ============================================================
-- 
-- 목적:
-- - 주문별 출고 대상 빠르게 조회 (order_id + unit_status)
-- - 송장번호 검색 성능 향상
-- - 특정 주문 예약 재고 조회 성능 향상 (stock_units)
-- 
-- 실행 순서:
-- - 039 이후 실행 (컬럼이 있어야 인덱스 추가 가능)
-- - 040과 순서 무관
-- 
-- 주의:
-- - 인덱스는 중복 실행 시 에러 발생 (IF NOT EXISTS 지원 안 함)
-- - 기존 인덱스 존재 여부 확인 후 추가
-- 
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 인덱스 존재 여부 확인
-- ============================================================
SELECT '=== 사전 검증: 인덱스 존재 여부 ===' AS info;
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    COLUMN_NAME,
    SEQ_IN_INDEX,
    NON_UNIQUE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME IN ('order_item_units', 'stock_units')
  AND INDEX_NAME IN ('idx_oiu_orderid_unitstatus', 'idx_oiu_tracking_number', 'idx_stock_reserved_order_status')
ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX;

-- ============================================================
-- 2. order_item_units 인덱스 추가
-- ============================================================

-- 2-1. idx_oiu_orderid_unitstatus (주문별 출고 대상 빠르게 조회)
SELECT '=== idx_oiu_orderid_unitstatus 인덱스 추가 ===' AS info;

-- 기존 인덱스 확인
SELECT COUNT(*) INTO @index_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND INDEX_NAME = 'idx_oiu_orderid_unitstatus';

-- 인덱스가 없으면 추가
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_oiu_orderid_unitstatus ON order_item_units(order_id, unit_status)',
    'SELECT "인덱스가 이미 존재합니다." AS info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2-2. idx_oiu_tracking_number (송장 검색)
SELECT '=== idx_oiu_tracking_number 인덱스 추가 ===' AS info;

-- 기존 인덱스 확인
SELECT COUNT(*) INTO @index_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'order_item_units'
  AND INDEX_NAME = 'idx_oiu_tracking_number';

-- 인덱스가 없으면 추가
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_oiu_tracking_number ON order_item_units(tracking_number)',
    'SELECT "인덱스가 이미 존재합니다." AS info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. stock_units 인덱스 추가
-- ============================================================

-- 3-1. idx_stock_reserved_order_status (특정 주문 예약 재고 조회)
SELECT '=== idx_stock_reserved_order_status 인덱스 추가 ===' AS info;

-- 기존 인덱스 확인
SELECT COUNT(*) INTO @index_exists
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'stock_units'
  AND INDEX_NAME = 'idx_stock_reserved_order_status';

-- 인덱스가 없으면 추가
SET @sql = IF(@index_exists = 0,
    'CREATE INDEX idx_stock_reserved_order_status ON stock_units(reserved_by_order_id, status)',
    'SELECT "인덱스가 이미 존재합니다." AS info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 4. 검증: 인덱스 추가 완료 확인
-- ============================================================
SELECT '=== 인덱스 추가 완료 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    INDEX_NAME,
    GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ', ') AS columns,
    NON_UNIQUE,
    CASE 
        WHEN NON_UNIQUE = 0 THEN 'UNIQUE'
        ELSE 'INDEX'
    END AS index_type
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME IN ('order_item_units', 'stock_units')
  AND INDEX_NAME IN ('idx_oiu_orderid_unitstatus', 'idx_oiu_tracking_number', 'idx_stock_reserved_order_status')
GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE
ORDER BY TABLE_NAME, INDEX_NAME;
