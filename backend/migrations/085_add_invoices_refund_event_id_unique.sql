-- ============================================================
-- 085_add_invoices_refund_event_id_unique.sql
-- Credit Note 식별자 (환불 이벤트 중복 방지)
-- A안: generated column + UNIQUE (MySQL NULL 동작 회피)
-- Idempotent: 컬럼/인덱스 존재 시 스킵 (재실행·부분 적용 대비)
--
-- 정책:
-- - refund_event_id는 credit_note에서만 의미가 있으며,
-- - 멱등성의 기준은 credit_note_refund_event_id(=refund_event_id)이다.
-- - invoice/refunded/void 여부와 무관하게 '같은 refund_event_id로 issued credit_note는 1장'이다.
-- ============================================================

USE prepmood;

-- ============================================================
-- 0. 기존 credit_note 확인
-- ============================================================
SELECT '=== 0. 기존 credit_note 확인 ===' AS info;
SELECT `type`, COUNT(*) AS cnt FROM invoices WHERE `type` = 'credit_note' GROUP BY `type`;

-- ============================================================
-- 1. refund_event_id 컬럼 추가 (없을 때만)
-- ============================================================
SELECT '=== 1. refund_event_id 컬럼 추가 (idempotent) ===' AS info;

SET @col_refund = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = 'prepmood' AND TABLE_NAME = 'invoices' AND COLUMN_NAME = 'refund_event_id'
);

SET @sql1 = IF(@col_refund = 0,
    CONCAT(
        'ALTER TABLE invoices ADD COLUMN refund_event_id VARCHAR(64) NULL ',
        'COMMENT ''credit_note 전용: 환불 이벤트 식별자 (내부 UUID v7 또는 PG refund_id, credit_note일 때만 값 있음)'' ',
        'AFTER related_invoice_id'
    ),
    'SELECT ''refund_event_id 컬럼이 이미 존재합니다.'' AS info'
);

PREPARE stmt1 FROM @sql1;
EXECUTE stmt1;
DEALLOCATE PREPARE stmt1;

-- ============================================================
-- 2. credit_note_refund_event_id generated column 추가
-- 084 패턴: 직접 ALTER TABLE (동적 SQL은 GENERATED 구문에서 구문 오류 발생)
-- 재실행 시 Duplicate column → schema_migrations failed 삭제 후 재실행 필요
-- ============================================================
SELECT '=== 2. credit_note_refund_event_id generated column 추가 ===' AS info;

ALTER TABLE invoices
ADD COLUMN credit_note_refund_event_id VARCHAR(64) NULL
    GENERATED ALWAYS AS (IF(`type` = 'credit_note', refund_event_id, NULL)) STORED
    COMMENT 'credit_note only refund_event_id else NULL'
    AFTER refund_event_id;

-- ============================================================
-- 3. UNIQUE 제약 추가 (없을 때만)
-- ============================================================
SELECT '=== 3. UNIQUE 제약 추가 (idempotent) ===' AS info;

SET @idx_uk = (
    SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = 'prepmood' AND TABLE_NAME = 'invoices' AND INDEX_NAME = 'uk_invoices_credit_note_refund_event'
);

SET @sql3 = IF(@idx_uk = 0,
    'ALTER TABLE invoices ADD UNIQUE KEY uk_invoices_credit_note_refund_event (credit_note_refund_event_id)',
    'SELECT ''uk_invoices_credit_note_refund_event 인덱스가 이미 존재합니다.'' AS info'
);

PREPARE stmt3 FROM @sql3;
EXECUTE stmt3;
DEALLOCATE PREPARE stmt3;

-- ============================================================
-- 4. 제약 확인
-- ============================================================
SELECT '=== 4. UNIQUE 제약 확인 ===' AS info;
SHOW INDEX FROM invoices WHERE Key_name = 'uk_invoices_credit_note_refund_event';

-- ============================================================
-- 참고: 기존 credit_note
-- ============================================================
-- refund_event_id NULL 유지. UNIQUE는 NULL 다수 허용.
-- 향후 생성분부터 refund_event_id 항상 채움 (코드 + Idempotency-Key)
