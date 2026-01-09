-- ============================================================
-- 023_cleanup_and_retry_phase2.sql
-- Phase 1-2 재실행 전: 깨끗한 초기화 (GPT A안 권장 방식)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 현재 상태 확인
-- ============================================================
SELECT '=== 현재 상태 확인 ===' AS info;

-- warranties 데이터 확인
SELECT COUNT(*) AS warranties_count FROM warranties;

-- transfer_logs 데이터 확인
SELECT COUNT(*) AS transfer_logs_count FROM transfer_logs;

-- scan_logs 데이터 확인 (SET NULL이지만 확인)
SELECT COUNT(*) AS scan_logs_count FROM scan_logs;

-- token_pk 컬럼 존재 여부 확인
SELECT 
    COLUMN_NAME, 
    IS_NULLABLE, 
    COLUMN_TYPE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'warranties'
  AND COLUMN_NAME = 'token_pk';

-- ============================================================
-- 2. 자식 테이블 먼저 삭제 (FK 제약 때문에 반드시 이 순서)
-- ============================================================
SELECT '=== 자식 테이블 삭제 시작 ===' AS info;

-- transfer_logs 삭제 (ON DELETE RESTRICT이므로 먼저 삭제)
DELETE FROM transfer_logs;
SELECT 'transfer_logs 삭제 완료' AS info;

-- scan_logs는 ON DELETE SET NULL이므로 삭제 불필요하지만, 테스트 데이터면 삭제 가능
-- DELETE FROM scan_logs;
-- SELECT 'scan_logs 삭제 완료' AS info;

-- ============================================================
-- 3. warranties 삭제
-- ============================================================
SELECT '=== warranties 삭제 시작 ===' AS info;
DELETE FROM warranties;
SELECT 'warranties 삭제 완료' AS info;

-- ============================================================
-- 4. 삭제 확인
-- ============================================================
SELECT '=== 삭제 확인 ===' AS info;
SELECT 
    (SELECT COUNT(*) FROM warranties) AS warranties_count,
    (SELECT COUNT(*) FROM transfer_logs) AS transfer_logs_count,
    (SELECT COUNT(*) FROM scan_logs) AS scan_logs_count;

-- ============================================================
-- 5. token_pk 컬럼이 있으면 DROP (완전 초기화)
-- ============================================================
SELECT '=== token_pk 컬럼 정리 ===' AS info;

-- token_pk 컬럼 존재 여부 확인
SET @column_exists = (
    SELECT COUNT(*) 
    FROM information_schema.COLUMNS 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'warranties' 
      AND COLUMN_NAME = 'token_pk'
);

-- token_pk FK가 있으면 제거
SET @fk_exists = (
    SELECT COUNT(*) 
    FROM information_schema.KEY_COLUMN_USAGE 
    WHERE TABLE_SCHEMA = 'prepmood' 
      AND TABLE_NAME = 'warranties' 
      AND CONSTRAINT_NAME = 'fk_warranties_token_pk'
);

-- FK 제거 (있는 경우)
SET @sql = IF(@fk_exists > 0, 
    'ALTER TABLE warranties DROP FOREIGN KEY fk_warranties_token_pk',
    'SELECT "FK가 없습니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- 컬럼 제거 (있는 경우)
SET @sql = IF(@column_exists > 0, 
    'ALTER TABLE warranties DROP COLUMN token_pk',
    'SELECT "token_pk 컬럼이 없습니다." AS info'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ============================================================
-- 6. 최종 확인
-- ============================================================
SELECT '=== 최종 확인 ===' AS info;

-- warranties가 비어있는지 확인
SELECT COUNT(*) AS warranties_count FROM warranties;
-- 기대 결과: 0

-- token_pk 컬럼이 제거되었는지 확인
SELECT 
    CASE 
        WHEN COUNT(*) = 0 THEN 'token_pk 컬럼 없음 (정상)'
        ELSE 'token_pk 컬럼 존재 (이상)'
    END AS token_pk_status
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'warranties'
  AND COLUMN_NAME = 'token_pk';

SELECT '=== 초기화 완료: Phase 1-2 재실행 준비됨 ===' AS info;
