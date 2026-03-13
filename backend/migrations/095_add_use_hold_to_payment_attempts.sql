-- 095_add_use_hold_to_payment_attempts.sql
-- payment_attempts.use_hold 컬럼 추가 (Phase 1: hold-enabled 경로 구분)
-- - use_hold: 0 = legacy (hold 사용 안 함), 1 = hold-enabled 경로

USE prepmood;

SET @col_exists := (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_attempts'
      AND COLUMN_NAME = 'use_hold'
);

SET @add_col_sql := IF(
    @col_exists = 0,
    'ALTER TABLE payment_attempts ADD COLUMN use_hold TINYINT(1) NOT NULL DEFAULT 0 COMMENT ''0=legacy, 1=hold-enabled'' AFTER refund_status',
    'SELECT ''use_hold 컬럼이 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @add_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '=== 095 payment_attempts.use_hold 컬럼 추가 완료 ===' AS info;

