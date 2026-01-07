-- 현재 데이터베이스 상태 확인 스크립트
-- users.user_id 마이그레이션 전 현재 상태를 확인합니다

USE prepmood;

-- ============================================================
-- 1. MySQL 버전 확인
-- ============================================================
SELECT '=== 1. MySQL 버전 확인 ===' AS info;
SELECT VERSION() AS mysql_version;

-- ============================================================
-- 2. users 테이블 구조 확인
-- ============================================================
SELECT '=== 2. users 테이블 구조 ===' AS info;
DESCRIBE users;

-- users 테이블의 user_id 타입 확인
SELECT 
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'users'
  AND COLUMN_NAME = 'user_id';

-- ============================================================
-- 3. users 테이블 데이터 개수 확인
-- ============================================================
SELECT '=== 3. users 테이블 데이터 개수 ===' AS info;
SELECT COUNT(*) AS total_users FROM users;

-- 샘플 user_id 확인 (최대 5개)
SELECT user_id, email, created_at 
FROM users 
ORDER BY user_id 
LIMIT 5;

-- ============================================================
-- 4. FK 관계 확인 (users.user_id를 참조하는 테이블들)
-- ============================================================
SELECT '=== 4. users.user_id를 참조하는 FK 관계 ===' AS info;
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    CONSTRAINT_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND REFERENCED_TABLE_NAME = 'users'
  AND REFERENCED_COLUMN_NAME = 'user_id'
ORDER BY TABLE_NAME, COLUMN_NAME;

-- ============================================================
-- 5. 각 테이블의 user_id 관련 컬럼 타입 확인
-- ============================================================
SELECT '=== 5. 각 테이블의 user_id 관련 컬럼 타입 ===' AS info;
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    DATA_TYPE,
    COLUMN_TYPE,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND (
    (TABLE_NAME = 'orders' AND COLUMN_NAME = 'user_id') OR
    (TABLE_NAME = 'warranties' AND COLUMN_NAME = 'user_id') OR
    (TABLE_NAME = 'inquiries' AND COLUMN_NAME = 'user_id') OR
    (TABLE_NAME = 'token_master' AND COLUMN_NAME = 'owner_user_id') OR
    (TABLE_NAME = 'transfer_logs' AND COLUMN_NAME IN ('from_user_id', 'to_user_id', 'admin_user_id')) OR
    (TABLE_NAME = 'scan_logs' AND COLUMN_NAME = 'user_id') OR
    (TABLE_NAME = 'orders_idempotency' AND COLUMN_NAME = 'user_id')
  )
ORDER BY TABLE_NAME, COLUMN_NAME;

-- ============================================================
-- 6. 각 테이블의 데이터 개수 확인
-- ============================================================
SELECT '=== 6. 각 테이블의 데이터 개수 ===' AS info;
SELECT 
    'orders' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(DISTINCT user_id) AS distinct_user_ids,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS null_user_ids
FROM orders
UNION ALL
SELECT 
    'warranties' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(DISTINCT user_id) AS distinct_user_ids,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS null_user_ids
FROM warranties
UNION ALL
SELECT 
    'inquiries' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(DISTINCT user_id) AS distinct_user_ids,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS null_user_ids
FROM inquiries
UNION ALL
SELECT 
    'token_master' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(DISTINCT owner_user_id) AS distinct_user_ids,
    COUNT(CASE WHEN owner_user_id IS NULL THEN 1 END) AS null_user_ids
FROM token_master
UNION ALL
SELECT 
    'orders_idempotency' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(DISTINCT user_id) AS distinct_user_ids,
    COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS null_user_ids
FROM orders_idempotency;

-- ============================================================
-- 7. orders 테이블에 guest_id 컬럼 존재 여부 확인
-- ============================================================
SELECT '=== 7. orders 테이블에 guest_id 컬럼 존재 여부 ===' AS info;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'guest_id 컬럼 존재함'
        ELSE 'guest_id 컬럼 없음 (추가 필요)'
    END AS guest_id_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
  AND COLUMN_NAME = 'guest_id';

-- ============================================================
-- 8. 데이터 무결성 확인 (고아 레코드 체크)
-- ============================================================
SELECT '=== 8. 데이터 무결성 확인 (고아 레코드) ===' AS info;

-- orders 테이블에서 users에 없는 user_id를 참조하는 경우
SELECT 
    'orders' AS table_name,
    COUNT(*) AS orphaned_records
FROM orders o
LEFT JOIN users u ON o.user_id = u.user_id
WHERE o.user_id IS NOT NULL AND u.user_id IS NULL

UNION ALL

-- warranties 테이블에서 users에 없는 user_id를 참조하는 경우
SELECT 
    'warranties' AS table_name,
    COUNT(*) AS orphaned_records
FROM warranties w
LEFT JOIN users u ON w.user_id = u.user_id
WHERE w.user_id IS NOT NULL AND u.user_id IS NULL

UNION ALL

-- inquiries 테이블에서 users에 없는 user_id를 참조하는 경우
SELECT 
    'inquiries' AS table_name,
    COUNT(*) AS orphaned_records
FROM inquiries i
LEFT JOIN users u ON i.user_id = u.user_id
WHERE i.user_id IS NOT NULL AND u.user_id IS NULL;

-- ============================================================
-- 9. 트랜잭션 격리 수준 확인
-- ============================================================
SELECT '=== 9. 트랜잭션 격리 수준 ===' AS info;
SELECT @@transaction_isolation AS current_isolation_level;

