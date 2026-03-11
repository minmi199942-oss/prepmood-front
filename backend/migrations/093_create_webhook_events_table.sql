-- 093_create_webhook_events_table.sql
-- webhook_events 테이블 생성 (provider 웹훅 dedupe + 처리 상태 추적)
-- - UNIQUE(provider_name, provider_event_id)
-- - processing_status: RECEIVED|PROCESSING|PROCESSED|FAILED

-- USE prepmood;    ← 제거 완료

CREATE TABLE IF NOT EXISTS webhook_events (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    provider_name VARCHAR(32) NOT NULL,
    provider_event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    processing_status VARCHAR(30) NOT NULL DEFAULT 'RECEIVED',
    received_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uk_webhook_provider_event (provider_name, provider_event_id),
    KEY idx_webhook_processing_status (processing_status),
    KEY idx_webhook_status_updated_at (processing_status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;