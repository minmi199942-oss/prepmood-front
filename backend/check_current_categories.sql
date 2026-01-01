-- 현재 admin_products 테이블의 실제 카테고리 구조 확인
-- gender 없이 확인

USE prepmood;

-- 1. Category (카테고리) 분포
SELECT 
    '=== Category 분포 ===' AS info;
    
SELECT 
    category,
    COUNT(*) AS count
FROM admin_products
GROUP BY category
ORDER BY category;

-- 2. Type (타입) 분포 (카테고리별)
SELECT 
    '=== Type 분포 (카테고리별) ===' AS info;
    
SELECT 
    category,
    type,
    COUNT(*) AS count
FROM admin_products
GROUP BY category, type
ORDER BY category, type;

-- 3. 전체 고유값 목록
SELECT 
    '=== 사용 중인 Category 값 ===' AS info,
    GROUP_CONCAT(DISTINCT category ORDER BY category SEPARATOR ', ') AS categories
FROM admin_products;

SELECT 
    '=== 사용 중인 Type 값 (카테고리별) ===' AS info,
    category,
    GROUP_CONCAT(DISTINCT type ORDER BY type SEPARATOR ', ') AS types
FROM admin_products
GROUP BY category
ORDER BY category;

-- 4. 샘플 데이터 (최대 10개)
SELECT 
    '=== 샘플 데이터 ===' AS info;
    
SELECT 
    id,
    name,
    category,
    type,
    price
FROM admin_products
ORDER BY created_at DESC
LIMIT 10;

