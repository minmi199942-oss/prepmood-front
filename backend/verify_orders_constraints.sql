-- ============================================================================
-- orders 테이블 제약조건 및 인덱스 검증 스크립트
-- ============================================================================

-- [SECTION] 환경/버전
SELECT VERSION() AS mysql_version;

-- [SECTION] 테이블 구조/제약
SHOW CREATE TABLE orders;

-- [SECTION] 인덱스 구조
SHOW INDEX FROM orders;

-- [SECTION] 주문번호 길이/NULL 검증
SELECT
  MAX(CHAR_LENGTH(order_number)) AS max_len,
  SUM(order_number IS NULL) AS null_cnt,
  COUNT(*) AS total_orders
FROM orders;

-- [SECTION] 상태/배송방법/수치 제약 위반 탐지
SELECT COUNT(*) AS bad_status_count
FROM orders
WHERE status NOT IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded');

SELECT COUNT(*) AS bad_method_count
FROM orders
WHERE shipping_method NOT IN ('standard','express','overnight','pickup');

SELECT COUNT(*) AS negative_shipping_cost,
       MIN(shipping_cost) AS min_shipping_cost
FROM orders
WHERE shipping_cost < 0;

SELECT COUNT(*) AS negative_total_price,
       MIN(total_price) AS min_total_price
FROM orders
WHERE total_price < 0;

-- [SECTION] SSOT 중복 여부
SELECT 
  COUNT(*) AS rows_total,
  COUNT(order_number) AS rows_with_order_number,
  COUNT(serial_number) AS rows_with_serial_number,
  COUNT(*) - COUNT(DISTINCT order_number) AS duplicate_order_number
FROM orders;

-- [SECTION] 인덱스 통계(information_schema)
SELECT TABLE_NAME, INDEX_NAME, CARDINALITY, NULLABLE
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders'
ORDER BY INDEX_NAME;

-- [SECTION] 인덱스 실사용 통계(sys) - MySQL 8+ 전용
SELECT 
  table_schema, table_name, index_name, rows_read, rows_indexed, index_scans
FROM sys.schema_index_statistics
WHERE table_schema = DATABASE()
  AND table_name = 'orders'
ORDER BY rows_read DESC;

-- [SECTION - OPTIONAL] 제약 실패 테스트(트랜잭션, 기본 주석 처리)
-- 실행 시 의도적으로 오류가 발생하며, 트랜잭션은 ROLLBACK 처리됩니다.
-- START TRANSACTION;
-- -- (실패해야 정상) 잘못된 status
-- INSERT INTO orders (user_id, order_number, total_price, status, shipping_method, shipping_cost)
-- VALUES (999, 'ORD-TEST-001', 10000.00, 'weird', 'standard', 0);
-- -- (실패해야 정상) 음수 total_price
-- INSERT INTO orders (user_id, order_number, total_price, status, shipping_method, shipping_cost)
-- VALUES (999, 'ORD-TEST-002', -1000.00, 'confirmed', 'standard', 0);
-- ROLLBACK;

-- [SECTION] 완료 메시지
SELECT '=== 제약조건 및 인덱스 검증 완료 ===' AS message;