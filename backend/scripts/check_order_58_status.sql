-- ============================================================
-- 주문 58 상태 확인 (문제 진단용)
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 주문 기본 정보
-- ============================================================
SELECT '=== 1. 주문 기본 정보 ===' AS info;

SELECT 
    order_id,
    order_number,
    status,
    paid_at,
    user_id,
    total_price,
    order_date
FROM orders
WHERE order_id = 58;

-- ============================================================
-- 2. 결제 정보 확인 (payments 테이블)
-- ============================================================
SELECT '=== 2. 결제 정보 확인 (payments) ===' AS info;

SELECT 
    payment_id,
    order_number,
    gateway,
    payment_key,
    status as payment_status,
    amount,
    currency,
    created_at
FROM payments
WHERE order_number = (SELECT order_number FROM orders WHERE order_id = 58)
ORDER BY created_at DESC;

-- ============================================================
-- 3. paid_events 확인
-- ============================================================
SELECT '=== 3. paid_events 확인 ===' AS info;

SELECT 
    event_id,
    order_id,
    payment_key,
    event_source,
    amount,
    currency,
    created_at
FROM paid_events
WHERE order_id = 58;

-- ============================================================
-- 4. paid_event_processing 확인
-- ============================================================
SELECT '=== 4. paid_event_processing 확인 ===' AS info;

SELECT 
    pep.event_id,
    pep.status,
    pep.last_error,
    pep.processed_at,
    pep.retry_count,
    pe.order_id
FROM paid_event_processing pep
JOIN paid_events pe ON pep.event_id = pe.event_id
WHERE pe.order_id = 58;

-- ============================================================
-- 5. order_items 확인
-- ============================================================
SELECT '=== 5. order_items 확인 ===' AS info;

SELECT 
    order_item_id,
    order_id,
    product_id,
    quantity,
    size,
    color
FROM order_items
WHERE order_id = 58;

-- ============================================================
-- 6. order_item_units 확인
-- ============================================================
SELECT '=== 6. order_item_units 확인 ===' AS info;

SELECT 
    order_item_unit_id,
    order_id,
    order_item_id,
    stock_unit_id,
    token_pk,
    unit_status
FROM order_item_units
WHERE order_id = 58;

-- ============================================================
-- 7. warranties 확인
-- ============================================================
SELECT '=== 7. warranties 확인 ===' AS info;

SELECT 
    id,
    public_id,
    status,
    owner_user_id,
    token_pk,
    source_order_item_unit_id,
    created_at
FROM warranties
WHERE source_order_item_unit_id IN (
    SELECT order_item_unit_id FROM order_item_units WHERE order_id = 58
);

-- ============================================================
-- 8. invoices 확인
-- ============================================================
SELECT '=== 8. invoices 확인 ===' AS info;

SELECT 
    invoice_id,
    invoice_number,
    order_id,
    status,
    total_amount,
    issued_at
FROM invoices
WHERE order_id = 58;

-- ============================================================
-- 9. 재고 상태 확인 (order_items의 product_id 기준)
-- ============================================================
SELECT '=== 9. 재고 상태 확인 ===' AS info;

SELECT 
    su.stock_unit_id,
    su.product_id,
    su.size,
    su.color,
    su.status,
    su.reserved_by_order_id,
    su.reserved_at,
    su.sold_at
FROM stock_units su
WHERE su.product_id IN (
    SELECT product_id FROM order_items WHERE order_id = 58
)
ORDER BY su.stock_unit_id;
