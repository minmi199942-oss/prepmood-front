-- products.xlsx의 제품명과 admin_products의 제품명 매칭 확인
USE prepmood;

SELECT '=== admin_products 목록 ===' AS info;
SELECT id, name FROM admin_products ORDER BY name;

-- products.xlsx에서 읽은 제품명 예시 (xlsx 파일을 확인해야 함)
SELECT '=== 참고: xlsx의 product_name 예시 ===' AS info;
SELECT '예: "SH Teneu Solid" (실제 xlsx 파일을 확인하세요)' AS note;
