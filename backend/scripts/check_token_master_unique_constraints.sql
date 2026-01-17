-- ============================================================
-- token_master 고유값 사전 점검 SQL
-- UNIQUE 제약 추가 전에 반드시 실행
-- ============================================================
-- 
-- 목적:
-- - serial_number, warranty_bottom_code의 NULL/빈문자열/중복 확인
-- - UNIQUE 제약 추가 전 데이터 정합성 확인
--
-- 실행 방법:
-- mysql -u prepmood_user -p prepmood < backend/scripts/check_token_master_unique_constraints.sql
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. NULL/빈 문자열 확인
-- ============================================================
SELECT '=== 1. NULL/빈 문자열 확인 ===' AS info;

SELECT 
    'serial_number NULL/빈문자열' AS check_type,
    COUNT(*) AS count
FROM token_master
WHERE serial_number IS NULL OR serial_number = '';

SELECT 
    'warranty_bottom_code NULL/빈문자열' AS check_type,
    COUNT(*) AS count
FROM token_master
WHERE warranty_bottom_code IS NULL OR warranty_bottom_code = '';

-- ============================================================
-- 2. 중복 확인
-- ============================================================
SELECT '=== 2. 중복 확인 ===' AS info;

-- serial_number 중복
SELECT 
    'serial_number 중복' AS check_type,
    serial_number,
    COUNT(*) AS count
FROM token_master
WHERE serial_number IS NOT NULL AND serial_number != ''
GROUP BY serial_number
HAVING COUNT(*) > 1;

-- warranty_bottom_code 중복
SELECT 
    'warranty_bottom_code 중복' AS check_type,
    warranty_bottom_code,
    COUNT(*) AS count
FROM token_master
WHERE warranty_bottom_code IS NOT NULL AND warranty_bottom_code != ''
GROUP BY warranty_bottom_code
HAVING COUNT(*) > 1;

-- ============================================================
-- 3. 결과 해석
-- ============================================================
SELECT '=== 3. 결과 해석 ===' AS info;

-- NULL/빈문자열이 있으면:
-- → 업로드 모드에서 NULL 금지 검증 필요
-- → 기존 데이터 정리 필요 (선택사항)

-- 중복이 있으면:
-- → 정리 후 UNIQUE 제약 추가
-- → 중복 데이터 정리 방법:
--   1. 중복된 행 중 하나만 남기고 나머지 삭제
--   2. 또는 중복된 행의 serial_number/warranty_bottom_code 수정

-- 모두 0이면:
-- → UNIQUE 제약 추가 가능
-- → 다음 SQL 실행:
--   ALTER TABLE token_master
--   ADD CONSTRAINT uk_token_master_serial_number UNIQUE (serial_number);
--   
--   ALTER TABLE token_master
--   ADD CONSTRAINT uk_token_master_warranty_bottom_code UNIQUE (warranty_bottom_code);
