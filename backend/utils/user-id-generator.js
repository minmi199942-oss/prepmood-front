/**
 * user_id 및 guest_id 생성 유틸리티
 * 
 * user_id 형식: PM.{년도}.{랜덤6자}
 * guest_id 형식: G-{YYYYMMDD}-{랜덤6자}
 */

/**
 * 랜덤 문자열 생성 (대문자 영문 + 숫자)
 * @param {number} length - 길이
 * @returns {string} 랜덤 문자열
 */
function generateRandomString(length) {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * 새 user_id 생성 함수
 * 형식: PM.{년도}.{랜덤6자}
 * @param {Date} date - 날짜 (기본값: 현재 날짜)
 * @returns {string} 새 user_id (예: PM.2025.ABC123)
 */
function generateNewUserId(date = new Date()) {
  const year = date.getFullYear();
  const randomChars = generateRandomString(6);
  return `PM.${year}.${randomChars}`;
}

/**
 * user_id 중복 체크
 * @param {string} userId - 체크할 user_id
 * @param {Connection} connection - DB 연결
 * @returns {Promise<boolean>} 중복 여부 (true: 중복됨, false: 사용 가능)
 */
async function checkUserIdExists(userId, connection) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) as count FROM users WHERE user_id = ?',
    [userId]
  );
  return rows[0].count > 0;
}

/**
 * 고유한 user_id 생성 (중복 체크 포함)
 * @param {Connection} connection - DB 연결
 * @param {Date} date - 날짜 (기본값: 현재 날짜)
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 10)
 * @returns {Promise<string>} 새 user_id
 * @throws {Error} 최대 재시도 횟수 초과 시
 */
async function generateUniqueUserId(connection, date = new Date(), maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const newUserId = generateNewUserId(date);
    const exists = await checkUserIdExists(newUserId, connection);
    if (!exists) {
      return newUserId;
    }
  }
  throw new Error('고유한 user_id 생성 실패 (최대 재시도 횟수 초과)');
}

/**
 * guest_id 생성 함수
 * 형식: G-{YYYYMMDD}-{랜덤6자}
 * @param {Date} orderDate - 주문 생성 시점 (기본값: 현재 날짜)
 * @returns {string} 새 guest_id (예: G-20250101-ABC123)
 */
function generateGuestId(orderDate = new Date()) {
  const year = orderDate.getFullYear();
  const month = String(orderDate.getMonth() + 1).padStart(2, '0');
  const day = String(orderDate.getDate()).padStart(2, '0');
  const dateStr = `${year}${month}${day}`;
  const randomChars = generateRandomString(6);
  return `G-${dateStr}-${randomChars}`;
}

/**
 * guest_id 중복 체크
 * @param {string} guestId - 체크할 guest_id
 * @param {Connection} connection - DB 연결
 * @returns {Promise<boolean>} 중복 여부 (true: 중복됨, false: 사용 가능)
 */
async function checkGuestIdExists(guestId, connection) {
  const [rows] = await connection.execute(
    'SELECT COUNT(*) as count FROM orders WHERE guest_id = ?',
    [guestId]
  );
  return rows[0].count > 0;
}

/**
 * 고유한 guest_id 생성 (중복 체크 포함)
 * @param {Connection} connection - DB 연결
 * @param {Date} orderDate - 주문 생성 시점 (기본값: 현재 날짜)
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 10)
 * @returns {Promise<string>} 새 guest_id
 * @throws {Error} 최대 재시도 횟수 초과 시
 */
async function generateUniqueGuestId(connection, orderDate = new Date(), maxRetries = 10) {
  for (let i = 0; i < maxRetries; i++) {
    const newGuestId = generateGuestId(orderDate);
    const exists = await checkGuestIdExists(newGuestId, connection);
    if (!exists) {
      return newGuestId;
    }
  }
  throw new Error('고유한 guest_id 생성 실패 (최대 재시도 횟수 초과)');
}

module.exports = {
  generateNewUserId,
  generateUniqueUserId,
  checkUserIdExists,
  generateGuestId,
  generateUniqueGuestId,
  checkGuestIdExists,
  generateRandomString
};

