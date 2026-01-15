-- ============================================================
-- paid_events가 없는 주문에 대해 paid_events 생성
-- ============================================================
USE prepmood;

-- ============================================================
-- 1. paid_events가 없는 주문 목록 확인
-- ============================================================
SELECT '=== 1. paid_events가 없는 주문 목록 ===' AS info;

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    p.payment_id,
    p.payment_key,
    p.status as payment_status,
    p.amount,
    p.currency,
    p.created_at as payment_created_at
FROM orders o
JOIN payments p ON o.order_number = p.order_number
WHERE o.status = 'processing'
  AND o.paid_at IS NULL
  AND p.status = 'captured'
  AND NOT EXISTS (
      SELECT 1 FROM paid_events WHERE order_id = o.order_id
  )
ORDER BY o.order_id DESC;

-- ============================================================
-- 2. 수동으로 paid_events 생성 (예시 - 주문 61)
-- ============================================================
-- 주의: 실제로는 Node.js 스크립트로 createPaidEvent() 함수를 호출해야 함
-- 이 SQL은 참고용으로만 사용

-- 예시: 주문 61에 대한 paid_events 생성
-- INSERT INTO paid_events 
-- (order_id, payment_key, event_source, amount, currency, raw_payload_json, created_at)
-- SELECT 
--     o.order_id,
--     p.payment_key,
--     'manual_fix' as event_source,
--     p.amount,
--     p.currency,
--     p.payload_json,
--     NOW()
-- FROM orders o
-- JOIN payments p ON o.order_number = p.order_number
-- WHERE o.order_id = 61
--   AND NOT EXISTS (SELECT 1 FROM paid_events WHERE order_id = o.order_id)
-- LIMIT 1;

-- ============================================================
-- 3. paid_event_processing 생성 (paid_events 생성 후)
-- ============================================================
-- INSERT INTO paid_event_processing 
-- (event_id, status, created_at, updated_at)
-- SELECT 
--     pe.event_id,
--     'pending' as status,
--     NOW(),
--     NOW()
-- FROM paid_events pe
-- WHERE pe.order_id = 61
--   AND NOT EXISTS (SELECT 1 FROM paid_event_processing WHERE event_id = pe.event_id)
-- LIMIT 1;
