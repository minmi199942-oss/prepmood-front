/**
 * 마이그레이션 실행 스크립트
 * 
 * 안전장치:
 * - migrations/ 디렉토리 밖의 파일 실행 차단
 * - schema_migrations 테이블로 실행 이력 기록
 * - 중복 실행 방지
 * - Phase 0 정책 준수 (민감 정보 로깅 방지)
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

// 안전장치 1: migrations/ 디렉토리 밖의 파일 실행 차단
const migrationsDir = path.join(__dirname, 'migrations');
const migrationPath = path.join(__dirname, migrationFile);

// 상대 경로 정규화
const normalizedPath = path.normalize(migrationPath);
const normalizedDir = path.normalize(migrationsDir);

if (!normalizedPath.startsWith(normalizedDir + path.sep) && normalizedPath !== normalizedDir) {
    console.error('❌ 보안: migrations/ 디렉토리 밖의 파일은 실행할 수 없습니다.');
    console.error(`   요청 경로: ${migrationFile}`);
    process.exit(1);
}

if (!fs.existsSync(migrationPath)) {
    console.error(`❌ 마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    process.exit(1);
}

/**
 * schema_migrations 테이블 생성 (실행 이력 기록용)
 */
async function ensureSchemaMigrationsTable(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            migration_file VARCHAR(255) NOT NULL UNIQUE,
            executed_at DATETIME NOT NULL,
            execution_time_ms INT,
            status ENUM('success', 'failed') NOT NULL,
            error_message TEXT,
            INDEX idx_migration_file (migration_file)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

/**
 * 마이그레이션 실행 이력 확인
 */
async function checkMigrationHistory(connection, migrationFile) {
    const [rows] = await connection.execute(
        'SELECT * FROM schema_migrations WHERE migration_file = ?',
        [migrationFile]
    );
    return rows[0] || null;
}

/**
 * 마이그레이션 실행 이력 기록
 */
async function recordMigration(connection, migrationFile, status, executionTime, errorMessage = null) {
    await connection.execute(
        'INSERT INTO schema_migrations (migration_file, executed_at, execution_time_ms, status, error_message) VALUES (?, NOW(), ?, ?, ?)',
        [migrationFile, executionTime, status, errorMessage]
    );
}

async function runMigration() {
    let connection;
    const startTime = Date.now();
    
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
        
        // 안전장치 2: schema_migrations 테이블 생성
        await ensureSchemaMigrationsTable(connection);
        
        // 안전장치 3: 중복 실행 확인
        const history = await checkMigrationHistory(connection, migrationFile);
        if (history && history.status === 'success') {
            console.log(`⚠️  이미 실행된 마이그레이션입니다: ${migrationFile}`);
            console.log(`   실행 시간: ${history.executed_at}`);
            console.log(`   재실행하려면 schema_migrations 테이블에서 해당 레코드를 삭제하세요.`);
            return;
        }
        
        // 마이그레이션 파일 읽기
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log(`📄 마이그레이션 파일 읽기 완료: ${migrationFile}`);
        
        // SQL 실행 (트랜잭션은 DDL 특성상 제한적이지만, 최소한 이력은 기록)
        console.log('🚀 마이그레이션 실행 중...');
        await connection.query(sql);
        
        const executionTime = Date.now() - startTime;
        
        // 실행 이력 기록
        await recordMigration(connection, migrationFile, 'success', executionTime);
        
        console.log(`✅ 마이그레이션 완료! (${executionTime}ms)`);
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Phase 0 정책: error 객체 전체 덤프 금지
        console.error('❌ 마이그레이션 실패:', error.message);
        
        if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_ENTRY') {
            console.log('⚠️  테이블/제약조건이 이미 존재합니다. (정상)');
            // 이미 존재하는 경우도 성공으로 기록
            if (connection) {
                await recordMigration(connection, migrationFile, 'success', executionTime, 'Table/constraint already exists');
            }
        } else {
            // 실패 이력 기록
            if (connection) {
                await recordMigration(connection, migrationFile, 'failed', executionTime, error.message);
            }
            process.exit(1);
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

runMigration();

