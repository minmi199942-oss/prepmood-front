-- ============================================================
-- 주문 56 수동 처리 스크립트
-- ============================================================
-- 
-- 사용 시나리오:
-- 1. paid_events가 없어서 processPaidOrder()가 실행되지 않은 경우
-- 2. 결제는 완료되었지만 주문 처리가 안 된 경우
--
-- 주의: 이미 처리된 경우 중복 처리될 수 있으므로 주의
-- ============================================================

USE prepmood;

-- ============================================================
-- 1. 현재 상태 확인
-- ============================================================
SELECT '=== 1. 현재 상태 확인 ===' AS info;

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    o.total_price,
    p.payment_key,
    p.status as payment_status,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = 56) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = 56) as order_item_units_count,
    (SELECT COUNT(*) FROM warranties WHERE source_order_item_unit_id IN (
        SELECT order_item_unit_id FROM order_item_units WHERE order_id = 56
    )) as warranties_count
FROM orders o
LEFT JOIN payments p ON o.order_number = p.order_number
WHERE o.order_id = 56;

-- ============================================================
-- 2. paid_events 수동 생성 (이미 있으면 스킵)
-- ============================================================
SELECT '=== 2. paid_events 수동 생성 ===' AS info;

-- 기존 paid_events 확인
SELECT 
    event_id,
    order_id,
    payment_key,
    event_source,
    created_at
FROM paid_events
WHERE order_id = 56;

-- paid_events 생성 (이미 있으면 에러 발생, 무시)
INSERT IGNORE INTO paid_events 
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

-- 생성된 paid_events 확인
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
-- 3. paid_event_processing 생성 (이미 있으면 스킵)
-- ============================================================
SELECT '=== 3. paid_event_processing 생성 ===' AS info;

-- paid_event_processing 생성
INSERT IGNORE INTO paid_event_processing 
    (event_id, status, created_at, updated_at)
SELECT 
    pe.event_id,
    'pending',
    NOW(),
    NOW()
FROM paid_events pe
WHERE pe.order_id = 56
  AND NOT EXISTS (
      SELECT 1 FROM paid_event_processing pep WHERE pep.event_id = pe.event_id
  );

-- 생성된 paid_event_processing 확인
SELECT 
    pep.event_id,
    pep.status,
    pep.last_error,
    pep.processed_at
FROM paid_event_processing pep
JOIN paid_events pe ON pep.event_id = pe.event_id
WHERE pe.order_id = 56;

-- ============================================================
-- 4. 다음 단계 안내
-- ============================================================
SELECT '=== 4. 다음 단계 ===' AS info;

SELECT 
    CONCAT(
        'paid_events 생성 완료. ',
        '이제 Node.js 스크립트로 processPaidOrder()를 실행하거나, ',
        '백엔드 API를 통해 수동 처리해야 합니다.'
    ) AS next_step;
