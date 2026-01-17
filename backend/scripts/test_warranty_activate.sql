-- 보증서 활성화 API 테스트용 데이터 준비 및 검증 스크립트
-- 
-- 테스트 시나리오:
-- 1. 정상 케이스: issued 상태의 보증서 활성화
-- 2. 에러 케이스: 소유자 불일치
-- 3. 에러 케이스: 상태가 issued가 아님
-- 4. 에러 케이스: 인보이스 연동 확인 실패
-- 5. 에러 케이스: 환불된 주문

-- ============================================
-- 1. 테스트용 데이터 확인
-- ============================================
SELECT '=== 1. 테스트용 보증서 확인 ===' AS info;

SELECT 
    w.id as warranty_id,
    w.status,
    w.owner_user_id,
    w.source_order_item_unit_id,
    w.activated_at,
    o.user_id as order_user_id,
    o.status as order_status,
    o.order_number,
    oiu.unit_status
FROM warranties w
LEFT JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
LEFT JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
LEFT JOIN orders o ON oi.order_id = o.order_id
WHERE w.status = 'issued'
ORDER BY w.id DESC
LIMIT 5;

-- ============================================
-- 2. 활성화 가능한 보증서 확인
-- ============================================
SELECT '=== 2. 활성화 가능한 보증서 확인 ===' AS info;

SELECT 
    w.id as warranty_id,
    w.status,
    w.owner_user_id,
    u.email as owner_email,
    o.user_id as order_user_id,
    o.status as order_status,
    oiu.unit_status,
    CASE 
        WHEN w.status != 'issued' THEN '❌ 상태가 issued가 아님'
        WHEN w.owner_user_id IS NULL THEN '❌ 소유자가 없음'
        WHEN w.source_order_item_unit_id IS NULL THEN '❌ 주문 항목 연결 없음'
        WHEN o.user_id IS NULL THEN '❌ 주문이 없음'
        WHEN o.user_id != w.owner_user_id THEN '❌ 주문 소유자와 보증서 소유자 불일치'
        WHEN o.status = 'refunded' THEN '❌ 환불된 주문'
        WHEN oiu.unit_status = 'refunded' THEN '❌ 환불된 주문 항목'
        ELSE '✅ 활성화 가능'
    END as activation_status
FROM warranties w
LEFT JOIN users u ON w.owner_user_id = u.user_id
LEFT JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
LEFT JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
LEFT JOIN orders o ON oi.order_id = o.order_id
WHERE w.status = 'issued'
ORDER BY w.id DESC
LIMIT 10;

-- ============================================
-- 3. 활성화 테스트 전 상태 확인 (특정 warranty_id)
-- ============================================
-- 사용법: 아래 warranty_id를 실제 테스트할 보증서 ID로 변경
-- SET @test_warranty_id = 1;

-- SELECT '=== 3. 활성화 테스트 전 상태 확인 ===' AS info;
-- 
-- SELECT 
--     w.id as warranty_id,
--     w.status,
--     w.owner_user_id,
--     w.activated_at,
--     w.source_order_item_unit_id,
--     o.user_id as order_user_id,
--     o.status as order_status,
--     o.order_number,
--     oiu.unit_status,
--     u.email as owner_email
-- FROM warranties w
-- LEFT JOIN users u ON w.owner_user_id = u.user_id
-- LEFT JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
-- LEFT JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
-- LEFT JOIN orders o ON oi.order_id = o.order_id
-- WHERE w.id = @test_warranty_id;

-- ============================================
-- 4. 활성화 후 상태 확인 (특정 warranty_id)
-- ============================================
-- 사용법: 활성화 API 호출 후 실행
-- SET @test_warranty_id = 1;

-- SELECT '=== 4. 활성화 후 상태 확인 ===' AS info;
-- 
-- SELECT 
--     w.id as warranty_id,
--     w.status,
--     w.owner_user_id,
--     w.activated_at,
--     COUNT(we.event_id) as event_count,
--     MAX(we.created_at) as last_event_time
-- FROM warranties w
-- LEFT JOIN warranty_events we ON w.id = we.warranty_id
-- WHERE w.id = @test_warranty_id
-- GROUP BY w.id, w.status, w.owner_user_id, w.activated_at;

-- ============================================
-- 5. warranty_events 확인 (활성화 이벤트)
-- ============================================
SELECT '=== 5. 최근 warranty_events 확인 ===' AS info;

SELECT 
    we.event_id,
    we.warranty_id,
    we.event_type,
    we.old_value,
    we.new_value,
    we.changed_by,
    we.changed_by_id,
    we.reason,
    we.created_at
FROM warranty_events we
WHERE we.event_type = 'status_change'
ORDER BY we.created_at DESC
LIMIT 10;

-- ============================================
-- 6. 활성화된 보증서 통계
-- ============================================
SELECT '=== 6. 활성화된 보증서 통계 ===' AS info;

SELECT 
    status,
    COUNT(*) as count,
    COUNT(CASE WHEN activated_at IS NOT NULL THEN 1 END) as activated_count
FROM warranties
GROUP BY status;
