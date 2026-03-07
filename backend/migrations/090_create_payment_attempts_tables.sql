-- ============================================================
-- 090_create_payment_attempts_tables.sql
-- Step A-1: payment_attempts, payment_payloads, stock_holds
-- GEMINI_FEEDBACK_ORDER_COMPLETE_BACK_NAVIGATION_REVIEW.md §11·§12·§14 반영
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. payment_attempts (결제 시도 메타데이터)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_attempts (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    order_id INT NOT NULL COMMENT 'orders.order_id',
    external_ref_id VARCHAR(150) NOT NULL COMMENT '토스 paymentKey 등 게이트웨이 고유 키',
    gateway VARCHAR(32) NOT NULL DEFAULT 'toss',
    attempt_seq SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT '동일 주문 내 시도 순서',
    status VARCHAR(30) NOT NULL COMMENT 'PROCESSING|CONFIRMED|FAILED|ABORTED_CHECK_REQUIRED|RECON_PROCESSING|TIMEOUT_WAITING|MANUAL_INTERVENTION_REQUIRED',
    amount DECIMAL(12,2) NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'KRW',
    stock_hold_id BIGINT UNSIGNED NULL COMMENT '연결된 stock_holds.id, 주문/홀딩 전이면 NULL',
    expires_at DATETIME NOT NULL COMMENT '선점 타임아웃·배치 GC. INSERT 시 필수(선점: NOW()+타임아웃)',
    recon_started_at DATETIME NULL COMMENT 'RECON_PROCESSING 전이 시각',
    status_history JSON NULL COMMENT '배열: [{ at, from, to, reason }]. 업데이트 시 JSON_ARRAY_APPEND 사용',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_gateway_external_ref (gateway, external_ref_id),
    UNIQUE KEY uk_order_attempt (order_id, attempt_seq) COMMENT '동일 주문 내 attempt_seq 중복 선점 방지',
    KEY idx_payment_attempts_order (order_id),
    KEY idx_payment_attempts_status_expires (status, expires_at),
    CONSTRAINT fk_payment_attempts_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. payment_payloads (결제 시도별 대용량 페이로드 1:1, ON DELETE RESTRICT)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_payloads (
    attempt_id BIGINT UNSIGNED PRIMARY KEY COMMENT 'payment_attempts.id',
    payload_json JSON NULL COMMENT '토스 응답 원본·에러 스택 등, 8KB 이하 권장. 포인트 조회만 허용',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_payment_payloads_attempt FOREIGN KEY (attempt_id) REFERENCES payment_attempts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. stock_holds (재고 소프트 홀딩. 오버 홀딩 방지는 INSERT 시 stock_units FOR UPDATE)
-- ============================================================
CREATE TABLE IF NOT EXISTS stock_holds (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    stock_unit_id BIGINT NOT NULL COMMENT 'stock_units.stock_unit_id',
    order_id INT NOT NULL COMMENT 'orders.order_id',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE|RELEASED|EXPIRED|CONSUMED',
    expires_at DATETIME NOT NULL COMMENT '만료 시각, 미니 배치 GC 대상',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    released_at DATETIME NULL COMMENT 'RELEASED/EXPIRED/CONSUMED 전이 시각',
    KEY idx_stock_holds_expires (expires_at),
    KEY idx_stock_holds_status_expires (status, expires_at),
    KEY idx_stock_holds_order (order_id),
    KEY idx_stock_holds_stock_unit (stock_unit_id),
    CONSTRAINT fk_stock_holds_stock_unit FOREIGN KEY (stock_unit_id) REFERENCES stock_units(stock_unit_id) ON DELETE RESTRICT,
    CONSTRAINT fk_stock_holds_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== 090 payment_attempts, payment_payloads, stock_holds 생성 완료 ===' AS info;
