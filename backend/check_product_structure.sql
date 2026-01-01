-- 상품 테이블 구조 및 데이터 확인 스크립트
-- admin_products 테이블의 실제 구조와 분류 체계 확인

USE prepmood;

-- ============================================================
-- 1. 테이블 구조 확인
-- ============================================================
SELECT '=== admin_products 테이블 구조 ===' AS info;
DESCRIBE admin_products;

-- ============================================================
-- 2. 테이블 존재 여부 및 데이터 개수
-- ============================================================
SELECT '=== 테이블 상태 ===' AS info;
SELECT 
    COUNT(*) AS total_products,
    COUNT(DISTINCT gender) AS gender_count,
    COUNT(DISTINCT category) AS category_count,
    COUNT(DISTINCT type) AS type_count
FROM admin_products;

-- ============================================================
-- 3. Gender (성별) 분류 확인
-- ============================================================
SELECT '=== Gender (성별) 분류 ===' AS info;
SELECT 
    gender,
    COUNT(*) AS count,
    GROUP_CONCAT(DISTINCT category ORDER BY category SEPARATOR ', ') AS categories
FROM admin_products
GROUP BY gender
ORDER BY gender;

-- ============================================================
-- 4. Category (카테고리) 분류 확인
-- ============================================================
SELECT '=== Category (카테고리) 분류 ===' AS info;
SELECT 
    category,
    COUNT(*) AS count,
    GROUP_CONCAT(DISTINCT gender ORDER BY gender SEPARATOR ', ') AS genders,
    GROUP_CONCAT(DISTINCT type ORDER BY type SEPARATOR ', ') AS types
FROM admin_products
GROUP BY category
ORDER BY category;

-- ============================================================
-- 5. Type (타입) 분류 확인
-- ============================================================
SELECT '=== Type (타입) 분류 ===' AS info;
SELECT 
    type,
    category,
    COUNT(*) AS count
FROM admin_products
GROUP BY type, category
ORDER BY category, type;

-- ============================================================
-- 6. Gender + Category 조합별 개수
-- ============================================================
SELECT '=== Gender + Category 조합별 개수 ===' AS info;
SELECT 
    gender,
    category,
    COUNT(*) AS count
FROM admin_products
GROUP BY gender, category
ORDER BY gender, category;

-- ============================================================
-- 7. 샘플 데이터 (최대 10개)
-- ============================================================
SELECT '=== 샘플 데이터 (최대 10개) ===' AS info;
SELECT 
    id,
    name,
    price,
    gender,
    category,
    type,
    SUBSTRING(description, 1, 50) AS description_preview
FROM admin_products
ORDER BY created_at DESC
LIMIT 10;

-- ============================================================
-- 8. 실제 사용되는 모든 고유값 목록
-- ============================================================
SELECT '=== 실제 사용되는 고유값 목록 ===' AS info;

SELECT 'Gender 값:' AS field_type, GROUP_CONCAT(DISTINCT gender ORDER BY gender SEPARATOR ', ') AS values
FROM admin_products
UNION ALL
SELECT 'Category 값:' AS field_type, GROUP_CONCAT(DISTINCT category ORDER BY category SEPARATOR ', ') AS values
FROM admin_products
UNION ALL
SELECT 'Type 값 (전체):' AS field_type, GROUP_CONCAT(DISTINCT type ORDER BY type SEPARATOR ', ') AS values
FROM admin_products;

