-- token_master 새 필드 추가 마이그레이션 검증
-- 실행: mysql -u prepmood_user -p prepmood < backend/migrations/019_add_token_master_new_fields_verify.sql

USE prepmood;

-- ============================================================
-- 1. 새 컬럼 존재 확인
-- ============================================================
SELECT '=== 새 컬럼 존재 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME IN ('serial_number', 'rot_code', 'warranty_bottom_code', 'digital_warranty_code')
ORDER BY COLUMN_NAME;

-- ============================================================
-- 2. 인덱스 확인
-- ============================================================
SELECT '=== 새 인덱스 확인 ===' AS info;
SELECT 
    INDEX_NAME,
    COLUMN_NAME,
    NON_UNIQUE,
    SEQ_IN_INDEX
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND INDEX_NAME IN ('idx_serial_number', 'idx_rot_code', 'idx_warranty_bottom_code', 'idx_digital_warranty_code')
ORDER BY INDEX_NAME, SEQ_IN_INDEX;

-- ============================================================
-- 3. 데이터 샘플 확인 (NULL 허용이므로 기존 데이터는 NULL)
-- ============================================================
SELECT '=== 데이터 샘플 확인 ===' AS info;
SELECT 
    token,
    internal_code,
    product_name,
    serial_number,
    rot_code,
    warranty_bottom_code,
    digital_warranty_code,
    created_at
FROM token_master
ORDER BY created_at DESC
LIMIT 5;

-- ============================================================
-- 4. 데이터 통계
-- ============================================================
SELECT '=== 데이터 통계 ===' AS info;
SELECT 
    COUNT(*) AS total_tokens,
    COUNT(serial_number) AS tokens_with_serial_number,
    COUNT(rot_code) AS tokens_with_rot_code,
    COUNT(warranty_bottom_code) AS tokens_with_warranty_bottom_code,
    COUNT(digital_warranty_code) AS tokens_with_digital_warranty_code,
    COUNT(internal_code) AS tokens_with_internal_code
FROM token_master;

-- ============================================================
-- 5. internal_code와 warranty_bottom_code 구분 확인
-- ============================================================
SELECT '=== internal_code와 warranty_bottom_code 구분 확인 ===' AS info;
SELECT 
    COLUMN_NAME,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
  AND COLUMN_NAME IN ('internal_code', 'warranty_bottom_code')
ORDER BY COLUMN_NAME;

-- ============================================================
-- 6. 최종 테이블 구조 확인
-- ============================================================
SELECT '=== token_master 테이블 최종 구조 ===' AS info;
SELECT 
    COLUMN_NAME,
    IS_NULLABLE,
    COLUMN_TYPE,
    COLUMN_KEY,
    COLUMN_DEFAULT,
    COLUMN_COMMENT
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'token_master'
ORDER BY ORDINAL_POSITION;
