/**
 * 쿼리 헬퍼 유틸리티
 * 
 * SQL 쿼리 생성 및 파라미터 바인딩을 위한 공통 함수 모음
 * 
 * 핵심 원칙 (SSOT 준수):
 * - IN 절 플레이스홀더 생성은 이 함수로만 통일
 * - 중복 정의 금지 (shipped/delivered 등에서 require로만 사용)
 * - 빈 배열 입력 시 명시적 에러 발생
 */

/**
 * IN 절 플레이스홀더 + 파라미터 배열 생성 (단일 함수로 통일)
 * 
 * @param {Array} ids - IN 절에 사용할 ID 배열
 * @returns {Object} { placeholders: string, params: Array }
 * @throws {Error} ids가 비어있거나 null/undefined인 경우
 * 
 * @example
 * const { placeholders, params } = buildInClause([1, 2, 3]);
 * // placeholders: '?,?,?'
 * // params: [1, 2, 3]
 * 
 * const [rows] = await connection.execute(
 *   `SELECT * FROM table WHERE id IN (${placeholders})`,
 *   params
 * );
 */
function buildInClause(ids) {
    if (!ids || ids.length === 0) {
        throw new Error('빈 배열은 IN 절에 사용할 수 없습니다');
    }
    const placeholders = ids.map(() => '?').join(',');
    return { placeholders, params: ids };
}

module.exports = { buildInClause };
