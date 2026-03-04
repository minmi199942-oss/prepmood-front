/**
 * guest-token-helpers.js
 *
 * guest_order_access_tokens 테이블의 "유효한 토큰" 조건을 단일 정의.
 * ORDER_AND_SYSTEM_FLOW.md 14.3, 16.2, 16.3: confirm, webhook, inicis, order-routes 등
 * 모든 조회에서 이 조건을 사용하여 expires_at 누락·불일치(휴먼 에러) 방지.
 *
 * 사용 예:
 *   const { selectValidGuestTokenSql } = require('./utils/guest-token-helpers');
 *   const cond = selectValidGuestTokenSql('got');
 *   // SELECT token FROM guest_order_access_tokens got WHERE got.order_id = ? AND ${cond} ORDER BY got.created_at DESC LIMIT 1
 */

/**
 * 유효한 guest_order_access_token 조건의 SQL 조각 반환.
 * JOIN/서브쿼리 시 테이블 알리아스가 달라질 수 있으므로 alias 인자 사용.
 *
 * @param {string} [alias='got'] - guest_order_access_tokens 테이블 알리아스
 * @returns {string} SQL 조건 (예: "got.expires_at > NOW() AND got.revoked_at IS NULL")
 */
function selectValidGuestTokenSql(alias = 'got') {
    const a = alias || 'got';
    return `${a}.expires_at > NOW() AND ${a}.revoked_at IS NULL`;
}

module.exports = {
    selectValidGuestTokenSql
};
