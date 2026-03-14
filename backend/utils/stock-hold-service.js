const Logger = require('../logger');

/**
 * stock_holds 관련 유틸리티 (Phase 1: hold acquire/reuse 전용)
 *
 * - 이 모듈은 커넥션 생성/풀 관리 responsibility 를 갖지 않는다.
 * - 항상 호출하는 쪽에서 MySQL connection 을 넘겨야 하며,
 *   beginTransaction/commit/rollback 도 호출 측에서 제어한다.
 */

/**
 * 주문에 필요한 order_items 스냅샷 조회
 * - processPaidOrder 와 동일한 기준으로 product_id/size/color/quantity 를 본다.
 * - Phase 1 최소 구현: order_items 단위로 그대로 사용.
 *
 * @param {Object} connection
 * @param {number} orderId
 * @returns {Promise<Array<{order_item_id:number, product_id:string, size:string|null, color:string|null, quantity:number}>>}
 */
async function loadOrderItemsSnapshot(connection, orderId) {
    const [rows] = await connection.execute(
        `SELECT 
            order_item_id,
            product_id,
            size,
            color,
            quantity
         FROM order_items
         WHERE order_id = ?
         ORDER BY order_item_id`,
        [orderId]
    );
    return rows.map(row => ({
        order_item_id: row.order_item_id,
        product_id: row.product_id,
        size: row.size,
        color: row.color,
        quantity: Number(row.quantity)
    }));
}

/**
 * order_id 기준 ACTIVE hold 세트 조회
 *
 * @param {Object} connection
 * @param {number} orderId
 * @returns {Promise<Array<any>>}
 */
async function loadActiveHoldsForOrder(connection, orderId) {
    const [rows] = await connection.execute(
        `SELECT 
            id,
            stock_unit_id,
            order_id,
            status,
            expires_at,
            created_at,
            released_at
         FROM stock_holds
         WHERE order_id = ?
           AND status = 'ACTIVE'
           AND expires_at > NOW()
         ORDER BY id`,
        [orderId]
    );
    return rows;
}

/**
 * hold 재사용이 가능한지 검증
 * - 정확한 결제 스냅샷(문서 5.2.1 기준)에 최대한 가깝게 맞춘다.
 * - Phase 1: checkout_session_id / payment_attempt_id 는 stock_holds 컬럼에 없으므로,
 *   order_items 구성·필요 수량·ACTIVE/TTL 기준까지 엄격히 맞추고,
 *   세션/attempt 레벨은 "현재 ACTIVE 세트는 가장 최근 시도"라는 전제 하에 운용한다.
 *
 * @param {Object} params
 * @param {Array} params.holds - ACTIVE stock_holds rows
 * @param {Array} params.orderItems - loadOrderItemsSnapshot 결과
 * @returns {{reusable: boolean, reason?: string}}
 */
function validateHoldReuseForOrder({ holds, orderItems }) {
    if (!Array.isArray(holds) || holds.length === 0) {
        return { reusable: false, reason: 'NO_ACTIVE_HOLDS' };
    }
    if (!Array.isArray(orderItems) || orderItems.length === 0) {
        return { reusable: false, reason: 'NO_ORDER_ITEMS' };
    }

    // Phase 1: stock_holds 에 order_item_id 가 없으므로,
    // "총 필요한 unit 수"와 "hold 개수"가 정확히 일치하는지만 본다.
    const requiredTotal = orderItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    const holdCount = holds.length;

    if (requiredTotal !== holdCount) {
        return {
            reusable: false,
            reason: `MISMATCH_REQUIRED_QTY(required=${requiredTotal}, holds=${holdCount})`
        };
    }

    // 추가로, status/expires_at 는 쿼리에서 이미 필터링했으므로 여기서는 생략.
    // 향후 stock_holds 에 order_item_id / payment_attempt_id / checkout_session_id 컬럼이 추가되면,
    // 여기에서 더 엄격한 스냅샷 비교를 수행한다.

    return { reusable: true };
}

