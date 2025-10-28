USE prepmood;

ALTER TABLE orders
  MODIFY status          VARCHAR(50) NOT NULL DEFAULT 'pending' COMMENT '주문 상태: pending, confirmed, processing, shipped, delivered, cancelled, refunded',
  MODIFY shipping_method VARCHAR(50) NOT NULL DEFAULT 'standard' COMMENT '배송 방법: standard, express, overnight, pickup',
  MODIFY shipping_cost   DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '배송비',
  MODIFY total_price     DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '총 금액',
  MODIFY quantity        INT NOT NULL DEFAULT 1;

ALTER TABLE orders
  MODIFY serial_number VARCHAR(50) COMMENT 'DEPRECATED: use order_number (FK dropped; will be removed later)';

SHOW CREATE TABLE orders;
