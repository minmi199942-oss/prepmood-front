-- ============================================================
-- Phase 7 테스트: QR 스캔 로직 수정 검증
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 테스트 데이터 준비 확인
-- ============================================================
SELECT '=== 1. 테스트 데이터 준비 확인 ===' AS info;

-- 1-1. token_master에서 테스트용 토큰 확인
SELECT 
    token_pk,
    token,
    product_name,
    first_scanned_at,
    scan_count
FROM token_master
WHERE is_blocked = 0
ORDER BY token_pk
LIMIT 5;

-- 1-2. warranties 테이블 확인 (token_pk 기준)
SELECT 
    w.id as warranty_id,
    w.token_pk,
    w.status,
    w.owner_user_id,
    w.source_order_item_unit_id,
    w.activated_at,
    w.revoked_at,
    w.created_at,
    tm.token,
    tm.product_name
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
ORDER BY w.id DESC
LIMIT 5;

-- ============================================================
-- 2. 테스트 시나리오별 데이터 확인
-- ============================================================

-- 2-1. 시나리오 1: warranty가 있는 경우 (정상 조회)
SELECT '=== 2-1. 시나리오 1: warranty가 있는 경우 ===' AS info;
SELECT 
    tm.token,
    tm.token_pk,
    w.id as warranty_id,
    w.status,
    w.owner_user_id,
    w.public_id
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status IN ('issued', 'issued_unassigned', 'active')
LIMIT 3;

-- 2-2. 시나리오 2: warranty가 없는 경우 (404 에러 예상)
SELECT '=== 2-2. 시나리오 2: warranty가 없는 경우 ===' AS info;
SELECT 
    tm.token,
    tm.token_pk,
    'warranty 없음' AS status
FROM token_master tm
LEFT JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.id IS NULL
  AND tm.is_blocked = 0
LIMIT 3;

-- 2-3. 시나리오 3: revoked 상태 warranty (403 에러 예상)
SELECT '=== 2-3. 시나리오 3: revoked 상태 warranty ===' AS info;
SELECT 
    tm.token,
    tm.token_pk,
    w.id as warranty_id,
    w.status,
    w.revoked_at
FROM token_master tm
JOIN warranties w ON tm.token_pk = w.token_pk
WHERE w.status = 'revoked'
LIMIT 3;

-- ============================================================
-- 3. 테스트용 토큰 생성 (필요시)
-- ============================================================
-- 주의: 실제 테스트용 데이터는 수동으로 생성하거나
-- 기존 데이터를 활용하세요.

-- 예시: revoked 상태 warranty 생성 (테스트용)
-- UPDATE warranties 
-- SET status = 'revoked', revoked_at = NOW()
-- WHERE id = ?;

-- ============================================================
-- 4. scan_logs 확인 (스캔 이력)
-- ============================================================
SELECT '=== 4. scan_logs 확인 ===' AS info;
SELECT 
    token,
    user_id,
    warranty_public_id,
    event_type,
    created_at
FROM scan_logs
ORDER BY created_at DESC
LIMIT 10;
