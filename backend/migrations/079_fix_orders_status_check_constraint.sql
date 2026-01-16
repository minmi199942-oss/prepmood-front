-- ============================================================
-- 079_fix_orders_status_check_constraint.sql
-- orders.status 체크 제약 수정: paid, partial_shipped, partial_delivered 추가
-- 문서 스펙: FINAL_EXECUTION_SPEC_REVIEW.md (라인 58-70)
-- 문제: ORDER_66_FAILURE_ANALYSIS.md 참조
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- orders 테이블 존재 확인
SELECT 
    TABLE_NAME,
    TABLE_TYPE
FROM information_schema.TABLES
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders';

-- 현재 체크 제약 확인 (SHOW CREATE TABLE 사용)
SELECT '=== 현재 체크 제약 확인 ===' AS info;
SHOW CREATE TABLE orders\G

-- 현재 orders.status 값 분포 확인
SELECT 
    status,
    COUNT(*) as count
FROM orders
GROUP BY status
ORDER BY count DESC;

-- ============================================================
-- 2. 체크 제약 수정
-- ============================================================
SELECT '=== 2. 체크 제약 수정 ===' AS info;

-- 기존 체크 제약 삭제
ALTER TABLE orders
DROP CONSTRAINT IF EXISTS chk_order_status;

-- 새로운 체크 제약 추가 (paid, partial_shipped, partial_delivered 포함)
ALTER TABLE orders
ADD CONSTRAINT chk_order_status 
CHECK (`status` IN (
  'pending', 
  'confirmed', 
  'processing', 
  'paid',              -- 추가 (설계 문서 기준)
  'partial_shipped',   -- 추가 (설계 문서 기준)
  'shipped', 
  'partial_delivered', -- 추가 (설계 문서 기준)
  'delivered', 
  'cancelled', 
  'refunded'
));

-- ============================================================
-- 3. 사후 검증
-- ============================================================
SELECT '=== 3. 사후 검증 ===' AS info;

-- 체크 제약 확인 (SHOW CREATE TABLE 사용)
SELECT '=== 체크 제약 확인 ===' AS info;
SHOW CREATE TABLE orders\G

-- orders 테이블 구조 확인 (status 컬럼)
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'orders' 
  AND COLUMN_NAME = 'status';

-- 체크 제약이 제대로 적용되었는지 테스트 (유효한 값)
SELECT '=== 테스트: 유효한 status 값 ===' AS test;
-- 이 쿼리는 에러가 나지 않아야 함
SELECT 
    order_id,
    order_number,
    status
FROM orders
WHERE status IN ('pending', 'confirmed', 'processing', 'paid', 'partial_shipped', 'shipped', 'partial_delivered', 'delivered', 'cancelled', 'refunded')
LIMIT 5;

SELECT '=== orders.status 체크 제약 수정 완료 ===' AS status;
