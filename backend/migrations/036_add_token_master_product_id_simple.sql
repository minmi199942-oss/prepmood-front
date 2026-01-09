-- ============================================================
-- 036_add_token_master_product_id_simple.sql
-- token_master에 product_id 컬럼 추가 (간단 버전, IF 문 없음)
-- ============================================================

USE prepmood;

SELECT '=== 사전 검증: token_master 현재 구조 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_KEY
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME IN ('product_id', 'product_name')
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 1. product_id 컬럼 추가
-- ============================================================
SELECT '=== product_id 컬럼 추가 시작 ===' AS info;

-- 컬럼이 이미 존재하는지 확인
SELECT '--- product_id 컬럼 존재 여부 확인 ---' AS info;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'product_id 컬럼이 이미 존재합니다.'
        ELSE 'product_id 컬럼이 없습니다. 추가합니다.'
    END AS status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME = 'product_id';

-- 컬럼 추가 (이미 존재하면 에러 발생하지만 무시 가능)
ALTER TABLE token_master
ADD COLUMN product_id VARCHAR(50) NULL 
COMMENT 'admin_products.id 참조 (FK 추가 예정, 현재 NULL 허용)' 
AFTER product_name;

-- ============================================================
-- 2. 인덱스 추가
-- ============================================================
SELECT '=== product_id 인덱스 추가 시작 ===' AS info;

-- 인덱스가 이미 존재하는지 확인
SELECT '--- idx_product_id 인덱스 존재 여부 확인 ---' AS info;
SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 'idx_product_id 인덱스가 이미 존재합니다.'
        ELSE 'idx_product_id 인덱스가 없습니다. 추가합니다.'
    END AS status
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND INDEX_NAME = 'idx_product_id';

-- 인덱스 추가 (이미 존재하면 에러 발생하지만 무시 가능)
CREATE INDEX idx_product_id ON token_master(product_id);

-- ============================================================
-- 3. 사후 검증
-- ============================================================
SELECT '=== 사후 검증: token_master 구조 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME = 'product_id';

SELECT '=== product_id NULL 개수 확인 ===' AS info;
SELECT 
    COUNT(*) as total_tokens,
    COUNT(product_id) as tokens_with_product_id,
    COUNT(*) - COUNT(product_id) as tokens_without_product_id
FROM token_master;

SELECT '=== 마이그레이션 완료 (단계 1) ===' AS info;
SELECT '다음 단계: 037_auto_map_token_master_product_id.sql 실행' AS next_step;
