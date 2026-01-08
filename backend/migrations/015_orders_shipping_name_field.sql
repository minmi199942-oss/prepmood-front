-- Phase 0-5: orders 테이블 shipping_name 필드 통합
-- shipping_first_name, shipping_last_name → shipping_name 단일 필드로 변경

USE prepmood;

-- ============================================================
-- 1. shipping_name 컬럼 추가 (단일 필드)
-- ============================================================
ALTER TABLE orders
  ADD COLUMN shipping_name VARCHAR(100) NULL COMMENT '배송지 수령인 이름 (단일 필드)' 
  AFTER shipping_email;

-- ============================================================
-- 2. 기존 데이터 마이그레이션 (shipping_last_name + shipping_first_name → shipping_name)
-- ============================================================
-- 기존 주문의 shipping_last_name과 shipping_first_name을 shipping_name으로 통합
UPDATE orders 
SET shipping_name = TRIM(
  CONCAT(
    COALESCE(shipping_last_name, ''), 
    CASE 
      WHEN shipping_last_name IS NOT NULL AND shipping_first_name IS NOT NULL THEN ' '
      ELSE ''
    END,
    COALESCE(shipping_first_name, '')
  )
)
WHERE shipping_name IS NULL;

-- shipping_name이 비어있는 경우 처리 (NULL 또는 빈 문자열)
UPDATE orders 
SET shipping_name = COALESCE(shipping_email, '고객')
WHERE shipping_name IS NULL OR TRIM(shipping_name) = '';

-- ============================================================
-- 3. shipping_name 컬럼 필수로 변경
-- ============================================================
ALTER TABLE orders
  MODIFY COLUMN shipping_name VARCHAR(100) NOT NULL COMMENT '배송지 수령인 이름 (단일 필드)';

-- ============================================================
-- 4. shipping_first_name, shipping_last_name 컬럼 제거
-- ============================================================
-- ⚠️ 주의: shipping_name으로 데이터가 마이그레이션된 후에만 실행
ALTER TABLE orders
  DROP COLUMN shipping_first_name,
  DROP COLUMN shipping_last_name;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 실행 후 다음 쿼리로 확인:
-- DESCRIBE orders;  -- shipping_name 컬럼 확인, shipping_first_name/shipping_last_name 제거 확인
-- SELECT order_id, order_number, shipping_name, shipping_email FROM orders LIMIT 5;  -- 데이터 확인
