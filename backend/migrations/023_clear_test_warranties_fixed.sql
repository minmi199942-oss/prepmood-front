-- ============================================================
-- 023_clear_test_warranties_fixed.sql
-- Phase 1-2 실행 전: 테스트 데이터 warranties 삭제 (FK 제약 처리)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 삭제 전 데이터 확인
-- ============================================================
SELECT '=== 삭제 전 warranties 데이터 확인 ===' AS info;
SELECT COUNT(*) as warranty_count FROM warranties;

-- ============================================================
-- 2. FK 제약 확인
-- ============================================================
SELECT '=== warranties를 참조하는 FK 확인 ===' AS info;
SELECT 
    TABLE_NAME, 
    CONSTRAINT_NAME, 
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE REFERENCED_TABLE_NAME = 'warranties'
  AND TABLE_SCHEMA = 'prepmood';

-- ============================================================
-- 3. FK 제약 일시적으로 제거
-- ============================================================
-- transfer_logs FK 제거
ALTER TABLE transfer_logs DROP FOREIGN KEY transfer_logs_ibfk_1;

-- scan_logs FK 제거 (있는 경우)
-- ALTER TABLE scan_logs DROP FOREIGN KEY scan_logs_ibfk_1;

-- token_master FK 제거 (있는 경우)
-- ALTER TABLE token_master DROP FOREIGN KEY token_master_ibfk_1;

-- ============================================================
-- 4. warranties 테이블 데이터 삭제
-- ============================================================
DELETE FROM warranties;

-- ============================================================
-- 5. 삭제 후 확인
-- ============================================================
SELECT '=== 삭제 후 warranties 데이터 확인 ===' AS info;
SELECT COUNT(*) as warranty_count FROM warranties;
-- 결과: 0

SELECT '=== 완료 ===' AS info;
