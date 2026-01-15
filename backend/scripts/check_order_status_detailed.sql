-- ============================================================
-- 주문 상태 상세 진단 (재고는 차감되었지만 실패한 경우)
-- 사용법: 주문 번호를 WHERE 절에 입력
-- ============================================================
USE prepmood;

-- 주문 번호 입력 (예: 'ORD-20260115-272164-5M1IMA')
SET @order_number = 'ORD-20260115-272164-5M1IMA' COLLATE utf8mb4_unicode_ci;

-- ============================================================
-- 1. 주문 기본 정보
-- ============================================================
SELECT '=== 1. 주문 기본 정보 ===' AS info;

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    o.user_id,
    o.guest_id,
    o.total_price,
    o.order_date
FROM orders o
WHERE o.order_number COLLATE utf8mb4_unicode_ci = @order_number;

-- ============================================================
-- 2. paid_events 확인 (결제 증거)
-- ============================================================
SELECT '=== 2. paid_events 확인 ===' AS info;

SELECT 
    pe.event_id,
    pe.order_id,
    pe.payment_key,
    pe.event_source,
    pe.amount,
    pe.currency,
    pe.confirmed_at,
    pe.created_at
FROM paid_events pe
WHERE pe.order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number);

-- ============================================================
-- 3. paid_event_processing 상태 확인
-- ============================================================
SELECT '=== 3. paid_event_processing 상태 ===' AS info;

SELECT 
    pep.event_id,
    pep.status as processing_status,
    pep.last_error,
    pep.processed_at,
    pep.retry_count,
    pep.created_at,
    pep.updated_at
FROM paid_event_processing pep
WHERE pep.event_id IN (
    SELECT event_id FROM paid_events 
    WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)
);

-- ============================================================
-- 4. 재고 차감 확인 (stock_units)
-- ============================================================
SELECT '=== 4. 재고 차감 확인 (stock_units) ===' AS info;

SELECT 
    su.stock_unit_id,
    su.product_id,
    su.size,
    su.color,
    su.status,
    su.reserved_at,
    su.reserved_by_order_id,
    su.token_pk
FROM stock_units su
WHERE su.reserved_by_order_id = (
    SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number
)
ORDER BY su.stock_unit_id;

-- ============================================================
-- 5. order_items 확인
-- ============================================================
SELECT '=== 5. order_items 확인 ===' AS info;

SELECT 
    oi.order_item_id,
    oi.order_id,
    oi.product_id,
    oi.size,
    oi.color,
    oi.quantity,
    oi.unit_price,
    oi.subtotal
FROM order_items oi
WHERE oi.order_id = (
    SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number
)
ORDER BY oi.order_item_id;

-- ============================================================
-- 6. order_item_units 확인 (재고 배정 후 생성되어야 함)
-- ============================================================
SELECT '=== 6. order_item_units 확인 ===' AS info;

SELECT 
    oiu.order_item_unit_id,
    oiu.order_id,
    oiu.order_item_id,
    oiu.unit_seq,
    oiu.stock_unit_id,
    oiu.token_pk,
    oiu.unit_status,
    oiu.created_at
FROM order_item_units oiu
WHERE oiu.order_id = (
    SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number
)
ORDER BY oiu.order_item_id, oiu.unit_seq;

-- ============================================================
-- 7. warranties 확인 (보증서 생성 여부)
-- ============================================================
SELECT '=== 7. warranties 확인 ===' AS info;

SELECT 
    w.id as warranty_id,
    w.source_order_item_unit_id,
    w.token_pk,
    w.owner_user_id,
    w.status,
    w.created_at,
    w.revoked_at
FROM warranties w
WHERE w.source_order_item_unit_id IN (
    SELECT order_item_unit_id FROM order_item_units 
    WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)
)
ORDER BY w.id;

-- ============================================================
-- 8. invoices 확인 (인보이스 생성 여부)
-- ============================================================
SELECT '=== 8. invoices 확인 ===' AS info;

SELECT 
    inv.invoice_id,
    inv.order_id,
    inv.invoice_number,
    inv.status,
    inv.issued_at
FROM invoices inv
WHERE inv.order_id = (
    SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number
)
ORDER BY inv.invoice_id;

-- ============================================================
-- 9. order_stock_issues 확인 (재고 부족 이슈 기록)
-- ============================================================
SELECT '=== 9. order_stock_issues 확인 ===' AS info;

SELECT 
    osi.issue_id,
    osi.event_id,
    osi.order_id,
    osi.product_id,
    osi.required_qty,
    osi.available_qty,
    osi.status,
    osi.resolved_at,
    osi.resolution_note,
    osi.created_at
FROM order_stock_issues osi
WHERE osi.order_id = (
    SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number
)
ORDER BY osi.issue_id;

-- ============================================================
-- 10. 단계별 성공/실패 요약
-- ============================================================
SELECT '=== 10. 단계별 성공/실패 요약 ===' AS info;

SELECT 
    '재고 차감' AS step,
    CASE 
        WHEN (SELECT COUNT(*) FROM stock_units 
              WHERE reserved_by_order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)) > 0 
        THEN '✅ 성공' 
        ELSE '❌ 실패' 
    END AS status,
    (SELECT COUNT(*) FROM stock_units 
     WHERE reserved_by_order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)) AS count
UNION ALL
SELECT 
    'order_item_units 생성' AS step,
    CASE 
        WHEN (SELECT COUNT(*) FROM order_item_units 
              WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)) > 0 
        THEN '✅ 성공' 
        ELSE '❌ 실패' 
    END AS status,
    (SELECT COUNT(*) FROM order_item_units 
     WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)) AS count
UNION ALL
SELECT 
    'warranties 생성' AS step,
    CASE 
        WHEN (SELECT COUNT(*) FROM warranties 
              WHERE source_order_item_unit_id IN (
                  SELECT order_item_unit_id FROM order_item_units 
                  WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)
              )) > 0 
        THEN '✅ 성공' 
        ELSE '❌ 실패' 
    END AS status,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units 
         WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)
     )) AS count
UNION ALL
SELECT 
    'invoices 생성' AS step,
    CASE 
        WHEN (SELECT COUNT(*) FROM invoices 
              WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)) > 0 
        THEN '✅ 성공' 
        ELSE '❌ 실패' 
    END AS status,
    (SELECT COUNT(*) FROM invoices 
     WHERE order_id = (SELECT order_id FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number)) AS count
UNION ALL
SELECT 
    'orders.paid_at 업데이트' AS step,
    CASE 
        WHEN (SELECT paid_at FROM orders WHERE order_number COLLATE utf8mb4_unicode_ci = @order_number) IS NOT NULL 
        THEN '✅ 성공' 
        ELSE '❌ 실패' 
    END AS status,
    NULL AS count;
