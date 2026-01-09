-- ============================================================
-- 023_token_pk_migration_phase2_warranties.sql
-- Phase 1-2: warranties 테이블 FK 전환 (token → token_pk)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. warranties.token_pk 컬럼 추가
-- ============================================================
ALTER TABLE warranties 
  ADD COLUMN token_pk INT NULL
  COMMENT 'token_master.token_pk 참조 (FK 추가 예정)'
  AFTER token;

-- ============================================================
-- 2. 기존 데이터 마이그레이션 (token → token_pk 매핑)
-- ============================================================
UPDATE warranties w
JOIN token_master tm ON w.token = tm.token
SET w.token_pk = tm.token_pk;

-- ============================================================
-- 3. 검증: 매핑되지 않은 데이터 확인
-- ============================================================
SELECT '=== 검증: 매핑되지 않은 warranties 확인 ===' AS info;
SELECT COUNT(*) as unmapped_count
FROM warranties w
LEFT JOIN token_master tm ON w.token = tm.token
WHERE w.token_pk IS NULL AND w.token IS NOT NULL;
-- 결과: 0 (모든 warranties가 매핑되어야 함)

-- ============================================================
-- 4. token_pk를 NOT NULL로 변경
-- ============================================================
ALTER TABLE warranties 
  MODIFY COLUMN token_pk INT NOT NULL;

-- ============================================================
-- 5. 새 FK 추가 (token_pk 기반) - RESTRICT로 고정
-- ============================================================
ALTER TABLE warranties
  ADD CONSTRAINT fk_warranties_token_pk 
  FOREIGN KEY (token_pk) REFERENCES token_master(token_pk) 
  ON DELETE RESTRICT;

-- ============================================================
-- 6. 기존 token 컬럼은 유지 (deprecated 표시)
-- ============================================================
ALTER TABLE warranties 
  MODIFY COLUMN token VARCHAR(20) COMMENT 'DEPRECATED: Use token_pk instead. Keep for backward compatibility.';

-- ============================================================
-- 7. 사후 검증: 참조 무결성 확인
-- ============================================================
SELECT '=== 사후 검증: 참조 무결성 확인 ===' AS info;
SELECT COUNT(*) as orphan_count 
FROM warranties w
LEFT JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.token_pk IS NOT NULL AND tm.token_pk IS NULL;
-- 결과: 0

SELECT '=== 마이그레이션 완료 ===' AS info;
