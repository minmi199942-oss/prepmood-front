#!/bin/bash
# VPS에서 직접 실행할 수 있는 빠른 확인 스크립트

mysql -u prepmood_user -p prepmood << EOF
-- 1. 테이블 구조 확인
DESCRIBE admin_products;

-- 2. 데이터 개수
SELECT COUNT(*) AS total_products FROM admin_products;

-- 3. gender 컬럼 존재 여부
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'gender 컬럼 존재함'
        ELSE 'gender 컬럼 없음'
    END AS gender_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'gender';

-- 4. 샘플 데이터 (최대 3개)
SELECT * FROM admin_products LIMIT 3;
EOF

