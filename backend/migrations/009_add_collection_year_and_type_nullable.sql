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
-- 3. gender 컬럼 제거 (있는 경우에만)
-- ============================================================
-- 주의: 먼저 DESCRIBE admin_products로 확인 후 실행
-- gender 컬럼이 없으면 이 구문은 에러 발생하므로 조건부 실행 필요
-- 실제 실행 시 수동으로 확인 후 실행하거나, 아래 주석 처리 후 실행
-- ALTER TABLE admin_products DROP COLUMN gender;

-- ============================================================
-- 4. 기존 인덱스 제거 (gender 관련)
-- ============================================================
-- 인덱스가 없으면 에러가 발생하므로 조건부 제거
-- 실제 실행 시 에러가 나면 해당 인덱스가 없는 것이므로 무시
DROP INDEX IF EXISTS idx_gender ON admin_products;
DROP INDEX IF EXISTS idx_gender_category ON admin_products;
DROP INDEX IF EXISTS idx_gender_category_type ON admin_products;

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

