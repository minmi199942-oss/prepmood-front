-- order_items 테이블에 size와 color 컬럼 추가
-- 주문 상세 정보를 정확히 저장하기 위한 마이그레이션

USE prepmood;

-- 1. 컬럼 추가
ALTER TABLE order_items 
ADD COLUMN size VARCHAR(10) AFTER product_name,
ADD COLUMN color VARCHAR(20) AFTER size;

-- 2. 확인
DESCRIBE order_items;

-- 3. 테스트 데이터 확인
SELECT order_item_id, product_name, size, color, quantity, unit_price 
FROM order_items 
LIMIT 5;

