-- 예약된 재고가 있는 주문 찾기
-- 주문 처리 실패로 인해 재고만 예약된 상태로 남아있는 주문 확인

USE prepmood;

-- ============================================================
-- 1. 예약된 재고가 있는 모든 주문 확인
-- ============================================================
SELECT 
    o.order_id,
    o.order_number,
    o.status as order_status,
    o.paid_at,
    o.created_at,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM stock_units WHERE reserved_by_order_id = o.order_id AND status = 'reserved') as reserved_stock_count,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
     )) as warranties_count
FROM orders o
WHERE EXISTS (
    SELECT 1 FROM stock_units 
    WHERE reserved_by_order_id = o.order_id 
    AND status = 'reserved'
)
ORDER BY o.order_id DESC
LIMIT 20;

-- ============================================================
-- 2. 문제가 있는 주문만 필터링 (재고는 예약되었지만 order_item_units 없음)
-- ============================================================
SELECT 
    o.order_id,
    o.order_number,
    o.status as order_status,
    o.paid_at,
    o.created_at,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM stock_units WHERE reserved_by_order_id = o.order_id AND status = 'reserved') as reserved_stock_count
FROM orders o
WHERE EXISTS (
    SELECT 1 FROM stock_units 
    WHERE reserved_by_order_id = o.order_id 
    AND status = 'reserved'
)
AND NOT EXISTS (
    SELECT 1 FROM order_item_units 
    WHERE order_id = o.order_id
)
ORDER BY o.order_id DESC;

-- ============================================================
-- 3. 특정 주문의 상세 정보 확인 (order_id를 실제 값으로 변경)
-- ============================================================
-- 사용법: 아래 쿼리에서 [order_id]를 실제 order_id로 변경
-- 예: SET @order_id = 123;

SET @order_id = NULL;  -- 여기에 실제 order_id 입력

SELECT 
    o.order_id,
    o.order_number,
    o.status as order_status,
    o.paid_at,
    o.created_at,
    o.user_id,
    o.guest_id,
    (SELECT COUNT(*) FROM paid_events WHERE order_id = o.order_id) as paid_events_count,
    (SELECT COUNT(*) FROM order_item_units WHERE order_id = o.order_id) as order_item_units_count,
    (SELECT COUNT(*) FROM stock_units WHERE reserved_by_order_id = o.order_id AND status = 'reserved') as reserved_stock_count,
    (SELECT COUNT(*) FROM warranties 
     WHERE source_order_item_unit_id IN (
         SELECT order_item_unit_id FROM order_item_units WHERE order_id = o.order_id
     )) as warranties_count
FROM orders o
WHERE o.order_id = @order_id;

-- ============================================================
-- 4. 예약된 재고 상세 정보 (특정 주문)
-- ============================================================
SELECT 
    su.stock_unit_id,
    su.product_id,
    su.size,
    su.color,
    su.status,
    su.reserved_at,
    su.reserved_by_order_id,
    o.order_number,
    (SELECT COUNT(*) FROM order_item_units oiu WHERE oiu.stock_unit_id = su.stock_unit_id) as unit_count,
    (SELECT COUNT(*) FROM order_item_units oiu 
     WHERE oiu.stock_unit_id = su.stock_unit_id 
     AND oiu.unit_status IN ('reserved', 'shipped', 'delivered')) as active_unit_count,
    (SELECT COUNT(*) FROM order_item_units oiu 
     WHERE oiu.stock_unit_id = su.stock_unit_id 
     AND oiu.active_lock = 1) as active_lock_count
FROM stock_units su
LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
WHERE su.reserved_by_order_id = @order_id 
  AND su.status = 'reserved';
