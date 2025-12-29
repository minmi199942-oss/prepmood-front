/**
 * 마이그레이션 실행 스크립트
 * 
 * 안전장치:
 * - migrations/ 디렉토리 밖의 파일 실행 차단
 * - schema_migrations 테이블로 실행 이력 기록
 * - 중복 실행 방지 (file_hash 불일치 시 fail-fast)
 * - Phase 0 정책 준수 (민감 정보 로깅 방지)
 * 
 * 사용법:
 * node backend/run-migration.js migrations/001_create_warranties_table.sql
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
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
 * 파일 해시 계산 (SHA256)
 */
function calculateFileHash(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * schema_migrations 테이블 생성 (실행 이력 기록용)
 * 
 * 안전장치:
 * - migration_file에 UNIQUE 제약 (DB 레벨 중복 방지)
 * - file_hash로 파일 내용 변경 감지 (재실행 허용이 아닌 사고 방지용)
 */
async function ensureSchemaMigrationsTable(connection) {
    await connection.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            migration_file VARCHAR(255) NOT NULL UNIQUE,
            file_hash VARCHAR(64) NOT NULL COMMENT 'SHA256 해시 (파일 변경 감지용)',
            executed_at DATETIME NOT NULL,
            execution_time_ms INT,
            status ENUM('success', 'failed') NOT NULL,
            error_message TEXT,
            INDEX idx_migration_file (migration_file),
            INDEX idx_executed_at (executed_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
}

/**
 * 마이그레이션 실행 이력 확인
 * 
 * 정책: 같은 파일명이 이미 실행되었으면 재실행 금지
 * - file_hash가 동일 → 스킵 (정상)
 * - file_hash가 다름 → 실패 (파일 변경 감지, 새 파일로 분리해야 함)
 */
async function checkMigrationHistory(connection, migrationFile, fileHash) {
    const [rows] = await connection.execute(
        'SELECT * FROM schema_migrations WHERE migration_file = ?',
        [migrationFile]
    );
    
    if (rows.length === 0) {
        return null; // 실행 이력 없음 → 실행 가능
    }
    
    const history = rows[0];
    
    // 이미 실행된 마이그레이션
    if (history.status === 'success') {
        // 파일 해시 비교
        if (history.file_hash === fileHash) {
            // 해시가 동일 → 정상 (스킵)
            return history;
        } else {
            // 해시가 다름 → 파일이 변경됨 (사고 방지: fail-fast)
            console.error(`❌ 마이그레이션 파일이 변경되었습니다: ${migrationFile}`);
            console.error(`   기존 해시: ${history.file_hash.substring(0, 8)}...`);
            console.error(`   현재 해시: ${fileHash.substring(0, 8)}...`);
            console.error(`   실행 시간: ${history.executed_at}`);
            console.error('');
            console.error('⚠️  마이그레이션 정책 위반:');
            console.error('   이미 실행된 마이그레이션 파일을 수정할 수 없습니다.');
            console.error('   새 마이그레이션 파일(예: 002_...)을 생성하여 변경사항을 적용하세요.');
            process.exit(2); // 파일 변경 감지 (종료 코드 2)
        }
    }
    
    // 실패한 마이그레이션은 재실행 가능 (null 반환)
    return null;
}

/**
 * 마이그레이션 실행 이력 기록
 * 
 * @param {Object} connection - MySQL 연결
 * @param {Object} params - 기록할 정보
 * @param {string} params.migrationFile - 마이그레이션 파일명
 * @param {string} params.fileHash - 파일 해시 (SHA256)
 * @param {string} params.status - 실행 상태 ('success' | 'failed')
 * @param {number} params.executionTimeMs - 실행 시간 (밀리초)
 * @param {string|null} params.errorMessage - 에러 메시지 (실패 시)
 * @returns {Object} - { inserted: boolean, existing?: Object }
 *   - inserted: true → 기록 성공
 *   - inserted: false → UNIQUE 충돌, existing에 기존 기록 포함
 */
async function recordMigration(connection, params) {
    const { migrationFile, fileHash, status, executionTimeMs, errorMessage = null } = params;
    
    try {
        await connection.execute(
            'INSERT INTO schema_migrations (migration_file, file_hash, executed_at, execution_time_ms, status, error_message) VALUES (?, ?, NOW(), ?, ?, ?)',
            [migrationFile, fileHash, executionTimeMs, status, errorMessage]
        );
        return { inserted: true }; // 기록 성공
    } catch (error) {
        // UNIQUE 충돌: 다른 프로세스가 이미 기록
        if (error.code === 'ER_DUP_ENTRY' || error.code === 1062) {
            // 실제 DB 상태를 다시 조회하여 확인
            // UNIQUE 제약이 있으므로 정확히 1건만 반환됨 (LIMIT 1은 안전장치)
            const [rows] = await connection.execute(
                'SELECT * FROM schema_migrations WHERE migration_file = ? LIMIT 1',
                [migrationFile]
            );
            return {
                inserted: false,
                existing: rows[0] || null // 기존 기록 반환
            };
        }
        throw error; // 다른 에러는 재던지기
    }
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
        
        // 파일 해시 계산
        const fileHash = calculateFileHash(migrationPath);
        
        // 안전장치 3: 중복 실행 확인 (file_hash 불일치 시 fail-fast)
        const history = await checkMigrationHistory(connection, migrationFile, fileHash);
        if (history && history.status === 'success') {
            // checkMigrationHistory에서 file_hash 불일치 시 이미 exit(1) 처리됨
            // 여기 도달했다면 해시가 동일한 경우 (정상 스킵)
            console.log(`⚠️  이미 실행된 마이그레이션입니다: ${migrationFile}`);
            console.log(`   실행 시간: ${history.executed_at}`);
            console.log(`   재실행하려면 schema_migrations 테이블에서 해당 레코드를 삭제하세요.`);
            return;
        }
        
        // 마이그레이션 파일 읽기
        const sql = fs.readFileSync(migrationPath, 'utf8');
        console.log(`📄 마이그레이션 파일: ${migrationFile}`);
        
        // SQL 실행 (트랜잭션은 DDL 특성상 제한적이지만, 최소한 이력은 기록)
        console.log('🚀 마이그레이션 실행 중...');
        await connection.query(sql);
        
        const executionTime = Date.now() - startTime;
        
        // 실행 이력 기록 (동시 실행 경합 처리)
        const recordResult = await recordMigration(connection, {
            migrationFile,
            fileHash,
            status: 'success',
            executionTimeMs: executionTime,
            errorMessage: null
        });
        
        if (!recordResult.inserted) {
            // UNIQUE 충돌: 다른 프로세스가 이미 기록
            const existing = recordResult.existing;
            
            if (!existing) {
                // 드문 경우: 충돌했는데 조회 결과가 없음
                console.error('❌ UNIQUE 충돌 발생했으나 기존 기록을 찾을 수 없습니다.');
                process.exit(1);
            }
            
            // file_hash 비교 (파일 변경 감지가 최우선)
            if (existing.file_hash !== fileHash) {
                console.error(`❌ 마이그레이션 파일이 변경되었습니다: ${migrationFile}`);
                console.error(`   기존 해시: ${existing.file_hash.substring(0, 8)}...`);
                console.error(`   현재 해시: ${fileHash.substring(0, 8)}...`);
                console.error(`   실행 시간: ${existing.executed_at}`);
                console.error('');
                console.error('⚠️  마이그레이션 정책 위반:');
                console.error('   이미 실행된 마이그레이션 파일을 수정할 수 없습니다.');
                console.error('   새 마이그레이션 파일(예: 002_...)을 생성하여 변경사항을 적용하세요.');
                process.exit(2); // 파일 변경 감지
            }
            
            // file_hash가 동일한 경우, status 확인
            if (existing.status === 'success') {
                // 다른 프로세스가 성공적으로 완료
                console.log('⚠️  다른 프로세스가 이미 마이그레이션을 완료했습니다.');
                console.log(`   실행 시간: ${existing.executed_at}`);
                process.exit(0); // 정상 종료 (이미 적용됨)
            } else if (existing.status === 'failed') {
                // 다른 프로세스가 실패한 상태로 기록
                console.error('❌ 다른 프로세스가 마이그레이션을 실패한 상태로 기록했습니다.');
                console.error(`   실패 시간: ${existing.executed_at}`);
                console.error(`   에러: ${existing.error_message || '알 수 없음'}`);
                process.exit(1); // 비정상 종료 (실패 상태)
            } else {
                // 예상치 못한 status 값
                console.error(`❌ 예상치 못한 상태: ${existing.status}`);
                process.exit(1);
            }
        }
        
        console.log(`✅ 마이그레이션 완료 (${executionTime}ms)`);
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Phase 0 정책: error 객체 전체 덤프 금지
        console.error('❌ 마이그레이션 실패:', error.message);
        
        if (error.code === 'ER_TABLE_EXISTS_ERROR' || error.code === 'ER_DUP_ENTRY') {
            console.log('⚠️  테이블/제약조건이 이미 존재합니다. (정상)');
            // 이미 존재하는 경우도 성공으로 기록 (동시 실행 경합 처리)
            if (connection) {
                const fileHash = calculateFileHash(migrationPath);
                const recordResult = await recordMigration(connection, {
                    migrationFile,
                    fileHash,
                    status: 'success',
                    executionTimeMs: executionTime,
                    errorMessage: 'Table/constraint already exists'
                });
                
                if (!recordResult.inserted) {
                    // UNIQUE 충돌: 다른 프로세스가 이미 기록
                    const existing = recordResult.existing;
                    
                    if (existing) {
                        // file_hash 비교 (파일 변경 감지가 최우선)
                        if (existing.file_hash !== fileHash) {
                            console.error(`❌ 마이그레이션 파일이 변경되었습니다: ${migrationFile}`);
                            process.exit(2); // 파일 변경 감지
                        }
                        
                        // file_hash가 동일한 경우, status 확인
                        if (existing.status === 'success') {
                            console.log('⚠️  다른 프로세스가 이미 마이그레이션을 완료했습니다.');
                            process.exit(0); // 정상 종료
                        } else if (existing.status === 'failed') {
                            console.error('❌ 다른 프로세스가 실패 상태로 기록했습니다.');
                            process.exit(1);
                        }
                    }
                }
            }
        } else {
            // 실패 이력 기록 (동시 실행 경합 처리)
            if (connection) {
                const fileHash = calculateFileHash(migrationPath);
                const recordResult = await recordMigration(connection, {
                    migrationFile,
                    fileHash,
                    status: 'failed',
                    executionTimeMs: executionTime,
                    errorMessage: error.message
                });
                
                if (!recordResult.inserted) {
                    // UNIQUE 충돌: 다른 프로세스가 이미 기록
                    const existing = recordResult.existing;
                    
                    if (existing) {
                        // file_hash 비교
                        if (existing.file_hash !== fileHash) {
                            console.error(`❌ 마이그레이션 파일이 변경되었습니다: ${migrationFile}`);
                            process.exit(2); // 파일 변경 감지
                        }
                        
                        // status 확인
                        if (existing.status === 'failed') {
                            console.error('⚠️  다른 프로세스가 이미 실패 상태로 기록했습니다.');
                            console.error(`   에러: ${existing.error_message || '알 수 없음'}`);
                        } else if (existing.status === 'success') {
                            // 다른 프로세스가 성공 상태로 기록 (드문 경우)
                            console.log('⚠️  다른 프로세스가 성공 상태로 기록했습니다.');
                        }
                    }
                }
            }
            process.exit(1); // 비정상 종료 (마이그레이션 실패)
        }
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

runMigration();
