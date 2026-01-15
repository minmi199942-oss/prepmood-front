-- ============================================================
-- 주문 후처리 파이프라인 상태 확인
-- GPT 분석 결과 기반: 주문 완료 후 보증서/인보이스/재고 배정이 안 되는 문제 진단
-- ============================================================
USE prepmood;

-- ============================================================
-- 1. 문제가 있는 주문 목록 (processing 상태인데 paid_at이 NULL)
-- ============================================================
SELECT '=== 1. 문제가 있는 주문 목록 ===' AS info;

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    o.order_date,
    o.user_id,
    o.total_price,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT status FROM paid_event_processing 
     WHERE event_id = (SELECT event_id FROM paid_events WHERE order_id = o.order_id LIMIT 1)) as processing_status,
    (SELECT last_error FROM paid_event_processing 
     WHERE event_id = (SELECT event_id FROM paid_events WHERE order_id = o.order_id LIMIT 1)) as last_error,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
     )) as warranties_count,
    (SELECT COUNT(*) FROM invoices WHERE order_id = o.order_id) as invoices_count,
    (SELECT COUNT(*) FROM order_stock_issues WHERE order_id = o.order_id) as stock_issues_count
FROM orders o
WHERE o.status = 'processing' AND o.paid_at IS NULL
ORDER BY o.order_id DESC
LIMIT 10;

-- ============================================================
-- 2. paid_events가 없는 주문 (파이프라인 시작 안 됨)
-- ============================================================
SELECT '=== 2. paid_events가 없는 주문 ===' AS info;

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    o.order_date,
    (SELECT COUNT(*) FROM payments WHERE order_number = o.order_number) as payments_count,
    (SELECT status FROM payments WHERE order_number = o.order_number ORDER BY created_at DESC LIMIT 1) as payment_status
FROM orders o
WHERE o.status IN ('processing', 'pending') 
  AND o.paid_at IS NULL
  AND NOT EXISTS (
      SELECT 1 FROM paid_events WHERE order_id = o.order_id
  )
ORDER BY o.order_id DESC
LIMIT 10;

-- ============================================================
-- 3. paid_event_processing 상태 확인 (pending/failed)
-- ============================================================
SELECT '=== 3. paid_event_processing 상태 확인 ===' AS info;

SELECT 
    pep.event_id,
    pep.status,
    pep.last_error,
    pep.retry_count,
    pep.processed_at,
    pep.created_at,
    pe.order_id,
    o.order_number,
    o.status as order_status,
    o.paid_at
FROM paid_event_processing pep
JOIN paid_events pe ON pep.event_id = pe.event_id
JOIN orders o ON pe.order_id = o.order_id
WHERE pep.status IN ('pending', 'failed')
ORDER BY pep.created_at DESC
LIMIT 10;

-- ============================================================
-- 4. order_stock_issues 확인 (재고 배정 실패 기록)
-- ============================================================
SELECT '=== 4. order_stock_issues 확인 ===' AS info;

SELECT 
    osi.issue_id,
    osi.order_id,
    osi.event_id,
    osi.product_id,
    osi.required_qty,
    osi.available_qty,
    osi.status,
    osi.resolution_note,
    osi.created_at,
    o.order_number,
    o.status as order_status
FROM order_stock_issues osi
JOIN orders o ON osi.order_id = o.order_id
WHERE osi.status = 'open'
ORDER BY osi.created_at DESC
LIMIT 10;

-- ============================================================
-- 5. 최근 주문들의 후처리 파이프라인 상태 요약
-- ============================================================
SELECT '=== 5. 최근 주문들의 후처리 파이프라인 상태 요약 ===' AS info;

SELECT 
    o.order_id,
    o.order_number,
    o.status,
    o.paid_at,
    CASE 
        WHEN NOT EXISTS (SELECT 1 FROM paid_events WHERE order_id = o.order_id) THEN '❌ paid_events 없음'
        WHEN EXISTS (
            SELECT 1 FROM paid_event_processing pep
            JOIN paid_events pe ON pep.event_id = pe.event_id
            WHERE pe.order_id = o.order_id AND pep.status = 'pending'
        ) THEN '⚠️ processing pending'
        WHEN EXISTS (
            SELECT 1 FROM paid_event_processing pep
            JOIN paid_events pe ON pep.event_id = pe.event_id
            WHERE pe.order_id = o.order_id AND pep.status = 'failed'
        ) THEN '❌ processing failed'
        WHEN NOT EXISTS (SELECT 1 FROM order_item_units WHERE order_id = o.order_id) THEN '⚠️ order_item_units 없음'
        WHEN NOT EXISTS (
            SELECT 1 FROM warranties 
            WHERE source_order_item_unit_id IN (
                SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
            )
        ) THEN '⚠️ warranties 없음'
        WHEN NOT EXISTS (SELECT 1 FROM invoices WHERE order_id = o.order_id) THEN '⚠️ invoices 없음'
        ELSE '✅ 정상'
    END as pipeline_status,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
     )) as warranties_count,
    (SELECT COUNT(*) FROM invoices WHERE order_id = o.order_id) as invoices_count
FROM orders o
WHERE o.status = 'processing'
ORDER BY o.order_id DESC
LIMIT 20;
