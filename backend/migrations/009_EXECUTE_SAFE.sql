-- 안전한 마이그레이션 실행 스크립트
-- 실행 전: 데이터 백업 필수!
-- CREATE TABLE admin_products_backup AS SELECT * FROM admin_products;
-- (백업 테이블이 이미 있으면: DROP TABLE IF EXISTS admin_products_backup; 후 재생성)

USE prepmood;

-- ============================================================
-- 1. 데이터 백업 (실행 전에 수동으로 실행 권장)
-- ============================================================
-- 백업 테이블이 이미 있으면:
-- DROP TABLE IF EXISTS admin_products_backup;
-- CREATE TABLE admin_products_backup AS SELECT * FROM admin_products;

-- ============================================================
-- 2. collection_year 컬럼 추가
-- ============================================================
-- 기존 데이터는 모두 DEFAULT 2026이 자동 적용됨
ALTER TABLE admin_products
ADD COLUMN collection_year INT NOT NULL DEFAULT 2026 AFTER image;

-- ============================================================
-- 3. type 컬럼 NULL 허용 변경
-- ============================================================
-- non-accessories 카테고리는 type을 NULL로 저장하는 정책
-- 기존 데이터는 그대로 유지됨 (shirts, jackets, ties 등)
ALTER TABLE admin_products
MODIFY COLUMN type VARCHAR(100) NULL;

-- ============================================================
-- 4. 새로운 인덱스 추가
-- ============================================================
CREATE INDEX idx_collection_year ON admin_products(collection_year);
CREATE INDEX idx_collection_category ON admin_products(collection_year, category);
CREATE INDEX idx_collection_category_type ON admin_products(collection_year, category, type);

-- ============================================================
-- 5. 결과 확인
-- ============================================================
DESCRIBE admin_products;
SELECT COUNT(*) AS total_products FROM admin_products;
SELECT 'Migration completed successfully!' AS status;
