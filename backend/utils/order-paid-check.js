/**
 * order-paid-check.js
 *
 * 재결제·새 checkout session 발급 금지 판정용.
 * paid_events 존재 여부만 사용.
 *
 * [전제] paid_events에는 "PG 검증 완료된 결제"만 INSERT되어야 함.
 * - 정상 경로: payments confirm / 이니시스 redirect / 웹훅에서 createPaidEvent(PG 응답 확정 후) 호출만 사용.
 * - 복구·스크립트: payments 캡처 완료가 확인된 경우에만 createPaidEvent 호출. 실패/보류 상태나 임시 insert 금지.
 * - 위 전제가 깨지면 정상 주문까지 재결제·세션 발급이 막힐 수 있음.
 */

/**
 * 해당 주문에 paid_events가 한 건이라도 있으면 true.
 * 재결제 금지·새 세션 발급 금지 판정에만 사용.
 *
 * @param {object} connection - MySQL2 connection (order-routes: createConnection, payments-routes: pool connection)
 * @param {number} orderId - orders.order_id
 * @returns {Promise<boolean>}
 */
async function hasPaidEventForOrder(connection, orderId) {
    const [rows] = await connection.execute(
        'SELECT 1 FROM paid_events WHERE order_id = ? LIMIT 1',
        [orderId]
    );
    return rows.length > 0;
}

module.exports = {
    hasPaidEventForOrder
};
