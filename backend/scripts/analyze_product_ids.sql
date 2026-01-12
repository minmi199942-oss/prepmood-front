-- ============================================================
-- analyze_product_ids.sql
-- Phase 2: 기존 product_id 패턴 분석 및 중복 확인
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 현재 product_id 패턴 분석
-- ============================================================
SELECT '=== 1. product_id 패턴 분석 ===' AS info;

SELECT 
    id,
    name,
    CASE 
        WHEN id LIKE '%/%' THEN '사이즈 포함'
        WHEN id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%' OR id LIKE '%-WT-%' OR id LIKE '%-LGY-%' THEN '색상 코드 포함'
        ELSE '정상'
    END AS pattern_type,
    -- ⚠️ GPT 제안: SUBSTRING_INDEX 사용 (슬래시부터 오른쪽 전체 제거)
    CASE 
        WHEN id LIKE '%/%' THEN SUBSTRING_INDEX(id, '/', 1)
        ELSE id
    END AS suggested_new_id
FROM admin_products
WHERE id LIKE '%/%' OR id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%' OR id LIKE '%-WT-%' OR id LIKE '%-LGY-%'
ORDER BY id;

-- 전체 상품 수 및 패턴 통계
SELECT '=== 1-1. 패턴 통계 ===' AS info;
SELECT 
    CASE 
        WHEN id LIKE '%/%' THEN '사이즈 포함'
        WHEN id LIKE '%-LB-%' OR id LIKE '%-GY-%' OR id LIKE '%-BK-%' OR id LIKE '%-NV-%' OR id LIKE '%-WH-%' OR id LIKE '%-WT-%' OR id LIKE '%-LGY-%' THEN '색상 코드 포함'
        ELSE '정상'
    END AS pattern_type,
    COUNT(*) as count
FROM admin_products
GROUP BY pattern_type
ORDER BY count DESC;

-- ============================================================
-- 2. 중복 확인 (GPT 제안: new_id + name 조합으로 확인)
-- ============================================================
SELECT '=== 2. 중복 확인 (new_id + name 조합) ===' AS info;

SELECT 
    suggested_new_id,
    name,
    COUNT(*) as count,
    GROUP_CONCAT(id ORDER BY id) as old_ids,
    GROUP_CONCAT(name ORDER BY id SEPARATOR ' | ') as names
FROM (
    SELECT 
        id,
        name,
        CASE 
            WHEN id LIKE '%/%' THEN SUBSTRING_INDEX(id, '/', 1)
            ELSE id
        END AS suggested_new_id
    FROM admin_products
    WHERE id LIKE '%/%'
) AS candidates
GROUP BY suggested_new_id, name
HAVING count > 1;

-- ⚠️ 중복 종류 구분:
-- A) 서로 다른 상품이 우연히 같은 new_id로 합쳐짐 (진짜 충돌 - 수동 해결 필요)
--    → conflict_resolution에 해결 방법 기록 (예: "PM-25-SH-Teneu-Solid-LB-v2" 사용)
-- B) 같은 상품이지만 컬러/라인업 구분이 원래 애매해서 합쳐짐 (정책 결정 필요)
--    → 정책 결정 후 conflict_resolution에 기록

-- new_id만으로 중복 확인 (이름이 다른 경우)
SELECT '=== 2-1. new_id만 중복 (이름 다른 경우) ===' AS info;
SELECT 
    suggested_new_id,
    COUNT(DISTINCT name) as distinct_names,
    COUNT(*) as count,
    GROUP_CONCAT(DISTINCT name ORDER BY name SEPARATOR ' | ') as names,
    GROUP_CONCAT(id ORDER BY id) as old_ids
FROM (
    SELECT 
        id,
        name,
        CASE 
            WHEN id LIKE '%/%' THEN SUBSTRING_INDEX(id, '/', 1)
            ELSE id
        END AS suggested_new_id
    FROM admin_products
    WHERE id LIKE '%/%'
) AS candidates
GROUP BY suggested_new_id
HAVING count > 1 AND distinct_names > 1;

-- ============================================================
-- 3. 참조 무결성 확인
-- ============================================================
SELECT '=== 3. 참조 무결성 확인 ===' AS info;

-- stock_units 참조 확인 (FK 존재)
SELECT '=== 3-1. stock_units 참조 ===' AS info;
SELECT 
    COUNT(*) as stock_units_count,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_count
FROM stock_units;

-- order_items 참조 확인 (FK 없음 - ⚠️ 조용히 갈라질 수 있음)
SELECT '=== 3-2. order_items 참조 ===' AS info;
SELECT 
    COUNT(*) as order_items_count,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_count
FROM order_items;

-- token_master 참조 확인 (FK 존재)
SELECT '=== 3-3. token_master 참조 ===' AS info;
SELECT 
    COUNT(*) as token_master_count,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id IS NOT NULL AND product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_count
FROM token_master
WHERE product_id IS NOT NULL;

-- ⚠️ order_items 정합성 리포트 (마이그레이션 전/후 비교용)
SELECT '=== 3-4. order_items 정합성 리포트 ===' AS info;
SELECT 
    'order_items 정합성 리포트' AS report_type,
    COUNT(*) as total_items,
    COUNT(DISTINCT product_id) as unique_product_ids,
    COUNT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END) as orphan_product_ids,
    GROUP_CONCAT(DISTINCT CASE WHEN product_id NOT IN (SELECT id FROM admin_products) THEN product_id END LIMIT 10) as orphan_list
FROM order_items;

-- ============================================================
-- 4. 마이그레이션 영향도 평가
-- ============================================================
SELECT '=== 4. 마이그레이션 영향도 평가 ===' AS info;

-- 사이즈 포함 상품 수
SELECT 
    '사이즈 포함 상품 수' AS metric,
    COUNT(*) as count
FROM admin_products
WHERE id LIKE '%/%';

-- stock_units에 연결된 사이즈 포함 상품 수
SELECT 
    'stock_units에 연결된 사이즈 포함 상품 수' AS metric,
    COUNT(DISTINCT su.product_id) as count
FROM stock_units su
JOIN admin_products ap ON su.product_id = ap.id
WHERE ap.id LIKE '%/%';

-- order_items에 연결된 사이즈 포함 상품 수
SELECT 
    'order_items에 연결된 사이즈 포함 상품 수' AS metric,
    COUNT(DISTINCT oi.product_id) as count
FROM order_items oi
JOIN admin_products ap ON oi.product_id = ap.id
WHERE ap.id LIKE '%/%';

-- token_master에 연결된 사이즈 포함 상품 수
SELECT 
    'token_master에 연결된 사이즈 포함 상품 수' AS metric,
    COUNT(DISTINCT tm.product_id) as count
FROM token_master tm
JOIN admin_products ap ON tm.product_id = ap.id
WHERE tm.product_id IS NOT NULL
  AND ap.id LIKE '%/%';

SELECT '=== 분석 완료 ===' AS status;
