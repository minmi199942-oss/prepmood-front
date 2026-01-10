-- ============================================================
-- 046_add_admin_products_short_name.sql
-- admin_products 테이블에 short_name 컬럼 추가
-- products.xlsx의 product_name과 정확히 매칭하기 위한 컬럼
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 컬럼 존재 확인
-- ============================================================
SELECT '=== 사전 검증: short_name 컬럼 존재 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_DEFAULT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND COLUMN_NAME = 'short_name';

-- ============================================================
-- 2. short_name 컬럼 추가 (name 컬럼 다음에)
-- ============================================================
SET @column_exists = (
    SELECT COUNT(*)
    FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'admin_products'
      AND COLUMN_NAME = 'short_name'
);

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE admin_products ADD COLUMN short_name VARCHAR(100) NULL COMMENT "xlsx product_name 매칭용 (예: SH Teneu Solid)" AFTER name',
    'SELECT "short_name 컬럼이 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT '=== short_name 컬럼 추가 완료 ===' AS info;

-- ============================================================
-- 3. 기존 데이터 업데이트 (xlsx product_name과 매핑)
-- ============================================================
SELECT '=== 기존 데이터 업데이트 시작 ===' AS info;

-- xlsx의 product_name과 admin_products.id 매핑
UPDATE admin_products SET short_name = 'SH Teneu Solid' WHERE id = 'PM-25-SH-Teneu-Solid-LB-S/M/L';
UPDATE admin_products SET short_name = 'SH Oxford Stripe' WHERE id = 'PM-25-SH-Oxford-Stripe-GY-S/M/L';
UPDATE admin_products SET short_name = 'SH Teneu Solid Pintuck' WHERE id = 'PM-25-SH-Teneu-Solid-Pintuck-WH-S/M';
UPDATE admin_products SET short_name = 'TOP Solid Suit Bustier' WHERE id = 'PM-25-TOP-Solid-Suit-Bustier-BK/GY-F';
UPDATE admin_products SET short_name = 'TOP Heavyweight Vest' WHERE id = 'PM-25-TOP-Heavyweight-Vest-GY-S/M';
UPDATE admin_products SET short_name = 'SK Solid Suit Balloon' WHERE id = 'PM-25-SK-Suit-Balloon-BK/GY-F';
UPDATE admin_products SET short_name = 'Outer LeStripe Suit' WHERE id = 'PM-25-Outer-LeStripe-Suit-NV-S/L';
UPDATE admin_products SET short_name = 'Outer London Liberty Toile' WHERE id = 'PM-25-Outer-London-Liberty-Toile-BK-S/L';
UPDATE admin_products SET short_name = 'Tie Solid Suit Skinny' WHERE id = 'PM-25-ACC-Fabric-Tie-Skinny';
UPDATE admin_products SET short_name = 'Tie Solid Suit Slim' WHERE id = 'PM-25-ACC-Fabric-Tie-Solid';

SELECT '=== 기존 데이터 업데이트 완료 ===' AS info;

-- ============================================================
-- 4. 업데이트 결과 확인
-- ============================================================
SELECT '=== 업데이트 결과 확인 ===' AS info;
SELECT 
    id,
    name,
    short_name,
    CASE 
        WHEN short_name IS NULL THEN '⚠️ short_name이 NULL입니다'
        ELSE '✅ 정상'
    END AS status
FROM admin_products
ORDER BY short_name;

-- ============================================================
-- 5. UNIQUE 제약조건 추가 (중복 방지)
-- ============================================================
SELECT '=== UNIQUE 제약조건 추가 ===' AS info;

-- 기존 UNIQUE 제약조건이 있는지 확인
SET @unique_exists = (
    SELECT COUNT(*)
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE TABLE_SCHEMA = 'prepmood'
      AND TABLE_NAME = 'admin_products'
      AND CONSTRAINT_NAME = 'uk_admin_products_short_name'
      AND CONSTRAINT_TYPE = 'UNIQUE'
);

SET @sql = IF(@unique_exists = 0,
    'ALTER TABLE admin_products ADD CONSTRAINT uk_admin_products_short_name UNIQUE (short_name)',
    'SELECT "UNIQUE 제약조건이 이미 존재합니다." AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. 최종 확인
-- ============================================================
SELECT '=== 최종 확인 ===' AS info;
SELECT 
    COUNT(*) as total_products,
    COUNT(short_name) as products_with_short_name,
    COUNT(*) - COUNT(short_name) as products_without_short_name
FROM admin_products;

SELECT '=== UNIQUE 제약조건 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'admin_products'
  AND CONSTRAINT_NAME = 'uk_admin_products_short_name';

SELECT '=== 마이그레이션 완료 ===' AS info;
