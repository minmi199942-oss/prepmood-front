-- Phase 0-5 롤백 스크립트
-- shipping_name → shipping_first_name, shipping_last_name으로 복원
-- ⚠️ 주의: 이 롤백은 shipping_name에서 이름을 분리하는 로직이므로 완벽하지 않을 수 있습니다.

USE prepmood;

-- ============================================================
-- 1. shipping_first_name, shipping_last_name 컬럼 추가
-- ============================================================
ALTER TABLE orders
  ADD COLUMN shipping_first_name VARCHAR(100) NULL COMMENT '배송지 이름' 
  AFTER shipping_email;

ALTER TABLE orders
  ADD COLUMN shipping_last_name VARCHAR(100) NULL COMMENT '배송지 성' 
  AFTER shipping_first_name;

-- ============================================================
-- 2. 기존 데이터 복원 (shipping_name → shipping_first_name, shipping_last_name)
-- ============================================================
-- ⚠️ 주의: shipping_name을 분리하는 로직은 완벽하지 않습니다.
-- 단일 단어인 경우: shipping_first_name에 저장, shipping_last_name은 빈 값
-- 여러 단어인 경우: 첫 번째를 shipping_last_name, 나머지를 shipping_first_name으로 저장
UPDATE orders 
SET 
  shipping_last_name = CASE 
    WHEN shipping_name IS NULL OR TRIM(shipping_name) = '' THEN NULL
    WHEN LOCATE(' ', TRIM(shipping_name)) > 0 THEN SUBSTRING_INDEX(TRIM(shipping_name), ' ', 1)
    ELSE NULL
  END,
  shipping_first_name = CASE 
    WHEN shipping_name IS NULL OR TRIM(shipping_name) = '' THEN NULL
    WHEN LOCATE(' ', TRIM(shipping_name)) > 0 THEN TRIM(SUBSTRING(TRIM(shipping_name), LOCATE(' ', TRIM(shipping_name)) + 1))
    ELSE TRIM(shipping_name)
  END
WHERE shipping_name IS NOT NULL;

-- ============================================================
-- 3. shipping_name 컬럼 제거
-- ============================================================
ALTER TABLE orders
  DROP COLUMN shipping_name;

-- ============================================================
-- 검증 쿼리
-- ============================================================
-- 실행 후 다음 쿼리로 확인:
-- DESCRIBE orders;  -- shipping_first_name, shipping_last_name 컬럼 확인, shipping_name 제거 확인
-- SELECT order_id, order_number, shipping_first_name, shipping_last_name, shipping_email FROM orders LIMIT 5;  -- 데이터 확인
