-- ============================================================
-- Phase 7 테스트 데이터 준비
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 시나리오 1: warranty가 있는 경우를 위한 데이터 확인/생성
-- ============================================================
SELECT '=== 1. 시나리오 1: warranty가 있는 토큰 확인 ===' AS info;

-- 기존 warranty 확인
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    w.owner_user_id,
    tm.token,
    tm.product_name
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.status IN ('issued', 'issued_unassigned', 'active')
ORDER BY w.id DESC
LIMIT 5;

-- warranty가 있는 토큰이 없으면, 테스트용으로 하나 생성
-- (실제 주문이 있다면 그 주문의 order_item_unit을 사용)
-- 주의: 실제 주문 데이터가 있어야 함

-- ============================================================
-- 2. 시나리오 3: revoked 상태 warranty 생성 (테스트용)
-- ============================================================
SELECT '=== 2. 시나리오 3: revoked 상태 warranty 생성 ===' AS info;

-- 기존 warranty 중 하나를 revoked로 변경 (테스트용)
-- 주의: 실제 데이터를 변경하므로 주의해서 실행
-- UPDATE warranties 
-- SET status = 'revoked', revoked_at = NOW()
-- WHERE id = ? AND status != 'revoked'
-- LIMIT 1;

-- 또는 새로운 revoked warranty 생성 (테스트용)
-- 주의: 실제 주문 데이터가 있어야 함

-- ============================================================
-- 3. 테스트용 토큰 목록 정리
-- ============================================================
SELECT '=== 3. 테스트용 토큰 목록 ===' AS info;

-- 시나리오 1: warranty 있는 토큰
SELECT 
    '시나리오 1 (warranty 있음)' AS scenario,
    tm.token,
    tm.token_pk,
    w.status as warranty_status
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status IN ('issued', 'issued_unassigned', 'active')
LIMIT 1;

-- 시나리오 2: warranty 없는 토큰
SELECT 
    '시나리오 2 (warranty 없음)' AS scenario,
    tm.token,
    tm.token_pk,
    'warranty 없음' AS warranty_status
FROM token_master tm
LEFT JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.id IS NULL
  AND tm.is_blocked = 0
LIMIT 3;

-- 시나리오 3: revoked 상태 warranty
SELECT 
    '시나리오 3 (revoked)' AS scenario,
    tm.token,
    tm.token_pk,
    w.status as warranty_status
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status = 'revoked'
LIMIT 1;
