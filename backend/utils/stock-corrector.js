/**
 * stock-corrector.js
 * 
 * 재고 정정 유틸리티 (안전장치 포함)
 * 
 * 핵심 원칙:
 * - reserved → in_stock 변경 시 연결된 주문/단위 확인 필수
 * - 관리자 로그 + reason 필수
 */

const mysql = require('mysql2/promise');
const Logger = require('../logger');
require('dotenv').config();

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/**
 * 재고 상태 정정 (안전장치 포함)
 * 
 * @param {number} stockUnitId - stock_units.stock_unit_id
 * @param {string} newStatus - 변경할 상태 ('in_stock', 'returned' 등)
 * @param {string} reason - 변경 사유 (필수)
 * @param {number} adminId - 관리자 ID
 * 
 * @returns {Promise<Object>} 처리 결과
 */
async function correctStockStatus(stockUnitId, newStatus, reason, adminId) {
    let connection;
    try {
        if (!reason || reason.trim().length === 0) {
            throw new Error('변경 사유는 필수입니다.');
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 1. 현재 상태 확인 (FOR UPDATE)
            const [stock] = await connection.execute(
                'SELECT * FROM stock_units WHERE stock_unit_id = ? FOR UPDATE',
                [stockUnitId]
            );

            if (stock.length === 0) {
                await connection.rollback();
                await connection.end();
                throw new Error(`재고를 찾을 수 없습니다: stock_unit_id=${stockUnitId}`);
            }

            const currentStock = stock[0];

            // 2. reserved → in_stock 변경인 경우에만 안전장치 체크
            if (currentStock.status === 'reserved' && newStatus === 'in_stock') {
                // 2-1. reserved_by_order_id 확인
                if (currentStock.reserved_by_order_id) {
                    // 해당 주문의 모든 order_item_units 확인
                    const [units] = await connection.execute(
                        `SELECT oiu.order_item_unit_id, oiu.unit_status, oiu.active_lock
                         FROM order_item_units oiu
                         WHERE oiu.stock_unit_id = ?`,
                        [stockUnitId]
                    );

                    // 2-2. active_lock=1인 레코드가 있으면 금지
                    const activeUnits = units.filter(u => u.active_lock === 1);
                    if (activeUnits.length > 0) {
                        await connection.rollback();
                        await connection.end();
                        throw new Error('활성 주문 단위가 연결되어 있어 정정할 수 없습니다.');
                    }

                    // 2-3. 모든 단위가 refunded인지 확인
                    const allRefunded = units.length === 0 || units.every(u => u.unit_status === 'refunded');
                    if (!allRefunded) {
                        await connection.rollback();
                        await connection.end();
                        throw new Error('모든 주문 단위가 refunded 상태가 아닙니다.');
                    }
                }
            }

            // 3. 상태 변경
            await connection.execute(
                `UPDATE stock_units 
                 SET status = ?, 
                     reserved_by_order_id = NULL, 
                     reserved_at = NULL,
                     updated_at = NOW() 
                 WHERE stock_unit_id = ?`,
                [newStatus, stockUnitId]
            );

            // 4. 관리자 로그 기록 (admin_audit_logs 테이블이 있다면)
            // 현재는 Logger로만 기록
            Logger.log('[STOCK_CORRECTOR] 재고 상태 정정', {
                stockUnitId,
                oldStatus: currentStock.status,
                newStatus,
                reason,
                adminId
            });

            await connection.commit();
            await connection.end();

            return {
                success: true,
                message: '재고 상태가 정정되었습니다.',
                stockUnitId,
                oldStatus: currentStock.status,
                newStatus
            };

        } catch (error) {
            await connection.rollback();
            await connection.end();
            throw error;
        }

    } catch (error) {
        Logger.error('[STOCK_CORRECTOR] 재고 상태 정정 실패', {
            stockUnitId,
            newStatus,
            reason,
            adminId,
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        throw error;
    }
}

module.exports = {
    correctStockStatus
};
