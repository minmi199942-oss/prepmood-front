-- ============================================================
-- 023_token_pk_migration_phase2_warranties_fixed.sql
-- Phase 1-2: warranties 테이블 FK 전환 (token → token_pk) - 수정 버전
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. warranties 데이터 확인
-- ============================================================
SELECT '=== warranties 데이터 확인 ===' AS info;
SELECT COUNT(*) as warranty_count FROM warranties;

-- ============================================================
-- 2. token_pk 컬럼 존재 여부 확인 및 처리
-- ============================================================
SELECT '=== token_pk 컬럼 존재 여부 확인 ===' AS info;
SELECT 
    COLUMN_NAME, 
    COLUMN_TYPE, 
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood' 
  AND TABLE_NAME = 'warranties' 
  AND COLUMN_NAME = 'token_pk';

-- token_pk 컬럼이 이미 있으면 제거 후 재추가
SET @column_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'warranties' 
      AND COLUMN_NAME = 'token_pk'
);

-- token_pk 컬럼이 있으면 제거
SET @sql = IF(@column_exists > 0, 
    'ALTER TABLE warranties DROP COLUMN token_pk',
    'SELECT "token_pk 컬럼이 없습니다. 추가합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 3. warranties.token_pk 컬럼 추가
-- ============================================================
ALTER TABLE warranties 
  ADD COLUMN token_pk INT NULL
  COMMENT 'token_master.token_pk 참조 (FK 추가 예정)'
  AFTER token;

-- ============================================================
-- 4. 기존 데이터 마이그레이션 (token → token_pk 매핑)
-- ============================================================
-- warranties가 비어있으면 UPDATE는 실행되지 않음 (에러 없음)
UPDATE warranties w
JOIN token_master tm ON w.token = tm.token
SET w.token_pk = tm.token_pk;

-- ============================================================
-- 5. 검증: 매핑되지 않은 데이터 확인
-- ============================================================
SELECT '=== 검증: 매핑되지 않은 warranties 확인 ===' AS info;
SELECT COUNT(*) as unmapped_count
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
WHERE w.token_pk IS NULL AND w.token IS NOT NULL;
-- 결과: 0 (모든 warranties가 매핑되어야 함, 또는 warranties가 비어있으면 0)

-- ============================================================
-- 6. token_pk를 NOT NULL로 변경
-- ============================================================
-- warranties가 비어있으면 NOT NULL로 변경 가능
ALTER TABLE warranties 
  MODIFY COLUMN token_pk INT NOT NULL;

-- ============================================================
-- 7. 새 FK 추가 (token_pk 기반) - RESTRICT로 고정
-- ============================================================
-- 기존 FK가 있으면 제거
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'warranties' 
      AND CONSTRAINT_NAME = 'fk_warranties_token_pk'
);

SET @sql = IF(@fk_exists > 0, 
    'ALTER TABLE warranties DROP FOREIGN KEY fk_warranties_token_pk',
    'SELECT "FK가 없습니다. 추가합니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE warranties
  ADD CONSTRAINT fk_warranties_token_pk 
  FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) 
  ON DELETE RESTRICT;

-- ============================================================
-- 8. 기존 token 컬럼은 유지 (deprecated 표시)
-- ============================================================
ALTER TABLE warranties 
  MODIFY COLUMN token VARCHAR(20) COMMENT 'DEPRECATED: Use token_pk instead. Keep for backward compatibility.';

-- ============================================================
-- 9. 사후 검증: 참조 무결성 확인
-- ============================================================
SELECT '=== 사후 검증: 참조 무결성 확인 ===' AS info;
SELECT COUNT(*) as orphan_count 
FROM warranties w
LEFT JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.token_pk IS NOT NULL AND tm.token_pk IS NULL;
-- 결과: 0

SELECT '=== 마이그레이션 완료 ===' AS info;
