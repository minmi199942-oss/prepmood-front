-- admin_products와 xlsx 제품명 매칭 확인
USE prepmood;

SELECT '=== admin_products 목록 ===' AS info;
SELECT id, name FROM admin_products ORDER BY id;
