-- ============================================================
-- 033_create_paid_event_processing_table.sql
-- paid_event_processing 테이블 생성 (처리 상태 추적)
-- ============================================================

USE prepmood;

-- ============================================================
-- paid_event_processing 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS paid_event_processing (
    event_id BIGINT PRIMARY KEY,
    status ENUM('pending', 'processing', 'success', 'failed') NOT NULL DEFAULT 'pending',
    last_error TEXT NULL COMMENT '마지막 에러 메시지',
    processed_at DATETIME NULL COMMENT '처리 완료 시각',
    retry_count INT DEFAULT 0 COMMENT '재시도 횟수',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES paid_events(event_id) ON DELETE RESTRICT,
    INDEX idx_status (status),
    INDEX idx_processed_at (processed_at),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== paid_event_processing 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'paid_event_processing'
ORDER BY ORDINAL_POSITION;

SELECT '=== FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'paid_event_processing' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;
