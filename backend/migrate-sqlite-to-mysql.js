/**
 * SQLite → MySQL 이관 스크립트
 * 
 * 역할:
 * - SQLite prep.db의 products 테이블 → MySQL token_master 테이블 이관
 * - 기존 warranties와 owner_user_id 동기화
 * 
 * 실행 방법:
 * node migrate-sqlite-to-mysql.js
 */

require('dotenv').config();
const Database = require('better-sqlite3');
const mysql = require('mysql2/promise');
const path = require('path');
const Logger = require('./logger');

const SQLITE_DB_PATH = path.join(__dirname, 'prep.db');
const DB_CONFIG = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

async function migrateSqliteToMysql() {
    let sqliteDb;
    let mysqlConn;
    
    try {
        Logger.log('='.repeat(60));
        Logger.log('SQLite → MySQL 이관 시작');
        Logger.log('='.repeat(60));
        
        // 1. SQLite 연결
        if (!require('fs').existsSync(SQLITE_DB_PATH)) {
            throw new Error(`SQLite DB 파일을 찾을 수 없습니다: ${SQLITE_DB_PATH}`);
        }
        
        sqliteDb = new Database(SQLITE_DB_PATH);
        Logger.log('✅ SQLite 연결 성공');
        
        // 2. MySQL 연결
        mysqlConn = await mysql.createConnection(DB_CONFIG);
        Logger.log('✅ MySQL 연결 성공');
        
        // 3. SQLite에서 모든 토큰 조회
        const products = sqliteDb.prepare(`
            SELECT token, internal_code, product_name, status, scan_count,
                   first_verified_at, last_verified_at
            FROM products
            ORDER BY token
        `).all();
        
        Logger.log(`📊 SQLite에서 ${products.length}개 토큰 발견`);
        
        if (products.length === 0) {
            Logger.warn('⚠️  이관할 토큰이 없습니다.');
            return;
        }
        
        // 4. MySQL에서 기존 warranties의 owner_user_id 매핑 조회
        const [warranties] = await mysqlConn.execute(
            'SELECT token, owner_user_id FROM warranties WHERE token IS NOT NULL'
        );
        
        const tokenToUserId = {};
        warranties.forEach(w => {
            tokenToUserId[w.token] = w.owner_user_id;
        });
        
        Logger.log(`📋 MySQL warranties에서 ${warranties.length}개 소유주 매핑 발견`);
        
        // 5. token_master에 INSERT 또는 UPDATE
        let inserted = 0;
        let updated = 0;
        let skipped = 0;
        
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        for (const product of products) {
            try {
                // is_blocked 변환 (SQLite status → MySQL is_blocked)
                // status === 3 (무효화)만 차단, 나머지는 정상
                let isBlocked = 0;
                if (product.status === 3) {
                    isBlocked = 1;  // 무효화된 토큰은 차단
                }
                // status === 0, 1은 모두 is_blocked = 0 (정상)
                
                // owner_user_id 가져오기 (warranties에서)
                const ownerUserId = tokenToUserId[product.token] || null;
                
                // DATETIME 변환 (SQLite TEXT → MySQL DATETIME)
                // 필드명 변환: first_verified_at → first_scanned_at
                const firstScannedAt = product.first_verified_at 
                    ? product.first_verified_at.replace('T', ' ').substring(0, 19)
                    : null;
                const lastScannedAt = product.last_verified_at
                    ? product.last_verified_at.replace('T', ' ').substring(0, 19)
                    : null;
                
                // INSERT ... ON DUPLICATE KEY UPDATE
                // 새 필드(serial_number, rot_code, warranty_bottom_code, digital_warranty_code, digital_warranty_collection)는 SQLite에 없으므로 NULL 처리
                // internal_code는 SQLite에서 그대로 가져옴 (warranty_bottom_code와 별개)
                await mysqlConn.execute(
                    `INSERT INTO token_master 
                     (token, internal_code, product_name, serial_number, rot_code, warranty_bottom_code, digital_warranty_code, digital_warranty_collection,
                      is_blocked, owner_user_id, 
                      scan_count, first_scanned_at, last_scanned_at, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                     ON DUPLICATE KEY UPDATE
                     internal_code = VALUES(internal_code),
                     product_name = VALUES(product_name),
                     serial_number = COALESCE(serial_number, VALUES(serial_number)),
                     rot_code = COALESCE(rot_code, VALUES(rot_code)),
                     warranty_bottom_code = COALESCE(warranty_bottom_code, VALUES(warranty_bottom_code)),
                     digital_warranty_code = COALESCE(digital_warranty_code, VALUES(digital_warranty_code)),
                     digital_warranty_collection = COALESCE(digital_warranty_collection, VALUES(digital_warranty_collection)),
                     is_blocked = VALUES(is_blocked),
                     owner_user_id = COALESCE(owner_user_id, VALUES(owner_user_id)),
                     scan_count = VALUES(scan_count),
                     first_scanned_at = COALESCE(first_scanned_at, VALUES(first_scanned_at)),
                     last_scanned_at = VALUES(last_scanned_at),
                     updated_at = VALUES(updated_at)`,
                    [
                        product.token,
                        product.internal_code, // SQLite에서 그대로 가져옴
                        product.product_name,
                        null, // serial_number (SQLite에는 없음)
                        null, // rot_code (SQLite에는 없음)
                        null, // warranty_bottom_code (SQLite에는 없음)
                        null, // digital_warranty_code (SQLite에는 없음)
                        null, // digital_warranty_collection (SQLite에는 없음)
                        isBlocked,
                        ownerUserId,
                        product.scan_count || 0,
                        firstScannedAt,
                        lastScannedAt,
                        now,
                        now
                    ]
                );
                
                if (tokenToUserId[product.token]) {
                    updated++;
                } else {
                    inserted++;
                }
                
            } catch (error) {
                Logger.error(`❌ 토큰 ${product.token.substring(0, 4)}... 이관 실패:`, {
                    message: error.message
                });
                skipped++;
            }
        }
        
        Logger.log('='.repeat(60));
        Logger.log('✅ 이관 완료');
        Logger.log(`   - 신규 INSERT: ${inserted}개`);
        Logger.log(`   - 기존 UPDATE: ${updated}개`);
        Logger.log(`   - 실패 SKIP: ${skipped}개`);
        Logger.log('='.repeat(60));
        
    } catch (error) {
        Logger.error('❌ 이관 실패:', {
            message: error.message,
            stack: error.stack
        });
        process.exit(1);
    } finally {
        if (sqliteDb) sqliteDb.close();
        if (mysqlConn) await mysqlConn.end();
    }
}

// 스크립트 직접 실행 시
if (require.main === module) {
    migrateSqliteToMysql()
        .then(() => {
            Logger.log('✅ 이관 스크립트 완료');
            process.exit(0);
        })
        .catch(error => {
            Logger.error('❌ 이관 스크립트 실패:', error);
            process.exit(1);
        });
}

module.exports = { migrateSqliteToMysql };

