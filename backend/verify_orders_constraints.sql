-- orders 테이블 제약조건 및 인덱스 검증 스크립트

-- 1. 테이블 구조 및 제약조건 확인
SHOW CREATE TABLE orders;

-- 2. 인덱스 확인
SHOW INDEX FROM orders;

-- 3. 주문번호 길이 검증 (현재 포맷 'ORD-YYYYMMDD-######'가 VARCHAR(20)에 들어가는지)
SELECT
  MAX(CHAR_LENGTH(order_number)) AS max_len,
  SUM(order_number IS NULL) AS null_cnt,
  COUNT(*) AS total_orders
FROM orders;

-- 4. 상태 제약조건 검증 (이외 값이 있는 레코드가 없는지)
SELECT 
  COUNT(*) AS bad_status_count,
  GROUP_CONCAT(DISTINCT status) AS invalid_statuses
FROM orders
WHERE status NOT IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded');

-- 5. 배송방법 제약조건 검증
SELECT 
  COUNT(*) AS bad_method_count,
  GROUP_CONCAT(DISTINCT shipping_method) AS invalid_methods
FROM orders
WHERE shipping_method NOT IN ('standard','express','overnight','pickup');

-- 6. 배송비 제약조건 검증 (0 이상)
SELECT 
  COUNT(*) AS negative_shipping_cost,
  MIN(shipping_cost) AS min_shipping_cost
FROM orders
WHERE shipping_cost < 0;

-- 7. 총 금액 제약조건 검증 (0 이상)
SELECT 
  COUNT(*) AS negative_total_price,
  MIN(total_price) AS min_total_price
FROM orders
WHERE total_price < 0;

-- 8. serial_number와 order_number 중복 확인 (SSOT 검증)
SELECT 
  COUNT(*) AS has_serial_number,
  COUNT(order_number) AS has_order_number,
  COUNT(CASE WHEN serial_number IS NOT NULL AND order_number IS NOT NULL THEN 1 END) AS has_both
FROM orders;

-- 9. 주문번호 고유성 검증
SELECT 
  COUNT(*) AS total_order_numbers,
  COUNT(DISTINCT order_number) AS unique_order_numbers,
  COUNT(*) - COUNT(DISTINCT order_number) AS duplicate_count
FROM orders
WHERE order_number IS NOT NULL;

-- 10. 인덱스 사용 통계 확인 (MySQL 8.0+)
SELECT 
  TABLE_NAME,
  INDEX_NAME,
  CARDINALITY,
  NULLABLE
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders'
ORDER BY INDEX_NAME;
