-- ============================================================
-- MySQL 락 및 대기 상태 확인
-- GPT 분석 결과 기반: ER_LOCK_WAIT_TIMEOUT 원인 파악
-- ============================================================
USE prepmood;

-- ============================================================
-- 1. 현재 실행 중인 프로세스 확인
-- ============================================================
SELECT '=== 1. 현재 실행 중인 프로세스 (오래 걸리는 쿼리 위주) ===' AS info;

SHOW FULL PROCESSLIST;

-- ============================================================
-- 2. InnoDB 상태 확인 (락 정보 포함)
-- ============================================================
SELECT '=== 2. InnoDB 상태 (TRANSACTIONS 섹션 확인) ===' AS info;

SHOW ENGINE INNODB STATUS\G

-- ============================================================
-- 3. paid_events 테이블의 UNIQUE 제약 확인
-- ============================================================
SELECT '=== 3. paid_events 테이블의 UNIQUE 제약 확인 ===' AS info;

SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    ORDINAL_POSITION
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'paid_events'
  AND CONSTRAINT_NAME IN (
      SELECT CONSTRAINT_NAME
      FROM information_schema.TABLE_CONSTRAINTS
      WHERE TABLE_SCHEMA = 'prepmood'
        AND TABLE_NAME = 'paid_events'
        AND CONSTRAINT_TYPE = 'UNIQUE'
  )
ORDER BY CONSTRAINT_NAME, ORDINAL_POSITION;

-- ============================================================
-- 4. 같은 payment_key가 여러 번 들어간 경우 확인
-- ============================================================
SELECT '=== 4. 같은 payment_key가 여러 번 들어간 경우 확인 ===' AS info;

SELECT 
    payment_key,
    COUNT(*) as count,
    GROUP_CONCAT(DISTINCT order_id) as order_ids,
    GROUP_CONCAT(DISTINCT event_source) as event_sources
FROM paid_events
GROUP BY payment_key
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 10;

-- ============================================================
-- 5. 같은 order_id에 여러 paid_events가 있는 경우 확인
-- ============================================================
SELECT '=== 5. 같은 order_id에 여러 paid_events가 있는 경우 확인 ===' AS info;

SELECT 
    order_id,
    COUNT(*) as count,
    GROUP_CONCAT(DISTINCT payment_key) as payment_keys,
    GROUP_CONCAT(DISTINCT event_source) as event_sources
FROM paid_events
GROUP BY order_id
HAVING COUNT(*) > 1
ORDER BY count DESC
LIMIT 10;

-- ============================================================
-- 6. payments와 paid_events 비교 (중복 확인)
-- ============================================================
SELECT '=== 6. payments와 paid_events 비교 (중복 확인) ===' AS info;

SELECT 
    p.payment_key,
    p.order_number,
    COUNT(DISTINCT pe.event_id) as paid_events_count,
    GROUP_CONCAT(DISTINCT pe.event_source) as event_sources
FROM payments p
LEFT JOIN paid_events pe ON p.payment_key = pe.payment_key
WHERE p.status = 'captured'
GROUP BY p.payment_key, p.order_number
HAVING COUNT(DISTINCT pe.event_id) > 1
ORDER BY paid_events_count DESC
LIMIT 10;
