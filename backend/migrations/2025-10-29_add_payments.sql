-- payments 테이블 생성
-- 결제 시스템 통합을 위한 테이블

USE prepmood;

CREATE TABLE IF NOT EXISTS payments (
    payment_id BIGINT AUTO_INCREMENT PRIMARY KEY,
    order_number VARCHAR(32) NOT NULL,
    gateway VARCHAR(32) NOT NULL COMMENT '결제 게이트웨이 (예: toss)',
    payment_key VARCHAR(128) NOT NULL COMMENT '게이트웨이 고유 키',
    status ENUM('initiated', 'authorized', 'captured', 'failed', 'cancelled', 'refunded') NOT NULL DEFAULT 'initiated',
    amount DECIMAL(12,2) NOT NULL COMMENT '결제 금액',
    currency CHAR(3) NOT NULL DEFAULT 'KRW' COMMENT '통화 코드',
    failure_reason VARCHAR(255) NULL COMMENT '실패 사유',
    payload_json JSON NULL COMMENT '게이트웨이 응답 원본',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (order_number) REFERENCES orders(order_number) ON DELETE CASCADE,
    UNIQUE KEY uk_payment_key (payment_key),
    KEY idx_payments_order (order_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

COMMENT ON TABLE payments IS '결제 정보 테이블';
COMMENT ON COLUMN payments.payment_key IS '토스페이먼츠 등 게이트웨이에서 반환하는 고유 결제 키';
COMMENT ON COLUMN payments.status IS 'initiated: 초기화됨, authorized: 승인됨, captured: 확정됨, failed: 실패, cancelled: 취소됨, refunded: 환불됨';

