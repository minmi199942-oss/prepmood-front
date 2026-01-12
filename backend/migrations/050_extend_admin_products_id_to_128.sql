-- ============================================================
-- 050_extend_admin_products_id_to_128.sql
-- Phase 1 사전 작업: admin_products.id를 VARCHAR(128)로 확장
-- GPT 최종 지적 (A): 신규 상품 규칙이 커지면 VARCHAR(50)으로는 부족
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 현재 admin_products.id 스펙 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_SET_NAME,
    COLLATION_NAME,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'id';

-- 현재 가장 긴 id 확인
SELECT '=== 현재 가장 긴 id 확인 ===' AS info;
SELECT 
    id,
    LENGTH(id) as id_length
FROM admin_products
ORDER BY LENGTH(id) DESC
LIMIT 5;

-- ============================================================
-- 2. admin_products.id를 VARCHAR(128)로 확장
-- ============================================================
-- ⚠️ GPT 최종 지적 (A): Phase 1 시작 전 필수
-- 신규 상품이 id 컬럼에 들어가는데 50이면 부족할 수 있음
ALTER TABLE admin_products
MODIFY COLUMN id VARCHAR(128)
CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci NOT NULL;

-- ============================================================
-- 3. 결과 확인
-- ============================================================
SELECT '=== 변경 후 admin_products.id 스펙 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_SET_NAME,
    COLLATION_NAME,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'id';

SELECT '=== admin_products.id 확장 완료 ===' AS status;
