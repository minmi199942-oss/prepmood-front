/**
 * 현재 데이터베이스 상태 확인 스크립트
 * users.user_id 마이그레이션 전 현재 상태를 확인합니다
 */

require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

async function checkCurrentState() {
    let connection;
    
    try {
        console.log('🔍 데이터베이스 상태 확인 시작...\n');
        
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공\n');
        
        // 1. MySQL 버전 확인
        console.log('=== 1. MySQL 버전 확인 ===');
        const [version] = await connection.execute('SELECT VERSION() AS mysql_version');
        console.log(`MySQL 버전: ${version[0].mysql_version}\n`);
        
        // 2. users 테이블 구조 확인
        console.log('=== 2. users 테이블 구조 ===');
        const [usersDesc] = await connection.execute('DESCRIBE users');
        const userIdColumn = usersDesc.find(col => col.Field === 'user_id');
        if (userIdColumn) {
            console.log(`user_id 타입: ${userIdColumn.Type}`);
            console.log(`NULL 허용: ${userIdColumn.Null}`);
            console.log(`키 타입: ${userIdColumn.Key}\n`);
        } else {
            console.log('⚠️  user_id 컬럼을 찾을 수 없습니다.\n');
        }
        
        // 3. users 테이블 데이터 개수
        console.log('=== 3. users 테이블 데이터 개수 ===');
        const [userCount] = await connection.execute('SELECT COUNT(*) as count FROM users');
        console.log(`총 사용자 수: ${userCount[0].count}`);
        
        if (userCount[0].count > 0) {
            const [sampleUsers] = await connection.execute(
                'SELECT user_id, email, created_at FROM users ORDER BY user_id LIMIT 5'
            );
            console.log('\n샘플 user_id:');
            sampleUsers.forEach(user => {
                console.log(`  - user_id: ${user.user_id} (타입: ${typeof user.user_id}), email: ${user.email}`);
            });
        }
        console.log('');
        
        // 4. FK 관계 확인
        console.log('=== 4. users.user_id를 참조하는 FK 관계 ===');
        const [fkRelations] = await connection.execute(`
            SELECT 
                TABLE_NAME,
                COLUMN_NAME,
                CONSTRAINT_NAME,
                REFERENCED_TABLE_NAME,
                REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ?
              AND REFERENCED_TABLE_NAME = 'users'
              AND REFERENCED_COLUMN_NAME = 'user_id'
            ORDER BY TABLE_NAME, COLUMN_NAME
        `, [process.env.DB_NAME]);
        
        if (fkRelations.length > 0) {
            console.log(`총 ${fkRelations.length}개의 FK 관계 발견:\n`);
            fkRelations.forEach(fk => {
                console.log(`  - ${fk.TABLE_NAME}.${fk.COLUMN_NAME} → users.user_id`);
            });
        } else {
            console.log('⚠️  FK 관계를 찾을 수 없습니다.');
        }
        console.log('');
        
        // 5. 각 테이블의 user_id 관련 컬럼 타입 확인
        console.log('=== 5. 각 테이블의 user_id 관련 컬럼 타입 ===');
        const [columns] = await connection.execute(`
            SELECT 
                TABLE_NAME,
                COLUMN_NAME,
                DATA_TYPE,
                COLUMN_TYPE,
                IS_NULLABLE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND (
                (TABLE_NAME = 'orders' AND COLUMN_NAME = 'user_id') OR
                (TABLE_NAME = 'warranties' AND COLUMN_NAME = 'user_id') OR
                (TABLE_NAME = 'inquiries' AND COLUMN_NAME = 'user_id') OR
                (TABLE_NAME = 'token_master' AND COLUMN_NAME = 'owner_user_id') OR
                (TABLE_NAME = 'transfer_logs' AND COLUMN_NAME IN ('from_user_id', 'to_user_id', 'admin_user_id')) OR
                (TABLE_NAME = 'scan_logs' AND COLUMN_NAME = 'user_id') OR
                (TABLE_NAME = 'orders_idempotency' AND COLUMN_NAME = 'user_id')
              )
            ORDER BY TABLE_NAME, COLUMN_NAME
        `, [process.env.DB_NAME]);
        
        if (columns.length > 0) {
            columns.forEach(col => {
                console.log(`  - ${col.TABLE_NAME}.${col.COLUMN_NAME}: ${col.DATA_TYPE} (${col.COLUMN_TYPE}), NULL: ${col.IS_NULLABLE}`);
            });
        } else {
            console.log('⚠️  관련 컬럼을 찾을 수 없습니다.');
        }
        console.log('');
        
        // 6. orders 테이블에 guest_id 컬럼 존재 여부
        console.log('=== 6. orders 테이블에 guest_id 컬럼 존재 여부 ===');
        const [guestIdCheck] = await connection.execute(`
            SELECT 
                CASE 
                    WHEN COUNT(*) > 0 THEN 'guest_id 컬럼 존재함'
                    ELSE 'guest_id 컬럼 없음 (추가 필요)'
                END AS guest_id_status
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = 'orders'
              AND COLUMN_NAME = 'guest_id'
        `, [process.env.DB_NAME]);
        console.log(guestIdCheck[0].guest_id_status);
        console.log('');
        
        // 7. 데이터 무결성 확인
        console.log('=== 7. 데이터 무결성 확인 (고아 레코드) ===');
        const [orphanedOrders] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.user_id
            WHERE o.user_id IS NOT NULL AND u.user_id IS NULL
        `);
        console.log(`orders 테이블 고아 레코드: ${orphanedOrders[0].count}개`);
        
        const [orphanedWarranties] = await connection.execute(`
            SELECT COUNT(*) as count
            FROM warranties w
            LEFT JOIN users u ON w.user_id = u.user_id
            WHERE w.user_id IS NOT NULL AND u.user_id IS NULL
        `);
        console.log(`warranties 테이블 고아 레코드: ${orphanedWarranties[0].count}개`);
        console.log('');
        
        // 8. 트랜잭션 격리 수준
        console.log('=== 8. 트랜잭션 격리 수준 ===');
        const [isolation] = await connection.execute('SELECT @@transaction_isolation AS level');
        console.log(`현재 격리 수준: ${isolation[0].level}`);
        console.log('');
        
        console.log('✅ 상태 확인 완료!');
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        console.error(error);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    checkCurrentState();
}

module.exports = { checkCurrentState };

