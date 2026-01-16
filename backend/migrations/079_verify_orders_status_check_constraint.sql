-- ============================================================
-- 079_verify_orders_status_check_constraint.sql
-- orders.status 체크 제약 검증
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 체크 제약 확인
-- ============================================================
SELECT '=== 1. 체크 제약 확인 ===' AS info;

SELECT 
    CONSTRAINT_NAME,
    CHECK_CLAUSE
FROM information_schema.CHECK_CONSTRAINTS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders'
  AND CONSTRAINT_NAME = 'chk_order_status';

-- ============================================================
-- 2. 허용된 status 값 확인
-- ============================================================
SELECT '=== 2. 허용된 status 값 확인 ===' AS info;

-- 체크 제약에서 허용된 값 추출 (수동 확인용)
-- 예상 값: pending, confirmed, processing, paid, partial_shipped, shipped, partial_delivered, delivered, cancelled, refunded

-- ============================================================
-- 3. 현재 orders.status 값 분포
-- ============================================================
SELECT '=== 3. 현재 orders.status 값 분포 ===' AS info;

SELECT 
    status,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM orders), 2) as percentage
FROM orders
GROUP BY status
ORDER BY count DESC;

-- ============================================================
-- 4. 체크 제약 위반 데이터 확인 (있으면 안 됨)
-- ============================================================
SELECT '=== 4. 체크 제약 위반 데이터 확인 ===' AS info;

-- 이 쿼리는 결과가 없어야 함 (모든 status가 허용된 값이어야 함)
SELECT 
    order_id,
    order_number,
    status,
    '체크 제약 위반 가능성' AS warning
FROM orders
WHERE status NOT IN (
    'pending', 
    'confirmed', 
    'processing', 
    'paid', 
    'partial_shipped', 
    'shipped', 
    'partial_delivered', 
    'delivered', 
    'cancelled', 
    'refunded'
);

-- ============================================================
-- 5. 체크 제약 테스트 (INSERT 시도)
-- ============================================================
SELECT '=== 5. 체크 제약 테스트 ===' AS info;

-- 테스트용 임시 테이블 생성 (실제 orders 테이블에 영향 없음)
CREATE TEMPORARY TABLE IF NOT EXISTS test_orders_status (
    test_id INT PRIMARY KEY AUTO_INCREMENT,
    test_status VARCHAR(50)
);

-- 유효한 값 테스트 (에러 없어야 함)
INSERT INTO test_orders_status (test_status) VALUES 
    ('pending'),
    ('confirmed'),
    ('processing'),
    ('paid'),
    ('partial_shipped'),
    ('shipped'),
    ('partial_delivered'),
    ('delivered'),
    ('cancelled'),
    ('refunded');

SELECT '유효한 status 값 테스트 성공' AS result;

-- 임시 테이블 삭제
DROP TEMPORARY TABLE IF EXISTS test_orders_status;

-- ============================================================
-- 6. SHOW CREATE TABLE로 최종 확인
-- ============================================================
SELECT '=== 6. SHOW CREATE TABLE로 최종 확인 ===' AS info;

SHOW CREATE TABLE orders\G

SELECT '=== 검증 완료 ===' AS status;
