-- ============================================================
-- 031_cleanup_duplicate_warranties_fk.sql
-- warranties 테이블 중복 FK 정리
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 현재 FK 확인
-- ============================================================
SELECT '=== 현재 warranties FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'owner_user_id'
  AND REFERENCED_TABLE_NAME IS NOT NULL;

-- ============================================================
-- 2. 기존 warranties_ibfk_1 제거 (중복 FK)
-- ============================================================
-- fk_warranties_owner_user_id가 이미 있으므로 기존 warranties_ibfk_1 제거
ALTER TABLE warranties DROP FOREIGN KEY warranties_ibfk_1;

-- ============================================================
-- 3. 최종 확인
-- ============================================================
SELECT '=== 최종 warranties FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND REFERENCED_TABLE_NAME IS NOT NULL
ORDER BY COLUMN_NAME, CONSTRAINT_NAME;

SELECT '=== 중복 FK 정리 완료 ===' AS info;
