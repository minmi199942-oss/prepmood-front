-- ============================================================
-- 038_finalize_token_master_product_id.sql
-- token_master.product_id 최종화 (NOT NULL + FK 추가)
-- ============================================================
-- 
-- 주의:
-- 1. 이 스크립트는 모든 token_master.product_id가 채워진 후에만 실행하세요.
-- 2. 매핑 누락이 있으면 NOT NULL 제약 추가가 실패합니다.
-- 
-- 실행 전 확인:
-- SELECT COUNT(*) FROM token_master WHERE product_id IS NULL;
-- 결과가 0이어야 합니다.
-- 
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 모든 product_id가 채워졌는지 확인
-- ============================================================
SELECT '=== 사전 검증: product_id NULL 확인 ===' AS info;
SELECT 
    COUNT(*) as total_tokens,
    COUNT(product_id) as tokens_with_product_id,
    COUNT(*) - COUNT(product_id) as tokens_without_product_id
FROM token_master;

-- 매핑 누락이 있으면 중단
SELECT COUNT(*) INTO @null_count
FROM token_master
WHERE product_id IS NULL;

IF @null_count > 0 THEN
    SELECT CONCAT('❌ 오류: ', @null_count, '개의 토큰이 product_id가 NULL입니다. 먼저 매핑을 완료하세요.') AS error;
    SELECT '이 스크립트를 중단합니다. 매핑을 완료한 후 다시 실행하세요.' AS message;
    -- 스크립트 중단 (MySQL에서는 SIGNAL 사용)
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = 'product_id가 NULL인 토큰이 있습니다. 매핑을 완료한 후 다시 실행하세요.';
END IF;

-- ============================================================
-- 2. 참조 무결성 확인 (admin_products에 없는 product_id가 있는지)
-- ============================================================
SELECT '=== 참조 무결성 확인 ===' AS info;
SELECT 
    tm.token_pk,
    tm.product_id,
    tm.product_name,
    'admin_products에 없음' as error
FROM token_master tm
LEFT JOIN admin_products ap ON tm.product_id = ap.id
WHERE tm.product_id IS NOT NULL
  AND ap.id IS NULL;

SELECT COUNT(*) INTO @orphan_count
FROM token_master tm
LEFT JOIN admin_products ap ON tm.product_id = ap.id
WHERE tm.product_id IS NOT NULL
  AND ap.id IS NULL;

IF @orphan_count > 0 THEN
    SELECT CONCAT('❌ 오류: ', @orphan_count, '개의 토큰이 존재하지 않는 product_id를 참조합니다.') AS error;
    SELECT '이 스크립트를 중단합니다. product_id를 수정한 후 다시 실행하세요.' AS message;
    SIGNAL SQLSTATE '45000'
    SET MESSAGE_TEXT = '존재하지 않는 product_id를 참조하는 토큰이 있습니다.';
END IF;

-- ============================================================
-- 3. product_id를 NOT NULL로 변경
-- ============================================================
SELECT '=== product_id NOT NULL 변경 시작 ===' AS info;

ALTER TABLE token_master
MODIFY COLUMN product_id VARCHAR(50) NOT NULL
COMMENT 'admin_products.id 참조 (FK 추가 예정)';

SELECT 'product_id NOT NULL 변경 완료' AS info;

-- ============================================================
-- 4. FK 추가
-- ============================================================
SELECT '=== FK 추가 시작 ===' AS info;

-- FK가 이미 존재하는지 확인
SELECT COUNT(*) INTO @fk_exists
FROM information_schema.TABLE_CONSTRAINTS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND CONSTRAINT_NAME = 'fk_token_master_product_id';

IF @fk_exists = 0 THEN
    ALTER TABLE token_master
    ADD CONSTRAINT fk_token_master_product_id
    FOREIGN KEY (product_id) REFERENCES admin_products(id) ON DELETE RESTRICT;
    
    SELECT 'fk_token_master_product_id FK 추가 완료' AS info;
ELSE
    SELECT 'fk_token_master_product_id FK가 이미 존재합니다. 스킵합니다.' AS info;
END IF;

-- ============================================================
-- 5. 사후 검증
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

SELECT '=== FK 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND CONSTRAINT_NAME = 'fk_token_master_product_id';

SELECT '=== 최종화 완료 ===' AS info;
SELECT '다음 단계: stock-routes.js에서 문자열 매칭 제거하고 product_id 기반으로 변경' AS next_step;
