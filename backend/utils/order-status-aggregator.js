/**
 * orders.status 집계 함수
 * 
 * ⚠️ 중요: orders.status는 집계 결과(뷰/표시용)이며, 직접 정책 판단 기준으로 사용하지 않습니다.
 * - 환불/양도/제재 판단은 warranties.status를 기준으로 합니다.
 * - orders.status는 집계 함수로만 갱신되며, 관리자 수동 수정 금지.
 * 
 * 집계 규칙:
 * - pending: paid_events 없음 (또는 paid_at NULL)
 * - paid: paid_events 존재 AND unit이 1개 이상 reserved 이상 존재
 * - partial_shipped: 일부 unit shipped 이상, 일부는 reserved
 * - shipped: 모든 unit shipped 이상
 * - partial_delivered: 일부 delivered 이상, 일부 shipped
 * - delivered: 모든 unit delivered 이상
 * - refunded: 모든 unit이 환불 최종 상태 도달
 */

const Logger = require('../logger');

/**
 * orders.status 집계 함수
 * 
 * @param {Object} connection - MySQL 연결
 * @param {number} orderId - 주문 ID
 * @returns {Promise<string>} 계산된 주문 상태
 */
async function updateOrderStatus(connection, orderId) {
    try {
        // 1. order_item_units 통계 조회 (order_id로 직접 조회 - 더 효율적)
        const [units] = await connection.execute(
            `SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN unit_status IN ('shipped', 'delivered') THEN 1 ELSE 0 END) as shipped_count,
                SUM(CASE WHEN unit_status = 'delivered' THEN 1 ELSE 0 END) as delivered_count,
                SUM(CASE WHEN unit_status = 'refunded' THEN 1 ELSE 0 END) as refunded_count,
                SUM(CASE WHEN unit_status = 'reserved' THEN 1 ELSE 0 END) as reserved_count
            FROM order_item_units
            WHERE order_id = ?`,
            [orderId]
        );

        const stats = units[0];
        
        // NULL 값 처리 (SUM이 NULL을 반환할 수 있음)
        const total = stats.total || 0;
        const shipped_count = stats.shipped_count || 0;
        const delivered_count = stats.delivered_count || 0;
        const refunded_count = stats.refunded_count || 0;
        const reserved_count = stats.reserved_count || 0;
        
        Logger.log('[ORDER_STATUS_AGGREGATOR] 통계 조회 완료', {
            orderId,
            total,
            shipped_count,
            delivered_count,
            refunded_count,
            reserved_count
        });
        
        // 2. paid_events 존재 여부 확인
        const [paidEvents] = await connection.execute(
            'SELECT event_id FROM paid_events WHERE order_id = ? LIMIT 1',
            [orderId]
        );

        // 3. paid_at 확인 (캐시/파생 필드)
        const [orders] = await connection.execute(
            'SELECT paid_at FROM orders WHERE order_id = ?',
            [orderId]
        );

        if (orders.length === 0) {
            throw new Error(`주문을 찾을 수 없습니다: order_id=${orderId}`);
        }

        const hasPaidEvent = paidEvents.length > 0;
        const hasPaidAt = orders[0].paid_at !== null;

        // 4. 상태 계산 (집계 규칙)
        let newStatus;

        if (!hasPaidEvent && !hasPaidAt) {
            // 결제 전
            newStatus = 'pending';
        } else if (total === 0) {
            // unit이 없는 경우 (이론적으로 발생하지 않아야 함)
            // paid_events가 있으면 paid, 없으면 pending
            newStatus = hasPaidEvent || hasPaidAt ? 'paid' : 'pending';
        } else if (refunded_count === total && total > 0) {
            // 모든 unit 환불
            newStatus = 'refunded';
        } else if (delivered_count === total && total > 0) {
            // 모든 unit 배송 완료
            newStatus = 'delivered';
        } else if (delivered_count > 0) {
            // 일부 delivered, 일부 shipped
            newStatus = 'partial_delivered';
        } else if (shipped_count === total && total > 0) {
            // 모든 unit 배송 중
            newStatus = 'shipped';
        } else if (shipped_count > 0) {
            // 일부 shipped, 일부 reserved
            newStatus = 'partial_shipped';
        } else {
            // 모든 unit reserved (결제 완료)
            newStatus = 'paid';
        }

        // 5. orders.status 업데이트
        const [updateResult] = await connection.execute(
            'UPDATE orders SET status = ? WHERE order_id = ?',
            [newStatus, orderId]
        );

        if (updateResult.affectedRows !== 1) {
            // ⚠️ 주문이 없거나 이미 삭제된 경우
            Logger.error('[ORDER_STATUS_AGGREGATOR] orders.status 업데이트 실패 - 주문이 없거나 이미 삭제됨', {
                orderId,
                newStatus,
                affectedRows: updateResult.affectedRows
            });
            throw new Error(`orders.status 업데이트 실패: order_id=${orderId}, affectedRows=${updateResult.affectedRows}`);
        }

        Logger.log('[ORDER_STATUS_AGGREGATOR] orders.status 집계 완료', {
            orderId,
            newStatus,
            stats: {
                total,
                shipped_count,
                delivered_count,
                refunded_count,
                reserved_count
            },
            hasPaidEvent,
            hasPaidAt
        });

        return newStatus;
    } catch (error) {
        Logger.error('[ORDER_STATUS_AGGREGATOR] orders.status 집계 실패', {
            orderId,
            error: error.message,
            error_code: error.code,
            stack: error.stack
        });
        throw error;
    }
}

module.exports = {
    updateOrderStatus
};
