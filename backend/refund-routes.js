/**
 * refund-routes.js
 * 
 * 환불 처리 API (관리자 전용)
 * 
 * 핵심 원칙:
 * - 환불 가능 판정: warranties.status만 본다 (SSOT)
 * - 원자적 상태 전이: affectedRows=1 검증 필수
 * - Outbox 패턴: warranty_events INSERT 실패 시 전이도 롤백
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const { updateOrderStatus } = require('./utils/order-status-aggregator');
const Logger = require('./logger');
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
 * Credit Note 번호 생성
 * 형식: PM-CN-YYMMDD-HHmmss-{랜덤4자}
 */
function generateCreditNoteNumber(date = new Date()) {
    const year = date.getFullYear().toString().slice(-2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    // 랜덤 4자 생성 (0-9, A-Z)
    const randomChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let randomSuffix = '';
    for (let i = 0; i < 4; i++) {
        const randomIndex = crypto.randomInt(0, randomChars.length);
        randomSuffix += randomChars[randomIndex];
    }
    
    return `PM-CN-${year}${month}${day}-${hours}${minutes}${seconds}-${randomSuffix}`;
}

/**
 * 고유한 Credit Note 번호 생성 (DB 중복 확인 포함)
 */
async function generateUniqueCreditNoteNumber(connection, date = new Date(), maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const creditNoteNumber = generateCreditNoteNumber(date);
        
        try {
            const [existing] = await connection.execute(
                'SELECT 1 FROM invoices WHERE invoice_number = ? LIMIT 1',
                [creditNoteNumber]
            );
            
            if (existing.length === 0) {
                return creditNoteNumber;
            }
            
            Logger.warn('[REFUND] Credit Note 번호 충돌 감지:', {
                attempt,
                maxRetries,
                creditNoteNumber
            });
            
            if (attempt === maxRetries) {
                throw new Error(`Credit Note 번호 생성 실패: ${maxRetries}회 재시도 후에도 고유한 번호를 생성할 수 없습니다`);
            }
            
            // 지수 백오프
            const backoffMs = Math.min(10 * Math.pow(2, attempt - 1), 40);
            await new Promise(resolve => setTimeout(resolve, backoffMs));
            
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            Logger.error('[REFUND] Credit Note 번호 생성 오류:', {
                attempt,
                maxRetries,
                error: error.message
            });
        }
    }
}

/**
 * POST /api/admin/refunds/process
 * 환불 처리 API (관리자 전용)
 * 
 * 요청 본문:
 * {
 *   "warranty_id": 1,
 *   "reason": "고객 요청"
 * }
 * 
 * 처리 흐름 (SYSTEM_FLOW_DETAILED.md 6-2절, FINAL_EXECUTION_SPEC_REVIEW.md 205-257줄):
 * 1. 환불 가능 판정: warranties.status만 본다 (SSOT)
 * 2. 원자적 상태 전이 (affectedRows=1 검증)
 * 3. order_item_units.unit_status = 'refunded' 업데이트
 * 4. stock_units.status = 'in_stock' (재판매 가능)
 * 5. credit_note 생성
 * 6. warranty_events 이벤트 기록 (Outbox 패턴)
 * 7. orders.status 집계 함수로 자동 업데이트
 */
