/**
 * 설계 결정을 위한 DB 상태 확인 스크립트
 * 실행: node backend/check_design_decisions.js
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

async function checkDesignDecisions() {
    let connection;
    
    try {
        connection = await mysql.createConnection(dbConfig);
        console.log('✅ MySQL 연결 성공\n');
        
        // 1. orders.user_id NULL 허용 여부 확인
        console.log('=== 1. orders.user_id NULL 허용 여부 확인 ===');
        const [ordersColumns] = await connection.execute(`
            SELECT 
                COLUMN_NAME,
                IS_NULLABLE,
                COLUMN_TYPE,
                COLUMN_DEFAULT,
                COLUMN_COMMENT
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = 'orders'
              AND COLUMN_NAME IN ('user_id', 'guest_id')
            ORDER BY COLUMN_NAME
        `, [process.env.DB_NAME]);
        
        console.table(ordersColumns);
        
        const [ordersData] = await connection.execute(`
            SELECT 
                COUNT(*) AS total_orders,
                COUNT(user_id) AS orders_with_user_id,
                COUNT(CASE WHEN user_id IS NULL THEN 1 END) AS orders_with_null_user_id,
                COUNT(guest_id) AS orders_with_guest_id,
                COUNT(CASE WHEN guest_id IS NULL THEN 1 END) AS orders_with_null_guest_id
            FROM orders
        `);
        
        console.log('\norders 테이블 데이터 상태:');
        console.table(ordersData);
        
        // 2. token_master 양방향 참조 확인
        console.log('\n=== 2. token_master 양방향 참조 확인 ===');
        const [tokenMasterColumns] = await connection.execute(`
            SELECT 
                COLUMN_NAME,
                IS_NULLABLE,
                COLUMN_TYPE,
                COLUMN_KEY,
                COLUMN_COMMENT
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = 'token_master'
              AND COLUMN_NAME IN ('token', 'owner_warranty_public_id', 'owner_user_id')
            ORDER BY COLUMN_NAME
        `, [process.env.DB_NAME]);
        
        console.table(tokenMasterColumns);
        
        const [tokenMasterFKs] = await connection.execute(`
            SELECT 
                CONSTRAINT_NAME,
                TABLE_NAME,
                COLUMN_NAME,
                REFERENCED_TABLE_NAME,
                REFERENCED_COLUMN_NAME
            FROM information_schema.KEY_COLUMN_USAGE
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = 'token_master'
              AND REFERENCED_TABLE_NAME IS NOT NULL
        `, [process.env.DB_NAME]);
        
        console.log('\ntoken_master FK 관계:');
        console.table(tokenMasterFKs);
        
        const [tokenMasterUsage] = await connection.execute(`
            SELECT 
                COUNT(*) AS total_tokens,
                COUNT(owner_warranty_public_id) AS tokens_with_warranty_link,
                COUNT(CASE WHEN owner_warranty_public_id IS NULL THEN 1 END) AS tokens_without_warranty_link
            FROM token_master
        `);
        
        console.log('\nowner_warranty_public_id 사용 현황:');
        console.table(tokenMasterUsage);
        
        // 3. warranties 테이블 구조 확인
        console.log('\n=== 3. warranties 테이블 구조 확인 ===');
        const [warrantiesColumns] = await connection.execute(`
            SELECT 
                COLUMN_NAME,
                IS_NULLABLE,
                COLUMN_TYPE,
                COLUMN_KEY,
                COLUMN_COMMENT
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = 'warranties'
              AND COLUMN_NAME IN ('id', 'user_id', 'token', 'public_id', 'source_order_item_unit_id')
            ORDER BY COLUMN_NAME
        `, [process.env.DB_NAME]);
        
        console.table(warrantiesColumns);
        
        // 4. orders_idempotency 테이블 확인
        console.log('\n=== 4. orders_idempotency 테이블 확인 ===');
        const [idempotencyColumns] = await connection.execute(`
            SELECT 
                COLUMN_NAME,
                IS_NULLABLE,
                COLUMN_TYPE,
                COLUMN_KEY,
                COLUMN_COMMENT
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME = 'orders_idempotency'
            ORDER BY COLUMN_NAME
        `, [process.env.DB_NAME]);
        
        console.table(idempotencyColumns);
        
        // 5. 신규 테이블 존재 여부 확인
        console.log('\n=== 5. 신규 테이블 존재 여부 확인 ===');
        const [newTables] = await connection.execute(`
            SELECT 
                TABLE_NAME,
                TABLE_COMMENT
            FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ?
              AND TABLE_NAME IN (
                'order_item_units',
                'stock_units',
                'paid_events',
                'shipments',
                'shipment_units',
                'warranty_events',
                'warranty_transfers',
                'invoices'
              )
            ORDER BY TABLE_NAME
        `, [process.env.DB_NAME]);
        
        console.table(newTables);
        
        // 6. token_master와 warranties 연결 현황
        console.log('\n=== 6. token_master와 warranties 연결 현황 ===');
        const [connectionStatus] = await connection.execute(`
            SELECT 
                COUNT(DISTINCT tm.token) AS total_tokens,
                COUNT(DISTINCT tm.owner_warranty_public_id) AS tokens_linked_to_warranties,
                COUNT(DISTINCT w.public_id) AS total_warranties,
                COUNT(DISTINCT w.token) AS warranties_with_token
            FROM token_master tm
            LEFT JOIN warranties w ON tm.owner_warranty_public_id = w.public_id
        `);
        
        console.table(connectionStatus);
        
        // 불일치 확인
        const [mismatches] = await connection.execute(`
            SELECT 
                'token_master에 있지만 warranties에 없는 public_id' AS issue_type,
                COUNT(*) AS count
            FROM token_master tm
            WHERE tm.owner_warranty_public_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM warranties w 
                WHERE w.public_id = tm.owner_warranty_public_id
              )
            UNION ALL
            SELECT 
                'warranties에 있지만 token_master에 연결되지 않은 public_id' AS issue_type,
                COUNT(*) AS count
            FROM warranties w
            WHERE NOT EXISTS (
                SELECT 1 FROM token_master tm 
                WHERE tm.owner_warranty_public_id = w.public_id
              )
        `);
        
        console.log('\n양방향 참조 불일치 확인:');
        console.table(mismatches);
        
        console.log('\n✅ 확인 완료!');
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        console.error(error.stack);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

checkDesignDecisions();
