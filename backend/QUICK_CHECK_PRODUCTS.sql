-- 빠른 상품 테이블 확인 스크립트
-- VPS에서 실행하여 현재 상태 확인

USE prepmood;

-- 1. 테이블 구조 확인 (gender 필드 있는지 확인)
DESCRIBE admin_products;

-- 2. 샘플 데이터 확인 (gender 컬럼 포함)
SELECT id, name, gender, category, type FROM admin_products LIMIT 5;

-- 3. Gender 값 확인 (NULL이 있으면 문제!)
SELECT 
    'Gender 분포' AS info,
    COALESCE(gender, 'NULL') AS gender,
    COUNT(*) AS count
FROM admin_products
GROUP BY gender
ORDER BY gender;

-- 4. Category 분포
SELECT 
    'Category 분포' AS info,
    category,
    COUNT(*) AS count
FROM admin_products
GROUP BY category
ORDER BY category;

-- 5. Type 분포 (카테고리별)
SELECT 
    category,
    type,
    COUNT(*) AS count
FROM admin_products
GROUP BY category, type
ORDER BY category, type;

