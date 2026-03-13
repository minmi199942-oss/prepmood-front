const mysql = require('mysql2/promise');
const Logger = require('../logger');
require('dotenv').config();

/**
 * 만료된 stock_holds를 수동으로 EXPIRED 처리하는 스크립트.
 *
 * 사용 예:
 *   node scripts/expire_stock_holds_manual.js           # 기본: expires_at < NOW()
 *   node scripts/expire_stock_holds_manual.js 5         # expires_at < NOW() - 5분
 *
 * 주의:
 * - ACTIVE + expires_at < NOW() 인 hold 중에서만 EXPIRED 전이.
 * - 배치 크기는 200개로 제한하여 한 번에 너무 많은 행을 잠그지 않도록 함.
 * - 실제 운영 워커를 만들기 전까지, 사람이 명시적으로 실행하는 수동 안전장치 용도이다.
 */

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
};

async function main() {
    const graceMinutesArg = process.argv[2];
    const graceMinutes = Number.isFinite(Number(graceMinutesArg)) ? Number(graceMinutesArg) : 0;

    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        console.log('🔍 만료된 ACTIVE stock_holds 검색 중...');

        // graceMinutes > 0 이면, 그 만큼 여유를 두고 만료 처리
        const whereExpr = graceMinutes > 0
            ? `status = 'ACTIVE' AND expires_at < DATE_SUB(NOW(), INTERVAL ${graceMinutes} MINUTE)`
            : `status = 'ACTIVE' AND expires_at < NOW()`;

        const [rows] = await connection.execute(
            `SELECT id, stock_unit_id, order_id, expires_at
             FROM stock_holds
             WHERE ${whereExpr}
             ORDER BY expires_at ASC
             LIMIT 200`
        );

        if (rows.length === 0) {
            console.log('✅ 만료 대상 ACTIVE hold가 없습니다.');
            return;
        }

        console.log(`📋 만료 대상으로 선택된 ACTIVE hold: ${rows.length}개`);

        const ids = rows.map(r => r.id);
        const placeholders = ids.map(() => '?').join(',');

        const [result] = await connection.execute(
            `UPDATE stock_holds
             SET status = 'EXPIRED',
                 released_at = NOW()
             WHERE id IN (${placeholders}) AND status = 'ACTIVE'`,
            ids
        );

        console.log(`🔄 EXPIRED로 전이된 hold: ${result.affectedRows}개`);
        Logger.log('[expire_stock_holds_manual] 만료 hold EXPIRED 처리', {
            affectedRows: result.affectedRows,
            graceMinutes
        });
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        console.error(error.stack);
        Logger.error('[expire_stock_holds_manual] 실행 실패', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

main()
    .then(() => {
        console.log('✅ 완료');
        process.exit(0);
    })
    .catch((error) => {
        console.error('❌ 실패:', error);
        process.exit(1);
    });

