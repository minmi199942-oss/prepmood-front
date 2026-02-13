/**
 * token_master 테이블 초기화 스크립트 (안전한 버전)
 * 
 * 역할:
 * 1. warranties 테이블 상태 확인
 * 2. warranties가 비어있으면 token_master 삭제 후 재생성
 * 3. warranties에 데이터가 있으면 경고하고 중단
 * 
 * 실행 방법:
 * node reset-token-master.js
 * 
 * ⚠️ 주의: 이 스크립트는 token_master의 모든 데이터를 삭제합니다.
 * warranties 테이블에 데이터가 있으면 실행되지 않습니다.
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const Logger = require('./logger');

// DB 설정
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'prepmood_user',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'prepmood',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

/**
 * warranties 테이블 상태 확인
 */
async function checkWarrantiesStatus(connection) {
    const [rows] = await connection.execute('SELECT COUNT(*) as count FROM warranties');
    const count = rows[0].count;
    
    Logger.log(`[RESET] warranties 테이블: ${count}개 레코드`);
    
    if (count > 0) {
        Logger.warn('[RESET] ⚠️  warranties 테이블에 데이터가 있습니다!');
        Logger.warn('[RESET] token_master를 삭제하려면 먼저 warranties를 처리해야 합니다.');
        Logger.warn('[RESET] 실행이 중단됩니다.');
        return false;
    }
    
    Logger.log('[RESET] ✅ warranties 테이블이 비어있습니다. 안전하게 진행할 수 있습니다.');
    return true;
}

/**
 * token_master 테이블 초기화
 */
async function resetTokenMaster() {
    let connection;
    try {
        Logger.log('='.repeat(50));
        Logger.log('token_master 테이블 초기화 시작');
        Logger.log('='.repeat(50));
        
        // 1. MySQL 연결
        connection = await mysql.createConnection(dbConfig);
        Logger.log('[RESET] ✅ MySQL 연결 성공');
        
        // 2. warranties 테이블 상태 확인
        const canProceed = await checkWarrantiesStatus(connection);
        if (!canProceed) {
            Logger.error('[RESET] ❌ warranties 테이블에 데이터가 있어 실행을 중단합니다.');
            return;
        }
        
        // 3. token_master 기존 데이터 확인
        const [countRows] = await connection.execute('SELECT COUNT(*) as count FROM token_master');
        const existingCount = countRows[0].count;
        
        Logger.log(`[RESET] token_master 테이블: ${existingCount}개 레코드`);
        
        if (existingCount > 0) {
            Logger.warn('[RESET] ⚠️  token_master 테이블에 기존 데이터가 있습니다!');
            Logger.warn('[RESET] 기존 데이터를 삭제합니다...');
            
            // FK 제약조건 확인 (warranties가 비어있으므로 문제없음)
            await connection.execute('DELETE FROM token_master');
            Logger.log(`[RESET] ✅ 기존 데이터 ${existingCount}개 삭제 완료`);
        } else {
            Logger.log('[RESET] ✅ token_master 테이블이 이미 비어있습니다.');
        }
        
        Logger.log('[RESET] ✅ token_master 테이블 초기화 완료');
        Logger.log('[RESET] 다음 단계: 토큰은 관리자 UI에서 생성하세요.');
        
    } catch (error) {
        Logger.error('[RESET] ❌ 초기화 실패:', {
            message: error.message,
            stack: error.stack
        });
        throw error;
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 메인 실행
if (require.main === module) {
    resetTokenMaster()
        .then(() => {
            Logger.log('[RESET] ✅ 작업 완료');
            process.exit(0);
        })
        .catch((error) => {
            Logger.error('[RESET] ❌ 작업 실패:', error);
            process.exit(1);
        });
}

module.exports = {
    resetTokenMaster,
    checkWarrantiesStatus
};
