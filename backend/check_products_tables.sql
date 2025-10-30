-- products와 admin_products 테이블 비교

USE prepmood;

-- 1. products 테이블 구조
SELECT '=== products 테이블 구조 ===' AS info;
DESCRIBE products;

-- 2. admin_products 테이블 구조
SELECT '=== admin_products 테이블 구조 ===' AS info;
DESCRIBE admin_products;

-- 3. products 데이터 수
SELECT '=== products 데이터 수 ===' AS info;
SELECT COUNT(*) AS count FROM products;

-- 4. admin_products 데이터 수
SELECT '=== admin_products 데이터 수 ===' AS info;
SELECT COUNT(*) AS count FROM admin_products;

-- 5. products 샘플 데이터 (최대 5개)
SELECT '=== products 샘플 데이터 ===' AS info;
SELECT id, name, price, category FROM products LIMIT 5;

-- 6. admin_products 샘플 데이터 (최대 5개)
SELECT '=== admin_products 샘플 데이터 ===' AS info;
SELECT id, name, price, category FROM admin_products LIMIT 5;


