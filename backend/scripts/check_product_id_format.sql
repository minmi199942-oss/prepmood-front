-- ============================================================
-- Product ID 형식 확인 스크립트
-- 사이즈 코드와 색상 코드 제거 여부 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 현재 admin_products.id 형식 확인
-- ============================================================
SELECT '=== 1. admin_products.id 형식 확인 ===' AS info;

SELECT 
    id,
    name,
    CASE 
        WHEN id LIKE '%/%' THEN '슬래시 포함 (사이즈 코드)'
        WHEN id REGEXP '-(S|M|L|XL|XXL|F)$' THEN '단일 사이즈 코드 포함 (-S, -M, -L 등)'
        WHEN id LIKE '%-LB' OR id LIKE '%-GY' OR id LIKE '%-BK' OR id LIKE '%-NV' OR id LIKE '%-WH' OR id LIKE '%-WT' OR id LIKE '%-LGY' THEN '색상 코드 포함 (끝에)'
        WHEN id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%' OR id LIKE '%-WT-%' OR id LIKE '%-LGY-%' THEN '색상 코드 포함 (중간에)'
        ELSE '정상 (사이즈/색상 코드 없음)'
    END AS pattern_type
FROM admin_products
ORDER BY id;

-- ============================================================
-- 2. 패턴 통계
-- ============================================================
SELECT '=== 2. 패턴 통계 ===' AS info;

SELECT 
    CASE 
        WHEN id LIKE '%/%' THEN '슬래시 포함 (S/M/L 형식)'
        WHEN id REGEXP '-(S|M|L|XL|XXL|F)$' THEN '단일 사이즈 코드 (-S, -M, -L 등)'
        WHEN id LIKE '%-LB' OR id LIKE '%-GY' OR id LIKE '%-BK' OR id LIKE '%-NV' OR id LIKE '%-WH' OR id LIKE '%-WT' OR id LIKE '%-LGY' THEN '색상 코드 포함 (끝)'
        WHEN id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%' OR id LIKE '%-WT-%' OR id LIKE '%-LGY-%' THEN '색상 코드 포함 (중간)'
        ELSE '정상'
    END AS pattern_type,
    COUNT(*) as count
FROM admin_products
GROUP BY pattern_type
ORDER BY count DESC;

-- ============================================================
-- 3. 샘플 데이터 (최대 10개)
-- ============================================================
SELECT '=== 3. 샘플 데이터 ===' AS info;

SELECT 
    id,
    name,
    CASE 
        WHEN id LIKE '%/%' THEN '슬래시 포함'
        WHEN id REGEXP '-(S|M|L|XL|XXL|F)$' THEN '단일 사이즈'
        WHEN id LIKE '%-LB' OR id LIKE '%-GY' OR id LIKE '%-BK' OR id LIKE '%-NV' OR id LIKE '%-WH' OR id LIKE '%-WT' OR id LIKE '%-LGY' THEN '색상 코드 (끝)'
        WHEN id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%' OR id LIKE '%-WT-%' OR id LIKE '%-LGY-%' THEN '색상 코드 (중간)'
        ELSE '정상'
    END AS pattern
FROM admin_products
ORDER BY id
LIMIT 10;

-- ============================================================
-- 4. 마이그레이션 컬럼 확인 (canonical_id, id_backup)
-- ============================================================
SELECT '=== 4. 마이그레이션 컬럼 확인 ===' AS info;

SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME IN ('canonical_id', 'id_backup')
ORDER BY COLUMN_NAME;
