-- Phase 0-5 검증 스크립트
-- 마이그레이션 후 실행하여 정상적으로 적용되었는지 확인

USE prepmood;

-- ============================================================
-- 1. orders 테이블 구조 확인
-- ============================================================
SELECT '=== orders 테이블 구조 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME LIKE 'shipping%'
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 2. shipping_name 컬럼 확인
-- ============================================================
SELECT '=== shipping_name 컬럼 확인 ===' AS info;

SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'shipping_name 컬럼 존재함 ✅'
        ELSE 'shipping_name 컬럼 없음 ❌'
    END AS shipping_name_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME = 'shipping_name';

-- ============================================================
-- 3. 제거된 컬럼 확인 (없어야 함)
-- ============================================================
SELECT '=== 제거된 컬럼 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    CASE 
        WHEN COLUMN_NAME IN ('shipping_first_name', 'shipping_last_name') THEN '❌ 제거되어야 하는 컬럼이 아직 존재함'
        ELSE '✅ 정상'
    END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME IN ('shipping_first_name', 'shipping_last_name');

-- ============================================================
-- 4. 데이터 샘플 확인
-- ============================================================
SELECT '=== 데이터 샘플 확인 ===' AS info;

SELECT 
    order_id,
    order_number,
    shipping_name,
    shipping_email,
    order_date
FROM orders
ORDER BY order_date DESC
LIMIT 5;

-- ============================================================
-- 5. 데이터 통계
-- ============================================================
SELECT '=== 데이터 통계 ===' AS info;

SELECT 
    COUNT(*) as total_orders,
    COUNT(shipping_name) as orders_with_shipping_name,
    COUNT(*) - COUNT(shipping_name) as orders_without_shipping_name,
    CASE 
        WHEN COUNT(*) = COUNT(shipping_name) THEN '✅ 모든 주문이 shipping_name 보유'
        ELSE '❌ shipping_name이 없는 주문 존재'
    END AS status
FROM orders;
