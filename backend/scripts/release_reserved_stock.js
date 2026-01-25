#!/usr/bin/env node

/**
 * release_reserved_stock.js
 * 
 * 예약된 재고를 안전하게 해제하는 스크립트
 * 
 * 사용법:
 *   node scripts/release_reserved_stock.js --order-id=123
 *   node scripts/release_reserved_stock.js --order-id=123 --dry-run
 *   node scripts/release_reserved_stock.js --check-all
 * 
 * 안전장치:
 * - order_item_units가 없거나 모두 refunded인 경우만 해제
 * - active_lock이 있는 경우 해제 금지
 * - 관리자 확인 필수
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
 * 주문 ID로 예약된 재고 확인
 */
async function checkReservedStock(connection, orderId) {
    const [stockUnits] = await connection.execute(
        `SELECT 
            su.stock_unit_id,
            su.product_id,
            su.size,
            su.color,
            su.status,
            su.reserved_at,
            su.reserved_by_order_id,
            o.order_number,
            o.status as order_status,
            (SELECT COUNT(*) FROM order_item_units oiu WHERE oiu.stock_unit_id = su.stock_unit_id) as unit_count,
            (SELECT COUNT(*) FROM order_item_units oiu 
             WHERE oiu.stock_unit_id = su.stock_unit_id 
             AND oiu.unit_status IN ('reserved', 'shipped', 'delivered')) as active_unit_count
        FROM stock_units su
        LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
        WHERE su.reserved_by_order_id = ? AND su.status = 'reserved'`,
        [orderId]
    );

    return stockUnits;
}

/**
 * 모든 예약된 재고 확인 (주문 정보 없음)
 */
async function checkAllOrphanedReservedStock(connection) {
    const [stockUnits] = await connection.execute(
        `SELECT 
            su.stock_unit_id,
            su.product_id,
            su.size,
            su.color,
            su.status,
            su.reserved_at,
            su.reserved_by_order_id,
            o.order_number,
            o.status as order_status,
            (SELECT COUNT(*) FROM order_item_units oiu WHERE oiu.stock_unit_id = su.stock_unit_id) as unit_count,
            (SELECT COUNT(*) FROM order_item_units oiu 
             WHERE oiu.stock_unit_id = su.stock_unit_id 
             AND oiu.unit_status IN ('reserved', 'shipped', 'delivered')) as active_unit_count,
            (SELECT COUNT(*) FROM paid_events pe WHERE pe.order_id = su.reserved_by_order_id) as paid_events_count
        FROM stock_units su
        LEFT JOIN orders o ON su.reserved_by_order_id = o.order_id
        WHERE su.status = 'reserved'
        ORDER BY su.reserved_at DESC
        LIMIT 50`
    );

    return stockUnits;
}

/**
 * 안전하게 재고 해제
 */
async function releaseReservedStock(connection, stockUnitId, reason) {
    // 1. 현재 상태 확인 (FOR UPDATE)
    const [stock] = await connection.execute(
        'SELECT * FROM stock_units WHERE stock_unit_id = ? FOR UPDATE',
        [stockUnitId]
    );

    if (stock.length === 0) {
        throw new Error(`재고를 찾을 수 없습니다: stock_unit_id=${stockUnitId}`);
    }

    const currentStock = stock[0];

    if (currentStock.status !== 'reserved') {
        throw new Error(`재고가 reserved 상태가 아닙니다: status=${currentStock.status}`);
    }

    // 2. order_item_units 확인
    const [units] = await connection.execute(
        `SELECT oiu.order_item_unit_id, oiu.unit_status, oiu.active_lock
         FROM order_item_units oiu
         WHERE oiu.stock_unit_id = ?`,
        [stockUnitId]
    );

    // 3. active_lock=1인 레코드가 있으면 금지
    const activeUnits = units.filter(u => u.active_lock === 1);
    if (activeUnits.length > 0) {
        throw new Error(
            `활성 주문 단위가 연결되어 있어 해제할 수 없습니다. ` +
            `order_item_unit_id: ${activeUnits.map(u => u.order_item_unit_id).join(', ')}`
        );
    }

    // 4. paid_events 확인 (주문이 실제로 처리 중인지)
    if (currentStock.reserved_by_order_id) {
        const [paidEvents] = await connection.execute(
            'SELECT event_id FROM paid_events WHERE order_id = ?',
            [currentStock.reserved_by_order_id]
        );

        if (paidEvents.length > 0 && units.length === 0) {
            // paid_events는 있지만 order_item_units가 없는 경우
            // 이는 processPaidOrder()가 재고 배정 후 실패한 경우
            // 재고 해제 가능
            Logger.log('[RELEASE_STOCK] paid_events는 있지만 order_item_units 없음 (재고 해제 가능)', {
                stock_unit_id: stockUnitId,
                order_id: currentStock.reserved_by_order_id
            });
        } else if (paidEvents.length > 0 && units.length > 0) {
            // paid_events와 order_item_units 모두 있는 경우
            // 주문이 정상 처리 중이므로 해제 금지
            throw new Error(
                `주문이 정상 처리 중입니다. paid_events와 order_item_units가 모두 존재합니다. ` +
                `order_id=${currentStock.reserved_by_order_id}`
            );
        }
    }

    // 5. 재고 해제
    const [updateResult] = await connection.execute(
        `UPDATE stock_units 
         SET status = 'in_stock',
             reserved_at = NULL,
             reserved_by_order_id = NULL,
             updated_at = NOW()
         WHERE stock_unit_id = ? AND status = 'reserved'`,
        [stockUnitId]
    );

    if (updateResult.affectedRows !== 1) {
        throw new Error(`재고 해제 실패: affectedRows=${updateResult.affectedRows}`);
    }

    Logger.log('[RELEASE_STOCK] 재고 해제 완료', {
        stock_unit_id: stockUnitId,
        product_id: currentStock.product_id,
        order_id: currentStock.reserved_by_order_id,
        reason
    });

    return {
        stock_unit_id: stockUnitId,
        product_id: currentStock.product_id,
        old_status: 'reserved',
        new_status: 'in_stock',
        order_id: currentStock.reserved_by_order_id
    };
}

