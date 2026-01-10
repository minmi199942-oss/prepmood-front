-- ============================================================
-- 043_fix_carriers_valex_name.sql
-- carriers 테이블의 VALEX 이름 수정 (한진택배 → 발렉스 특수 물류)
-- ============================================================
-- 
-- 목적:
-- - 040 마이그레이션에서 VALEX의 name이 잘못 입력됨 (한진택배 → 발렉스 특수 물류)
-- - 기존 데이터 보정
-- 
-- 실행 순서:
-- - 040 이후 실행
-- 
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 현재 VALEX 데이터 확인
-- ============================================================
SELECT '=== 사전 검증: 현재 VALEX 데이터 확인 ===' AS info;
SELECT code, name, name_en, is_active
FROM carriers
WHERE code = 'VALEX';

-- ============================================================
-- 2. VALEX 이름 수정
-- ============================================================
SELECT '=== VALEX 이름 수정 ===' AS info;

UPDATE carriers
SET name = '발렉스 특수 물류',
    name_en = 'VALEX Special Logistics',
    updated_at = NOW()
WHERE code = 'VALEX'
  AND name = '한진택배';  -- 잘못된 이름만 수정

-- ============================================================
-- 3. 검증: 수정 결과 확인
-- ============================================================
SELECT '=== 수정 결과 확인 ===' AS info;
SELECT code, name, name_en, is_active, updated_at
FROM carriers
WHERE code = 'VALEX';

-- 모든 택배사 목록 확인 (중복 이름 체크)
SELECT '--- 전체 택배사 목록 (중복 체크) ---' AS info;
SELECT code, name, name_en, is_active
FROM carriers
ORDER BY code;

SELECT '=== 마이그레이션 완료 ===' AS info;
