/**
 * Paid 주문 처리 유틸리티
 * 
 * 결제 완료 시 자동으로 재고 배정, 주문 단위 생성, 보증서 생성, 인보이스 생성을 처리합니다.
 * 
 * 핵심 원칙 (SSOT 준수):
 * - 락 순서: stock_units → orders → warranties → invoices
 * - 멱등성: paid_events UNIQUE 제약 활용
 * - 재고 배정: stock_units.status = 'in_stock'만 배정
 * - 보증서 생성: 회원/비회원 구분 (issued vs issued_unassigned)
 * 
 * 중요: paid_events는 별도 커넥션(autocommit)으로 먼저 생성되어야 함
 * 이 함수는 paidEventId를 받아서 주문 처리 트랜잭션만 수행
 */

const Logger = require('../logger');
const { createInvoiceFromOrder } = require('./invoice-creator');
const { updateProcessingStatus, recordStockIssue } = require('./paid-event-creator');

/**
 * Paid 주문 처리
 * 
 * @param {Object} params - 처리 파라미터
 * @param {Object} params.connection - MySQL 연결 (트랜잭션 내, 이미 시작된 상태)
 * @param {number} params.paidEventId - paid_events.event_id (이미 생성된 결제 증거)
 * @param {number} params.orderId - 주문 ID
 * @param {string} params.paymentKey - 결제 키 (토스페이먼츠 paymentKey)
 * @param {number} params.amount - 결제 금액
 * @param {string} params.currency - 통화 (기본값: 'KRW')
 * @param {string} params.eventSource - 이벤트 소스 ('webhook', 'redirect', 'manual_verify')
 * @param {Object} params.rawPayload - 원본 결제 응답 (JSON)
 * 
 * @returns {Promise<Object>} 처리 결과
 * @returns {boolean} returns.success - 성공 여부
 * @returns {boolean} returns.alreadyProcessed - 이미 처리된 경우 true
 * @returns {string} returns.message - 메시지
 * @returns {Object} returns.data - 처리 데이터
 */