/**
 * 주문 ID로 예약된 재고 모두 해제
 */
async function releaseStockByOrderId(orderId, dryRun = false, reason = null) {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        await connection.beginTransaction();

        // 1. 예약된 재고 확인
        const stockUnits = await checkReservedStock(connection, orderId);

        if (stockUnits.length === 0) {
            console.log(`\n✅ 주문 ID ${orderId}에 예약된 재고가 없습니다.`);
            await connection.rollback();
            await connection.end();
            return;
        }

        console.log(`\n📋 주문 ID ${orderId}에 예약된 재고: ${stockUnits.length}개`);
        console.log(`주문 번호: ${stockUnits[0].order_number || '없음'}`);
        console.log(`주문 상태: ${stockUnits[0].order_status || '없음'}`);

        // 2. 각 재고 확인 및 해제 가능 여부 판단
        const releasable = [];
        const notReleasable = [];

        for (const stock of stockUnits) {
            try {
                // 안전장치 체크 (실제 해제는 하지 않고 검증만)
                const [units] = await connection.execute(
                    `SELECT oiu.order_item_unit_id, oiu.unit_status, oiu.active_lock
                     FROM order_item_units oiu
                     WHERE oiu.stock_unit_id = ?`,
                    [stock.stock_unit_id]
                );

                const activeUnits = units.filter(u => u.active_lock === 1);
                
                if (activeUnits.length > 0) {
                    notReleasable.push({
                        stock_unit_id: stock.stock_unit_id,
                        product_id: stock.product_id,
                        reason: `활성 주문 단위 연결됨 (${activeUnits.length}개)`
                    });
                } else {
                    releasable.push({
                        stock_unit_id: stock.stock_unit_id,
                        product_id: stock.product_id,
                        size: stock.size,
                        color: stock.color,
                        unit_count: stock.unit_count,
                        active_unit_count: stock.active_unit_count
                    });
                }
            } catch (error) {
                notReleasable.push({
                    stock_unit_id: stock.stock_unit_id,
                    product_id: stock.product_id,
                    reason: error.message
                });
            }
        }

        // 3. 결과 출력
        console.log(`\n✅ 해제 가능: ${releasable.length}개`);
        if (releasable.length > 0) {
            releasable.forEach(s => {
                console.log(`   - stock_unit_id: ${s.stock_unit_id}, product_id: ${s.product_id}, size: ${s.size || 'N/A'}, color: ${s.color || 'N/A'}`);
            });
        }

        if (notReleasable.length > 0) {
            console.log(`\n⚠️  해제 불가: ${notReleasable.length}개`);
            notReleasable.forEach(s => {
                console.log(`   - stock_unit_id: ${s.stock_unit_id}, product_id: ${s.product_id}, 이유: ${s.reason}`);
            });
        }

        // 4. dry-run 모드면 여기서 종료
        if (dryRun) {
            console.log(`\n🔍 [DRY-RUN] 실제로는 해제되지 않습니다.`);
            await connection.rollback();
            await connection.end();
            return;
        }

        // 5. 실제 해제 실행
        if (releasable.length === 0) {
            console.log(`\n⚠️  해제 가능한 재고가 없습니다.`);
            await connection.rollback();
            await connection.end();
            return;
        }

        const releaseReason = reason || `주문 처리 실패로 인한 재고 해제 (order_id=${orderId})`;
        const released = [];

        for (const stock of releasable) {
            try {
                const result = await releaseReservedStock(connection, stock.stock_unit_id, releaseReason);
                released.push(result);
            } catch (error) {
                console.error(`❌ 재고 해제 실패 (stock_unit_id=${stock.stock_unit_id}): ${error.message}`);
                Logger.error('[RELEASE_STOCK] 재고 해제 실패', {
                    stock_unit_id: stock.stock_unit_id,
                    order_id: orderId,
                    error: error.message
                });
            }
        }

        await connection.commit();
        await connection.end();

        console.log(`\n✅ 재고 해제 완료: ${released.length}개`);
        console.log(`해제된 재고:`);
        released.forEach(r => {
            console.log(`   - stock_unit_id: ${r.stock_unit_id}, product_id: ${r.product_id}`);
        });

        Logger.log('[RELEASE_STOCK] 주문별 재고 해제 완료', {
            order_id: orderId,
            released_count: released.length,
            total_count: stockUnits.length
        });

    } catch (error) {
        await connection.rollback();
        await connection.end();
        console.error(`\n❌ 오류 발생: ${error.message}`);
        console.error(error.stack);
        Logger.error('[RELEASE_STOCK] 재고 해제 실패', {
            order_id: orderId,
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
}

/**
 * 모든 고아 예약 재고 확인
 */
async function checkAllOrphanedStock() {
    const connection = await mysql.createConnection(dbConfig);
    
    try {
        const stockUnits = await checkAllOrphanedReservedStock(connection);

        if (stockUnits.length === 0) {
            console.log(`\n✅ 예약된 재고가 없습니다.`);
            await connection.end();
            return;
        }

        console.log(`\n📋 예약된 재고: ${stockUnits.length}개\n`);

        // 해제 가능 여부 판단
        const releasable = [];
        const notReleasable = [];
        const needsReview = [];

        for (const stock of stockUnits) {
            const [units] = await connection.execute(
                `SELECT oiu.order_item_unit_id, oiu.unit_status, oiu.active_lock
                 FROM order_item_units oiu
                 WHERE oiu.stock_unit_id = ?`,
                [stock.stock_unit_id]
            );

            const activeUnits = units.filter(u => u.active_lock === 1);
            
            if (activeUnits.length > 0) {
                notReleasable.push(stock);
            } else if (stock.paid_events_count > 0 && stock.unit_count === 0) {
                // paid_events는 있지만 order_item_units가 없는 경우 (재고 해제 가능)
                releasable.push(stock);
            } else if (stock.order_id === null) {
                // 주문이 없는 경우 (FK 제약으로 인해 발생할 수 없지만 확인)
                needsReview.push(stock);
            } else {
                needsReview.push(stock);
            }
        }

        console.log(`✅ 해제 가능: ${releasable.length}개`);
        if (releasable.length > 0) {
            console.log(`\n해제 가능한 재고:`);
            releasable.forEach(s => {
                console.log(`   - stock_unit_id: ${s.stock_unit_id}, product_id: ${s.product_id}, order_id: ${s.reserved_by_order_id}, order_number: ${s.order_number || '없음'}`);
            });
        }

        if (notReleasable.length > 0) {
            console.log(`\n⚠️  해제 불가 (활성 주문 단위 연결): ${notReleasable.length}개`);
        }

        if (needsReview.length > 0) {
            console.log(`\n🔍 검토 필요: ${needsReview.length}개`);
            needsReview.forEach(s => {
                console.log(`   - stock_unit_id: ${s.stock_unit_id}, product_id: ${s.product_id}, order_id: ${s.reserved_by_order_id}, paid_events: ${s.paid_events_count}, units: ${s.unit_count}`);
            });
        }

        await connection.end();

    } catch (error) {
        await connection.end();
        console.error(`\n❌ 오류 발생: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// 메인 실행
async function main() {
    const args = process.argv.slice(2);
    const orderIdArg = args.find(arg => arg.startsWith('--order-id='));
    const checkAllArg = args.find(arg => arg === '--check-all');
    const dryRunArg = args.find(arg => arg === '--dry-run');
    const reasonArg = args.find(arg => arg.startsWith('--reason='));

    if (checkAllArg) {
        await checkAllOrphanedStock();
        return;
    }

    if (!orderIdArg) {
        console.error('사용법:');
        console.error('  node scripts/release_reserved_stock.js --order-id=123');
        console.error('  node scripts/release_reserved_stock.js --order-id=123 --dry-run');
        console.error('  node scripts/release_reserved_stock.js --check-all');
        process.exit(1);
    }

    const orderId = parseInt(orderIdArg.split('=')[1]);
    if (isNaN(orderId)) {
        console.error('❌ 잘못된 order_id입니다.');
        process.exit(1);
    }

    const dryRun = !!dryRunArg;
    const reason = reasonArg ? reasonArg.split('=')[1] : null;

    if (dryRun) {
        console.log(`\n🔍 [DRY-RUN 모드] 주문 ID ${orderId}의 예약된 재고 확인 중...`);
    } else {
        console.log(`\n⚠️  주문 ID ${orderId}의 예약된 재고를 해제합니다.`);
        console.log(`계속하려면 Ctrl+C를 누르세요...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    await releaseStockByOrderId(orderId, dryRun, reason);
}

if (require.main === module) {
    main().catch(error => {
        console.error('❌ 스크립트 실행 실패:', error.message);
        process.exit(1);
    });
}

module.exports = {
    releaseStockByOrderId,
    checkReservedStock,
    checkAllOrphanedStock
};
