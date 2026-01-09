-- ============================================================
-- 023_clear_test_warranties.sql
-- Phase 1-2 실행 전: 테스트 데이터 warranties 삭제
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 삭제 전 데이터 확인
-- ============================================================
SELECT '=== 삭제 전 warranties 데이터 확인 ===' AS info;
SELECT COUNT(*) as warranty_count FROM warranties;

SELECT '=== 삭제 전 warranties 샘플 ===' AS info;
SELECT id, token, user_id, created_at 
FROM warranties 
ORDER BY created_at DESC 
LIMIT 5;

-- ============================================================
-- 2. warranties 테이블 데이터 삭제
-- ============================================================
DELETE FROM warranties;

-- ============================================================
-- 3. 삭제 후 확인
-- ============================================================
SELECT '=== 삭제 후 warranties 데이터 확인 ===' AS info;
SELECT COUNT(*) as warranty_count FROM warranties;
-- 결과: 0

SELECT '=== 완료 ===' AS info;