async function processPaidOrder({
    connection,
    paidEventId,
    orderId,
    paymentKey,
    amount,
    currency = 'KRW',
    eventSource = 'redirect',
    rawPayload = null
}) {
    const startTime = Date.now();
    
    try {
        // ============================================================
        // 1. 주문 잠금 및 금액 검증 (락 순서: orders)
        // ============================================================
        Logger.log('[PAID_PROCESSOR] 주문 잠금 및 검증 시작', {
            orderId,
            paymentKey: paymentKey?.substring(0, 20) + '...',
            amount,
            currency,
            eventSource
        });

        const [orderRows] = await connection.execute(
            `SELECT 
                order_id, 
                total_price, 
                user_id, 
                guest_id, 
                status 
            FROM orders 
            WHERE order_id = ? 
            FOR UPDATE`,
            [orderId]
        );

        if (orderRows.length === 0) {
            throw new Error(`주문을 찾을 수 없습니다: order_id=${orderId}`);
        }

        const order = orderRows[0];

        // 금액 검증 (서버 확정값과 일치 확인)
        // 주의: paid_events는 이미 별도 커넥션에서 생성되어 있음
        // 주의: orders 테이블에는 currency 컬럼이 없음 (paid_events에만 있음)
        if (parseFloat(order.total_price) != parseFloat(amount)) {
            Logger.error('[PAID_PROCESSOR] 결제 금액 불일치', {
                orderId,
                paidEventId,
                orderTotalPrice: order.total_price,
                paymentAmount: amount
            });
            
            throw new Error(`결제 금액 불일치: 주문=${order.total_price}, 결제=${amount}`);
        }

        // 통화 검증: paid_events에서 가져온 currency와 파라미터 currency 비교
        // (orders 테이블에는 currency 컬럼이 없으므로 paid_events 기준으로 검증)
        const [paidEventRows] = await connection.execute(
            `SELECT currency FROM paid_events WHERE event_id = ?`,
            [paidEventId]
        );

        if (paidEventRows.length > 0 && paidEventRows[0].currency !== currency) {
            Logger.error('[PAID_PROCESSOR] 통화 불일치', {
                orderId,
                paidEventId,
                paidEventCurrency: paidEventRows[0].currency,
                paymentCurrency: currency
            });
            
            throw new Error(`통화 불일치: paid_events=${paidEventRows[0].currency}, 결제=${currency}`);
        }

        // ============================================================
        // 2. paidEventId 검증 (이미 별도 커넥션에서 생성됨)
        // ============================================================
        Logger.log('[PAID_PROCESSOR] paidEventId 검증', {
            orderId,
            paidEventId
        });

        if (!paidEventId) {
            throw new Error('paidEventId가 필요합니다. paid_events가 먼저 생성되어야 합니다.');
        }

        // paid_event_processing 상태를 'processing'으로 업데이트
        // (별도 커넥션에서 수행, 트랜잭션과 분리)
        await updateProcessingStatus(paidEventId, 'processing');

        // ============================================================
        // 3. order_items 조회 (size, color 포함)
        // ============================================================
        const [orderItems] = await connection.execute(
            `SELECT 
                order_item_id,
                product_id,
                size,
                color,
                quantity,
                unit_price,
                subtotal
            FROM order_items 
            WHERE order_id = ? 
            ORDER BY order_item_id`,
            [orderId]
        );

        if (orderItems.length === 0) {
            throw new Error(`주문 상품이 없습니다: order_id=${orderId}`);
        }

        Logger.log('[PAID_PROCESSOR] order_items 조회 완료', {
            orderId,
            itemCount: orderItems.length
        });

        // ============================================================
        // 4. 재고 배정 (락 순서 1단계: stock_units)
        // ============================================================
        Logger.log('[PAID_PROCESSOR] 재고 배정 시작', {
            orderId,
            itemCount: orderItems.length
        });

        const reservedStockUnits = [];
        const orderItemUnitsToCreate = [];

        for (const item of orderItems) {
            const needQty = item.quantity;
            const productId = item.product_id;
            const size = item.size || null;
            const color = item.color || null;

            // 재고 조회 (정석: product_id, status, size, color로 정확히 매칭)
            // 정책: size/color가 주문에 있으면 정확히 매칭만 허용 (NULL 재고는 배정 제외)
            // 이유: 사이즈별 정확 배정이 목표이므로, 레거시(NULL) 재고는 명시적으로만 처리
            let stockQuery = `SELECT stock_unit_id, token_pk, product_id, size, color
                FROM stock_units
                WHERE product_id = ? 
                  AND status = 'in_stock'`;
            
            const stockParams = [productId];
            
            // size 정책 (정석): 주문에 size가 있으면 정확 매칭, 없으면 NULL 재고만 배정
            // 핵심: 타이/액세서리처럼 size 없는 상품은 size IS NULL 재고만 배정
            // 이유: "S가 품절인데 NULL 재고가 대신 배정되는" 사고 방지
            if (size !== null && size !== undefined && size !== '') {
                stockQuery += ` AND size = ?`;
                stockParams.push(size);
            } else {
                // 주문에 size가 NULL이면 NULL 재고만 배정 (정책: size 없는 상품 처리)
                stockQuery += ` AND size IS NULL`;
            }
            
            // color 정책 (정석): 주문에 color가 있으면 정확 매칭, 없으면 NULL 재고만 배정
            // (현재는 모든 상품에 color가 있어야 하므로, NULL 케이스는 드뭅지만 정책 일관성 유지)
            if (color !== null && color !== undefined && color !== '') {
                stockQuery += ` AND color = ?`;
                stockParams.push(color);
            } else {
                // 주문에 color가 NULL이면 NULL 재고만 배정 (정책 일관성)
                stockQuery += ` AND color IS NULL`;
            }
            
            // stock_unit_id 순서 정렬 (인덱스 커버)
            stockQuery += ` ORDER BY stock_unit_id
                LIMIT ?
                FOR UPDATE SKIP LOCKED`;
            
            stockParams.push(needQty);
            
            const [availableStock] = await connection.execute(stockQuery, stockParams);

            if (availableStock.length < needQty) {
                // 재고 부족 이슈 기록 (별도 커넥션, 트랜잭션과 분리)
                await recordStockIssue(paidEventId, orderId, productId, needQty, availableStock.length);
                
                throw new Error(
                    `재고 부족: 상품 ${productId}, 필요: ${needQty}, 가용: ${availableStock.length}`
                );
            }

            // 재고 상태 업데이트 (reserved로 변경)
            for (let i = 0; i < availableStock.length; i++) {
                const stockUnit = availableStock[i];
                
                const [updateResult] = await connection.execute(
                    `UPDATE stock_units
                    SET status = 'reserved',
                        reserved_at = NOW(),
                        reserved_by_order_id = ?
                    WHERE stock_unit_id = ?`,
                    [orderId, stockUnit.stock_unit_id]
                );

                if (updateResult.affectedRows !== 1) {
                    throw new Error(
                        `재고 상태 업데이트 실패: stock_unit_id=${stockUnit.stock_unit_id}, affectedRows=${updateResult.affectedRows}`
                    );
                }

                reservedStockUnits.push({
                    stock_unit_id: stockUnit.stock_unit_id,
                    token_pk: stockUnit.token_pk,
                    product_id: productId,
                    order_item_id: item.order_item_id
                });

                // order_item_units 생성 준비
                orderItemUnitsToCreate.push({
                    order_item_id: item.order_item_id,
                    unit_seq: i + 1, // 1부터 시작
                    stock_unit_id: stockUnit.stock_unit_id,
                    token_pk: stockUnit.token_pk
                });
            }
        }

        Logger.log('[PAID_PROCESSOR] 재고 배정 완료', {
            orderId,
            reservedCount: reservedStockUnits.length
        });

        // ============================================================
        // 5. order_item_units 생성 (락 순서 2단계: orders 이후)
        // ============================================================
        Logger.log('[PAID_PROCESSOR] order_item_units 생성 시작', {
            orderId,
            unitCount: orderItemUnitsToCreate.length
        });

        const createdOrderItemUnits = [];
        
        for (const unit of orderItemUnitsToCreate) {
            try {
                const [insertResult] = await connection.execute(
                    `INSERT INTO order_item_units
                    (order_item_id, unit_seq, stock_unit_id, token_pk, unit_status, created_at)
                    VALUES (?, ?, ?, ?, 'reserved', NOW())`,
                    [
                        unit.order_item_id,
                        unit.unit_seq,
                        unit.stock_unit_id,
                        unit.token_pk
                    ]
                );

                createdOrderItemUnits.push({
                    order_item_unit_id: insertResult.insertId,
                    ...unit
                });
            } catch (error) {
                // UNIQUE 제약 위반 시 이미 생성된 것으로 간주
                if (error.code === 'ER_DUP_ENTRY') {
                    Logger.log('[PAID_PROCESSOR] order_item_units 중복 (이미 생성됨)', {
                        orderId,
                        order_item_id: unit.order_item_id,
                        unit_seq: unit.unit_seq
                    });
                    // 기존 레코드 조회
                    const [existing] = await connection.execute(
                        `SELECT order_item_unit_id 
                        FROM order_item_units 
                        WHERE order_item_id = ? AND unit_seq = ?`,
                        [unit.order_item_id, unit.unit_seq]
                    );
                    if (existing.length > 0) {
                        createdOrderItemUnits.push({
                            order_item_unit_id: existing[0].order_item_unit_id,
                            ...unit
                        });
                    }
                } else {
                    throw error;
                }
            }
        }

        Logger.log('[PAID_PROCESSOR] order_item_units 생성 완료', {
            orderId,
            createdCount: createdOrderItemUnits.length
        });

        // ============================================================
        // 6. warranties 생성/업데이트 (락 순서 3단계: warranties)
        // ============================================================
        Logger.log('[PAID_PROCESSOR] warranties 생성/업데이트 시작', {
            orderId,
            unitCount: createdOrderItemUnits.length,
            isMember: !!order.user_id
        });

        const createdWarranties = [];
        
        // 회원/비회원 구분
        const warrantyStatus = order.user_id ? 'issued' : 'issued_unassigned';
        const ownerUserId = order.user_id || null;

        for (const unit of createdOrderItemUnits) {
            try {
                // 재판매 처리: revoked 상태 warranty가 있는지 확인
                const [revokedWarranty] = await connection.execute(
                    `SELECT id as warranty_id, status
                     FROM warranties 
                     WHERE token_pk = ? AND status = 'revoked'
                     FOR UPDATE`,
                    [unit.token_pk]
                );

                if (revokedWarranty.length > 0) {
                    // 재판매 처리: revoked → issued/issued_unassigned 전이
                    // ⚠️ 원자적 조건: WHERE token_pk = ? AND status = 'revoked' + affectedRows=1 검증
                    // ⚠️ revoked_at 유지: 재판매 시에도 revoked_at은 그대로 유지 (A안 확정, 이력)
                    Logger.log('[PAID_PROCESSOR] 재판매 처리 (revoked → issued)', {
                        orderId,
                        token_pk: unit.token_pk,
                        warranty_id: revokedWarranty[0].warranty_id,
                        new_status: warrantyStatus
                    });

                    const [updateResult] = await connection.execute(
                        `UPDATE warranties
                         SET status = ?,
                             source_order_item_unit_id = ?,
                             owner_user_id = ?
                         WHERE token_pk = ? AND status = 'revoked'`,
                        [
                            warrantyStatus,
                            unit.order_item_unit_id,
                            ownerUserId,
                            unit.token_pk
                        ]
                    );

                    // ⚠️ 원자적 조건 검증: affected rows가 정확히 1이어야 함
                    if (updateResult.affectedRows !== 1) {
                        throw new Error(
                            `재판매 처리 실패: affectedRows=${updateResult.affectedRows}, ` +
                            `token_pk=${unit.token_pk}. ` +
                            `이미 issued/active인 토큰이거나 동시성 경합이 발생했을 수 있습니다.`
                        );
                    }

                    createdWarranties.push({
                        warranty_id: revokedWarranty[0].warranty_id,
                        order_item_unit_id: unit.order_item_unit_id,
                        token_pk: unit.token_pk,
                        status: warrantyStatus,
                        is_resale: true
                    });
                } else {
                    // 신규 생성: revoked 상태 warranty가 없으면 INSERT
                    const [insertResult] = await connection.execute(
                        `INSERT INTO warranties
                        (source_order_item_unit_id, token_pk, owner_user_id, status, created_at)
                        VALUES (?, ?, ?, ?, NOW())`,
                        [
                            unit.order_item_unit_id,
                            unit.token_pk,
                            ownerUserId,
                            warrantyStatus
                        ]
                    );

                    createdWarranties.push({
                        warranty_id: insertResult.insertId,
                        order_item_unit_id: unit.order_item_unit_id,
                        token_pk: unit.token_pk,
                        status: warrantyStatus,
                        is_resale: false
                    });
                }
            } catch (error) {
                // UNIQUE(token_pk) 제약 위반 시 이미 생성된 것으로 간주 (동시성 경합)
                if (error.code === 'ER_DUP_ENTRY') {
                    Logger.log('[PAID_PROCESSOR] warranties 중복 (이미 생성됨)', {
                        orderId,
                        token_pk: unit.token_pk
                    });
                    // 기존 레코드 조회
                    const [existing] = await connection.execute(
                        `SELECT id as warranty_id, status
                         FROM warranties 
                         WHERE token_pk = ?`,
                        [unit.token_pk]
                    );
                    if (existing.length > 0) {
                        createdWarranties.push({
                            warranty_id: existing[0].warranty_id,
                            order_item_unit_id: unit.order_item_unit_id,
                            token_pk: unit.token_pk,
                            status: existing[0].status,
                            is_resale: existing[0].status !== 'revoked'
                        });
                    }
                } else {
                    throw error;
                }
            }
        }

        const resaleCount = createdWarranties.filter(w => w.is_resale).length;
        const newCount = createdWarranties.filter(w => !w.is_resale).length;

        Logger.log('[PAID_PROCESSOR] warranties 생성/업데이트 완료', {
            orderId,
            totalCount: createdWarranties.length,
            newCount,
            resaleCount,
            status: warrantyStatus
        });

        // ============================================================
        // 7. invoices 생성 (락 순서 4단계: invoices)
        // ============================================================
        Logger.log('[PAID_PROCESSOR] invoices 생성 시작', {
            orderId
        });

        let invoiceNumber = null;
        try {
            const invoiceResult = await createInvoiceFromOrder(connection, orderId);
            invoiceNumber = invoiceResult.invoice_number;
            Logger.log('[PAID_PROCESSOR] invoices 생성 완료', {
                orderId,
                invoiceNumber
            });
        } catch (error) {
            // 인보이스 생성 실패는 로깅만 (결제 성공은 유지)
            Logger.error('[PAID_PROCESSOR] invoices 생성 실패 (결제는 성공)', {
                orderId,
                error: error.message,
                error_code: error.code,
                stack: error.stack
            });
        }

        // ============================================================
        // 8. orders.paid_at 업데이트
        // ============================================================
        const [updateResult] = await connection.execute(
            `UPDATE orders 
            SET paid_at = NOW()
            WHERE order_id = ?`,
            [orderId]
        );

        if (updateResult.affectedRows !== 1) {
            Logger.warn('[PAID_PROCESSOR] orders.paid_at 업데이트 실패', {
                orderId,
                affectedRows: updateResult.affectedRows
            });
        }

        const duration = Date.now() - startTime;

        Logger.log('[PAID_PROCESSOR] Paid 처리 완료', {
            orderId,
            paidEventId,
            duration,
            stockUnitsReserved: reservedStockUnits.length,
            orderItemUnitsCreated: createdOrderItemUnits.length,
            warrantiesCreated: createdWarranties.length,
            invoiceNumber
        });

        // 처리 상태를 'success'로 업데이트 (별도 커넥션, 트랜잭션과 분리)
        await updateProcessingStatus(paidEventId, 'success');

        return {
            success: true,
            alreadyProcessed: false,
            message: '처리 완료',
            data: {
                paidEventId,
                stockUnitsReserved: reservedStockUnits.length,
                orderItemUnitsCreated: createdOrderItemUnits.length,
                warrantiesCreated: createdWarranties.length,
                invoiceNumber
            }
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        Logger.error('[PAID_PROCESSOR] Paid 처리 실패', {
            orderId,
            paidEventId,
            duration,
            error: error.message,
            error_code: error.code,
            error_sql_state: error.sqlState,
            error_sql_message: error.sqlMessage,
            stack: error.stack
        });

        // 처리 상태를 'failed'로 업데이트 (별도 커넥션, 트랜잭션과 분리)
        await updateProcessingStatus(paidEventId, 'failed', error.message);

        throw error;
    }
}

module.exports = {
    processPaidOrder
};
