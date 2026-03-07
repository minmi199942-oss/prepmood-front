-- ============================================================
-- 091_checkout_sessions_and_payment_attempts_cols.sql
-- GEMINI_FEEDBACK_ORDER_COMPLETE_BACK_NAVIGATION_REVIEW.md §5·§9.3·§10.24 반영
-- - checkout_sessions: 세션 키 → IN_PROGRESS/CONSUMED, attempt_id 매핑
-- - payment_attempts 컬럼/인덱스: 090에 포함됨. 구버전 090 적용 DB만 §2·§4 주석 해제 후 1회 실행
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
-- 2. payment_attempts 컬럼·인덱스 (090에 포함됨. 091은 구버전 090 호환 시에만 필요)
-- ============================================================
-- 090 수정본 배포 이후에는 pg_order_id, refund_required, refund_status 및
-- idx_pg_order_id, idx_refund_track 이 090 CREATE에 포함되어 아래 ALTER 불필요.
-- 구버전 090(해당 컬럼 없음) 적용 DB만 091로 보완하는 경우 아래 주석 해제 후 1회 실행.
-- ALTER TABLE payment_attempts ADD COLUMN pg_order_id VARCHAR(100) NULL COMMENT 'PG 전달 orderId' AFTER external_ref_id;
-- ALTER TABLE payment_attempts ADD COLUMN refund_required TINYINT(1) NOT NULL DEFAULT 0 AFTER status_history, ADD COLUMN refund_status VARCHAR(20) NOT NULL DEFAULT 'NONE' AFTER refund_required;
-- ALTER TABLE payment_attempts ADD INDEX idx_pg_order_id (pg_order_id);
-- ALTER TABLE payment_attempts ADD INDEX idx_refund_track (refund_status, updated_at);

-- ============================================================
-- 3. payment_attempt_logs (상태 전이 Append-only, §10.5)
-- ON DELETE RESTRICT: 감사 로그 보존. attempt 삭제 시 로그가 있으면 삭제 차단(결제 데이터 Hard Delete 비권장).
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
    CONSTRAINT fk_payment_logs_attempt FOREIGN KEY (attempt_id) REFERENCES payment_attempts(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. stock_holds 인덱스 (090에 포함됨. 구버전 090 적용 DB만 필요 시 주석 해제)
-- ============================================================
-- ALTER TABLE stock_holds ADD INDEX idx_stock_holds_status_created (status, created_at);

SELECT '=== 091 checkout_sessions, payment_attempt_logs 완료 ===' AS info;
