/**
 * Phase 0-3': 기존 사용자에 membership_id 생성 및 채우기
 * 
 * 실행 방법:
 * node backend/migrations/013_phase_0_3_generate_membership_ids.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const { generateNewUserId } = require('../utils/user-id-generator');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

async function generateMembershipIds() {
    let connection;
    
    try {
        console.log('🔍 membership_id 생성 시작...\n');
        
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공\n');
        
        // 1. membership_id가 없는 사용자 조회
        const [users] = await connection.execute(
            'SELECT user_id, email, created_at FROM users WHERE membership_id IS NULL ORDER BY user_id'
        );
        
        if (users.length === 0) {
            console.log('✅ 모든 사용자가 이미 membership_id를 가지고 있습니다.');
            return;
        }
        
        console.log(`📋 총 ${users.length}명의 사용자에 membership_id 생성 시작...\n`);
        
        // 2. 각 사용자에 대해 membership_id 생성 및 업데이트
        let successCount = 0;
        let failCount = 0;
        
        for (const user of users) {
            try {
                // 생성 시점을 사용자의 created_at으로 설정 (가입 연도 반영)
                const createdDate = user.created_at ? new Date(user.created_at) : new Date();
                
                // membership_id 생성 (중복 체크 포함)
                let membershipId;
                let retries = 0;
                const maxRetries = 10;
                
                while (retries < maxRetries) {
                    const { generateNewUserId } = require('../utils/user-id-generator');
                    membershipId = generateNewUserId(createdDate);
                    
                    // membership_id 중복 체크
                    const [exists] = await connection.execute(
                        'SELECT COUNT(*) as count FROM users WHERE membership_id = ?',
                        [membershipId]
                    );
                    
                    if (exists[0].count === 0) {
                        break; // 중복 없음
                    }
                    
                    retries++;
                }
                
                if (retries >= maxRetries) {
                    throw new Error('고유한 membership_id 생성 실패 (최대 재시도 횟수 초과)');
                }
                
                // membership_id 업데이트
                await connection.execute(
                    'UPDATE users SET membership_id = ? WHERE user_id = ?',
                    [membershipId, user.user_id]
                );
                
                console.log(`  ✅ ${user.user_id} → ${membershipId} (${user.email})`);
                successCount++;
                
            } catch (error) {
                console.error(`  ❌ ${user.user_id} (${user.email}) 실패:`, error.message);
                failCount++;
            }
        }
        
        console.log(`\n✅ 완료: 성공 ${successCount}명, 실패 ${failCount}명`);
        
        // 3. 최종 검증
        const [verify] = await connection.execute(
            'SELECT COUNT(*) as total, COUNT(membership_id) as with_membership_id FROM users'
        );
        
        console.log(`\n📊 최종 통계:`);
        console.log(`  - 전체 사용자: ${verify[0].total}명`);
        console.log(`  - membership_id 보유: ${verify[0].with_membership_id}명`);
        
        if (verify[0].total === verify[0].with_membership_id) {
            console.log(`\n✅ 모든 사용자가 membership_id를 가지고 있습니다!`);
        } else {
            console.log(`\n⚠️  일부 사용자가 membership_id를 가지고 있지 않습니다.`);
        }
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        console.error(error);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    generateMembershipIds()
        .then(() => {
            console.log('\n✅ 스크립트 실행 완료');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ 스크립트 실행 실패:', error);
            process.exit(1);
        });
}

module.exports = { generateMembershipIds };

