/**
 * warranty-transfer-cleanup.js
 * 
 * 양도 만료 배치 작업
 * 
 * 역할:
 * - 72시간 초과 양도 요청 자동 만료 처리
 * - warranty_transfers.status = 'expired'로 변경
 * 
 * 실행 방식:
 * - setInterval로 주기적 실행 (예: 1시간마다)
 * - 또는 cron job으로 직접 실행
 */

const mysql = require('mysql2/promise');
const Logger = require('../logger');
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

/**
 * 만료된 양도 요청 정리 배치
 * 
 * 처리:
 * - expires_at < NOW() AND status = 'requested'인 레코드를 찾아서
 * - status = 'expired'로 변경
 */
async function cleanupExpiredTransfers() {
    let connection;
    try {
        Logger.log('[TRANSFER_CLEANUP] 양도 만료 배치 시작...');
        
        connection = await mysql.createConnection(dbConfig);
        
        // 72시간 초과 양도 요청 만료 처리
        const [result] = await connection.execute(
            `UPDATE warranty_transfers
             SET status = 'expired'
             WHERE status = 'requested'
               AND expires_at < NOW()`
        );
        
        const expiredCount = result.affectedRows;
        
        if (expiredCount > 0) {
            Logger.log('[TRANSFER_CLEANUP] 양도 만료 처리 완료:', {
                expiredCount
            });
        } else {
            Logger.log('[TRANSFER_CLEANUP] 만료된 양도 요청 없음');
        }
        
        await connection.end();
        
        return {
            success: true,
            expiredCount
        };
    } catch (error) {
        Logger.error('[TRANSFER_CLEANUP] 양도 만료 배치 실행 오류:', {
            error: error.message,
            stack: error.stack
        });
        
        if (connection) {
            try {
                await connection.end();
            } catch (endError) {
                Logger.error('[TRANSFER_CLEANUP] connection.end() 실패:', {
                    error: endError.message
                });
            }
        }
        
        return {
            success: false,
            error: error.message
        };
    }
}

// 직접 실행 시 (크론잡으로 호출)
if (require.main === module) {
    cleanupExpiredTransfers()
        .then((result) => {
            if (result.success) {
                console.log(`✅ 양도 만료 배치 완료: ${result.expiredCount}개 만료 처리`);
                process.exit(0);
            } else {
                console.error(`❌ 양도 만료 배치 실패: ${result.error}`);
                process.exit(1);
            }
        })
        .catch((error) => {
            console.error('❌ 양도 만료 배치 실행 중 오류:', error);
            process.exit(1);
        });
}

module.exports = { cleanupExpiredTransfers };
