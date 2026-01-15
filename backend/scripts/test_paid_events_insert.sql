-- ============================================================
-- paid_events INSERT 테스트 스크립트
-- ============================================================
-- 주문 56에 대한 paid_events INSERT를 직접 테스트하여 에러 원인 파악

USE prepmood;

-- ============================================================
-- 1. 주문 56 정보 확인
-- ============================================================
SELECT '=== 1. 주문 56 정보 ===' AS info;

SELECT 
    order_id,
    order_number,
    status,
    total_price
FROM orders
WHERE order_id = 56;

-- ============================================================
-- 2. 결제 정보 확인
-- ============================================================
SELECT '=== 2. 결제 정보 ===' AS info;

SELECT 
    payment_id,
    order_number,
    payment_key,
    status,
    amount,
    currency
FROM payments
WHERE order_number = (SELECT order_number FROM orders WHERE order_id = 56)
  AND status = 'captured';

-- ============================================================
-- 3. 기존 paid_events 확인
-- ============================================================
SELECT '=== 3. 기존 paid_events 확인 ===' AS info;

SELECT 
    event_id,
    order_id,
    payment_key,
    event_source,
    created_at
FROM paid_events
WHERE order_id = 56;

-- ============================================================
-- 4. paid_events INSERT 테스트 (에러 확인)
-- ============================================================
SELECT '=== 4. paid_events INSERT 테스트 ===' AS info;

-- INSERT 시도 (에러가 발생하면 메시지 확인)
INSERT INTO paid_events 
    (order_id, payment_key, event_source, amount, currency, raw_payload_json, confirmed_at, created_at)
SELECT 
    56,
    p.payment_key,
    'manual_verify',
    p.amount,
    p.currency,
    p.payload_json,
    NOW(),
    NOW()
FROM payments p
WHERE p.order_number = (SELECT order_number FROM orders WHERE order_id = 56)
  AND p.status = 'captured'
LIMIT 1;

-- ============================================================
-- 5. INSERT 결과 확인
-- ============================================================
SELECT '=== 5. INSERT 결과 확인 ===' AS info;

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
