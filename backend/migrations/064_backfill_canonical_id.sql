-- ============================================================
-- 064_backfill_canonical_id.sql
-- Phase 3 Step 4: canonical_id 백필 (Backfill)
-- GPT 제안: migration_status 기준이 아니라 "매핑 존재" 기준
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. admin_products.canonical_id 백필
-- ============================================================
-- ⚠️ GPT 제안: migration_status 기준이 아니라 "매핑 존재" 기준
-- 매핑 테이블로 canonical_id 백필 (상태 조건 없이)
UPDATE admin_products ap
JOIN product_id_mapping pm ON ap.id = pm.old_id
SET ap.canonical_id = pm.new_id;

-- 신규 상품은 자동으로 canonical_id = id (슬래시 없음)
UPDATE admin_products
SET canonical_id = id
WHERE canonical_id IS NULL;

SELECT '=== admin_products.canonical_id 백필 완료 ===' AS status;

-- ============================================================
-- 2. stock_units.product_id_canonical 백필
-- ============================================================
-- ⚠️ GPT 제안: migration_status 기준이 아니라 "매핑 존재" 기준
-- 매핑 테이블로 product_id_canonical 백필 (상태 조건 없이)
UPDATE stock_units su
JOIN product_id_mapping pm ON su.product_id = pm.old_id
SET su.product_id_canonical = pm.new_id;

SELECT '=== stock_units.product_id_canonical 백필 완료 ===' AS status;

-- ============================================================
-- 3. 백필 결과 확인
-- ============================================================
SELECT '=== 백필 결과 확인 ===' AS info;

-- admin_products NULL 체크
SELECT 
    'admin_products canonical_id NULL 체크' AS check_type,
    COUNT(*) as total,
    COUNT(canonical_id) as not_null_count,
    COUNT(*) - COUNT(canonical_id) as null_count
FROM admin_products;

-- stock_units NULL 체크
SELECT 
    'stock_units product_id_canonical NULL 체크' AS check_type,
    COUNT(*) as total,
    COUNT(product_id_canonical) as not_null_count,
    COUNT(*) - COUNT(product_id_canonical) as null_count
FROM stock_units;

-- 참조 무결성 확인
SELECT 
    'stock_units 참조 무결성' AS check_type,
    COUNT(*) as total,
    COUNT(CASE WHEN product_id_canonical IS NOT NULL AND product_id_canonical NOT IN (SELECT canonical_id FROM admin_products WHERE canonical_id IS NOT NULL) THEN 1 END) as orphan_count
FROM stock_units
WHERE product_id_canonical IS NOT NULL;

SELECT '=== 백필 완료 ===' AS status;
