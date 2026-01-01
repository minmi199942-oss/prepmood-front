-- 상품 테이블 마이그레이션
-- collection_year 추가 및 type NULL 허용 변경
-- 
-- 실행 전 확인:
-- 1. 현재 테이블 구조: DESCRIBE admin_products;
-- 2. 데이터 백업: CREATE TABLE admin_products_backup AS SELECT * FROM admin_products;
-- 3. gender 컬럼 존재 여부 확인 (없으면 DROP COLUMN 구문 건너뛰기)

USE prepmood;

-- ============================================================
-- 1. collection_year 컬럼 추가
-- ============================================================
-- 기존 데이터는 모두 DEFAULT 2026이 자동 적용됨
ALTER TABLE admin_products
ADD COLUMN collection_year INT NOT NULL DEFAULT 2026 AFTER image;

-- ============================================================
-- 2. type 컬럼 NULL 허용 변경
-- ============================================================
-- non-accessories 카테고리는 type을 NULL로 저장하는 정책
ALTER TABLE admin_products
MODIFY COLUMN type VARCHAR(100) NULL;

-- ============================================================
-- 3. gender 컬럼 제거 (확인 결과: 이미 없음, 건너뜀)
-- ============================================================
-- 확인 결과 gender 컬럼이 이미 없으므로 이 단계는 불필요
-- ALTER TABLE admin_products DROP COLUMN gender; -- 이미 없음

-- ============================================================
-- 4. 기존 인덱스 제거 (gender 관련 인덱스는 이미 없음)
-- ============================================================
-- 확인 결과 gender 관련 인덱스가 이미 없으므로 이 단계는 불필요
-- DROP INDEX IF EXISTS idx_gender ON admin_products; -- 이미 없음
-- DROP INDEX IF EXISTS idx_gender_category ON admin_products; -- 이미 없음
-- DROP INDEX IF EXISTS idx_gender_category_type ON admin_products; -- 이미 없음

-- ============================================================
-- 5. 새로운 인덱스 추가
-- ============================================================
CREATE INDEX idx_collection_year ON admin_products(collection_year);
CREATE INDEX idx_collection_category ON admin_products(collection_year, category);
CREATE INDEX idx_collection_category_type ON admin_products(collection_year, category, type);

-- ============================================================
-- 6. 결과 확인
-- ============================================================
DESCRIBE admin_products;
SELECT COUNT(*) AS total_products FROM admin_products;
SELECT 'Migration completed successfully!' AS status;

