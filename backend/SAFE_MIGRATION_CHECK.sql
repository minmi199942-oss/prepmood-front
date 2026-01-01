-- 안전한 마이그레이션 전 확인 스크립트
-- 마이그레이션 실행 전에 이 스크립트를 먼저 실행하여 현재 상태를 확인하세요

USE prepmood;

-- ============================================================
-- 1. 테이블 구조 확인
-- ============================================================
SELECT '=== 1. 테이블 구조 확인 ===' AS info;
DESCRIBE admin_products;

-- ============================================================
-- 2. 데이터 개수 확인
-- ============================================================
SELECT '=== 2. 데이터 개수 확인 ===' AS info;
SELECT COUNT(*) AS total_products FROM admin_products;

-- ============================================================
-- 3. gender 컬럼 존재 여부 확인
-- ============================================================
-- 이 쿼리가 에러 없이 실행되면 gender 컬럼이 존재함
-- 에러가 발생하면 gender 컬럼이 없는 것 (가능성 높음)
SELECT '=== 3. gender 컬럼 확인 ===' AS info;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'gender 컬럼 존재함'
        ELSE 'gender 컬럼 없음 (테이블이 비어있을 수 있음)'
    END AS gender_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'gender';

-- ============================================================
-- 4. 샘플 데이터 확인 (있는 경우)
-- ============================================================
SELECT '=== 4. 샘플 데이터 확인 ===' AS info;
SELECT * FROM admin_products LIMIT 5;

-- ============================================================
-- 5. 현재 인덱스 확인
-- ============================================================
SELECT '=== 5. 현재 인덱스 확인 ===' AS info;
SHOW INDEX FROM admin_products;

-- ============================================================
-- 6. 카테고리/타입 분포 확인
-- ============================================================
SELECT '=== 6. 카테고리 분포 ===' AS info;
SELECT 
    category,
    COUNT(*) AS count
FROM admin_products
GROUP BY category
ORDER BY category;

SELECT '=== 7. 타입 분포 (카테고리별) ===' AS info;
SELECT 
    category,
    type,
    COUNT(*) AS count
FROM admin_products
GROUP BY category, type
ORDER BY category, type;

