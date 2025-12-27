/**
 * 정품 인증 DB 관리 모듈
 * 
 * 역할:
 * - SQLite DB 연결 및 관리
 * - 제품 정보 조회/업데이트
 * - 인증 상태 관리
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const Logger = require('./logger');

// DB 파일 경로 (backend 폴더 내)
const DB_PATH = path.join(__dirname, 'prep.db');

// DB 인스턴스 (싱글톤 패턴)
let db = null;

/**
 * DB 연결 초기화
 * 서버 시작 시 한 번만 호출
 */
function initDatabase() {
    if (db) {
        return db; // 이미 연결되어 있으면 재사용
    }

    try {
        db = new Database(DB_PATH);
        
        // 외래 키 제약 조건 활성화
        db.pragma('foreign_keys = ON');
        
        // 테이블 생성
        db.exec(`
            CREATE TABLE IF NOT EXISTS products (
                token TEXT PRIMARY KEY,
                internal_code TEXT NOT NULL,
                product_name TEXT NOT NULL,
                status INTEGER DEFAULT 0,
                scan_count INTEGER DEFAULT 0,
                first_verified_at TEXT,
                last_verified_at TEXT
            )
        `);
        
        // DB 파일 권한 설정 (소유자만 읽기/쓰기: 600)
        // Windows에서는 chmod가 동작하지 않으므로 try-catch로 감쌈
        try {
            if (fs.existsSync(DB_PATH)) {
                fs.chmodSync(DB_PATH, 0o600);
            }
        } catch (error) {
            // Windows 환경에서는 무시 (권한 시스템이 다름)
            if (process.platform !== 'win32') {
                Logger.warn('[AUTH-DB] 파일 권한 설정 실패 (무시됨):', error.message);
            }
        }
        
        Logger.log('[AUTH-DB] SQLite DB 초기화 완료:', DB_PATH);
        return db;
    } catch (error) {
        Logger.error('[AUTH-DB] DB 초기화 실패:', error);
        throw error;
    }
}

/**
 * 토큰으로 제품 정보 조회
 * @param {string} token - 제품 토큰
 * @returns {Object|null} 제품 정보 또는 null
 */
function getProductByToken(token) {
    if (!db) {
        initDatabase();
    }

    try {
        const stmt = db.prepare(`
            SELECT token, internal_code, product_name, status, scan_count,
                   first_verified_at, last_verified_at
            FROM products
            WHERE token = ?
        `);
        
        const product = stmt.get(token);
        return product || null;
    } catch (error) {
        Logger.error('[AUTH-DB] 제품 조회 실패:', error);
        return null;
    }
}

/**
 * 첫 인증 처리 (status=0 -> 1)
 * @param {string} token - 제품 토큰
 */
function updateFirstVerification(token) {
    if (!db) {
        initDatabase();
    }

    try {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        const stmt = db.prepare(`
            UPDATE products
            SET status = 1,
                first_verified_at = ?,
                last_verified_at = ?,
                scan_count = 1
            WHERE token = ?
        `);
        
        stmt.run(now, now, token);
        Logger.log('[AUTH-DB] 첫 인증 완료:', token);
    } catch (error) {
        Logger.error('[AUTH-DB] 첫 인증 업데이트 실패:', error);
        throw error;
    }
}

/**
 * 재인증 처리 (status >= 1)
 * @param {string} token - 제품 토큰
 */
function updateReVerification(token) {
    if (!db) {
        initDatabase();
    }

    try {
        const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
        
        const stmt = db.prepare(`
            UPDATE products
            SET last_verified_at = ?,
                scan_count = scan_count + 1
            WHERE token = ?
        `);
        
        stmt.run(now, token);
        Logger.log('[AUTH-DB] 재인증 완료:', token);
    } catch (error) {
        Logger.error('[AUTH-DB] 재인증 업데이트 실패:', error);
        throw error;
    }
}

/**
 * 제품 데이터 일괄 삽입 (초기화 시 사용)
 * @param {Array} products - 제품 배열 [{token, internal_code, product_name}, ...]
 */
function insertProducts(products) {
    if (!db) {
        initDatabase();
    }

    try {
        const stmt = db.prepare(`
            INSERT OR IGNORE INTO products (token, internal_code, product_name, status, scan_count)
            VALUES (?, ?, ?, 0, 0)
        `);
        
        const insertMany = db.transaction((products) => {
            for (const product of products) {
                stmt.run(product.token, product.internal_code, product.product_name);
            }
        });
        
        insertMany(products);
        Logger.log(`[AUTH-DB] ${products.length}개 제품 데이터 삽입 완료`);
    } catch (error) {
        Logger.error('[AUTH-DB] 제품 삽입 실패:', error);
        throw error;
    }
}

/**
 * DB 연결 종료 (서버 종료 시)
 */
function closeDatabase() {
    if (db) {
        db.close();
        db = null;
        Logger.log('[AUTH-DB] DB 연결 종료');
    }
}

module.exports = {
    initDatabase,
    getProductByToken,
    updateFirstVerification,
    updateReVerification,
    insertProducts,
    closeDatabase
};

