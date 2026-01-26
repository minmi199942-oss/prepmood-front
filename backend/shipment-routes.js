/**
 * shipment-routes.js
 * 
 * 배송/송장 관리 API (관리자 전용)
 * 
 * 핵심 원칙:
 * - shipments 테이블에 송장 기록
 * - shipment_units 테이블에 order_item_unit_id와 연결
 * - order_item_units.current_shipment_id 업데이트
 * - order_item_units.unit_status 업데이트
 * - orders.status 집계 함수로 자동 업데이트
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const { updateOrderStatus } = require('./utils/order-status-aggregator');
const { buildInClause } = require('./utils/query-helpers');
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
 * POST /api/admin/orders/:orderId/shipments
 * 송장 생성 API (관리자 전용)
 * 
 * 요청 본문:
 * {
 *   "order_item_unit_ids": [1001, 1002],
 *   "carrier_code": "CJ",
 *   "tracking_number": "1234567890"
 * }
 * 
 * 처리 흐름 (SYSTEM_FLOW_DETAILED.md 8-4절 참조):
 * 1. 관리자가 주문 상세 페이지에서 배송할 제품 확인
 * 2. 각 order_item_unit의 시리얼 넘버와 토큰 확인
 * 3. 현실에서 해당 제품 찾기 (시리얼 넘버 또는 토큰으로)
 * 4. 송장 생성:
 *    - 택배사 코드 입력
 *    - 송장번호 입력
 *    - shipments 테이블에 기록
 *    - shipment_units 테이블에 order_item_unit_id와 연결
 *    - order_item_units.current_shipment_id 업데이트
 *    - order_item_units.unit_status = 'shipped' 업데이트
 * 5. orders.status 집계 함수로 자동 업데이트
 * 
 * ⚠️ 송장 교체 정책 (B안 확정):
 * - 교체 흐름: 기존 shipment를 voided_at + void_reason으로 무효화 → 새 shipment 생성 → shipment_units에 동일 unit 재매핑 → order_item_units.current_shipment_id를 새 shipment로 교체
 * - 핵심 금지: "shipment 없이 shipped로 바꾸기"는 그대로 금지 유지
 * - delivered 이후 replace 금지: delivered 이후 resend는 "추가 shipment 생성"만 허용
 */
