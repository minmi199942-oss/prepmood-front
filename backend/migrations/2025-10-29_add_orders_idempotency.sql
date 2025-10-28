-- Idempotency 테이블 생성
-- 주문 중복 방지를 위한 Idempotency 키 관리 테이블

CREATE TABLE IF NOT EXISTS orders_idempotency (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  user_id INT NOT NULL,
  idem_key VARCHAR(64) NOT NULL,
  order_number VARCHAR(32) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_idem (user_id, idem_key),
  KEY idx_order_number (order_number),
  CONSTRAINT fk_idem_order FOREIGN KEY (order_number)
    REFERENCES orders(order_number) ON DELETE CASCADE
);
