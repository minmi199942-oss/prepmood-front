-- Phase -1 검증 스크립트: orders.status 직접 업데이트 제거 확인
-- 
-- 검증 항목:
-- 1. orders.status가 집계 함수로만 갱신되는지 확인
-- 2. 관리자 API 제거 확인 (코드 레벨에서 확인 완료)
-- 3. 실제 주문 상태가 올바르게 집계되는지 확인

-- ============================================
-- 1. 최근 주문들의 상태와 집계 기준 확인
-- ============================================
SELECT 
    o.order_id,
    o.order_number,
    o.status as orders_status,
    o.paid_at,
    COUNT(DISTINCT pe.event_id) as paid_events_count,
    COUNT(DISTINCT oiu.order_item_unit_id) as unit_count,
    COUNT(DISTINCT CASE WHEN oiu.unit_status = 'reserved' THEN oiu.order_item_unit_id END) as reserved_count,
    COUNT(DISTINCT CASE WHEN oiu.unit_status = 'shipped' THEN oiu.order_item_unit_id END) as shipped_count,
    COUNT(DISTINCT CASE WHEN oiu.unit_status = 'delivered' THEN oiu.order_item_unit_id END) as delivered_count,
    COUNT(DISTINCT CASE WHEN oiu.unit_status = 'refunded' THEN oiu.order_item_unit_id END) as refunded_count,
    -- 집계 규칙에 따른 예상 상태 계산
    CASE 
        WHEN COUNT(DISTINCT pe.event_id) = 0 AND o.paid_at IS NULL THEN 'pending'
        WHEN COUNT(DISTINCT oiu.order_item_unit_id) = 0 THEN 
            CASE WHEN COUNT(DISTINCT pe.event_id) > 0 OR o.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END
        WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'refunded' THEN oiu.order_item_unit_id END) = COUNT(DISTINCT oiu.order_item_unit_id) 
            AND COUNT(DISTINCT oiu.order_item_unit_id) > 0 THEN 'refunded'
        WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'delivered' THEN oiu.order_item_unit_id END) = COUNT(DISTINCT oiu.order_item_unit_id) 
            AND COUNT(DISTINCT oiu.order_item_unit_id) > 0 THEN 'delivered'
        WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'delivered' THEN oiu.order_item_unit_id END) > 0 THEN 'partial_delivered'
        WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'shipped' THEN oiu.order_item_unit_id END) = COUNT(DISTINCT oiu.order_item_unit_id) 
            AND COUNT(DISTINCT oiu.order_item_unit_id) > 0 THEN 'shipped'
        WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'shipped' THEN oiu.order_item_unit_id END) > 0 THEN 'partial_shipped'
        ELSE 'paid'
    END as expected_status,
    -- 실제 상태와 예상 상태 일치 여부
    CASE 
        WHEN o.status = CASE 
            WHEN COUNT(DISTINCT pe.event_id) = 0 AND o.paid_at IS NULL THEN 'pending'
            WHEN COUNT(DISTINCT oiu.order_item_unit_id) = 0 THEN 
                CASE WHEN COUNT(DISTINCT pe.event_id) > 0 OR o.paid_at IS NOT NULL THEN 'paid' ELSE 'pending' END
            WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'refunded' THEN oiu.order_item_unit_id END) = COUNT(DISTINCT oiu.order_item_unit_id) 
                AND COUNT(DISTINCT oiu.order_item_unit_id) > 0 THEN 'refunded'
            WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'delivered' THEN oiu.order_item_unit_id END) = COUNT(DISTINCT oiu.order_item_unit_id) 
                AND COUNT(DISTINCT oiu.order_item_unit_id) > 0 THEN 'delivered'
            WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'delivered' THEN oiu.order_item_unit_id END) > 0 THEN 'partial_delivered'
            WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'shipped' THEN oiu.order_item_unit_id END) = COUNT(DISTINCT oiu.order_item_unit_id) 
                AND COUNT(DISTINCT oiu.order_item_unit_id) > 0 THEN 'shipped'
            WHEN COUNT(DISTINCT CASE WHEN oiu.unit_status = 'shipped' THEN oiu.order_item_unit_id END) > 0 THEN 'partial_shipped'
            ELSE 'paid'
        END THEN '✅ 일치'
        ELSE '❌ 불일치'
    END as status_match
FROM orders o
LEFT JOIN paid_events pe ON o.order_id = pe.order_id
LEFT JOIN order_item_units oiu ON o.order_id = oiu.order_id
WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY o.order_id, o.order_number, o.status, o.paid_at
ORDER BY o.order_date DESC
LIMIT 20;

-- ============================================
-- 2. 상태 불일치 주문 확인 (있다면 문제)
-- ============================================
SELECT 
    o.order_id,
    o.order_number,
    o.status as current_status,
    o.paid_at,
    COUNT(DISTINCT pe.event_id) as paid_events_count,
    COUNT(DISTINCT oiu.order_item_unit_id) as unit_count,
    GROUP_CONCAT(DISTINCT oiu.unit_status ORDER BY oiu.unit_status) as unit_statuses
FROM orders o
LEFT JOIN paid_events pe ON o.order_id = pe.order_id
LEFT JOIN order_item_units oiu ON o.order_id = oiu.order_id
WHERE o.order_date >= DATE_SUB(NOW(), INTERVAL 7 DAY)
GROUP BY o.order_id, o.order_number, o.status, o.paid_at
HAVING 
    -- paid_events가 있는데 status가 pending인 경우
    (COUNT(DISTINCT pe.event_id) > 0 OR o.paid_at IS NOT NULL) AND o.status = 'pending'
    OR
    -- paid_events가 없는데 status가 paid 이상인 경우
    (COUNT(DISTINCT pe.event_id) = 0 AND o.paid_at IS NULL) AND o.status IN ('paid', 'processing', 'shipped', 'delivered')
ORDER BY o.order_date DESC;

-- ============================================
-- 3. 최근 paid_events 생성 후 orders.status 갱신 확인
-- ============================================
SELECT 
    pe.event_id,
    pe.order_id,
    o.order_number,
    o.status as orders_status,
    pe.created_at as paid_event_created,
    o.updated_at as orders_updated,
    TIMESTAMPDIFF(SECOND, pe.created_at, o.updated_at) as seconds_after_paid_event
FROM paid_events pe
INNER JOIN orders o ON pe.order_id = o.order_id
WHERE pe.created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)
ORDER BY pe.created_at DESC
LIMIT 10;

-- ============================================
-- 4. 체크 제약 확인 (paid, partial_shipped, partial_delivered 포함 여부)
-- ============================================
SHOW CREATE TABLE orders\G
