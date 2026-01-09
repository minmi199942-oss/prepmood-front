-- ============================================================
-- 035_create_warranty_events_table.sql
-- warranty_events 테이블 생성 (보증서 변경 이력)
-- ============================================================

USE prepmood;

-- ============================================================
-- warranty_events 테이블 생성
-- ============================================================
CREATE TABLE IF NOT EXISTS warranty_events (
    event_id BIGINT PRIMARY KEY AUTO_INCREMENT,
    warranty_id INT NOT NULL,
    event_type ENUM('status_change', 'owner_change', 'suspend', 'unsuspend', 'revoke') NOT NULL,
    old_value JSON NULL COMMENT '변경 전 값 (status, owner_user_id 등)',
    new_value JSON NOT NULL COMMENT '변경 후 값',
    changed_by ENUM('user', 'admin', 'system') NOT NULL,
    changed_by_id INT NULL COMMENT 'user_id 또는 admin_user_id (changed_by에 따라)',
    reason TEXT NULL COMMENT '변경 사유',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (warranty_id) REFERENCES warranties(id) ON DELETE RESTRICT,
    INDEX idx_warranty_id (warranty_id),
    INDEX idx_event_type (event_type),
    INDEX idx_changed_by (changed_by),
    INDEX idx_changed_by_id (changed_by_id),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 검증
-- ============================================================
SELECT '=== warranty_events 테이블 생성 완료 ===' AS info;
SELECT 
    TABLE_NAME, 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranty_events'
ORDER BY ORDINAL_POSITION;

SELECT '=== FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME, 
    COLUMN_NAME, 
    REFERENCED_TABLE_NAME, 
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranty_events' 
  AND REFERENCED_TABLE_NAME IS NOT NULL;
