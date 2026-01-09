/**
 * 인보이스 번호 생성 유틸리티
 * 
 * 형식: PM-INV-YYMMDD-HHmm-{랜덤4자}
 * - YY: 2자리 연도
 * - MM: 월
 * - DD: 일
 * - HH: 시
 * - mm: 분 (초 제외)
 * - 랜덤4자: 중복 방지용 (0-9, A-Z)
 * 
 * UNIQUE 제약으로 인해 랜덤 4자가 필수입니다.
 */

const crypto = require('crypto');

/**
 * 인보이스 번호 생성
 * @param {Date} date - 기준 날짜 (기본값: 현재 시간)
 * @returns {string} PM-INV-YYMMDD-HHmm-{랜덤4자} 형식
 */
function generateInvoiceNumber(date = new Date()) {
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    // 랜덤 4자 생성 (0-9, A-Z) - UNIQUE 제약을 위한 중복 방지
    const randomChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let randomSuffix = '';
    for (let i = 0; i < 4; i++) {
        const randomIndex = crypto.randomInt(0, randomChars.length);
        randomSuffix += randomChars[randomIndex];
    }
    
    return `PM-INV-${year}${month}${day}-${hours}${minutes}-${randomSuffix}`;
}

/**
 * 고유한 인보이스 번호 생성 (DB 중복 확인 포함)
 * @param {Object} connection - MySQL 연결
 * @param {Date} date - 기준 날짜 (기본값: 현재 시간)
 * @param {number} maxRetries - 최대 재시도 횟수 (기본값: 3)
 * @returns {Promise<string>} 고유한 인보이스 번호
 */
async function generateUniqueInvoiceNumber(connection, date = new Date(), maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const invoiceNumber = generateInvoiceNumber(date);
        
        try {
            // UNIQUE 제약조건 확인
            const [existing] = await connection.execute(
                'SELECT 1 FROM invoices WHERE invoice_number = ? LIMIT 1',
                [invoiceNumber]
            );
            
            if (existing.length === 0) {
                return invoiceNumber; // 고유한 인보이스 번호 생성 성공
            }
            
            // 충돌 감지 시 로그
            console.log(`[INVOICE] 인보이스 번호 충돌 감지 (시도 ${attempt}/${maxRetries}): ${invoiceNumber}`);
            
            if (attempt === maxRetries) {
                throw new Error(`인보이스 번호 생성 실패: ${maxRetries}회 재시도 후에도 고유한 번호를 생성할 수 없습니다`);
            }
            
            // 지수 백오프: 10ms, 20ms, 40ms
            const backoffMs = Math.min(10 * Math.pow(2, attempt - 1), 40);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            console.log(`[INVOICE] 인보이스 번호 생성 오류 (시도 ${attempt}/${maxRetries}): ${error.message}`);
        }
    }
}

module.exports = {
    generateInvoiceNumber,
    generateUniqueInvoiceNumber
};
