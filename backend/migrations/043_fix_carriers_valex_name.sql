-- ============================================================
-- 043_fix_carriers_names.sql
-- carriers 테이블의 이름 오류 수정
-- ============================================================
-- 
-- 목적:
-- - VALEX 이름 수정 (한진택배 → 발렉스 특수 물류)
-- - ILYANG 이름 수정 (일양택배 → 일양로지스)
-- - LOGEN 이름 수정 (로젠택배 → 로지스앤컴퍼니, 중복 해결)
-- 
-- 실행 순서:
-- - 040 이후 실행
-- 
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 사전 검증: 현재 데이터 확인
-- ============================================================
SELECT '=== 사전 검증: 현재 carriers 데이터 확인 ===' AS info;
SELECT code, name, name_en, is_active
FROM carriers
WHERE code IN ('VALEX', 'ILYANG', 'LOGEN')
ORDER BY code;

-- 중복 이름 확인
SELECT '--- 중복 이름 확인 (로젠택배) ---' AS info;
SELECT name, COUNT(*) as count, GROUP_CONCAT(code ORDER BY code SEPARATOR ', ') as codes
FROM carriers
WHERE name = '로젠택배'
GROUP BY name;

-- ============================================================
-- 2. VALEX 이름 수정 (한진택배 → 발렉스 특수 물류)
-- ============================================================
SELECT '=== VALEX 이름 수정 ===' AS info;

UPDATE carriers
SET name = '발렉스 특수 물류',
    name_en = 'VALEX Special Logistics',
    updated_at = NOW()
WHERE code = 'VALEX'
  AND name = '한진택배';  -- 잘못된 이름만 수정

-- ============================================================
-- 3. ILYANG 이름 수정 (일양택배 → 일양로지스)
-- ============================================================
SELECT '=== ILYANG 이름 수정 ===' AS info;

UPDATE carriers
SET name = '일양로지스',
    name_en = 'ILYANG Logistics',
    updated_at = NOW()
WHERE code = 'ILYANG'
  AND name = '일양택배';  -- 잘못된 이름만 수정

-- ============================================================
-- 4. LOGEN 이름 수정 (로젠택배 → 로지스앤컴퍼니, 중복 해결)
-- ============================================================
SELECT '=== LOGEN 이름 수정 (로젠택배 중복 해결) ===' AS info;

UPDATE carriers
SET name = '로지스앤컴퍼니',
    name_en = 'LOGEN Logistics',
    updated_at = NOW()
WHERE code = 'LOGEN'
  AND name = '로젠택배';  -- 중복 이름만 수정 (KGB가 실제 로젠택배)

-- ============================================================
-- 5. 검증: 수정 결과 확인
-- ============================================================
SELECT '=== 수정 결과 확인 ===' AS info;
SELECT code, name, name_en, is_active, updated_at
FROM carriers
WHERE code IN ('VALEX', 'ILYANG', 'LOGEN', 'KGB')
ORDER BY code;

-- 중복 이름 재확인 (로젠택배는 KGB만 남아야 함)
SELECT '--- 중복 이름 재확인 ---' AS info;
SELECT name, COUNT(*) as count, GROUP_CONCAT(code ORDER BY code SEPARATOR ', ') as codes
FROM carriers
WHERE name IN ('로젠택배', '일양택배', '한진택배', '발렉스 특수 물류', '일양로지스', '로지스앤컴퍼니')
GROUP BY name
ORDER BY name;

-- 모든 택배사 목록 확인
SELECT '--- 전체 택배사 목록 ---' AS info;
SELECT code, name, name_en, is_active
FROM carriers
ORDER BY code;

SELECT '=== 마이그레이션 완료 ===' AS info;
