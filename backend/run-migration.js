/**
 * 마이그레이션 실행 스크립트
 * 
 * 사용법:
 * node backend/run-migration.js migrations/001_create_warranties_table.sql
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
require('dotenv').config();

const migrationFile = process.argv[2];

if (!migrationFile) {
    console.error('❌ 사용법: node backend/run-migration.js <migration-file>');
    console.error('예: node backend/run-migration.js migrations/001_create_warranties_table.sql');
    process.exit(1);
}

const migrationPath = path.join(__dirname, migrationFile);

if (!fs.existsSync(migrationPath)) {
    console.error(`❌ 마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    process.exit(1);
}

async function runMigration() {
    let connection;
    
    try {
        // MySQL 연결
        connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME,
            multipleStatements: true  // 여러 SQL 문 실행 허용
        });

        console.log('✅ MySQL 연결 성공');
        
        // 마이그레이션 파일 읽기
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log(`📄 마이그레이션 파일 읽기 완료: ${migrationFile}`);
        
        // SQL 실행
        console.log('🚀 마이그레이션 실행 중...');
        await connection.query(sql);
        
        console.log('✅ 마이그레이션 완료!');
        
    } catch (error) {
        console.error('❌ 마이그레이션 실패:', error.message);
        if (error.code === 'ER_TABLE_EXISTS_ERROR') {
            console.log('⚠️  테이블이 이미 존재합니다. (정상)');
        } else {
            console.error('에러 상세:', error);
            process.exit(1);
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

runMigration();

