/**
 * db.js - 결제 엔진용 MySQL Connection Pool
 *
 * 설계 문서 GEMINI_FEEDBACK_ORDER_COMPLETE_BACK_NAVIGATION_REVIEW.md §2 Pool·커넥션 반영.
 * confirm 경로(Conn A / Conn B)만 이 풀 사용. 기존 라우트는 계속 mysql.createConnection(dbConfig) 사용.
 *
 * - supportBigNumbers, bigNumberStrings: 금액 BigInt/정수 직렬화·mysql2 호환 (§9.4)
 * - queueLimit: 입장 제어와 함께 대기열 상한 (Fail-fast → 503)
 */

const mysql = require('mysql2/promise');
require('dotenv').config();

const poolConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    waitForConnections: true,
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT || '100', 10),
    queueLimit: parseInt(process.env.DB_POOL_QUEUE_LIMIT || '200', 10),
    supportBigNumbers: true,
    bigNumberStrings: true
};

const pool = mysql.createPool(poolConfig);

module.exports = { pool };
