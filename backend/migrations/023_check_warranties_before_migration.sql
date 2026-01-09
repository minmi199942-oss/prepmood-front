-- ============================================================
-- 023_check_warranties_before_migration.sql
-- Phase 1-2 실행 전 warranties 상태 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. warranties 테이블의 token 값 확인
-- ============================================================
SELECT '=== warranties.token 값 확인 ===' AS info;
SELECT 
    id,
    token,
    CASE WHEN token IS NULL THEN 'NULL' ELSE 'NOT NULL' END as token_status
FROM warranties
ORDER BY id;

-- ============================================================
-- 2. token_master와 매칭되는 warranties 확인
-- ============================================================
SELECT '=== token_master와 매칭되는 warranties ===' AS info;
SELECT 
    w.id as warranty_id,
    w.token,
    tm.token_pk,
    CASE WHEN tm.token_pk IS NOT NULL THEN '매칭됨' ELSE '매칭 안됨' END as match_status
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
ORDER BY w.id;

-- ============================================================
-- 3. 매칭되지 않은 warranties 상세 확인
-- ============================================================
SELECT '=== 매칭되지 않은 warranties 상세 ===' AS info;
SELECT 
    w.id as warranty_id,
    w.token,
    w.user_id,
    w.created_at
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
WHERE tm.token_pk IS NULL
ORDER BY w.id;

-- ============================================================
-- 4. token_master에 없는 token 목록
-- ============================================================
SELECT '=== token_master에 없는 token 목록 ===' AS info;
SELECT DISTINCT w.token
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
WHERE tm.token IS NULL AND w.token IS NOT NULL;
