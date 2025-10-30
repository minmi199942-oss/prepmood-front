// idempotency-cleanup.js - Idempotency 만료 레코드 정리 배치

const mysql = require('mysql2/promise');
require('dotenv').config();

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

// 정리 배치 실행
async function cleanupIdempotency() {
    let connection;
    try {
        console.log('🔄 Idempotency 정리 배치 시작...');
        
        connection = await mysql.createConnection(dbConfig);
        
        // 7일 이상 된 레코드 삭제
        const [result] = await connection.execute(
            `DELETE FROM orders_idempotency 
             WHERE created_at < NOW() - INTERVAL 7 DAY`
        );
        
        console.log(`✅ Idempotency 정리 완료: ${result.affectedRows}개 레코드 삭제`);
        
        await connection.end();
    } catch (error) {
        console.error('❌ Idempotency 정리 중 오류:', error.message);
        if (connection) {
            await connection.end();
        }
    }
}

// 직접 실행 시 (크론잡으로 호출)
if (require.main === module) {
    cleanupIdempotency()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}

module.exports = { cleanupIdempotency };

