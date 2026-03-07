-- ============================================================
-- 091_checkout_sessions_and_payment_attempts_cols.sql
-- GEMINI_FEEDBACK_ORDER_COMPLETE_BACK_NAVIGATION_REVIEW.md §5·§9.3·§10.24 반영
-- - checkout_sessions: 세션 키 → IN_PROGRESS/CONSUMED, attempt_id 매핑
-- - payment_attempts: pg_order_id, refund_required, refund_status (Path C·리콘)
-- - payment_attempt_logs: 상태 전이 로그 (Append-only)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. checkout_sessions (결제 세션·선점 재진입 방지)
-- ============================================================
CREATE TABLE IF NOT EXISTS checkout_sessions (
    session_key VARCHAR(150) PRIMARY KEY COMMENT '서버 발급 키 또는 paymentKey(최소 구현)',
    order_id INT NOT NULL COMMENT 'orders.order_id',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING|IN_PROGRESS|CONSUMED',
    attempt_id BIGINT UNSIGNED NULL COMMENT 'payment_attempts.id, IN_PROGRESS 시 매핑',
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_checkout_sessions_order (order_id),
    KEY idx_checkout_sessions_status_expires (status, expires_at),
    CONSTRAINT fk_checkout_sessions_order FOREIGN KEY (order_id) REFERENCES orders(order_id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. payment_attempts 컬럼 추가 (pg_order_id, Path C)
-- ============================================================
-- MySQL 5.7 호환: IF NOT EXISTS 없음. 최초 1회 실행. 이미 있으면 해당 ALTER 건너뛰기.
-- pg_order_id: Intent Binding·response.orderId 대조
ALTER TABLE payment_attempts
    ADD COLUMN pg_order_id VARCHAR(100) NULL COMMENT 'PG 전달 orderId, 응답 대조용' AFTER external_ref_id;

-- refund_required, refund_status: Pre-refund 로깅·리콘 (§10.14)
ALTER TABLE payment_attempts
    ADD COLUMN refund_required TINYINT(1) NOT NULL DEFAULT 0 COMMENT '0|1' AFTER status_history,
    ADD COLUMN refund_status VARCHAR(20) NOT NULL DEFAULT 'NONE' COMMENT 'NONE|PENDING|SUCCESS|FAILED' AFTER refund_required;

-- 인덱스 (리콘·Path C)
ALTER TABLE payment_attempts ADD INDEX idx_pg_order_id (pg_order_id);
ALTER TABLE payment_attempts ADD INDEX idx_refund_track (refund_status, updated_at);

-- ============================================================
-- 3. payment_attempt_logs (상태 전이 Append-only, §10.5)
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_attempt_logs (
    id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,
    attempt_id BIGINT UNSIGNED NOT NULL,
    from_status VARCHAR(30) NOT NULL,
    to_status VARCHAR(30) NOT NULL,
    reason TEXT NULL,
    server_ip VARCHAR(45) NULL,
    request_id VARCHAR(100) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_attempt_id (attempt_id),
    CONSTRAINT fk_payment_logs_attempt FOREIGN KEY (attempt_id) REFERENCES payment_attempts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. stock_holds 인덱스 (고아 홀드 Fallback Cleaner용, §5·§10.10)
-- ============================================================
ALTER TABLE stock_holds ADD INDEX idx_stock_holds_status_created (status, created_at);

SELECT '=== 091 checkout_sessions, payment_attempts cols, payment_attempt_logs, stock_holds 인덱스 완료 ===' AS info;
