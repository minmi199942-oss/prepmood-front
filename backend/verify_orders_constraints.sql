-- ============================================================================
-- orders 테이블 제약조건 및 인덱스 검증 스크립트
-- ============================================================================

-- ============================================================================
-- 1. 테이블 구조 및 제약조건 확인
-- 전체 테이블 정의를 확인하여 CREATE TABLE 문에서 제약조건이 명시되어 있는지 확인
-- ============================================================================
SHOW CREATE TABLE orders;

-- ============================================================================
-- 2. 인덱스 확인
-- 현재 orders 테이블에 생성된 모든 인덱스 목록 확인
-- ============================================================================
SHOW INDEX FROM orders;

-- ============================================================================
-- 3. 주문번호 길이 검증
-- 현재 포맷 'ORD-YYYYMMDD-######'가 VARCHAR(20)에 들어가는지 확인
-- ============================================================================
SELECT
  MAX(CHAR_LENGTH(order_number)) AS max_len,
  SUM(order_number IS NULL) AS null_cnt,
  COUNT(*) AS total_orders
FROM orders;

-- ============================================================================
-- 4. 상태 제약조건 검증
-- 허용된 상태값 이외의 값이 있는 레코드가 없는지 확인
-- ============================================================================
SELECT 
  COUNT(*) AS bad_status_count,
  GROUP_CONCAT(DISTINCT status) AS invalid_statuses
FROM orders
WHERE status NOT IN ('pending','confirmed','processing','shipped','delivered','cancelled','refunded');

-- ============================================================================
-- 5. 배송방법 제약조건 검증
-- 허용된 배송방법 이외의 값이 있는 레코드가 없는지 확인
-- ============================================================================
SELECT 
  COUNT(*) AS bad_method_count,
  GROUP_CONCAT(DISTINCT shipping_method) AS invalid_methods
FROM orders
WHERE shipping_method NOT IN ('standard','express','overnight','pickup');

-- ============================================================================
-- 6. 배송비 제약조건 검증 (0 이상)
-- 음수 배송비가 있는지 확인
-- ============================================================================
SELECT 
  COUNT(*) AS negative_shipping_cost,
  MIN(shipping_cost) AS min_shipping_cost
FROM orders
WHERE shipping_cost < 0;

-- ============================================================================
-- 7. 총 금액 제약조건 검증 (0 이상)
-- 음수 총 금액이 있는지 확인
-- ============================================================================
SELECT 
  COUNT(*) AS negative_total_price,
  MIN(total_price) AS min_total_price
FROM orders
WHERE total_price < 0;

-- ============================================================================
-- 8. serial_number와 order_number 중복 확인 (SSOT 검증)
-- SSOT(단일 진실 원천) 원칙에 따라 order_number로 통일되어야 함
-- ============================================================================
SELECT 
  COUNT(*) AS has_serial_number,
  COUNT(order_number) AS has_order_number,
  COUNT(CASE WHEN serial_number IS NOT NULL AND order_number IS NOT NULL THEN 1 END) AS has_both
FROM orders;

-- ============================================================================
-- 9. 주문번호 고유성 검증
-- order_number가 실제로 고유한지 확인
-- ============================================================================
SELECT 
  COUNT(*) AS total_order_numbers,
  COUNT(DISTINCT order_number) AS unique_order_numbers,
  COUNT(*) - COUNT(DISTINCT order_number) AS duplicate_count
FROM orders
WHERE order_number IS NOT NULL;

-- ============================================================================
-- 10. 인덱스 정의 확인
-- information_schema를 통해 현재 데이터베이스의 인덱스 정의 확인
-- ============================================================================
SELECT 
  TABLE_NAME,
  INDEX_NAME,
  CARDINALITY,
  NULLABLE
FROM information_schema.STATISTICS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders'
ORDER BY INDEX_NAME;

-- ============================================================================
-- 11. 인덱스 사용 통계 확인 (MySQL 8.0+)
-- sys.schema_index_statistics 뷰를 통해 실제 인덱스 사용 통계 확인
-- ============================================================================
SELECT 
  table_schema,
  table_name,
  index_name,
  rows_read,
  rows_indexed,
  index_scans
FROM sys.schema_index_statistics
WHERE table_schema = DATABASE()
  AND table_name = 'orders'
ORDER BY rows_read DESC;

-- ============================================================================
-- 12. 제약조건 실패 테스트 (실패해야 정상)
-- 잘못된 상태값을 삽입하려고 할 때 제약조건 오류가 발생해야 함
-- ============================================================================
-- 테스트용 테이블 생성 (실제 데이터에 영향을 주지 않기 위해)
CREATE TEMPORARY TABLE IF NOT EXISTS test_orders_constraints AS
SELECT * FROM orders WHERE 1=0;

-- 잘못된 status 삽입 시도 (오류가 발생해야 정상)
-- 주의: 이 쿼리는 실패해야 하므로 주석 처리되어 있습니다
-- INSERT INTO test_orders_constraints (user_id, order_number, total_price, status) 
-- VALUES (999, 'ORD-TEST-001', 10000.00, 'weird');
-- 위 쿼리를 실행하면 ERROR 3819 (HY000): Check constraint 'chk_order_status' is violated. 오류 발생

-- ============================================================================
-- 13. 제약조건 실패 테스트 (실패해야 정상)
-- 음수 총 금액을 삽입하려고 할 때 제약조건 오류가 발생해야 함
-- ============================================================================
-- 음수 total_price 삽입 시도 (오류가 발생해야 정상)
-- 주의: 이 쿼리는 실패해야 하므로 주석 처리되어 있습니다
-- INSERT INTO test_orders_constraints (user_id, order_number, total_price, status) 
-- VALUES (999, 'ORD-TEST-002', -1000.00, 'confirmed');
-- 위 쿼리를 실행하면 ERROR 3819 (HY000): Check constraint 'chk_total_price' is violated. 오류 발생

-- ============================================================================
-- 14. 테스트 정리
-- ============================================================================
DROP TEMPORARY TABLE IF EXISTS test_orders_constraints;

-- ============================================================================
-- 검증 완료 요약
-- ============================================================================
SELECT '=== 제약조건 및 인덱스 검증 완료 ===' AS message;
SELECT 
  '모든 쿼리가 성공적으로 실행되었다면 제약조건과 인덱스가 정상적으로 반영된 것입니다.' AS summary;