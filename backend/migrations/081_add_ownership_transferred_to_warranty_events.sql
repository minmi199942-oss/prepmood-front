-- ============================================================
-- 081_add_ownership_transferred_to_warranty_events.sql
-- warranty_events.event_type에 'ownership_transferred' 추가
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 확인
-- ============================================================
SELECT '=== 1. 사전 확인 ===' AS info;

-- 현재 event_type ENUM 값 확인
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'warranty_events'
  AND COLUMN_NAME = 'event_type';

-- 현재 'ownership_transferred' 사용 시도로 인한 에러가 있는지 확인
-- (실제로는 없을 수 있지만, 확인용)
SELECT 
    '현재 event_type 값 분포' AS info,
    event_type,
    COUNT(*) as count
FROM warranty_events
GROUP BY event_type;

-- ============================================================
-- 2. event_type ENUM에 'ownership_transferred' 추가
-- ============================================================
SELECT '=== 2. event_type ENUM 수정 ===' AS info;

ALTER TABLE warranty_events 
MODIFY COLUMN event_type ENUM(
    'status_change', 
    'owner_change', 
    'suspend', 
    'unsuspend', 
    'revoke',
    'ownership_transferred'
) NOT NULL COMMENT '이벤트 타입 (양도는 ownership_transferred로 구분)';

-- ============================================================
-- 3. 사후 검증
-- ============================================================
SELECT '=== 3. 사후 검증 ===' AS info;

-- 수정된 event_type ENUM 값 확인
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'warranty_events'
  AND COLUMN_NAME = 'event_type';

-- 'ownership_transferred' 값이 ENUM에 포함되었는지 확인
SELECT 
    'ownership_transferred ENUM 포함 확인' AS info,
    CASE 
        WHEN COLUMN_TYPE LIKE '%ownership_transferred%' THEN '✅ 포함됨'
        ELSE '❌ 포함되지 않음'
    END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'warranty_events'
  AND COLUMN_NAME = 'event_type';

SELECT '=== warranty_events.event_type 수정 완료 ===' AS info;
