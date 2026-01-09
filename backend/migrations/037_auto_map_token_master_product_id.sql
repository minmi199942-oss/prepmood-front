-- ============================================================
-- 037_auto_map_token_master_product_id.sql
-- token_master.product_id 자동 매핑 (부분 매칭, 검수 대기 리스트 생성)
-- ============================================================
-- 
-- 주의:
-- 1. 이 스크립트는 "부분 매칭"을 사용하여 자동으로 product_id를 채웁니다.
-- 2. 결과는 반드시 "검수 대기 리스트"로 확인하고 사람이 확정해야 합니다.
-- 3. 매핑이 불확실한 경우 NULL로 남겨두고 수동 확정이 필요합니다.
-- 
-- 실행 순서:
-- 1. 이 스크립트 실행 (자동 매핑)
-- 2. 매핑 결과 확인 (검수 대기 리스트)
-- 3. 수동 확정 (SQL UPDATE 또는 관리자 페이지)
-- 4. 100% 채워진 후 NOT NULL + FK 추가
-- 
-- ============================================================

USE prepmood;

SELECT '=== 사전 검증: 매핑 전 상태 ===' AS info;
SELECT 
    COUNT(*) as total_tokens,
    COUNT(product_id) as tokens_with_product_id,
    COUNT(*) - COUNT(product_id) as tokens_without_product_id
FROM token_master;

-- ============================================================
-- 1. 부분 매칭으로 자동 채움 (위험한 초기 이관 도구)
-- ============================================================
SELECT '=== 부분 매칭으로 자동 매핑 시작 ===' AS info;
SELECT '⚠️ 주의: 이 결과는 반드시 검수해야 합니다!' AS warning;

-- 부분 매칭 조건:
-- 1. 정확히 일치: tm.product_name = ap.name
-- 2. admin_products.name이 token_master.product_name으로 시작
-- 3. token_master.product_name이 admin_products.name으로 시작
UPDATE token_master tm
JOIN admin_products ap ON (
    tm.product_name = ap.name 
    OR ap.name LIKE CONCAT(tm.product_name, '%')
    OR tm.product_name LIKE CONCAT(ap.name, '%')
)
SET tm.product_id = ap.id
WHERE tm.product_id IS NULL;

SELECT '=== 자동 매핑 완료 ===' AS info;
SELECT ROW_COUNT() as auto_mapped_count;

-- ============================================================
-- 2. 매핑 결과 확인
-- ============================================================
SELECT '=== 매핑 후 상태 ===' AS info;
SELECT 
    COUNT(*) as total_tokens,
    COUNT(product_id) as tokens_with_product_id,
    COUNT(*) - COUNT(product_id) as tokens_without_product_id
FROM token_master;

-- ============================================================
-- 3. 검수 대기 리스트 (매핑되지 않은 토큰)
-- ============================================================
SELECT '=== 검수 대기 리스트 (매핑 필요) ===' AS info;
SELECT 
    tm.token_pk,
    tm.token,
    tm.product_name as token_product_name,
    '매핑 필요' as status,
    '수동 확정 필요' as action
FROM token_master tm
WHERE tm.product_id IS NULL
ORDER BY tm.token_pk;

-- ============================================================
-- 4. 의심스러운 매핑 확인 (중복 매칭 가능성)
-- ============================================================
SELECT '=== 의심스러운 매핑 확인 ===' AS info;
SELECT 
    tm.token_pk,
    tm.product_name as token_product_name,
    ap.name as admin_product_name,
    tm.product_id,
    '의심: 부분 매칭으로 인한 오매칭 가능성' as warning
FROM token_master tm
JOIN admin_products ap ON tm.product_id = ap.id
WHERE tm.product_name != ap.name
  AND NOT (ap.name LIKE CONCAT(tm.product_name, '%'))
  AND NOT (tm.product_name LIKE CONCAT(ap.name, '%'))
ORDER BY tm.token_pk
LIMIT 50;

-- ============================================================
-- 5. 매핑 통계
-- ============================================================
SELECT '=== 매핑 통계 ===' AS info;
SELECT 
    ap.id as product_id,
    ap.name as product_name,
    COUNT(tm.token_pk) as token_count
FROM admin_products ap
LEFT JOIN token_master tm ON ap.id = tm.product_id
GROUP BY ap.id, ap.name
ORDER BY token_count DESC;

SELECT '=== 자동 매핑 완료 ===' AS info;
SELECT '⚠️ 반드시 "검수 대기 리스트"를 확인하고 수동 확정하세요!' AS warning;
SELECT '다음 단계: 매핑 누락/의심 건을 수동 확정 후 038_finalize_token_master_product_id.sql 실행' AS next_step;
