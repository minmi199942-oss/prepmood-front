-- token_master.owner_warranty_public_id 제거 마이그레이션 검증
-- 실행: mysql -u prepmood_user -p prepmood < backend/migrations/017_remove_token_master_warranty_fk_verify.sql

USE prepmood;

-- ============================================================
-- 1. 컬럼 제거 확인
-- ============================================================
SELECT '=== 컬럼 제거 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME = 'owner_warranty_public_id';

-- 기대 결과: 0 rows (컬럼이 제거됨)

-- ============================================================
-- 2. FK 제약 제거 확인
-- ============================================================
SELECT '=== FK 제약 제거 확인 ===' AS info;
SELECT 
    CONSTRAINT_NAME,
    TABLE_NAME,
    COLUMN_NAME,
    REFERENCED_TABLE_NAME,
    REFERENCED_COLUMN_NAME
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND REFERENCED_TABLE_NAME = 'warranties';

-- 기대 결과: 0 rows (FK가 제거됨)

-- ============================================================
-- 3. 대체 조회 방법 테스트
-- ============================================================
SELECT '=== 대체 조회 방법 테스트 ===' AS info;
SELECT 
    COUNT(*) AS total_warranties,
    COUNT(DISTINCT w.token) AS warranties_with_token,
    COUNT(DISTINCT tm.token) AS tokens_found_via_join
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token;

-- 기대 결과: 
-- - warranties_with_token = 7
-- - tokens_found_via_join = 7 (JOIN으로 조회 가능)

-- ============================================================
-- 4. token_master 테이블 구조 최종 확인
-- ============================================================
SELECT '=== token_master 테이블 구조 최종 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_KEY,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
ORDER BY COLUMN_NAME;

-- 기대 결과: owner_warranty_public_id 컬럼이 없음
