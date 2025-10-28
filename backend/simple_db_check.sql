-- 간단한 데이터베이스 상태 확인 스크립트
-- 오류 없이 실행 가능한 기본 검증

-- [SECTION] 기본 연결 확인
USE prepmood;
SELECT '데이터베이스 연결 성공' AS status;

-- [SECTION] 테이블 존재 확인
USE prepmood;
SHOW TABLES LIKE 'orders';

-- [SECTION] orders 테이블 기본 정보
USE prepmood;
SELECT 
  COUNT(*) AS total_orders,
  COUNT(order_number) AS orders_with_number,
  COUNT(serial_number) AS orders_with_serial
FROM orders;

-- [SECTION] order_number 컬럼 정보 확인
USE prepmood;
SELECT 
  COLUMN_NAME,
  DATA_TYPE,
  CHARACTER_MAXIMUM_LENGTH,
  IS_NULLABLE,
  COLUMN_DEFAULT
FROM information_schema.COLUMNS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders' 
  AND COLUMN_NAME = 'order_number';

-- [SECTION] 제약조건 확인
USE prepmood;
SELECT 
  CONSTRAINT_NAME,
  CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS 
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'orders';

-- [SECTION] 인덱스 확인
USE prepmood;
SHOW INDEX FROM orders;

-- [SECTION] 최근 주문 확인 (있다면)
USE prepmood;
SELECT 
  order_id,
  order_number,
  total_price,
  status,
  order_date
FROM orders 
ORDER BY order_date DESC 
LIMIT 5;

-- [SECTION] 완료 메시지
USE prepmood;
SELECT '=== 기본 검증 완료 ===' AS message;
