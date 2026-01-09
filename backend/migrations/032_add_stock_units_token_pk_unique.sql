-- ============================================================
-- 032_add_stock_units_token_pk_unique.sql
-- stock_units.token_pk UNIQUE 제약 추가 (핵심 안전장치)
-- ============================================================

USE prepmood;

-- ============================================================
-- 사전 검증: 중복된 token_pk 확인
-- ============================================================
SELECT '=== 사전 검증: 중복된 token_pk 확인 ===' AS info;
SELECT 
    token_pk,
    COUNT(*) as count
FROM stock_units
GROUP BY token_pk
HAVING COUNT(*) > 1;

-- 중복이 있으면 마이그레이션 중단 (수동 정리 필요)
-- 중복이 없으면 다음 단계 진행

-- ============================================================
-- 1. UNIQUE 제약 추가 (이미 존재하면 스킵)
-- ============================================================
SELECT '=== stock_units.token_pk UNIQUE 제약 확인 ===' AS info;

-- 기존 제약 확인
SELECT COUNT(*) INTO @constraint_exists
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
  AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA 
  AND tc.TABLE_NAME = kcu.TABLE_NAME
WHERE tc.TABLE_SCHEMA = 'prepmood' 
  AND tc.TABLE_NAME = 'stock_units'
  AND tc.CONSTRAINT_TYPE = 'UNIQUE'
  AND kcu.COLUMN_NAME = 'token_pk';

-- 제약이 없으면 추가
SET @sql = IF(@constraint_exists = 0,
    'ALTER TABLE stock_units ADD CONSTRAINT uk_stock_units_token_pk UNIQUE (token_pk)',
    'SELECT "UNIQUE 제약이 이미 존재합니다." AS info');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 사후 검증
-- ============================================================
SELECT '=== 사후 검증: UNIQUE 제약 확인 ===' AS info;
SELECT 
    tc.CONSTRAINT_NAME,
    kcu.COLUMN_NAME,
    tc.CONSTRAINT_TYPE
FROM information_schema.TABLE_CONSTRAINTS tc
JOIN information_schema.KEY_COLUMN_USAGE kcu 
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
  AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA 
  AND tc.TABLE_NAME = kcu.TABLE_NAME
WHERE tc.TABLE_SCHEMA = 'prepmood' 
  AND tc.TABLE_NAME = 'stock_units'
  AND tc.CONSTRAINT_TYPE = 'UNIQUE'
  AND kcu.COLUMN_NAME = 'token_pk';

SELECT '=== 마이그레이션 완료 ===' AS info;
