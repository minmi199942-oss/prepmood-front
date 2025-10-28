-- serial_number 컬럼 Deprecated 표시
-- 1-2주 모니터링 후 제거 예정 (order_number로 통합됨)

-- 현재 serial_number 컬럼 상태 확인
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  IS_NULLABLE,
  COLUMN_DEFAULT,
  COLUMN_COMMENT
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders' 
  AND COLUMN_NAME = 'serial_number';

-- Deprecated 주석 추가 (MySQL 8.0+)
-- ALTER TABLE orders MODIFY COLUMN serial_number varchar(50) COMMENT 'DEPRECATED: Use order_number instead. Will be removed in 1-2 weeks.';

-- 모니터링용 쿼리: serial_number 사용 현황
SELECT 
  COUNT(*) AS total_orders,
  COUNT(serial_number) AS orders_with_serial,
  COUNT(order_number) AS orders_with_order_number,
  COUNT(CASE WHEN serial_number IS NOT NULL AND order_number IS NULL THEN 1 END) AS serial_only,
  COUNT(CASE WHEN serial_number IS NULL AND order_number IS NOT NULL THEN 1 END) AS order_number_only,
  COUNT(CASE WHEN serial_number IS NOT NULL AND order_number IS NOT NULL THEN 1 END) AS both_present
FROM orders;
