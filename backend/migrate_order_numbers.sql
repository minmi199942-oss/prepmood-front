-- serial_number와 order_number 통합 마이그레이션 스크립트
-- order_number를 SSOT(단일 진실 원천)로 설정

-- 1. 기존 데이터에 주문번호 생성 (serial_number가 있는 경우)
UPDATE orders 
SET order_number = CONCAT('ORD-', DATE_FORMAT(order_date, '%Y%m%d'), '-', LPAD(order_id, 6, '0'))
WHERE order_number IS NULL AND serial_number IS NOT NULL;

-- 2. serial_number가 없는 기존 주문에 주문번호 생성
UPDATE orders 
SET order_number = CONCAT('ORD-', DATE_FORMAT(order_date, '%Y%m%d'), '-', LPAD(order_id, 6, '0'))
WHERE order_number IS NULL;

-- 3. serial_number 컬럼 제거 (order_number로 통합)
-- 주의: 이 작업은 되돌릴 수 없으므로 백업 후 실행
-- ALTER TABLE orders DROP COLUMN serial_number;

-- 4. 통합 후 검증
SELECT 
  COUNT(*) AS total_orders,
  COUNT(order_number) AS orders_with_number,
  COUNT(serial_number) AS orders_with_serial,
  COUNT(CASE WHEN order_number IS NOT NULL AND serial_number IS NULL THEN 1 END) AS migrated_count
FROM orders;

-- 5. 주문번호 형식 검증
SELECT 
  order_number,
  CHAR_LENGTH(order_number) AS length,
  CASE 
    WHEN order_number REGEXP '^ORD-[0-9]{8}-[0-9]{6}$' THEN 'VALID'
    ELSE 'INVALID'
  END AS format_check
FROM orders 
WHERE order_number IS NOT NULL
ORDER BY order_id DESC
LIMIT 10;
