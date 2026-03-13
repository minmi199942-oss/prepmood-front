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
const { selectValidGuestTokenSql } = require('./guest-token-helpers');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

/**
 * 색상 정규화 함수 (SIZE_COLOR_STANDARDIZATION_POLICY.md 참고)
 * stock-routes.js와 동일한 로직 사용
 * 
 * @param {string|null|undefined} color - 정규화할 색상 문자열
 * @returns {string|null} - 정규화된 색상 문자열 또는 null
 */
function normalizeColor(color) {
    if (!color) return null;  // null 반환으로 통일
    const normalized = String(color).trim();
    if (!normalized) return null;  // 빈 문자열도 null 반환
    
    const upper = normalized.toUpperCase();
    
    // 정확 매칭 우선 (안전성 향상)
    if (upper === 'LIGHTBLUE' || 
        /^LightBlue$/i.test(normalized) || 
        /^Light-Blue$/i.test(normalized) || 
        upper === 'LB') {
        return 'Light Blue';
    }
    if (upper === 'LIGHTGREY' || 
        /^LightGrey$/i.test(normalized) || 
        /^Light-Grey$/i.test(normalized) || 
        upper === 'LG' || upper === 'LGY') {
        return 'Light Grey';
    }
    if (upper === 'BK') return 'Black';
    if (upper === 'NV') return 'Navy';
    if (upper === 'WH' || upper === 'WT') return 'White';
    if (upper === 'GY') return 'Grey';
    if (upper === 'GRAY') return 'Grey';
    
    return normalized;  // 이미 표준값이면 그대로 반환
}

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
    rawPayload = null,
    attemptId = null
}) {
    const startTime = Date.now();
    
    try {
        // ============================================================
        // 0. 멱등성: 이미 처리 완료된 event면 동일 data 스키마로 Early Return (§4.2, CONFIRM_FLOW_SENIOR_REVIEW_AND_GEMINI_FEEDBACK)
        // 동일 connection으로 SELECT하므로 단일 DB 기준 최신성 보장 (Replica 사용 시에는 읽기 커넥션 일관성 정책에 따름)
        // ============================================================
        const [pepRows] = await connection.execute(
            'SELECT status FROM paid_event_processing WHERE event_id = ?',
            [paidEventId]
        );
        if (pepRows.length > 0 && pepRows[0].status === 'success') {
            Logger.log('[PAID_PROCESSOR] 이미 처리됨 - Early Return', { orderId, paidEventId });
            // 기존 성공 시와 동일한 data 구조로 반환 (confirm/이니시스/웹훅 응답 호환)
            const [orderRowsRead] = await connection.execute(
                `SELECT o.order_id, o.order_number, o.total_price, o.shipping_email, o.shipping_name, o.created_at, o.user_id, o.guest_id,
                        u.email AS user_email, u.name AS user_name
                 FROM orders o LEFT JOIN users u ON o.user_id = u.user_id WHERE o.order_id = ?`,
                [orderId]
            );
            if (orderRowsRead.length === 0) {
                throw new Error(`주문을 찾을 수 없습니다: order_id=${orderId}`);
            }
            const orderRead = orderRowsRead[0];
            const [orderItemsRead] = await connection.execute(
                `SELECT order_item_id, product_id, product_name, size, color, quantity, unit_price, subtotal
                 FROM order_items WHERE order_id = ? ORDER BY order_item_id`,
                [orderId]
            );
            let guestAccessToken = null;
            const [tokenRows] = await connection.execute(
                `SELECT token FROM guest_order_access_tokens got
                 WHERE got.order_id = ? AND ${selectValidGuestTokenSql('got')} ORDER BY got.created_at DESC LIMIT 1`,
                [orderId]
            );
            if (tokenRows.length > 0) guestAccessToken = tokenRows[0].token;
            let invoiceId = null;
            let invoiceNumber = null;
            const [invRows] = await connection.execute(
                'SELECT id, invoice_number FROM invoices WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
                [orderId]
            );
            if (invRows.length > 0) {
                invoiceId = invRows[0].id;
                invoiceNumber = invRows[0].invoice_number;
            }
            return {
                success: true,
                alreadyProcessed: true,
                message: '이미 처리됨',
                data: {
                    paidEventId,
                    stockUnitsReserved: 0,
                    orderItemUnitsCreated: 0,
                    warrantiesCreated: 0,
                    invoiceId,
                    invoiceNumber,
                    orderInfo: {
                        order_id: orderId,
                        order_number: orderRead.order_number,
                        order_date: orderRead.created_at,
                        total_amount: orderRead.total_price,
                        user_email: orderRead.user_email,
                        shipping_email: orderRead.shipping_email,
                        user_id: orderRead.user_id,
                        guest_id: orderRead.guest_id,
                        guest_access_token: guestAccessToken,
                        customerName: orderRead.user_name || orderRead.shipping_name || null,
                        items: orderItemsRead.map(row => ({
                            product_name: row.product_name,
                            size: row.size,
                            color: row.color,
                            quantity: row.quantity,
                            unit_price: row.unit_price,
                            subtotal: row.subtotal
                        }))
                    }
                }
            };
        }

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
                o.order_id, 
                o.order_number,
                o.total_price, 
                o.user_id, 
                o.guest_id, 
                o.status,
                o.shipping_email,
                o.shipping_name,
                o.created_at,
                u.email as user_email,
                u.name as user_name
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.user_id
            WHERE o.order_id = ? 
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
        // 3. hold-aware 재고 처리 (Phase 1)
        // ============================================================
        // Phase 1: payment_attempts.use_hold 플래그를 기준으로 hold-enabled 여부를 판단.
        // - attemptId가 없으면 legacy 경로(useHold=false)
        // - attemptId가 있는데 행 조회/컬럼 접근이 실패하면 구조적 오류로 간주 (fail-closed)
        let useHold = false;
        if (attemptId != null) {
            try {
                const [attemptRows] = await connection.execute(
                    'SELECT use_hold FROM payment_attempts WHERE id = ?',
                    [attemptId]
                );
                if (attemptRows.length === 0) {
                    const err = new Error('USE_HOLD_RESOLUTION_FAILED');
                    err.code = 'USE_HOLD_RESOLUTION_FAILED';
                    Logger.error('[PAID_PROCESSOR] payment_attempts 행을 찾을 수 없음 (use_hold 판단 불가)', {
                        orderId,
                        paidEventId,
                        attemptId
                    });
                    throw err;
                }
                const val = Number(attemptRows[0].use_hold);
                if (val === 1) {
                    useHold = true;
                }
            } catch (e) {
                // 새 경로인데 use_hold 판단 자체를 못 하면 구조적 오류로 본다.
                const err = new Error('USE_HOLD_RESOLUTION_FAILED');
                err.code = 'USE_HOLD_RESOLUTION_FAILED';
                Logger.error('[PAID_PROCESSOR] payment_attempts.use_hold 조회 실패 (fail-closed)', {
                    orderId,
                    paidEventId,
                    attemptId,
                    error: e.message
                });
                throw err;
            }
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

        // Double-Check: 락 획득 후 동시 요청이 먼저 success로 바꿨을 수 있음 → 이중 처리 방지 (CONFIRM_FLOW §Gemini 레이스)
        const [pepRows2] = await connection.execute(
            'SELECT status FROM paid_event_processing WHERE event_id = ?',
            [paidEventId]
        );
        if (pepRows2.length > 0 && pepRows2[0].status === 'success') {
            Logger.log('[PAID_PROCESSOR] 이미 처리됨 - Double-Check (락 획득 후)', { orderId, paidEventId });
            const [orderItemsRead] = await connection.execute(
                `SELECT order_item_id, product_id, product_name, size, color, quantity, unit_price, subtotal
                 FROM order_items WHERE order_id = ? ORDER BY order_item_id`,
                [orderId]
            );
            let guestAccessToken = null;
            const [tokenRows2] = await connection.execute(
                `SELECT token FROM guest_order_access_tokens got
                 WHERE got.order_id = ? AND ${selectValidGuestTokenSql('got')} ORDER BY got.created_at DESC LIMIT 1`,
                [orderId]
            );
            if (tokenRows2.length > 0) guestAccessToken = tokenRows2[0].token;
            let invoiceId = null;
            let invoiceNumber = null;
            const [invRows2] = await connection.execute(
                'SELECT id, invoice_number FROM invoices WHERE order_id = ? ORDER BY created_at DESC LIMIT 1',
                [orderId]
            );
            if (invRows2.length > 0) {
                invoiceId = invRows2[0].id;
                invoiceNumber = invRows2[0].invoice_number;
            }
            return {
                success: true,
                alreadyProcessed: true,
                message: '이미 처리됨',
                data: {
                    paidEventId,
                    stockUnitsReserved: 0,
                    orderItemUnitsCreated: 0,
                    warrantiesCreated: 0,
                    invoiceId,
                    invoiceNumber,
                    orderInfo: {
                        order_id: orderId,
                        order_number: order.order_number,
                        order_date: order.created_at,
                        total_amount: order.total_price,
                        user_email: order.user_email,
                        shipping_email: order.shipping_email,
                        user_id: order.user_id,
                        guest_id: order.guest_id,
                        guest_access_token: guestAccessToken,
                        customerName: order.user_name || order.shipping_name || null,
                        items: orderItemsRead.map(row => ({
                            product_name: row.product_name,
                            size: row.size,
                            color: row.color,
                            quantity: row.quantity,
                            unit_price: row.unit_price,
                            subtotal: row.subtotal
                        }))
                    }
                }
            };
        }

        // paid_event_processing 상태를 'processing'으로 업데이트
        // (별도 커넥션에서 수행, 트랜잭션과 분리)
        await updateProcessingStatus(paidEventId, 'processing');

        // ============================================================
        // 3. order_items 조회 (size, color, product_name 포함)
        // ============================================================
        const [orderItems] = await connection.execute(
            `SELECT 
                order_item_id,
                product_id,
                product_name,
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
        // 4. 재고 배정 (useHold 여부에 따라 분기)
        // ============================================================
        Logger.log('[PAID_PROCESSOR] 재고 배정 시작', {
            orderId,
            itemCount: orderItems.length,
            useHold,
            attemptId
        });

        const reservedStockUnits = [];
        const orderItemUnitsToCreate = [];

        if (useHold) {
            // ---------- hold 기반 소비 ----------
            // 1) 현재 ACTIVE hold 세트 조회
            const [holdRows] = await connection.execute(
                `SELECT 
                    sh.id as hold_id,
                    sh.stock_unit_id,
                    sh.status,
                    sh.expires_at,
                    su.token_pk,
                    su.product_id,
                    su.size,
                    su.color
                 FROM stock_holds sh
                 INNER JOIN stock_units su ON su.stock_unit_id = sh.stock_unit_id
                 WHERE sh.order_id = ?
                   AND sh.status = 'ACTIVE'
                   AND sh.expires_at > NOW()
                 ORDER BY sh.id`,
                [orderId]
            );

            if (holdRows.length === 0) {
                const err = new Error('HOLD_MISSING');
                err.code = 'HOLD_MISSING';
                Logger.error('[PAID_PROCESSOR] hold-enabled 경로에서 ACTIVE hold 없음', {
                    orderId,
                    paidEventId,
                    attemptId
                });
                throw err;
            }

            // 2) hold 세트가 현재 order_items 스냅샷과 일치하는지 검증 및 매핑
            const remainingHolds = holdRows.map(h => ({
                hold_id: h.hold_id,
                stock_unit_id: h.stock_unit_id,
                token_pk: h.token_pk,
                product_id: h.product_id,
                size: h.size || null,
                color: h.color ? normalizeColor(h.color) : null
            }));

            const pickHoldsForItem = (item) => {
                const needQty = Number(item.quantity) || 0;
                const picked = [];
                const normalizedColor = item.color ? normalizeColor(item.color) : null;
                for (let i = 0; i < needQty; i++) {
                    const idx = remainingHolds.findIndex(h =>
                        h.product_id === item.product_id &&
                        ((item.size || null) === (h.size || null)) &&
                        ((normalizedColor || null) === (h.color || null))
                    );
                    if (idx === -1) {
                        return null;
                    }
                    picked.push(remainingHolds[idx]);
                    remainingHolds.splice(idx, 1);
                }
                return picked;
            };

            for (const item of orderItems) {
                const picked = pickHoldsForItem(item);
                if (!picked) {
                    const err = new Error('HOLD_REUSE_INVALID');
                    err.code = 'HOLD_REUSE_INVALID';
                    Logger.error('[PAID_PROCESSOR] hold 세트가 주문 스냅샷과 일치하지 않음', {
                        orderId,
                        paidEventId,
                        attemptId,
                        order_item_id: item.order_item_id
                    });
                    throw err;
                }
                picked.forEach((h, idx) => {
                    reservedStockUnits.push({
                        stock_unit_id: h.stock_unit_id,
                        token_pk: h.token_pk,
                        product_id: h.product_id,
                        order_item_id: item.order_item_id,
                        hold_id: h.hold_id
                    });
                    orderItemUnitsToCreate.push({
                        order_id: orderId,
                        order_item_id: item.order_item_id,
                        unit_seq: idx + 1,
                        stock_unit_id: h.stock_unit_id,
                        token_pk: h.token_pk,
                        product_name: item.product_name
                    });
                });
            }

            if (remainingHolds.length > 0) {
                // 남는 hold가 있으면 스냅샷 불일치로 본다.
                const err = new Error('HOLD_REUSE_INVALID');
                err.code = 'HOLD_REUSE_INVALID';
                Logger.error('[PAID_PROCESSOR] hold 세트에 사용되지 않은 ACTIVE hold가 남음', {
                    orderId,
                    paidEventId,
                    attemptId,
                    remainingHoldCount: remainingHolds.length
                });
                throw err;
            }

            // 3) hold 에 연결된 stock_units 를 reserved 로 전이
            // 데드락 방지를 위해 stock_unit_id ASC 기준으로 잠금 순서 통일
            const reservedSorted = [...reservedStockUnits].sort((a, b) => {
                if (a.stock_unit_id === b.stock_unit_id) return 0;
                return a.stock_unit_id < b.stock_unit_id ? 1 * -1 : 1;
            });

            for (const unit of reservedSorted) {
                const [updateResult] = await connection.execute(
                    `UPDATE stock_units
                     SET status = 'reserved',
                         reserved_at = NOW(),
                         reserved_by_order_id = ?
                     WHERE stock_unit_id = ? AND status = 'in_stock'`,
                    [orderId, unit.stock_unit_id]
                );

                if (updateResult.affectedRows !== 1) {
                    const err = new Error('HOLD_STOCK_MISMATCH');
                    err.code = 'HOLD_STOCK_MISMATCH';
                    Logger.error('[PAID_PROCESSOR] hold 이후 재고 상태 불일치(HOLD_STOCK_MISMATCH)', {
                        orderId,
                        paidEventId,
                        attemptId,
                        stock_unit_id: unit.stock_unit_id,
                        affectedRows: updateResult.affectedRows
                    });
                    throw err;
                }
            }

            // 4) stock_holds CONSUMED 로 전이
            const holdIds = reservedStockUnits
                .map(u => u.hold_id)
                .filter((v, i, arr) => arr.indexOf(v) === i);

            if (holdIds.length > 0) {
                const placeholders = holdIds.map(() => '?').join(',');
                const [updateHolds] = await connection.execute(
                    `UPDATE stock_holds
                     SET status = 'CONSUMED',
                         released_at = NOW()
                     WHERE id IN (${placeholders}) AND status = 'ACTIVE'`,
                    holdIds
                );
                if (updateHolds.affectedRows !== holdIds.length) {
                    const err = new Error('HOLD_CONSUME_MISMATCH');
                    err.code = 'HOLD_CONSUME_MISMATCH';
                    Logger.error('[PAID_PROCESSOR] CONSUMED 전이 대상 hold 수와 affectedRows 불일치', {
                        orderId,
                        paidEventId,
                        attemptId,
                        expected: holdIds.length,
                        affected: updateHolds.affectedRows
                    });
                    throw err;
                }
            }
        } else {
            // ---------- 기존 in_stock 기반 재고 배정 ----------
            // ⚠️ 중요: 모든 상품의 재고를 먼저 검증 (사전 검증)
            // 부분 예약 방지: 전부 가능할 때만 예약 시작
            const stockValidationResults = [];
            for (const item of orderItems) {
                const needQty = item.quantity;
                const productId = item.product_id;
                const size = item.size || null;
                const rawColor = item.color || null;

                // color 정규화 적용 (리스크 2 단기 정규화)
                const color = rawColor ? normalizeColor(rawColor) : null;

                // 재고 조회 쿼리 구성 (FOR UPDATE 없이 먼저 검증)
                let stockQuery = `SELECT COUNT(*) as available_count
                    FROM stock_units
                    WHERE product_id = ? 
                      AND status = 'in_stock'`;
                
                const stockParams = [productId];
                
                if (size !== null && size !== undefined && size !== '') {
                    stockQuery += ` AND size = ?`;
                    stockParams.push(size);
                } else {
                    stockQuery += ` AND size IS NULL`;
                }
                
                if (color !== null && color !== undefined && color !== '') {
                    stockQuery += ` AND color = ?`;
                    stockParams.push(color);
                } else {
                    stockQuery += ` AND color IS NULL`;
                }
                
                const [countResult] = await connection.execute(stockQuery, stockParams);
                const availableCount = countResult[0]?.available_count || 0;

                if (availableCount < needQty) {
                    // 재고 부족 이슈 기록 (별도 커넥션, 트랜잭션과 분리)
                    await recordStockIssue(paidEventId, orderId, productId, needQty, availableCount);
                    const err = new Error(`재고 부족: 상품 ${productId}, 필요: ${needQty}, 가용: ${availableCount}`);
                    err.code = 'INSUFFICIENT_STOCK';
                    throw err;
                }

                stockValidationResults.push({
                    item,
                    needQty,
                    productId,
                    size,
                    color,  // 정규화된 color 저장
                    availableCount
                });
            }

            // ⚠️ 모든 상품 재고 검증 완료 후 예약 시작
            for (const validation of stockValidationResults) {
                const { item, needQty, productId, size, color } = validation;

                // 재고 조회 및 잠금 (FOR UPDATE SKIP LOCKED)
                // color는 이미 위에서 정규화되었으므로 그대로 사용
                let stockQuery = `SELECT stock_unit_id, token_pk, product_id, size, color
                    FROM stock_units
                    WHERE product_id = ? 
                      AND status = 'in_stock'`;
                
                const stockParams = [productId];
                
                if (size !== null && size !== undefined && size !== '') {
                    stockQuery += ` AND size = ?`;
                    stockParams.push(size);
                } else {
                    stockQuery += ` AND size IS NULL`;
                }
                
                if (color !== null && color !== undefined && color !== '') {
                    stockQuery += ` AND color = ?`;
                    stockParams.push(color);
                } else {
                    stockQuery += ` AND color IS NULL`;
                }
                
                stockQuery += ` ORDER BY stock_unit_id
                    LIMIT ${parseInt(needQty)}
                    FOR UPDATE SKIP LOCKED`;
                
                const [availableStock] = await connection.execute(stockQuery, stockParams);

                // ⚠️ 재검증: 잠금 중에 재고가 변경되었을 수 있음
                if (availableStock.length < needQty) {
                    // 재고 부족 이슈 기록 (별도 커넥션, 트랜잭션과 분리)
                    await recordStockIssue(paidEventId, orderId, productId, needQty, availableStock.length);
                    const err = new Error(`재고 부족: 상품 ${productId}, 필요: ${needQty}, 가용: ${availableStock.length} (잠금 중 재고 변경)`);
                    err.code = 'INSUFFICIENT_STOCK';
                    throw err;
                }

                // 재고 상태 업데이트 (reserved로 변경)
                for (let i = 0; i < availableStock.length; i++) {
                    const stockUnit = availableStock[i];
                    
                    const [updateResult] = await connection.execute(
                        `UPDATE stock_units
                        SET status = 'reserved',
                            reserved_at = NOW(),
                            reserved_by_order_id = ?
                        WHERE stock_unit_id = ? AND status = 'in_stock'`,
                        [orderId, stockUnit.stock_unit_id]
                    );

                    if (updateResult.affectedRows !== 1) {
                        throw new Error(
                            `재고 상태 업데이트 실패: stock_unit_id=${stockUnit.stock_unit_id}, affectedRows=${updateResult.affectedRows} (동시성 경합 가능)`
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
                        order_id: orderId,
                        order_item_id: item.order_item_id,
                        unit_seq: i + 1,
                        stock_unit_id: stockUnit.stock_unit_id,
                        token_pk: stockUnit.token_pk,
                        product_name: item.product_name  // warranties에 저장하기 위해 추가
                    });
                }
            }
        }

        Logger.log('[PAID_PROCESSOR] 재고 배정 완료', {
            orderId,
            reservedCount: reservedStockUnits.length,
            useHold
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
                    (order_id, order_item_id, unit_seq, stock_unit_id, token_pk, unit_status, created_at)
                    VALUES (?, ?, ?, ?, ?, 'reserved', NOW())`,
                    [
                        unit.order_id,
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
        
        // verified_at 생성 (UTC 시간, 'YYYY-MM-DD HH:MM:SS' 형식)
        // ⚠️ 중요: verified_at은 NOT NULL 필드이므로 반드시 값이 있어야 함
        const now = new Date();
        const utcDateTime = now.toISOString().replace('T', ' ').substring(0, 19);
        
        if (!utcDateTime || utcDateTime.length !== 19) {
            throw new Error(`verified_at 생성 실패: utcDateTime=${utcDateTime}`);
        }

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
                             owner_user_id = ?,
                             product_name = ?,
                             verified_at = ?
                         WHERE token_pk = ? AND status = 'revoked'`,
                        [
                            warrantyStatus,
                            unit.order_item_unit_id,
                            ownerUserId,
                            unit.product_name,
                            utcDateTime,
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
                    // ⚠️ public_id 필수: UUID v4 생성
                    // ⚠️ verified_at 필수: UTC 시간 ('YYYY-MM-DD HH:MM:SS' 형식)
                    // ⚠️ product_name 필수: order_items에서 가져온 제품명 저장
                    const publicId = uuidv4();
                    const [insertResult] = await connection.execute(
                        `INSERT INTO warranties
                        (source_order_item_unit_id, token_pk, owner_user_id, status, public_id, product_name, verified_at, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            unit.order_item_unit_id,
                            unit.token_pk,
                            ownerUserId,
                            warrantyStatus,
                            publicId,
                            unit.product_name,
                            utcDateTime,
                            utcDateTime
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
        let invoiceId = null;
        try {
            const invoiceResult = await createInvoiceFromOrder(connection, orderId);
            invoiceNumber = invoiceResult.invoice_number;
            invoiceId = invoiceResult.invoice_id;
            Logger.log('[PAID_PROCESSOR] invoices 생성 완료', {
                orderId,
                invoiceId,
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

        // ============================================================
        // 9. guest_order_access_tokens 생성 (회원/비회원 모두 - 이메일 접근 토큰)
        // ============================================================
        let guestAccessToken = null;
        
        // 회원/비회원 모두 토큰 발급 (이메일 링크 통일)
        try {
            // 1. 기존 유효 토큰 확인 (SSOT: guest-token-helpers)
            const [existingTokens] = await connection.execute(
                `SELECT token 
                 FROM guest_order_access_tokens got 
                 WHERE got.order_id = ? AND ${selectValidGuestTokenSql('got')} 
                 ORDER BY got.created_at DESC 
                 LIMIT 1`,
                [orderId]
            );

            if (existingTokens.length > 0) {
                // 기존 최신 토큰 재사용
                guestAccessToken = existingTokens[0].token;
                Logger.log('[PAID_PROCESSOR] 기존 토큰 재사용', {
                    orderId,
                    userId: order.user_id,
                    guestId: order.guest_id,
                    tokenPrefix: guestAccessToken.substring(0, 8) + '...'
                });
            } else {
                // 새 토큰 생성
                // ⚠️ 레이스 조건: 동시 요청 시 여러 토큰이 생성될 수 있으나,
                // 다음 조회 시 ORDER BY created_at DESC LIMIT 1로 최신 것만 사용
                const accessToken = crypto.randomBytes(32).toString('hex');
                const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90일 후

                await connection.execute(
                    `INSERT INTO guest_order_access_tokens 
                     (order_id, token, expires_at) 
                     VALUES (?, ?, ?)`,
                    [orderId, accessToken, expiresAt]
                );

                guestAccessToken = accessToken;
                Logger.log('[PAID_PROCESSOR] 새 토큰 생성', {
                    orderId,
                    userId: order.user_id,
                    guestId: order.guest_id,
                    tokenPrefix: accessToken.substring(0, 8) + '...',
                    expiresAt
                });
            }

            // 2. 이메일 발송 직전에 항상 "대표 토큰(최신)"을 다시 조회해서 그 토큰으로 발송 (SSOT: guest-token-helpers)
            const [finalToken] = await connection.execute(
                `SELECT token 
                 FROM guest_order_access_tokens got 
                 WHERE got.order_id = ? AND ${selectValidGuestTokenSql('got')} 
                 ORDER BY got.created_at DESC 
                 LIMIT 1`,
                [orderId]
            );

            if (finalToken.length > 0) {
                guestAccessToken = finalToken[0].token; // 이메일 발송용 최종 토큰
                Logger.log('[PAID_PROCESSOR] 이메일 발송용 최신 토큰 선정', {
                    orderId,
                    tokenPrefix: guestAccessToken.substring(0, 8) + '...'
                });
            }
        } catch (error) {
            // 토큰 생성 실패는 로깅만 (결제 성공은 유지)
            Logger.error('[PAID_PROCESSOR] 토큰 처리 실패 (결제는 성공)', {
                orderId,
                userId: order.user_id,
                guestId: order.guest_id,
                error: error.message,
                error_code: error.code
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
            invoiceId,
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
                invoiceId,
                invoiceNumber,
                // 이메일 발송용 정보 (P2: 중복 조회 제거 — confirm에서 추가 SELECT 없이 사용)
                orderInfo: {
                    order_id: orderId,
                    order_number: order.order_number,
                    order_date: order.created_at,
                    total_amount: order.total_price,
                    user_email: order.user_email,
                    shipping_email: order.shipping_email,
                    user_id: order.user_id,
                    guest_id: order.guest_id,
                    guest_access_token: guestAccessToken,
                    customerName: order.user_name || order.shipping_name || null,
                    items: orderItems.map(row => ({
                        product_name: row.product_name,
                        size: row.size,
                        color: row.color,
                        quantity: row.quantity,
                        unit_price: row.unit_price,
                        subtotal: row.subtotal
                    }))
                }
            }
        };

    } catch (error) {
        const duration = Date.now() - startTime;
        
        // ⚠️ 상세 에러 정보 로깅 (디버깅용)
        const errorDetails = {
            orderId,
            paidEventId,
            duration,
            error_message: error.message || '에러 메시지 없음',
            error_code: error.code || '에러 코드 없음',
            error_sql_state: error.sqlState || 'SQL 상태 없음',
            error_sql_message: error.sqlMessage || 'SQL 메시지 없음',
            error_name: error.name || '에러 이름 없음',
            error_stack: error.stack || '스택 트레이스 없음'
        };
        
        // JSON 문자열로 변환하여 전체 에러 정보 출력
        Logger.error('[PAID_PROCESSOR] Paid 처리 실패 - 상세 정보', errorDetails);
        
        // 콘솔에도 출력 (PM2 로그에서 확인 가능)
        Logger.error('[PAID_PROCESSOR] Paid 처리 실패 - 전체 에러 객체:', JSON.stringify(errorDetails, null, 2));
        Logger.error('[PAID_PROCESSOR] 에러 원본:', error);

        // ⚠️ 안전망: 예약된 재고가 있으면 명시적으로 해제 (트랜잭션 롤백 실패 대비)
        // 주의: connection이 트랜잭션 내이므로 롤백되면 자동 해제되지만, 안전을 위해 명시적 해제
        try {
            const [reservedStock] = await connection.execute(
                `SELECT stock_unit_id, product_id 
                 FROM stock_units 
                 WHERE reserved_by_order_id = ? AND status = 'reserved'`,
                [orderId]
            );

            if (reservedStock.length > 0) {
                Logger.warn('[PAID_PROCESSOR] 예약된 재고 발견 - 명시적 해제 시도', {
                    orderId,
                    reservedCount: reservedStock.length
                });

                // 예약 해제 (트랜잭션 롤백 전에 명시적 해제)
                await connection.execute(
                    `UPDATE stock_units
                     SET status = 'in_stock',
                         reserved_at = NULL,
                         reserved_by_order_id = NULL
                     WHERE reserved_by_order_id = ? AND status = 'reserved'`,
                    [orderId]
                );

                Logger.log('[PAID_PROCESSOR] 예약된 재고 해제 완료', {
                    orderId,
                    releasedCount: reservedStock.length
                });
            }
        } catch (cleanupError) {
            // 재고 해제 실패는 로깅만 (트랜잭션 롤백으로 처리될 것)
            Logger.error('[PAID_PROCESSOR] 예약된 재고 해제 실패 (롤백으로 처리될 것)', {
                orderId,
                error: cleanupError.message
            });
        }

        // 처리 상태를 'failed'로 업데이트 (별도 커넥션, 트랜잭션과 분리)
        try {
            await updateProcessingStatus(paidEventId, 'failed', error.message || '알 수 없는 에러');
        } catch (statusError) {
            Logger.error('[PAID_PROCESSOR] updateProcessingStatus 실패 (무시하고 계속 진행)', {
                paidEventId,
                statusError: statusError.message
            });
        }

        throw error;
    }
}

module.exports = {
    processPaidOrder
};