router.post('/admin/refunds/process', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { warranty_id, reason } = req.body;
        const adminUserId = req.user.userId || req.user.id;

        // 1. 입력 검증
        if (!warranty_id) {
            return res.status(400).json({
                success: false,
                message: 'warranty_id는 필수입니다.',
                code: 'MISSING_WARRANTY_ID'
            });
        }

        if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '환불 사유는 필수입니다.',
                code: 'MISSING_REASON'
            });
        }

        // 1-1. Idempotency-Key 필수 검증 (085: 멱등성 보장)
        const idempotencyKeyRaw = req.get('Idempotency-Key') || req.headers['idempotency-key'] || req.headers['idempotency-key'];
        if (!idempotencyKeyRaw || typeof idempotencyKeyRaw !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Idempotency-Key 헤더가 필수입니다. (재시도 시 동일 키 재사용)',
                code: 'MISSING_IDEMPOTENCY_KEY'
            });
        }

        // trim() 처리 (선행/후행 공백 방지)
        const idempotencyKey = idempotencyKeyRaw.trim();
        if (idempotencyKey.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Idempotency-Key는 공백일 수 없습니다.',
                code: 'INVALID_IDEMPOTENCY_KEY'
            });
        }

        // UUID 형식 검증 (case-insensitive, 버전 무관 v1~v7 모두 허용)
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(idempotencyKey)) {
            return res.status(400).json({
                success: false,
                message: 'Idempotency-Key는 UUID 형식이어야 합니다.',
                code: 'INVALID_IDEMPOTENCY_KEY_FORMAT'
            });
        }

        // 길이 제한 확인 (VARCHAR(64), UUID는 36자)
        if (idempotencyKey.length > 64) {
            return res.status(400).json({
                success: false,
                message: 'Idempotency-Key는 64자 이하여야 합니다.',
                code: 'INVALID_IDEMPOTENCY_KEY_LENGTH'
            });
        }

        // refund_event_id 확정 (Idempotency-Key 값 사용, 재시도 시 동일 ID 보장)
        const refund_event_id = idempotencyKey;

        Logger.log('[REFUND] 환불 처리 요청:', {
            warranty_id,
            reason: reason.substring(0, 50),
            admin_user_id: adminUserId
        });

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 2-1. (락 없이) warranty → order_id 조회 (전역 락 순서: orders first)
            const [warrantyInfo] = await connection.execute(
                `SELECT w.id, oiu.order_id
                 FROM warranties w
                 INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
                 WHERE w.id = ?`,
                [warranty_id]
            );
            if (warrantyInfo.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: '보증서를 찾을 수 없습니다.',
                    code: 'WARRANTY_NOT_FOUND'
                });
            }
            const orderId = warrantyInfo[0].order_id;

            // 2-2. orders FOR UPDATE 먼저 잠금 (락 순서 1단계: 전역 순서 준수)
            const [orders] = await connection.execute(
                `SELECT order_id, order_number, total_price, shipping_email, shipping_name
                 FROM orders WHERE order_id = ? FOR UPDATE`,
                [orderId]
            );
            if (orders.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: '주문을 찾을 수 없습니다.',
                    code: 'ORDER_NOT_FOUND'
                });
            }

            // 2-3. warranties FOR UPDATE 잠금 (락 순서 4단계)
            const [warranties] = await connection.execute(
                `SELECT 
                    w.id,
                    w.status,
                    w.owner_user_id,
                    w.source_order_item_unit_id,
                    w.revoked_at,
                    oiu.order_item_unit_id,
                    oiu.order_id,
                    oiu.stock_unit_id,
                    oiu.unit_status,
                    oi.order_item_id,
                    oi.product_name,
                    oi.unit_price,
                    oi.subtotal,
                    o.order_number,
                    o.total_price,
                    o.shipping_email,
                    o.shipping_name
                FROM warranties w
                INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
                INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
                INNER JOIN orders o ON oi.order_id = o.order_id
                WHERE w.id = ?
                FOR UPDATE`,
                [warranty_id]
            );
            if (warranties.length === 0) {
                await connection.rollback();
                return res.status(404).json({
                    success: false,
                    message: '보증서를 찾을 수 없습니다.',
                    code: 'WARRANTY_NOT_FOUND'
                });
            }

            // 2-4. 경쟁 조건 검증: FOR UPDATE로 읽은 order_id가 최초 조회와 일치해야 함
            const confirmedOrderId = warranties[0].order_id;
            if (confirmedOrderId !== orderId) {
                Logger.error('[REFUND] order_id 불일치 (경쟁 조건 감지)', {
                    warranty_id,
                    initial_order_id: orderId,
                    confirmed_order_id: confirmedOrderId
                });
                await connection.rollback();
                throw new Error('Order ID mismatch detected. Please retry.');
            }

            const warranty = warranties[0];

            // 3. 환불 가능 판정: warranties.status만 본다 (SSOT)
            if (warranty.status === 'revoked') {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: '이미 환불 처리된 보증서입니다.',
                    code: 'ALREADY_REFUNDED'
                });
            }

            if (warranty.status === 'active') {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: '활성화된 보증서는 환불할 수 없습니다.',
                    code: 'ACTIVE_WARRANTY_CANNOT_REFUND'
                });
            }

            if (warranty.status !== 'issued' && warranty.status !== 'issued_unassigned') {
                await connection.rollback();
                return res.status(400).json({
                    success: false,
                    message: `환불할 수 없는 상태입니다. (현재 상태: ${warranty.status})`,
                    code: 'INVALID_WARRANTY_STATUS'
                });
            }

            // 4. 원자적 조건으로 상태 전이 (affectedRows=1 검증 필수)
            const [updateResult] = await connection.execute(
                `UPDATE warranties 
                 SET status = 'revoked', 
                     revoked_at = NOW()
                 WHERE id = ? 
                   AND status IN ('issued', 'issued_unassigned')`,
                [warranty_id]
            );

            if (updateResult.affectedRows !== 1) {
                await connection.rollback();
                Logger.error('[REFUND] warranty 상태 전이 실패:', {
                    warranty_id,
                    affectedRows: updateResult.affectedRows,
                    current_status: warranty.status
                });
                return res.status(500).json({
                    success: false,
                    message: '환불 처리 중 오류가 발생했습니다. (상태 전이 실패)',
                    code: 'STATUS_TRANSITION_FAILED'
                });
            }

            // 5. order_item_units.unit_status = 'refunded' 업데이트
            const [unitUpdateResult] = await connection.execute(
                `UPDATE order_item_units 
                 SET unit_status = 'refunded'
                 WHERE order_item_unit_id = ?`,
                [warranty.source_order_item_unit_id]
            );

            if (unitUpdateResult.affectedRows !== 1) {
                await connection.rollback();
                Logger.error('[REFUND] order_item_units 업데이트 실패:', {
                    order_item_unit_id: warranty.source_order_item_unit_id,
                    affectedRows: unitUpdateResult.affectedRows
                });
                return res.status(500).json({
                    success: false,
                    message: '환불 처리 중 오류가 발생했습니다. (주문 항목 단위 업데이트 실패)',
                    code: 'UNIT_UPDATE_FAILED'
                });
            }

            // 6. stock_units.status = 'in_stock' (재판매 가능)
            if (warranty.stock_unit_id) {
                const [stockUpdateResult] = await connection.execute(
                    `UPDATE stock_units 
                     SET status = 'in_stock'
                     WHERE stock_unit_id = ?`,
                    [warranty.stock_unit_id]
                );

                if (stockUpdateResult.affectedRows !== 1) {
                    await connection.rollback();
                    Logger.error('[REFUND] stock_units 업데이트 실패:', {
                        stock_unit_id: warranty.stock_unit_id,
                        affectedRows: stockUpdateResult.affectedRows
                    });
                    return res.status(500).json({
                        success: false,
                        message: '환불 처리 중 오류가 발생했습니다. (재고 상태 업데이트 실패)',
                        code: 'STOCK_UPDATE_FAILED'
                    });
                }
            }

            // 7. 원본 인보이스 조회 (credit_note 생성용)
            const [originalInvoices] = await connection.execute(
                `SELECT invoice_id, invoice_number, payload_json, total_amount, tax_amount, net_amount, currency
                 FROM invoices
                 WHERE order_id = ? 
                   AND type = 'invoice'
                   AND status = 'issued'
                 ORDER BY issued_at DESC
                 LIMIT 1`,
                [warranty.order_id]
            );

            let relatedInvoiceId = null;
            if (originalInvoices.length > 0) {
                relatedInvoiceId = originalInvoices[0].invoice_id;
            }

            // 8. credit_note 생성
            const creditNoteNumber = await generateUniqueCreditNoteNumber(connection);
            const now = new Date();
            
            // 환불 금액 계산 (단위 가격 기준)
            const refundAmount = parseFloat(warranty.subtotal || warranty.unit_price || 0);
            const refundTaxAmount = 0; // 부가세 별도 계산 시 수정 필요
            const refundNetAmount = refundAmount - refundTaxAmount;

            // credit_note payload_json 생성 (085: refund_event_id 포함)
            const creditNotePayload = {
                type: 'credit_note',
                related_invoice_id: relatedInvoiceId,
                related_invoice_number: originalInvoices.length > 0 ? originalInvoices[0].invoice_number : null,
                refund_event_id: refund_event_id, // 085: 멱등성 식별자
                refund_reason: reason.trim(),
                refunded_at: now.toISOString(),
                refunded_by: 'admin',
                refunded_by_id: adminUserId,
                refunded_unit: {
                    order_item_unit_id: warranty.source_order_item_unit_id,
                    order_item_id: warranty.order_item_id,
                    product_name: warranty.product_name,
                    unit_price: parseFloat(warranty.unit_price || 0),
                    subtotal: parseFloat(warranty.subtotal || 0)
                },
                amounts: {
                    total: refundAmount,
                    tax: refundTaxAmount,
                    net: refundNetAmount
                },
                currency: 'KRW' // 기본값, 실제로는 주문 통화 사용
            };

            const payloadString = JSON.stringify(creditNotePayload);
            const orderSnapshotHash = crypto.createHash('sha256').update(payloadString).digest('hex');

            // credit_note INSERT (085: refund_event_id 포함)
            let creditNoteResult;
            let creditNoteId;
            try {
                [creditNoteResult] = await connection.execute(
                    `INSERT INTO invoices (
                        order_id,
                        invoice_number,
                        type,
                        status,
                        currency,
                        total_amount,
                        tax_amount,
                        net_amount,
                        billing_name,
                        billing_email,
                        shipping_name,
                        shipping_email,
                        payload_json,
                        order_snapshot_hash,
                        version,
                        issued_by,
                        issued_by_id,
                        related_invoice_id,
                        refund_event_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        warranty.order_id,
                        creditNoteNumber,
                        'credit_note',
                        'issued',
                        'KRW',
                        refundAmount,
                        refundTaxAmount,
                        refundNetAmount,
                        warranty.shipping_name || '고객',
                        warranty.shipping_email || '',
                        warranty.shipping_name || '고객',
                        warranty.shipping_email || null,
                        payloadString,
                        orderSnapshotHash,
                        1,
                        'admin',
                        adminUserId,
                        relatedInvoiceId,
                        refund_event_id
                    ]
                );
                creditNoteId = creditNoteResult.insertId;
            } catch (sqlError) {
                // ER_DUP_ENTRY: UNIQUE(credit_note_refund_event_id) 위반 시 기존 credit_note 조회 후 반환 (멱등성)
                if (sqlError.code === 'ER_DUP_ENTRY') {
                    Logger.log('[REFUND] 중복 credit_note 감지 (DB 제약), 기존 credit_note 조회', {
                        refund_event_id,
                        warranty_id,
                        error_code: sqlError.code,
                        sql_message: sqlError.sqlMessage
                    });

                    // 기존 credit_note 조회 (issued 우선, 없으면 최신 1건)
                    const [existingCreditNotes] = await connection.execute(
                        `SELECT invoice_id, invoice_number, status, issued_at, refund_event_id
                         FROM invoices
                         WHERE type = 'credit_note' 
                           AND refund_event_id = ?
                         ORDER BY 
                           CASE WHEN status = 'issued' THEN 0 ELSE 1 END,
                           (issued_at IS NULL) ASC,
                           issued_at DESC,
                           invoice_id DESC
                         LIMIT 1`,
                        [refund_event_id]
                    );

                    if (existingCreditNotes.length > 0) {
                        const existing = existingCreditNotes[0];
                        
                        // issued가 있으면 반환 (정상 케이스)
                        if (existing.status === 'issued') {
                            Logger.log('[REFUND] 기존 issued credit_note 반환 (DB 충돌 처리)', {
                                refund_event_id,
                                warranty_id,
                                credit_note_id: existing.invoice_id,
                                credit_note_number: existing.invoice_number
                            });
                            creditNoteId = existing.invoice_id;
                            // 기존 credit_note 반환 후 계속 진행 (warranty_events 기록 등)
                        } else {
                            // issued 없고 void/refunded만 있으면 에러 (데이터 꼬임)
                            Logger.error('[REFUND] ER_DUP_ENTRY 발생했으나 issued credit_note 없음 (데이터 꼬임)', {
                                refund_event_id,
                                warranty_id,
                                related_invoice_id: relatedInvoiceId,
                                attempted_amount: refundAmount,
                                attempted_unit: warranty.source_order_item_unit_id,
                                existing_credit_note_id: existing.invoice_id,
                                existing_status: existing.status,
                                error_code: sqlError.code
                            });
                            throw new Error('Credit note 중복 감지되었으나 기존 issued credit note를 찾을 수 없습니다.');
                        }
                    } else {
                        // 조회 결과가 없으면 트랜잭션 가시성 문제 또는 데이터 꼬임
                        Logger.error('[REFUND] ER_DUP_ENTRY 발생했으나 기존 credit_note 조회 실패', {
                            refund_event_id,
                            warranty_id,
                            error_code: sqlError.code,
                            sql_message: sqlError.sqlMessage
                        });
                        throw new Error('Credit note 중복 감지되었으나 기존 credit note를 찾을 수 없습니다.');
                    }
                } else {
                    // 다른 SQL 에러는 그대로 throw
                    throw sqlError;
                }
            }

            // 9. warranty_events에 환불 이벤트 기록 (Outbox 패턴)
            // ⚠️ 이벤트 INSERT 실패 시 전이도 롤백
            try {
                await connection.execute(
                    `INSERT INTO warranty_events (
                        warranty_id,
                        event_type,
                        old_value,
                        new_value,
                        changed_by,
                        changed_by_id,
                        reason
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        warranty_id,
                        'status_change',
                        JSON.stringify({ status: warranty.status }),
                        JSON.stringify({ 
                            status: 'revoked',
                            revoked_at: now.toISOString()
                        }),
                        'admin',
                        adminUserId,
                        `환불 처리: ${reason.trim()}`
                    ]
                );
            } catch (eventError) {
                await connection.rollback();
                Logger.error('[REFUND] warranty_events INSERT 실패 (Outbox 패턴 위반):', {
                    warranty_id,
                    error: eventError.message
                });
                return res.status(500).json({
                    success: false,
                    message: '환불 처리 중 오류가 발생했습니다. (이벤트 기록 실패)',
                    code: 'EVENT_LOG_FAILED'
                });
            }

            // 10. orders.status 집계 함수로 자동 업데이트
            await updateOrderStatus(connection, warranty.order_id);

            await connection.commit();

            Logger.log('[REFUND] 환불 처리 성공:', {
                warranty_id,
                order_id: warranty.order_id,
                credit_note_id: creditNoteId,
                credit_note_number: creditNoteNumber,
                admin_user_id: adminUserId
            });

            return res.status(200).json({
                success: true,
                message: '환불 처리가 완료되었습니다.',
                data: {
                    warranty_id,
                    order_id: warranty.order_id,
                    order_number: warranty.order_number,
                    credit_note_id: creditNoteId,
                    credit_note_number: creditNoteNumber,
                    refund_amount: refundAmount,
                    refunded_at: now.toISOString()
                }
            });

        } catch (error) {
            await connection.rollback();
            Logger.error('[REFUND] 환불 처리 실패:', {
                warranty_id,
                error: error.message,
                stack: error.stack
            });
            return res.status(500).json({
                success: false,
                message: '환불 처리 중 오류가 발생했습니다.',
                code: 'INTERNAL_ERROR'
            });
        } finally {
            if (connection) {
                await connection.end();
            }
        }

    } catch (error) {
        Logger.error('[REFUND] 환불 처리 API 오류:', {
            error: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            message: '서버 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;
