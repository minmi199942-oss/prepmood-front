-- orders_idempotency owner_key 방식 변경 검증
-- 실행: mysql -u prepmood_user -p prepmood < backend/migrations/018_change_idempotency_to_owner_key_verify.sql

USE prepmood;

-- ============================================================
-- 1. 컬럼 구조 확인
-- ============================================================
SELECT '=== 컬럼 구조 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders_idempotency'
ORDER BY COLUMN_NAME;

-- 기대 결과:
-- - owner_key VARCHAR(100) NOT NULL 존재
-- - user_id INT NOT NULL 존재 (하위 호환성 유지)

-- ============================================================
-- 2. UNIQUE 제약 확인
-- ============================================================
SELECT '=== UNIQUE 제약 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    ORDINAL_POSITION
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders_idempotency'
  AND CONSTRAINT_NAME LIKE '%uniq%'
ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION;

-- 기대 결과:
-- - uniq_owner_idem (owner_key, idem_key) UNIQUE 제약 존재

-- ============================================================
-- 3. 데이터 마이그레이션 확인
-- ============================================================
SELECT '=== 데이터 마이그레이션 확인 ===' AS info;
SELECT 
    COUNT(*) AS total_records,
    COUNT(owner_key) AS records_with_owner_key,
    COUNT(CASE WHEN owner_key LIKE 'u:%' THEN 1 END) AS records_with_user_format,
    COUNT(CASE WHEN owner_key LIKE 'g:%' THEN 1 END) AS records_with_guest_format
FROM orders_idempotency;

-- 기대 결과:
-- - records_with_owner_key = total_records
-- - records_with_user_format = total_records (현재는 모두 회원)

-- ============================================================
-- 4. owner_key 형식 검증
-- ============================================================
SELECT '=== owner_key 형식 검증 ===' AS info;
SELECT 
    owner_key,
    user_id,
    CASE 
        WHEN owner_key = CONCAT('u:', user_id) THEN '✅ 형식 정상'
        ELSE '❌ 형식 불일치'
    END AS format_check
FROM orders_idempotency
LIMIT 10;

-- 기대 결과: 모든 레코드가 '✅ 형식 정상'

-- ============================================================
-- 5. UNIQUE 제약 테스트 (중복 방지 확인)
-- ============================================================
SELECT '=== UNIQUE 제약 테스트 ===' AS info;
SELECT 
    owner_key,
    idem_key,
    COUNT(*) AS duplicate_count
FROM orders_idempotency
GROUP BY owner_key, idem_key
HAVING COUNT(*) > 1;

-- 기대 결과: 0 rows (중복 없음)