/**
 * 새로운 ACTIVE hold 세트 생성
 *
 * - 동일 트랜잭션 내에서 stock_units FOR UPDATE SKIP LOCKED + stock_holds INSERT 를 수행해야 한다.
 * - 호출하는 쪽에서 이미 BEGIN 한 상태여야 하며, COMMIT/ROLLBACK 은 호출자가 담당한다.
 *
 * @param {Object} params
 * @param {Object} params.connection
 * @param {number} params.orderId
 * @param {Array} params.orderItems - loadOrderItemsSnapshot 결과
 * @param {number} params.holdTtlMinutes
 * @returns {Promise<{created:boolean, holds:Array}>}
 */
async function acquireNewHoldsForOrder({ connection, orderId, orderItems, holdTtlMinutes }) {
    const ttlMinutes = Number.isFinite(holdTtlMinutes) && holdTtlMinutes > 0 ? holdTtlMinutes : 12;
    const expiresExpr = `DATE_ADD(NOW(), INTERVAL ${ttlMinutes} MINUTE)`;

    const createdHolds = [];

    for (const item of orderItems) {
        const needed = Number(item.quantity) || 0;
        if (needed <= 0) continue;

        // stock_units 에서 in_stock + 해당 product/size/color 를 가진 unit 선별
        // 이미 ACTIVE hold 가 붙은 unit 은 제외 (NOT EXISTS)
        // 동시성 보강: stock_unit_id ASC 고정 정렬 + FOR UPDATE SKIP LOCKED
        // LIMIT: MySQL 8.0.22+ / mysql2에서 LIMIT ? 바인딩 시 ER_WRONG_ARGUMENTS 발생 → 검증된 정수만 삽입
        const limitInt = Math.max(0, Math.floor(Number(needed)));
        const [unitRows] = await connection.execute(
            `SELECT su.stock_unit_id
             FROM stock_units su
             WHERE su.product_id = ?
               AND su.status = 'in_stock'
               AND (su.size = ? OR (? IS NULL AND (su.size IS NULL OR su.size = '')))
               AND (su.color = ? OR (? IS NULL AND (su.color IS NULL OR su.color = '')))
               AND NOT EXISTS (
                    SELECT 1 FROM stock_holds sh
                    WHERE sh.stock_unit_id = su.stock_unit_id
                      AND sh.status = 'ACTIVE'
               )
             ORDER BY su.stock_unit_id
             LIMIT ${limitInt} FOR UPDATE SKIP LOCKED`,
            [
                item.product_id,
                item.size, item.size,
                item.color, item.color
            ]
        );

        if (unitRows.length !== needed) {
            // 필요한 수량만큼 확보 실패 → 전체 acquire 실패로 보고 호출자에게 위임
            return {
                created: false,
                holds: [],
                reason: `INSUFFICIENT_STOCK_FOR_HOLD(orderItemId=${item.order_item_id}, needed=${needed}, got=${unitRows.length})`
            };
        }

        // 선택된 unit 들에 대해 stock_holds INSERT
        for (const row of unitRows) {
            const [insertRes] = await connection.execute(
                `INSERT INTO stock_holds (stock_unit_id, order_id, status, expires_at, created_at)
                 VALUES (?, ?, 'ACTIVE', ${expiresExpr}, NOW())`,
                [row.stock_unit_id, orderId]
            );
            createdHolds.push({
                id: insertRes.insertId,
                stock_unit_id: row.stock_unit_id,
                order_id: orderId,
                status: 'ACTIVE'
            });
        }
    }

    Logger.log('[stock-hold-service] 새 ACTIVE holds 생성', {
        orderId,
        holdCount: createdHolds.length,
        holdTtlMinutes: ttlMinutes
    });

    return { created: true, holds: createdHolds };
}

module.exports = {
    loadOrderItemsSnapshot,
    loadActiveHoldsForOrder,
    validateHoldReuseForOrder,
    acquireNewHoldsForOrder
};

