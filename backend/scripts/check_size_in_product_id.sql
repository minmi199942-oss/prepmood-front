-- ============================================================
-- check_size_in_product_id.sql
-- admin_products.id에 사이즈 코드가 포함되어 있는지 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 전체 상품 ID 확인
-- ============================================================
SELECT '=== 1. 전체 상품 ID 목록 ===' AS info;

SELECT 
    id,
    name,
    LENGTH(id) as id_length
FROM admin_products
ORDER BY id;

-- ============================================================
-- 2. 사이즈 코드 포함 여부 확인
-- ============================================================
SELECT '=== 2. 사이즈 코드 포함 여부 확인 ===' AS info;

SELECT 
    id,
    name,
    CASE 
        WHEN id LIKE '%/%' THEN '슬래시 포함 (S/M/L 형식)'
        WHEN id LIKE '%-S' THEN '단일 사이즈 -S'
        WHEN id LIKE '%-M' THEN '단일 사이즈 -M'
        WHEN id LIKE '%-L' THEN '단일 사이즈 -L'
        WHEN id LIKE '%-XL' THEN '단일 사이즈 -XL'
        WHEN id LIKE '%-XXL' THEN '단일 사이즈 -XXL'
        WHEN id LIKE '%-F' THEN '단일 사이즈 -F'
        ELSE '사이즈 코드 없음'
    END AS size_pattern
FROM admin_products
WHERE id LIKE '%/%' 
   OR id LIKE '%-S'
   OR id LIKE '%-M'
   OR id LIKE '%-L'
   OR id LIKE '%-XL'
   OR id LIKE '%-XXL'
   OR id LIKE '%-F'
ORDER BY id;

-- ============================================================
-- 3. 사이즈 코드 포함 통계
-- ============================================================
SELECT '=== 3. 사이즈 코드 포함 통계 ===' AS info;

SELECT 
    CASE 
        WHEN id LIKE '%/%' THEN '슬래시 포함 (S/M/L 형식)'
        WHEN id LIKE '%-S' OR id LIKE '%-M' OR id LIKE '%-L' 
          OR id LIKE '%-XL' OR id LIKE '%-XXL' OR id LIKE '%-F' THEN '단일 사이즈 코드 (-S, -M, -L 등)'
        ELSE '사이즈 코드 없음'
    END AS pattern_type,
    COUNT(*) as count
FROM admin_products
GROUP BY pattern_type
ORDER BY count DESC;

-- ============================================================
-- 4. 색상 코드 포함 여부 확인 (참고용)
-- ============================================================
SELECT '=== 4. 색상 코드 포함 여부 확인 (참고용) ===' AS info;

SELECT 
    id,
    name,
    CASE 
        WHEN id LIKE '%-LB' OR id LIKE '%-LB-%' THEN 'Light Blue (LB)'
        WHEN id LIKE '%-GY' OR id LIKE '%-GY-%' THEN 'Grey (GY)'
        WHEN id LIKE '%-BK' OR id LIKE '%-BK-%' THEN 'Black (BK)'
        WHEN id LIKE '%-NV' OR id LIKE '%-NV-%' THEN 'Navy (NV)'
        WHEN id LIKE '%-WH' OR id LIKE '%-WH-%' THEN 'White (WH)'
        WHEN id LIKE '%-WT' OR id LIKE '%-WT-%' THEN 'White (WT)'
        WHEN id LIKE '%-LGY' OR id LIKE '%-LGY-%' THEN 'Light Grey (LGY)'
        ELSE '색상 코드 없음 또는 미확인'
    END AS color_pattern
FROM admin_products
WHERE id LIKE '%-LB' OR id LIKE '%-LB-%'
   OR id LIKE '%-GY' OR id LIKE '%-GY-%'
   OR id LIKE '%-BK' OR id LIKE '%-BK-%'
   OR id LIKE '%-NV' OR id LIKE '%-NV-%'
   OR id LIKE '%-WH' OR id LIKE '%-WH-%'
   OR id LIKE '%-WT' OR id LIKE '%-WT-%'
   OR id LIKE '%-LGY' OR id LIKE '%-LGY-%'
ORDER BY id;

-- ============================================================
-- 5. 전체 패턴 통계 (사이즈 + 색상)
-- ============================================================
SELECT '=== 5. 전체 패턴 통계 (사이즈 + 색상) ===' AS info;

SELECT 
    CASE 
        WHEN id LIKE '%/%' THEN '슬래시 포함 (S/M/L)'
        WHEN id LIKE '%-S' OR id LIKE '%-M' OR id LIKE '%-L' 
          OR id LIKE '%-XL' OR id LIKE '%-XXL' OR id LIKE '%-F' THEN '단일 사이즈 코드'
        WHEN id LIKE '%-LB' OR id LIKE '%-LB-%' 
          OR id LIKE '%-GY' OR id LIKE '%-GY-%'
          OR id LIKE '%-BK' OR id LIKE '%-BK-%'
          OR id LIKE '%-NV' OR id LIKE '%-NV-%'
          OR id LIKE '%-WH' OR id LIKE '%-WH-%'
          OR id LIKE '%-WT' OR id LIKE '%-WT-%'
          OR id LIKE '%-LGY' OR id LIKE '%-LGY-%' THEN '색상 코드만 포함'
        ELSE '정상 (사이즈/색상 코드 없음)'
    END AS pattern_type,
    COUNT(*) as count
FROM admin_products
GROUP BY pattern_type
ORDER BY count DESC;

SELECT '=== 확인 완료 ===' AS info;
