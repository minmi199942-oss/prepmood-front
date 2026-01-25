-- ============================================================
-- 085_add_invoices_refund_event_id_unique.sql
-- Credit Note 식별자 (환불 이벤트 중복 방지)
-- A안: generated column + UNIQUE (MySQL NULL 동작 회피)
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
SELECT '=== 기존 credit_note 확인 ===' AS info;
SELECT type, COUNT(*) AS cnt FROM invoices WHERE type = 'credit_note' GROUP BY type;

-- ============================================================
-- 1. 컬럼 추가 (실컬럼)
-- ============================================================
SELECT '=== 1. refund_event_id 컬럼 추가 ===' AS info;

ALTER TABLE invoices
ADD COLUMN refund_event_id VARCHAR(64) NULL
    COMMENT 'credit_note 전용: 환불 이벤트 식별자 (내부 UUID v7 또는 PG refund_id, credit_note일 때만 값 있음)'
    AFTER related_invoice_id;

-- ============================================================
-- 2. Generated column 추가 (부분 유니크용)
-- ============================================================
SELECT '=== 2. credit_note_refund_event_id generated column 추가 ===' AS info;

ALTER TABLE invoices
ADD COLUMN credit_note_refund_event_id VARCHAR(64) NULL
    GENERATED ALWAYS AS (IF(type = 'credit_note', refund_event_id, NULL)) STORED
    COMMENT 'credit_note 시 refund_event_id, 아니면 NULL (UNIQUE용)'
    AFTER refund_event_id;

-- ============================================================
-- 3. UNIQUE 제약 (credit_note 한정)
-- ============================================================
SELECT '=== 3. UNIQUE 제약 추가 ===' AS info;

ALTER TABLE invoices
ADD UNIQUE KEY uk_invoices_credit_note_refund_event (credit_note_refund_event_id);

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

-- ============================================================
-- 정책 명시
-- ============================================================
-- refund_event_id는 credit_note에서만 의미가 있으며,
-- 멱등성의 기준은 credit_note_refund_event_id(=refund_event_id)이다.
-- invoice/refunded/void 여부와 무관하게 '같은 refund_event_id로 issued credit_note는 1장'이다.
