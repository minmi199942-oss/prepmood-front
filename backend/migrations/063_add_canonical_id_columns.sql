-- ============================================================
-- 063_add_canonical_id_columns.sql
-- Phase 3 Step 3: canonical_id 컬럼 추가 (Expand)
-- GPT 최종 지적 (B): Idempotent 보강 - 재실행 가능한 형태
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. admin_products.canonical_id 컬럼 추가
-- ============================================================
-- ⚠️ GPT 최종 제안: 스펙을 현재 PK와 완전 동일하게
-- admin_products.id 스펙: VARCHAR(128) (Phase 1에서 확장됨), utf8mb4, utf8mb4_unicode_ci
-- canonical_id는 길이 128, charset/collation은 동일

-- 컬럼 존재 확인 후 추가 (MySQL은 IF NOT EXISTS 지원 안 함, 수동 체크)
SET @col_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'admin_products' 
      AND COLUMN_NAME = 'canonical_id'
);

SET @sql = IF(@col_exists = 0,
    CONCAT('ALTER TABLE admin_products ADD COLUMN canonical_id VARCHAR(128) NULL COMMENT ''정규화된 상품 ID (사이즈 제거, 슬래시 없음)'' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER id'),
    'SELECT ''canonical_id 컬럼이 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 임시 인덱스 생성 (UNIQUE 전에, 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_admin_products_canonical_id_temp 
ON admin_products(canonical_id);

SELECT '=== admin_products.canonical_id 컬럼 추가 완료 ===' AS status;

-- ============================================================
-- 2. stock_units.product_id_canonical 컬럼 추가
-- ============================================================
-- ⚠️ GPT 최종 제안: 스펙을 admin_products.id와 완전 동일하게

SET @col_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'stock_units' 
      AND COLUMN_NAME = 'product_id_canonical'
);

SET @sql = IF(@col_exists = 0,
    CONCAT('ALTER TABLE stock_units ADD COLUMN product_id_canonical VARCHAR(128) NULL COMMENT ''정규화된 상품 ID (canonical_id 참조)'' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci AFTER product_id'),
    'SELECT ''product_id_canonical 컬럼이 이미 존재합니다.'' AS info'
);

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 인덱스 추가 (non-unique)
CREATE INDEX IF NOT EXISTS idx_stock_units_product_id_canonical 
ON stock_units(product_id_canonical);

SELECT '=== stock_units.product_id_canonical 컬럼 추가 완료 ===' AS status;

-- ============================================================
-- 3. 결과 확인
-- ============================================================
SELECT '=== 컬럼 추가 결과 확인 ===' AS info;
SELECT 
    TABLE_NAME,
    COLUMN_NAME,
    COLUMN_TYPE,
    CHARACTER_SET_NAME,
    COLLATION_NAME,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME IN ('admin_products', 'stock_units')
  AND COLUMN_NAME IN ('canonical_id', 'product_id_canonical')
ORDER BY TABLE_NAME, COLUMN_NAME;

SELECT '=== canonical_id 컬럼 추가 완료 ===' AS status;
