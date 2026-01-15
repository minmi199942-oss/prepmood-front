-- ============================================================
-- 주문 56 현재 상태 확인 (간단 버전)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. paid_events 확인
-- ============================================================
SELECT '=== 1. paid_events 확인 ===' AS info;

SELECT 
    event_id,
    order_id,
    payment_key,
    event_source,
    amount,
    currency,
    created_at
FROM paid_events
WHERE order_id = 56;

-- ============================================================
-- 2. paid_event_processing 확인
-- ============================================================
SELECT '=== 2. paid_event_processing 확인 ===' AS info;

SELECT 
    pep.event_id,
    pep.status,
    pep.last_error,
    pep.processed_at,
    pep.retry_count,
    pe.order_id,
    pe.payment_key
FROM paid_event_processing pep
JOIN paid_events pe ON pep.event_id = pe.event_id
WHERE pe.order_id = 56;

-- ============================================================
-- 3. order_item_units 확인
-- ============================================================
SELECT '=== 3. order_item_units 확인 ===' AS info;

SELECT 
    order_item_unit_id,
    order_item_id,
    order_id,
    unit_seq,
    stock_unit_id,
    token_pk,
    unit_status
FROM order_item_units
WHERE order_id = 56;

-- ============================================================
-- 4. warranties 확인
-- ============================================================
SELECT '=== 4. warranties 확인 ===' AS info;

SELECT 
    w.id as warranty_id,
    w.public_id,
    w.status,
    w.owner_user_id,
    w.source_order_item_unit_id,
    w.token_pk,
    w.created_at
FROM warranties w
WHERE w.source_order_item_unit_id IN (
    SELECT order_item_unit_id 
    FROM order_item_units 
    WHERE order_id = 56
);

-- ============================================================
-- 5. invoices 확인
-- ============================================================
SELECT '=== 5. invoices 확인 ===' AS info;

SELECT 
    invoice_id,
    invoice_number,
    order_id,
    status,
    total_amount,
    issued_at
FROM invoices
WHERE order_id = 56;

-- ============================================================
-- 6. orders.paid_at 확인
-- ============================================================
SELECT '=== 6. orders.paid_at 확인 ===' AS info;

SELECT 
    order_id,
    order_number,
    status,
    paid_at
FROM orders
WHERE order_id = 56;
