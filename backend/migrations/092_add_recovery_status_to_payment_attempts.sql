-- 092_add_recovery_status_to_payment_attempts.sql
-- payment_attempts.recovery_status 컬럼 및 인덱스 추가
-- - recovery_status: NULL|REQUIRED|IN_PROGRESS|DONE
-- - 인덱스: recovery_status, (status, recovery_status)

USE prepmood;

-- 1. 컬럼 존재 여부 확인 후 추가
SET @col_exists := (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_attempts'
      AND COLUMN_NAME = 'recovery_status'
);

SET @add_col_sql := IF(
    @col_exists = 0,
    'ALTER TABLE payment_attempts ADD COLUMN recovery_status VARCHAR(30) NULL COMMENT ''NULL|REQUIRED|IN_PROGRESS|DONE'' AFTER refund_status',
    'SELECT ''recovery_status 컬럼이 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @add_col_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 2. 인덱스 존재 여부 확인 후 추가: idx_payment_attempts_recovery_status
SET @idx1_exists := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_attempts'
      AND INDEX_NAME = 'idx_payment_attempts_recovery_status'
);

SET @add_idx1_sql := IF(
    @idx1_exists = 0,
    'CREATE INDEX idx_payment_attempts_recovery_status ON payment_attempts (recovery_status)',
    'SELECT ''idx_payment_attempts_recovery_status 인덱스가 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @add_idx1_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 3. 인덱스 존재 여부 확인 후 추가: idx_payment_attempts_status_recovery
SET @idx2_exists := (
    SELECT COUNT(*)
    FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'payment_attempts'
      AND INDEX_NAME = 'idx_payment_attempts_status_recovery'
);

SET @add_idx2_sql := IF(
    @idx2_exists = 0,
    'CREATE INDEX idx_payment_attempts_status_recovery ON payment_attempts (status, recovery_status)',
    'SELECT ''idx_payment_attempts_status_recovery 인덱스가 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @add_idx2_sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 검증 메시지
SELECT '=== 092 payment_attempts.recovery_status 컬럼/인덱스 적용 완료 ===' AS info;