router.post('/admin/orders/:orderId/shipments', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        const { order_item_unit_ids, carrier_code, tracking_number } = req.body;
        const adminUserId = req.user.userId || req.user.id;

        // 1. 입력 검증
        if (!Array.isArray(order_item_unit_ids) || order_item_unit_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'order_item_unit_ids는 비어있지 않은 배열이어야 합니다.',
                code: 'MISSING_UNIT_IDS'
            });
        }

        if (!carrier_code || typeof carrier_code !== 'string' || !carrier_code.trim()) {
            return res.status(400).json({
                success: false,
                message: 'carrier_code는 필수입니다.',
                code: 'MISSING_CARRIER_CODE'
            });
        }

        if (!tracking_number || typeof tracking_number !== 'string' || !tracking_number.trim()) {
            return res.status(400).json({
                success: false,
                message: 'tracking_number는 필수입니다.',
                code: 'MISSING_TRACKING_NUMBER'
            });
        }

        // unit_ids 중복 방어
        const uniqueUnitIds = [...new Set(order_item_unit_ids)];
        if (uniqueUnitIds.length !== order_item_unit_ids.length) {
            const duplicates = order_item_unit_ids.filter((id, index) => order_item_unit_ids.indexOf(id) !== index);
            return res.status(400).json({
                success: false,
                message: `중복된 unit_id가 포함되어 있습니다: ${duplicates.join(', ')}`,
                code: 'DUPLICATE_UNIT_IDS'
            });
        }

        const normalizedCarrierCode = carrier_code.trim();
        const normalizedTrackingNumber = tracking_number.trim();

        Logger.log('[SHIPMENT] 송장 생성 요청:', {
            orderId,
            unitIds: uniqueUnitIds,
            carrierCode: normalizedCarrierCode,
            trackingNumber: normalizedTrackingNumber,
            adminUserId
        });

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 2. 택배사 코드 검증 (carriers 테이블 확인)
            const [carriers] = await connection.execute(
                'SELECT code, name FROM carriers WHERE code = ? AND is_active = 1',
                [normalizedCarrierCode]
            );

            if (carriers.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `유효하지 않은 택배사 코드입니다: ${normalizedCarrierCode}`,
                    code: 'INVALID_CARRIER_CODE'
                });
            }

            // 3. orders FOR UPDATE 먼저 잠금 (락 순서 1단계: 전역 순서 준수)
            const [orders] = await connection.execute(
                'SELECT order_id, order_number FROM orders WHERE order_id = ? FOR UPDATE',
                [orderId]
            );
            if (orders.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '주문을 찾을 수 없습니다.',
                    code: 'ORDER_NOT_FOUND'
                });
            }

            // 4. order_item_units 조회 (FOR UPDATE로 잠금, 락 순서 3단계)
            const { placeholders, params: unitIdsParams } = buildInClause(uniqueUnitIds);
            const [units] = await connection.execute(
                `SELECT 
                    oiu.order_item_unit_id,
                    oiu.order_id,
                    oiu.unit_status,
                    oiu.current_shipment_id,
                    oiu.shipped_at
                FROM order_item_units oiu
                WHERE oiu.order_item_unit_id IN (${placeholders})
                  AND oiu.order_id = ?
                FOR UPDATE`,
                [...unitIdsParams, orderId]
            );

            // 검증: 길이 일치
            if (units.length !== uniqueUnitIds.length) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `검증 실패: 요청=${uniqueUnitIds.length}개, 조회=${units.length}개`,
                    code: 'UNIT_IDS_MISMATCH'
                });
            }

            // 검증: order_id 일치
            const mismatchedOrderId = units.find(u => u.order_id !== parseInt(orderId));
            if (mismatchedOrderId) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `orderId 불일치: unit_id=${mismatchedOrderId.order_item_unit_id}`,
                    code: 'ORDER_ID_MISMATCH'
                });
            }

            // 검증: unit_status = 'reserved' (배송 가능한 상태)
            const invalidStatus = units.filter(u => u.unit_status !== 'reserved');
            if (invalidStatus.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `예약 상태가 아닌 유닛이 포함되어 있습니다: ${invalidStatus.map(u => `${u.order_item_unit_id}(${u.unit_status})`).join(', ')}`,
                    code: 'INVALID_UNIT_STATUS'
                });
            }

            // 검증: shipped_at 전부 NULL (이미 출고되지 않았는지)
            const alreadyShipped = units.filter(u => u.shipped_at !== null);
            if (alreadyShipped.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `이미 출고된 유닛이 포함되어 있습니다: ${alreadyShipped.map(u => u.order_item_unit_id).join(', ')}`,
                    code: 'ALREADY_SHIPPED'
                });
            }

            // 5. 기존 유효 송장 확인 (active_key 중복 방지)
            // active_key는 generated column으로 voided_at IS NULL일 때만 값이 있음
            const [existingShipments] = await connection.execute(
                `SELECT shipment_id, tracking_number, voided_at
                 FROM shipments
                 WHERE carrier_code = ?
                   AND tracking_number = ?
                   AND voided_at IS NULL`,
                [normalizedCarrierCode, normalizedTrackingNumber]
            );

            if (existingShipments.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(409).json({
                    success: false,
                    message: `이미 사용 중인 송장번호입니다: ${normalizedTrackingNumber}`,
                    code: 'DUPLICATE_TRACKING_NUMBER'
                });
            }

            // 6. shipments 테이블에 송장 기록
            const [shipmentResult] = await connection.execute(
                `INSERT INTO shipments 
                 (order_id, carrier_code, tracking_number, shipped_at, created_by_admin_id)
                 VALUES (?, ?, ?, NOW(), ?)`,
                [orderId, normalizedCarrierCode, normalizedTrackingNumber, adminUserId]
            );

            const shipmentId = shipmentResult.insertId;

            // 7. shipment_units 테이블에 order_item_unit_id와 연결
            for (const unitId of uniqueUnitIds) {
                await connection.execute(
                    `INSERT INTO shipment_units 
                     (shipment_id, order_item_unit_id)
                     VALUES (?, ?)`,
                    [shipmentId, unitId]
                );
            }

            // 8. order_item_units 업데이트
            // - current_shipment_id 업데이트
            // - unit_status = 'shipped' 업데이트
            // - carrier_code, tracking_number, shipped_at 업데이트 (기존 컬럼 유지)
            const [updateResult] = await connection.execute(
                `UPDATE order_item_units
                 SET unit_status = 'shipped',
                     current_shipment_id = ?,
                     carrier_code = ?,
                     tracking_number = ?,
                     shipped_at = NOW()
                 WHERE order_item_unit_id IN (${placeholders})
                   AND order_id = ?
                   AND unit_status = 'reserved'
                   AND shipped_at IS NULL`,
                [shipmentId, normalizedCarrierCode, normalizedTrackingNumber, ...unitIdsParams, orderId]
            );

            if (updateResult.affectedRows !== uniqueUnitIds.length) {
                await connection.rollback();
                await connection.end();
                Logger.error('[SHIPMENT] order_item_units 업데이트 실패:', {
                    orderId,
                    unitIds: uniqueUnitIds,
                    affectedRows: updateResult.affectedRows,
                    expectedRows: uniqueUnitIds.length
                });
                return res.status(500).json({
                    success: false,
                    message: `출고 처리 실패: 요청=${uniqueUnitIds.length}개, 업데이트=${updateResult.affectedRows}개`,
                    code: 'UPDATE_FAILED'
                });
            }

            // 9. orders.status 집계 함수로 자동 업데이트
            await updateOrderStatus(connection, orderId);

            await connection.commit();
            await connection.end();

            Logger.log('[SHIPMENT] 송장 생성 완료', {
                orderId,
                shipmentId,
                unitIds: uniqueUnitIds,
                carrierCode: normalizedCarrierCode,
                trackingNumber: normalizedTrackingNumber,
                adminUserId
            });

            res.status(201).json({
                success: true,
                message: '송장이 생성되었습니다.',
                data: {
                    order_id: parseInt(orderId),
                    shipment_id: shipmentId,
                    carrier_code: normalizedCarrierCode,
                    carrier_name: carriers[0].name,
                    tracking_number: normalizedTrackingNumber,
                    shipped_unit_count: updateResult.affectedRows,
                    shipped_at: new Date().toISOString()
                }
            });

        } catch (error) {
            await connection.rollback();
            await connection.end();
            throw error;
        }

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
                await connection.end();
            } catch (rollbackError) {
                Logger.error('[SHIPMENT] 롤백 실패', {
                    error: rollbackError.message
                });
            }
        }

        Logger.error('[SHIPMENT] 송장 생성 실패', {
            orderId: req.params.orderId,
            adminUserId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: '송장 생성 중 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * POST /api/admin/orders/:orderId/deliver
 * 배송 완료 처리 API (관리자 전용)
 * 
 * 요청 본문:
 * {
 *   "order_item_unit_ids": [1001, 1002]
 * }
 * 
 * 처리 흐름:
 * 1. 관리자가 주문 상세 페이지에서 배송 완료 처리할 제품 확인
 * 2. 각 order_item_unit의 시리얼 넘버와 토큰 확인
 * 3. order_item_units.unit_status = 'delivered' 업데이트
 * 4. orders.status 집계 함수로 자동 업데이트
 *    - 부분배송 지원: 일부 delivered 이상, 일부 shipped → partial_delivered
 *    - 모든 delivered 이상 → delivered
 */
router.post('/admin/orders/:orderId/deliver', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { orderId } = req.params;
        const { order_item_unit_ids } = req.body;
        const adminUserId = req.user.userId || req.user.id;

        // 1. 입력 검증
        if (!Array.isArray(order_item_unit_ids) || order_item_unit_ids.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'order_item_unit_ids는 비어있지 않은 배열이어야 합니다.',
                code: 'MISSING_UNIT_IDS'
            });
        }

        // unit_ids 중복 방어
        const uniqueUnitIds = [...new Set(order_item_unit_ids)];
        if (uniqueUnitIds.length !== order_item_unit_ids.length) {
            const duplicates = order_item_unit_ids.filter((id, index) => order_item_unit_ids.indexOf(id) !== index);
            return res.status(400).json({
                success: false,
                message: `중복된 unit_id가 포함되어 있습니다: ${duplicates.join(', ')}`,
                code: 'DUPLICATE_UNIT_IDS'
            });
        }

        Logger.log('[SHIPMENT] 배송 완료 처리 요청:', {
            orderId,
            unitIds: uniqueUnitIds,
            adminUserId
        });

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 2. orders FOR UPDATE 먼저 잠금 (락 순서 1단계: 전역 순서 준수)
            const [orders] = await connection.execute(
                'SELECT order_id, order_number FROM orders WHERE order_id = ? FOR UPDATE',
                [orderId]
            );
            if (orders.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '주문을 찾을 수 없습니다.',
                    code: 'ORDER_NOT_FOUND'
                });
            }

            // 3. order_item_units 조회 (FOR UPDATE로 잠금, 락 순서 3단계)
            const { placeholders, params: unitIdsParams } = buildInClause(uniqueUnitIds);
            const [units] = await connection.execute(
                `SELECT 
                    oiu.order_item_unit_id,
                    oiu.order_id,
                    oiu.unit_status,
                    oiu.delivered_at
                FROM order_item_units oiu
                WHERE oiu.order_item_unit_id IN (${placeholders})
                  AND oiu.order_id = ?
                FOR UPDATE`,
                [...unitIdsParams, orderId]
            );

            // 검증: 길이 일치
            if (units.length !== uniqueUnitIds.length) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `검증 실패: 요청=${uniqueUnitIds.length}개, 조회=${units.length}개`,
                    code: 'UNIT_IDS_MISMATCH'
                });
            }

            // 검증: order_id 일치
            const mismatchedOrderId = units.find(u => u.order_id !== parseInt(orderId));
            if (mismatchedOrderId) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `orderId 불일치: unit_id=${mismatchedOrderId.order_item_unit_id}`,
                    code: 'ORDER_ID_MISMATCH'
                });
            }

            // 검증: unit_status = 'shipped' (배송 완료는 shipped 상태에서만 가능)
            const invalidStatus = units.filter(u => u.unit_status !== 'shipped');
            if (invalidStatus.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `출고 상태가 아닌 유닛이 포함되어 있습니다: ${invalidStatus.map(u => `${u.order_item_unit_id}(${u.unit_status})`).join(', ')}`,
                    code: 'INVALID_UNIT_STATUS'
                });
            }

            // 검증: delivered_at 전부 NULL (이미 배송완료되지 않았는지)
            const alreadyDelivered = units.filter(u => u.delivered_at !== null);
            if (alreadyDelivered.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `이미 배송완료 처리된 유닛이 포함되어 있습니다: ${alreadyDelivered.map(u => u.order_item_unit_id).join(', ')}`,
                    code: 'ALREADY_DELIVERED'
                });
            }

            // 4. order_item_units.unit_status = 'delivered' 업데이트
            const [updateResult] = await connection.execute(
                `UPDATE order_item_units
                 SET unit_status = 'delivered',
                     delivered_at = NOW()
                 WHERE order_item_unit_id IN (${placeholders})
                   AND order_id = ?
                   AND unit_status = 'shipped'
                   AND delivered_at IS NULL`,
                [...unitIdsParams, orderId]
            );

            if (updateResult.affectedRows !== uniqueUnitIds.length) {
                await connection.rollback();
                await connection.end();
                Logger.error('[SHIPMENT] order_item_units 배송완료 업데이트 실패:', {
                    orderId,
                    unitIds: uniqueUnitIds,
                    affectedRows: updateResult.affectedRows,
                    expectedRows: uniqueUnitIds.length
                });
                return res.status(500).json({
                    success: false,
                    message: `배송완료 처리 실패: 요청=${uniqueUnitIds.length}개, 업데이트=${updateResult.affectedRows}개`,
                    code: 'UPDATE_FAILED'
                });
            }

            // 5. orders.status 집계 함수로 자동 업데이트
            await updateOrderStatus(connection, orderId);

            await connection.commit();
            await connection.end();

            Logger.log('[SHIPMENT] 배송 완료 처리 완료', {
                orderId,
                unitIds: uniqueUnitIds,
                adminUserId
            });

            res.json({
                success: true,
                message: '배송완료 처리가 완료되었습니다.',
                data: {
                    order_id: parseInt(orderId),
                    delivered_unit_count: updateResult.affectedRows,
                    delivered_at: new Date().toISOString()
                }
            });

        } catch (error) {
            await connection.rollback();
            await connection.end();
            throw error;
        }

    } catch (error) {
        if (connection) {
            try {
                await connection.rollback();
                await connection.end();
            } catch (rollbackError) {
                Logger.error('[SHIPMENT] 롤백 실패', {
                    error: rollbackError.message
                });
            }
        }

        Logger.error('[SHIPMENT] 배송 완료 처리 실패', {
            orderId: req.params.orderId,
            adminUserId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: '배송완료 처리 중 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
        });
    }
});

module.exports = router;
