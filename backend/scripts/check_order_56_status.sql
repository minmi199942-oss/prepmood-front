-- ============================================================
-- 주문 56 상태 확인 및 디버깅
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
    total_price
FROM orders
WHERE order_id = 56;

-- orders 테이블 실제 구조 확인
SELECT 
    COLUMN_NAME,
    COLUMN_TYPE,
    IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = 'prepmood'
  AND TABLE_NAME = 'orders'
ORDER BY ORDINAL_POSITION;

-- ============================================================
-- 2. 결제 정보 확인
-- ============================================================
SELECT '=== 2. 결제 정보 확인 ===' AS info;

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
WHERE order_number = (
    SELECT order_number FROM orders WHERE order_id = 56
)
ORDER BY created_at DESC;

-- ============================================================
-- 3. paid_events 확인
-- ============================================================
SELECT '=== 3. paid_events 확인 ===' AS info;

SELECT 
    event_id,
    order_id,
    payment_key,
    amount,
    currency,
    event_source,
    confirmed_at,
    raw_payload_json,
    created_at
FROM paid_events
WHERE order_id = 56
ORDER BY created_at DESC;

-- ============================================================
-- 4. order_items 확인
-- ============================================================
SELECT '=== 4. order_items 확인 ===' AS info;

SELECT 
    order_item_id,
    order_id,
    product_id,
    quantity,
    unit_price,
    subtotal
FROM order_items
WHERE order_id = 56;

-- ============================================================
-- 5. order_item_units 확인
-- ============================================================
SELECT '=== 5. order_item_units 확인 ===' AS info;

SELECT 
    order_item_unit_id,
    order_item_id,
    unit_seq,
    stock_unit_id,
    token_pk,
    unit_status
FROM order_item_units
WHERE order_item_id IN (
    SELECT order_item_id FROM order_items WHERE order_id = 56
);

-- ============================================================
-- 6. stock_units 확인 (재고 배정 여부)
-- ============================================================
SELECT '=== 6. stock_units 확인 ===' AS info;

SELECT 
    stock_unit_id,
    product_id,
    token_pk,
    status,
    reserved_at,
    reserved_by_order_id,
    sold_at
FROM stock_units
WHERE reserved_by_order_id = 56
   OR stock_unit_id IN (
       SELECT stock_unit_id 
       FROM order_item_units 
       WHERE order_item_id IN (
           SELECT order_item_id FROM order_items WHERE order_id = 56
       )
   );

-- ============================================================
-- 7. warranties 확인 (보증서 생성 여부)
-- ============================================================
SELECT '=== 7. warranties 확인 ===' AS info;

SELECT 
    w.id as warranty_id,
    w.public_id,
    w.status,
    w.owner_user_id,
    w.source_order_item_unit_id,
    w.token_pk,
    w.created_at,
    tm.token
FROM warranties w
JOIN token_master tm ON w.token_pk = tm.token_pk
WHERE w.source_order_item_unit_id IN (
    SELECT order_item_unit_id 
    FROM order_item_units 
    WHERE order_item_id IN (
        SELECT order_item_id FROM order_items WHERE order_id = 56
    )
);

-- ============================================================
-- 8. invoices 확인 (인보이스 생성 여부)
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
WHERE order_id = 56;

-- ============================================================
-- 9. paid_event_processing 확인 (처리 상태)
-- ============================================================
SELECT '=== 9. paid_event_processing 확인 ===' AS info;

SELECT 
    pep.event_id,
    pep.status as processing_status,
    pep.last_error,
    pep.processed_at,
    pep.retry_count,
    pep.created_at,
    pe.order_id,
    pe.payment_key
FROM paid_event_processing pep
JOIN paid_events pe ON pep.event_id = pe.event_id
WHERE pe.order_id = 56
ORDER BY pep.created_at DESC;
