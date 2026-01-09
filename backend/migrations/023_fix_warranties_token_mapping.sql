-- ============================================================
-- 023_fix_warranties_token_mapping.sql
-- Phase 1-2 실행 전: warranties의 token을 token_master에 추가
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. token_master에 없는 warranties.token 확인
-- ============================================================
SELECT '=== token_master에 없는 warranties.token 목록 ===' AS info;
SELECT DISTINCT w.token
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
WHERE tm.token IS NULL AND w.token IS NOT NULL;

-- ============================================================
-- 2. warranties의 token을 token_master에 추가
-- ============================================================
-- ⚠️ 주의: warranties에 있는 token이 token_master에 없으므로 추가 필요
-- 임시로 token_master에 추가 (나중에 실제 데이터로 교체 필요)

-- warranties 테이블에 product_name 컬럼이 있는지 확인
SET @has_product_name = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'warranties' 
      AND COLUMN_NAME = 'product_name'
);

-- product_name이 있으면 사용, 없으면 기본값 사용
INSERT INTO token_master (
    token, 
    internal_code, 
    product_name,
    serial_number,
    rot_code,
    warranty_bottom_code,
    digital_warranty_code,
    digital_warranty_collection,
    is_blocked,
    owner_user_id,
    scan_count,
    first_scanned_at,
    last_scanned_at,
    created_at,
    updated_at
)
SELECT DISTINCT
    w.token,
    CONCAT('AUTO-', w.id) as internal_code,  -- 임시 internal_code
    CASE 
        WHEN @has_product_name > 0 THEN COALESCE(w.product_name, 'Unknown Product')
        ELSE 'Unknown Product'
    END as product_name,
    NULL as serial_number,
    NULL as rot_code,
    NULL as warranty_bottom_code,
    NULL as digital_warranty_code,
    NULL as digital_warranty_collection,
    0 as is_blocked,
    NULL as owner_user_id,
    0 as scan_count,
    NULL as first_scanned_at,
    NULL as last_scanned_at,
    w.created_at,
    NOW() as updated_at
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
WHERE tm.token IS NULL AND w.token IS NOT NULL;

-- ============================================================
-- 3. 추가된 token 확인
-- ============================================================
SELECT '=== 추가된 token 확인 ===' AS info;
SELECT 
    token,
    internal_code,
    product_name,
    token_pk
FROM token_master
WHERE token IN (
    SELECT DISTINCT w.token
    FROM warranties w
    LEFT JOIN token_master tm ON w.token = tm.token
    WHERE tm.token IS NULL AND w.token IS NOT NULL
)
ORDER BY token_pk DESC
LIMIT 20;

-- ============================================================
-- 4. 매칭 확인
-- ============================================================
SELECT '=== 매칭 확인 ===' AS info;
SELECT 
    COUNT(*) as total_warranties,
    SUM(CASE WHEN tm.token_pk IS NOT NULL THEN 1 ELSE 0 END) as matched_count,
    SUM(CASE WHEN tm.token_pk IS NULL THEN 1 ELSE 0 END) as unmatched_count
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token;

SELECT '=== 완료 ===' AS info;
