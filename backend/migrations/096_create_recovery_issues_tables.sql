-- 096_create_recovery_issues_tables.sql
-- recovery 이슈 관측용 투영본(recovery_issues) + 액션 로그(recovery_action_logs)
-- SSOT 아님. orders/payment_attempts/paid_events/stock_holds/order_item_units 가 진실 원천.

CREATE TABLE IF NOT EXISTS recovery_issues (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    order_id INT NOT NULL,
    payment_key VARCHAR(150) NOT NULL,
    issue_code VARCHAR(64) NOT NULL COMMENT '예: USE_HOLD_RECOVERY_UNRESOLVED, UNRESOLVED_ATTEMPT 등 상위 이슈 코드',
    reason_code VARCHAR(64) NOT NULL COMMENT '예: NO_MATCHING_ATTEMPT, MULTIPLE_HOLD_ATTEMPTS 등 세부 진단 코드',
    recommended_action VARCHAR(64) DEFAULT NULL COMMENT '서버가 판단한 권장 액션 코드 (예: RETRY_RECOVERY, MANUAL_REVIEW 등)',
    use_hold TINYINT(1) NOT NULL DEFAULT 0 COMMENT '1=use_hold 주문에서 발생한 이슈, 0=기타',
    first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    last_retry_result VARCHAR(32) DEFAULT NULL COMMENT '마지막 복구 시도 결과 (SUCCESS|FAILED 등)',
    last_error_code VARCHAR(64) DEFAULT NULL COMMENT '마지막 오류 코드 (예: USE_HOLD_RECOVERY_UNRESOLVED 등)',
    payload_snapshot JSON NULL COMMENT '선택: 진단 시 참고용 스냅샷 (필요 시 제한)',
    PRIMARY KEY (id),
    KEY idx_recovery_issues_order (order_id),
    KEY idx_recovery_issues_issue (issue_code, reason_code),
    KEY idx_recovery_issues_seen (last_seen_at),
    UNIQUE KEY uk_recovery_issue_order_payment_issue (order_id, payment_key, issue_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recovery_action_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    issue_id BIGINT UNSIGNED NULL COMMENT 'recovery_issues.id (없을 수도 있음)',
    order_id INT NOT NULL,
    actor VARCHAR(128) NOT NULL COMMENT '관리자 또는 시스템 식별자',
    actor_type VARCHAR(64) NOT NULL DEFAULT 'admin' COMMENT '예: admin|worker|system 등',
    request_id VARCHAR(128) DEFAULT NULL COMMENT '요청 상관관계 ID (선택)',
    action VARCHAR(64) NOT NULL COMMENT '예: DIAGNOSE, RETRY_RECOVERY, MARK_MANUAL_REVIEW 등',
    issue_code VARCHAR(64) DEFAULT NULL COMMENT '연관 이슈 상위 코드 (옵션)',
    reason_code VARCHAR(64) DEFAULT NULL COMMENT '연관 이슈 세부 코드 (옵션)',
    pre_state_snapshot JSON NULL COMMENT '액션 직전 상태 스냅샷',
    result VARCHAR(32) NOT NULL COMMENT 'SUCCESS|FAILED 등',
    error_code VARCHAR(64) DEFAULT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_recovery_action_issue (issue_id),
    KEY idx_recovery_action_order (order_id),
    KEY idx_recovery_action_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

