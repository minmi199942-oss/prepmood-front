-- order_number 컬럼 길이 확장 (VARCHAR(20) -> VARCHAR(32))
-- 더 긴 주문번호 형식 지원을 위해 확장

ALTER TABLE orders MODIFY order_number VARCHAR(32) NOT NULL;

-- 변경 확인
DESCRIBE orders;
