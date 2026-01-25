-- ============================================================
-- 084_add_invoices_invoice_order_id_unique.sql
-- A안: invoice만 주문당 1장 강제 (credit_note 1:N 유지)
-- 정책 A 확정: invoice는 주문당 1장만 존재 (issued/void/refunded 무관)
-- - invoice_order_id generated column (status 무관)
-- - UNIQUE(invoice_order_id)
-- ============================================================

USE prepmood;

-- ============================================================
-- 0. type='invoice' 전체 중복 점검 (UNIQUE 적용 전 필수)
-- 정책 A 확정: invoice는 주문당 1장만 존재 (issued/void/refunded 무관)
-- 결과가 있으면 UNIQUE 추가 실패. 정리 필요.
-- ============================================================
SELECT '=== type=invoice 전체 중복 점검 (필수, 정책 A) ===' AS info;
SELECT order_id, COUNT(*) AS cnt
FROM invoices
WHERE type = 'invoice'
GROUP BY order_id
HAVING cnt > 1;
-- 0건이면 진행. 있으면 아래 정리 쿼리로 type='invoice' 전체에서 최신 1건만 남기기.

-- ============================================================
-- 1. 중복 invoice 확인 (issued 기준)
-- ============================================================
SELECT '=== 중복 invoice 확인 (issued) ===' AS info;
SELECT order_id, type, COUNT(*) AS cnt
FROM invoices
WHERE type = 'invoice' AND status = 'issued'
GROUP BY order_id, type
HAVING cnt > 1;

-- ============================================================
-- 2. 정리 전 상태 확인
-- ============================================================
SELECT '=== 정리 전 상태 ===' AS info;
SELECT
    order_id,
    COUNT(*) AS total_count,
    SUM(CASE WHEN status = 'issued' THEN 1 ELSE 0 END) AS issued_count,
    SUM(CASE WHEN status = 'void' THEN 1 ELSE 0 END) AS void_count,
    SUM(CASE WHEN status = 'refunded' THEN 1 ELSE 0 END) AS refunded_count
FROM invoices
WHERE type = 'invoice'
GROUP BY order_id
HAVING COUNT(*) > 1;

-- ============================================================
-- 3. 중복 invoice 정리 (MySQL 8.0+ 윈도우 함수)
-- 정책 A: type='invoice' 전체에서 최신 1건만 남기기 (issued/void/refunded 무관)
-- ⚠️ 치명적 문제: UPDATE로 status='void'만 바꾸면 generated column 값이 동일하게 유지되어 UNIQUE 추가 실패
-- 해결: 중복 행을 DELETE (또는 archive 이관 후 DELETE)
-- 순서: (A) 유지할 invoice_id 결정 → (B) credit_note 리맵 → (C) 삭제 → (D) UNIQUE 추가
-- ============================================================

-- 3-1. 유지할 invoice_id 결정 (TEMP TABLE 사용, CTE+UPDATE 호환성 회피)
CREATE TEMPORARY TABLE IF NOT EXISTS invoice_keep AS
SELECT
    invoice_id AS keep_invoice_id,
    order_id
FROM (
    SELECT
        invoice_id,
        order_id,
        ROW_NUMBER() OVER (
            PARTITION BY order_id
            ORDER BY (issued_at IS NULL) ASC, issued_at DESC, invoice_id DESC
        ) AS rn
    FROM invoices
    WHERE type = 'invoice'
) ranked
WHERE rn = 1;

-- 3-2. credit_note의 related_invoice_id를 keep_invoice_id로 리맵
-- "삭제될 invoice_id"를 참조하는 credit_note만 대상
UPDATE invoices cn
INNER JOIN invoice_keep ik ON cn.related_invoice_id IS NOT NULL
INNER JOIN invoices del_inv ON del_inv.invoice_id = cn.related_invoice_id
    AND del_inv.type = 'invoice'
    AND del_inv.order_id = ik.order_id
    AND del_inv.invoice_id != ik.keep_invoice_id
SET
    cn.related_invoice_id = ik.keep_invoice_id
WHERE cn.type = 'credit_note';

-- 3-3. rn>1 invoice 행 삭제 (정책 A: 주문당 1장만 존재)
DELETE i
FROM invoices i
INNER JOIN (
    SELECT
        invoice_id,
        order_id,
        ROW_NUMBER() OVER (
            PARTITION BY order_id
            ORDER BY (issued_at IS NULL) ASC, issued_at DESC, invoice_id DESC
        ) AS rn
    FROM invoices
    WHERE type = 'invoice'
) ranked ON i.invoice_id = ranked.invoice_id
WHERE ranked.rn > 1;

-- 3-4. TEMP TABLE 정리
DROP TEMPORARY TABLE IF EXISTS invoice_keep;

-- ============================================================
-- 4. 정리 후 확인 (정책 A: type='invoice' 전체)
-- ============================================================
SELECT '=== 정리 후 확인 (type=invoice 전체) ===' AS info;
SELECT order_id, COUNT(*) AS cnt
FROM invoices
WHERE type = 'invoice'
GROUP BY order_id
HAVING cnt > 1;
-- 기대: 0건 (정책 A: 주문당 invoice 1장만 존재)

-- ============================================================
-- 5. Generated column 추가 (A안, 정책 A)
-- invoice일 때만 order_id, 아니면 NULL (status 무관)
-- ============================================================
ALTER TABLE invoices
ADD COLUMN invoice_order_id INT NULL
    GENERATED ALWAYS AS (IF(type = 'invoice', order_id, NULL)) STORED
    COMMENT 'invoice 전용: 주문당 1장 강제 (정책 A: type=invoice일 때만 order_id, status 무관, credit_note는 NULL)'
    AFTER order_id;

-- ============================================================
-- 6. UNIQUE(invoice_order_id) 추가 (정책 A)
-- invoice만 중복 방지 (status 무관), credit_note는 NULL이라 1:N 허용
-- ============================================================
ALTER TABLE invoices
ADD UNIQUE KEY uk_invoices_invoice_order_id (invoice_order_id);

-- ============================================================
-- 7. 제약 확인
-- ============================================================
SELECT '=== UNIQUE 제약 확인 ===' AS info;
SHOW INDEX FROM invoices WHERE Key_name = 'uk_invoices_invoice_order_id';
