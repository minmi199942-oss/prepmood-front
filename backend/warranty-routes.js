/**
 * warranty-routes.js
 * 
 * 보증서 관련 사용자 API
 * 
 * 핵심 원칙:
 * - 사용자는 warranties를 직접 UPDATE하지 않음
 * - API를 통해 상태 전이만 수행
 * - 서버가 트랜잭션으로 warranty_events insert + warranties update를 함께 처리
 * - Outbox 패턴: 이벤트 INSERT 실패 시 전이도 롤백
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const path = require('path');
const { authenticateToken, requireAuthForHTML } = require('./auth-middleware');
const { sendTransferRequestEmail } = require('./mailer');
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
 * POST /api/warranties/:warrantyId/activate
 * 보증서 활성화 API (사용자 전용)
 * 
 * 요청 본문:
 * - agree: boolean (필수) - 활성화 동의 여부
 * 
 * 처리 흐름 (SYSTEM_FLOW_DETAILED.md 4-1절, FINAL_EXECUTION_SPEC_REVIEW.md 467-496줄):
 * 1. FOR UPDATE로 warranties 잠금
 * 2. owner_user_id 확인
 * 3. status = 'issued' 확인
 * 4. 핵심 검증: 인보이스 연동 확인 (환불 후 QR 코드 악용 방지)
 * 5. 동의 체크 확인
 * 6. 원자적 상태 전이 (affectedRows=1 검증)
 * 7. warranty_events 이벤트 기록 (Outbox 패턴)
 */
router.post('/warranties/:warrantyId/activate', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { warrantyId } = req.params;
        const { agree } = req.body;
        const userId = req.user.userId || req.user.id;

        // 동의 체크 확인
        if (!agree || agree !== true) {
            return res.status(400).json({
                success: false,
                message: '활성화 동의가 필요합니다.'
            });
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 1. FOR UPDATE로 warranties 잠금
            const [warranties] = await connection.execute(
                'SELECT id, public_id, status, owner_user_id, source_order_item_unit_id FROM warranties WHERE id = ? FOR UPDATE',
                [warrantyId]
            );

            if (warranties.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '보증서를 찾을 수 없습니다.'
                });
            }

            const warranty = warranties[0];

            // 2. owner_user_id 확인
            if (!warranty.owner_user_id || warranty.owner_user_id !== userId) {
                await connection.rollback();
                await connection.end();
                return res.status(403).json({
                    success: false,
                    message: '보증서 소유자만 활성화할 수 있습니다.'
                });
            }

            // 3. status = 'issued' 확인 (다른 상태에서 활성화 불가)
            if (warranty.status !== 'issued') {
                await connection.rollback();
                await connection.end();
                
                let message = '활성화할 수 없는 상태입니다.';
                if (warranty.status === 'revoked') {
                    message = '환불 처리된 보증서는 활성화할 수 없습니다.';
                } else if (warranty.status === 'active') {
                    message = '이미 활성화된 보증서입니다.';
                } else if (warranty.status === 'suspended') {
                    message = '제재된 보증서는 활성화할 수 없습니다.';
                } else if (warranty.status === 'issued_unassigned') {
                    message = '계정에 연동되지 않은 보증서는 활성화할 수 없습니다.';
                }

                return res.status(400).json({
                    success: false,
                    message
                });
            }

            // 4. 핵심 검증: 인보이스 연동 확인 (환불 후 QR 코드 악용 방지)
            // ⚠️ 이것이 환불 후 QR 코드 악용 방지의 핵심 방어 메커니즘
            if (!warranty.source_order_item_unit_id) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '보증서가 주문 항목과 연결되지 않았습니다.'
                });
            }

            const [orderInfo] = await connection.execute(
                `SELECT 
                    o.user_id as order_user_id,
                    o.status as order_status,
                    oiu.unit_status
                FROM warranties w
                INNER JOIN order_item_units oiu ON w.source_order_item_unit_id = oiu.order_item_unit_id
                INNER JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
                INNER JOIN orders o ON oi.order_id = o.order_id
                WHERE w.id = ?`,
                [warrantyId]
            );

            if (orderInfo.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '보증서가 연결된 주문 정보를 찾을 수 없습니다.'
                });
            }

            const order = orderInfo[0];

            // 인보이스 연동 확인: orders.user_id = 현재 로그인한 user_id
            if (!order.order_user_id || order.order_user_id !== userId) {
                await connection.rollback();
                await connection.end();
                return res.status(403).json({
                    success: false,
                    message: '해당 보증서가 속한 주문이 계정에 연동되지 않았습니다.'
                });
            }

            // 환불 상태 확인: orders.status != 'refunded'
            if (order.order_status === 'refunded') {
                await connection.rollback();
                await connection.end();
                return res.status(403).json({
                    success: false,
                    message: '환불 처리된 주문의 보증서는 활성화할 수 없습니다.'
                });
            }

            // 환불 상태 확인: order_item_units.unit_status != 'refunded'
            if (order.unit_status === 'refunded') {
                await connection.rollback();
                await connection.end();
                return res.status(403).json({
                    success: false,
                    message: '환불 처리된 주문 항목의 보증서는 활성화할 수 없습니다.'
                });
            }

            // 5. 동의 체크는 이미 확인됨 (요청 본문 검증)

            // 6. 원자적 조건으로 상태 전이
            // ⚠️ affectedRows=1 검증 필수
            const [updateResult] = await connection.execute(
                `UPDATE warranties 
                 SET status = 'active', activated_at = NOW()
                 WHERE id = ? AND status = 'issued' AND owner_user_id = ?`,
                [warrantyId, userId]
            );

            if (updateResult.affectedRows !== 1) {
                await connection.rollback();
                await connection.end();
                Logger.error('[WARRANTY_ACTIVATE] 상태 전이 실패 - affectedRows 검증 실패', {
                    warrantyId,
                    userId,
                    affectedRows: updateResult.affectedRows,
                    currentStatus: warranty.status
                });
                return res.status(500).json({
                    success: false,
                    message: '보증서 활성화에 실패했습니다. 상태가 변경되었을 수 있습니다.'
                });
            }

            // 7. warranty_events에 활성화 이벤트 기록 (Outbox 패턴)
            // ⚠️ 이벤트 INSERT 실패 시 전이도 롤백 (증거성 보장)
            try {
                await connection.execute(
                    `INSERT INTO warranty_events 
                     (warranty_id, event_type, old_value, new_value, changed_by, changed_by_id, reason)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        warrantyId,
                        'status_change',
                        JSON.stringify({ status: 'issued' }),
                        JSON.stringify({ status: 'active', activated_at: new Date().toISOString() }),
                        'user',
                        userId,
                        '사용자 활성화 요청'
                    ]
                );
            } catch (eventError) {
                // 이벤트 INSERT 실패 시 전이도 롤백 (Outbox 패턴)
                await connection.rollback();
                await connection.end();
                Logger.error('[WARRANTY_ACTIVATE] warranty_events INSERT 실패 - 트랜잭션 롤백', {
                    warrantyId,
                    userId,
                    error: eventError.message
                });
                return res.status(500).json({
                    success: false,
                    message: '보증서 활성화 이벤트 기록에 실패했습니다.'
                });
            }

            await connection.commit();
            await connection.end();

            Logger.log('[WARRANTY_ACTIVATE] 보증서 활성화 완료', {
                warrantyId,
                userId,
                previousStatus: warranty.status,
                newStatus: 'active'
            });

            res.json({
                success: true,
                message: '보증서가 활성화되었습니다.',
                warranty: {
                    id: warrantyId,
                    public_id: warranty.public_id,
                    status: 'active',
                    activated_at: new Date().toISOString()
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
                Logger.error('[WARRANTY_ACTIVATE] 롤백 실패', {
                    error: rollbackError.message
                });
            }
        }

        Logger.error('[WARRANTY_ACTIVATE] 보증서 활성화 실패', {
            warrantyId: req.params.warrantyId,
            userId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: '보증서 활성화 중 오류가 발생했습니다.'
        });
    }
});

/**
 * POST /api/warranties/:warrantyId/transfer
 * 양도 요청 API (사용자 전용)
 * 
 * 요청 본문:
 * {
 *   "to_email": "recipient@example.com"
 * }
 * 
 * 처리 흐름 (SYSTEM_FLOW_DETAILED.md 5-1절 참조):
 * 1. warranties.owner_user_id = 현재 로그인한 user_id 확인
 * 2. warranties.status = 'active' 확인
 * 3. 랜덤 7자 코드 생성 (72시간 유효)
 * 4. warranty_transfers 테이블에 양도 요청 기록
 * 5. 양도 링크를 이메일로 수령자에게 전송
 */
router.post('/warranties/:warrantyId/transfer', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { warrantyId } = req.params;
        const { to_email } = req.body;
        const userId = req.user.userId || req.user.id;

        // 1. 입력 검증
        if (!to_email || typeof to_email !== 'string' || !to_email.trim()) {
            return res.status(400).json({
                success: false,
                message: '수령자 이메일은 필수입니다.',
                code: 'MISSING_TO_EMAIL'
            });
        }

        // 이메일 형식 검증 (간단한 검증)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(to_email.trim())) {
            return res.status(400).json({
                success: false,
                message: '유효하지 않은 이메일 형식입니다.',
                code: 'INVALID_EMAIL_FORMAT'
            });
        }

        Logger.log('[WARRANTY_TRANSFER] 양도 요청:', {
            warrantyId,
            fromUserId: userId,
            toEmail: to_email.trim()
        });

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 2. warranty 조회 (FOR UPDATE로 잠금)
            const [warranties] = await connection.execute(
                `SELECT id, status, owner_user_id, public_id
                 FROM warranties 
                 WHERE id = ? 
                 FOR UPDATE`,
                [warrantyId]
            );

            if (warranties.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '보증서를 찾을 수 없습니다.',
                    code: 'WARRANTY_NOT_FOUND'
                });
            }

            const warranty = warranties[0];

            // 3. 소유자 확인
            if (!warranty.owner_user_id || warranty.owner_user_id !== userId) {
                await connection.rollback();
                await connection.end();
                return res.status(403).json({
                    success: false,
                    message: '보증서 소유자만 양도할 수 있습니다.',
                    code: 'NOT_OWNER'
                });
            }

            // 4. active 상태 확인 (활성화된 보증서만 양도 가능)
            if (warranty.status !== 'active') {
                await connection.rollback();
                await connection.end();
                
                let message = '양도할 수 없는 상태입니다.';
                if (warranty.status === 'revoked') {
                    message = '환불 처리된 보증서는 양도할 수 없습니다.';
                } else if (warranty.status === 'issued' || warranty.status === 'issued_unassigned') {
                    message = '활성화되지 않은 보증서는 양도할 수 없습니다.';
                } else if (warranty.status === 'suspended') {
                    message = '제재된 보증서는 양도할 수 없습니다.';
                }

                return res.status(400).json({
                    success: false,
                    message,
                    code: 'INVALID_WARRANTY_STATUS'
                });
            }

            // 5. 기존 양도 요청 확인 (진행 중인 요청이 있는지)
            const [existingTransfers] = await connection.execute(
                `SELECT transfer_id, status, expires_at
                 FROM warranty_transfers
                 WHERE warranty_id = ? 
                   AND status IN ('requested', 'accepted')
                   AND expires_at > NOW()`,
                [warrantyId]
            );

            if (existingTransfers.length > 0) {
                await connection.rollback();
                await connection.end();
                return res.status(409).json({
                    success: false,
                    message: '이미 진행 중인 양도 요청이 있습니다.',
                    code: 'TRANSFER_ALREADY_EXISTS'
                });
            }

            // 6. 랜덤 7자 코드 생성 (0-9, A-Z)
            const randomChars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
            let transferCode = '';
            for (let i = 0; i < 7; i++) {
                const randomIndex = crypto.randomInt(0, randomChars.length);
                transferCode += randomChars[randomIndex];
            }

            // 7. warranty_transfers 테이블에 양도 요청 기록
            const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72시간 후
            const expiresAtString = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

            const [transferResult] = await connection.execute(
                `INSERT INTO warranty_transfers 
                 (warranty_id, from_user_id, to_email, transfer_code, status, expires_at, requested_at)
                 VALUES (?, ?, ?, ?, 'requested', ?, NOW())`,
                [warrantyId, userId, to_email.trim(), transferCode, expiresAtString]
            );

            const transferId = transferResult.insertId;

            // 8. 양도 링크 생성 (프론트엔드 URL)
            const transferLink = `${process.env.FRONTEND_URL || 'https://prepmood.kr'}/warranties/transfer/accept?transfer_id=${transferId}&code=${transferCode}`;

            // 9. 이메일 발송 (비동기, 실패해도 양도 요청은 저장됨)
            try {
                const emailResult = await sendTransferRequestEmail(to_email.trim(), {
                    transferCode,
                    transferLink,
                    warrantyPublicId: warranty.public_id
                });

                if (!emailResult.success) {
                    Logger.warn('[WARRANTY_TRANSFER] 이메일 발송 실패 (양도 요청은 저장됨):', {
                        transferId,
                        toEmail: to_email.trim(),
                        error: emailResult.error
                    });
                }
            } catch (emailError) {
                Logger.error('[WARRANTY_TRANSFER] 이메일 발송 중 오류 (양도 요청은 저장됨):', {
                    transferId,
                    toEmail: to_email.trim(),
                    error: emailError.message
                });
            }

            await connection.commit();
            await connection.end();

            Logger.log('[WARRANTY_TRANSFER] 양도 요청 완료', {
                warrantyId,
                transferId,
                fromUserId: userId,
                toEmail: to_email.trim(),
                transferCode,
                expiresAt: expiresAtString
            });

            res.status(201).json({
                success: true,
                message: '양도 요청이 생성되었습니다. 수령자에게 이메일이 발송되었습니다.',
                data: {
                    transfer_id: transferId,
                    transfer_code: transferCode,
                    expires_at: expiresAt.toISOString(),
                    to_email: to_email.trim()
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
                Logger.error('[WARRANTY_TRANSFER] 롤백 실패', {
                    error: rollbackError.message
                });
            }
        }

        Logger.error('[WARRANTY_TRANSFER] 양도 요청 실패', {
            warrantyId: req.params.warrantyId,
            userId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: '양도 요청 중 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * POST /api/warranties/transfer/accept
 * 양도 수락 API (사용자 전용)
 * 
 * 요청 본문:
 * {
 *   "transfer_id": 1,
 *   "transfer_code": "ABC1234"
 * }
 * 
 * 처리 흐름 (SYSTEM_FLOW_DETAILED.md 5-1절 참조):
 * 1. 트랜잭션 시작
 * 2. 원자적 조건 검증 (FOR UPDATE, 코드/이메일/소유자 확인)
 * 3. warranties 소유자 변경 (affectedRows=1 검증)
 * 4. warranty_transfers 상태 변경 (affectedRows=1 검증)
 * 5. warranties.status는 'active' 상태로 유지 (재활성화 불필요)
 * 6. warranty_events 이벤트 기록 (ownership_transferred)
 */
router.post('/warranties/transfer/accept', authenticateToken, async (req, res) => {
    let connection;
    try {
        const { transfer_id, transfer_code } = req.body;
        const toUserId = req.user.userId || req.user.id;

        // 1. 입력 검증
        if (!transfer_id) {
            return res.status(400).json({
                success: false,
                message: 'transfer_id는 필수입니다.',
                code: 'MISSING_TRANSFER_ID'
            });
        }

        if (!transfer_code || typeof transfer_code !== 'string' || transfer_code.trim().length !== 7) {
            return res.status(400).json({
                success: false,
                message: '양도 코드는 7자리여야 합니다.',
                code: 'INVALID_TRANSFER_CODE'
            });
        }

        Logger.log('[WARRANTY_TRANSFER_ACCEPT] 양도 수락 요청:', {
            transferId: transfer_id,
            toUserId,
            transferCode: transfer_code.trim()
        });

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 2. 원자적 조건 검증: warranty_transfers 상태 확인 및 락
            const [transfers] = await connection.execute(
                `SELECT 
                    transfer_id,
                    warranty_id,
                    from_user_id,
                    to_email,
                    transfer_code,
                    status,
                    expires_at
                 FROM warranty_transfers 
                 WHERE transfer_id = ? 
                   AND status = 'requested' 
                   AND expires_at > NOW()
                 FOR UPDATE`,
                [transfer_id]
            );

            if (transfers.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '유효하지 않은 양도 요청입니다. (만료되었거나 이미 처리되었습니다)',
                    code: 'INVALID_TRANSFER_REQUEST'
                });
            }

            const transfer = transfers[0];

            // 2-1. 코드 검증
            if (transfer.transfer_code !== transfer_code.trim()) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '양도 코드가 일치하지 않습니다.',
                    code: 'INVALID_TRANSFER_CODE'
                });
            }

            // 2-2. 이메일 일치 검증 (보안 필수)
            const [users] = await connection.execute(
                'SELECT email FROM users WHERE user_id = ?',
                [toUserId]
            );

            if (users.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '사용자를 찾을 수 없습니다.',
                    code: 'USER_NOT_FOUND'
                });
            }

            if (users[0].email !== transfer.to_email) {
                await connection.rollback();
                await connection.end();
                return res.status(403).json({
                    success: false,
                    message: '양도 요청의 수령자 이메일과 로그인한 계정 이메일이 일치하지 않습니다.',
                    code: 'EMAIL_MISMATCH'
                });
            }

            // 2-3. 현재 소유자 일치 확인 (요청 생성 시점과 수락 시점 일치 검증)
            const [warranties] = await connection.execute(
                `SELECT id, owner_user_id, status
                 FROM warranties 
                 WHERE id = ? 
                 FOR UPDATE`,
                [transfer.warranty_id]
            );

            if (warranties.length === 0) {
                await connection.rollback();
                await connection.end();
                return res.status(404).json({
                    success: false,
                    message: '보증서를 찾을 수 없습니다.',
                    code: 'WARRANTY_NOT_FOUND'
                });
            }

            const warranty = warranties[0];

            if (warranty.owner_user_id !== transfer.from_user_id) {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '양도 요청 생성 후 보증서 소유자가 변경되었습니다.',
                    code: 'OWNER_CHANGED'
                });
            }

            if (warranty.status !== 'active') {
                await connection.rollback();
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: '보증서 상태가 활성화되지 않았습니다.',
                    code: 'WARRANTY_NOT_ACTIVE'
                });
            }

            // 3. warranties 소유자 변경 (원자적 조건)
            const [warrantyUpdate] = await connection.execute(
                `UPDATE warranties
                 SET owner_user_id = ?
                 WHERE id = ? 
                   AND owner_user_id = ?
                   AND status = 'active'`,
                [toUserId, transfer.warranty_id, transfer.from_user_id]
            );

            if (warrantyUpdate.affectedRows !== 1) {
                await connection.rollback();
                await connection.end();
                Logger.error('[WARRANTY_TRANSFER_ACCEPT] warranty 소유자 변경 실패:', {
                    warrantyId: transfer.warranty_id,
                    fromUserId: transfer.from_user_id,
                    toUserId,
                    affectedRows: warrantyUpdate.affectedRows
                });
                return res.status(500).json({
                    success: false,
                    message: '보증서 소유자 변경에 실패했습니다. 이미 양도되었거나 상태가 변경되었을 수 있습니다.',
                    code: 'OWNERSHIP_UPDATE_FAILED'
                });
            }

            // 4. warranty_transfers 상태 변경 (원자적 조건)
            const [transferUpdate] = await connection.execute(
                `UPDATE warranty_transfers
                 SET status = 'completed',
                     to_user_id = ?,
                     completed_at = NOW()
                 WHERE transfer_id = ?
                   AND status = 'requested'`,
                [toUserId, transfer_id]
            );

            if (transferUpdate.affectedRows !== 1) {
                await connection.rollback();
                await connection.end();
                Logger.error('[WARRANTY_TRANSFER_ACCEPT] warranty_transfers 상태 변경 실패:', {
                    transferId: transfer_id,
                    affectedRows: transferUpdate.affectedRows
                });
                return res.status(500).json({
                    success: false,
                    message: '양도 상태 변경에 실패했습니다. 이미 처리되었을 수 있습니다.',
                    code: 'TRANSFER_STATUS_UPDATE_FAILED'
                });
            }

            // 5. warranties.status는 'active' 상태로 유지 (재활성화 불필요)
            // 이미 위의 UPDATE에서 status = 'active' 조건으로 검증했으므로 자동으로 유지됨

            // 6. warranty_events에 양도 이벤트 기록 (Outbox 패턴)
            // ⚠️ 이벤트 INSERT 실패 시 전이도 롤백
            try {
                await connection.execute(
                    `INSERT INTO warranty_events 
                     (warranty_id, event_type, old_value, new_value, changed_by, changed_by_id, reason)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [
                        transfer.warranty_id,
                        'ownership_transferred',
                        JSON.stringify({ owner_user_id: transfer.from_user_id }),
                        JSON.stringify({ owner_user_id: toUserId }),
                        'user',
                        toUserId,
                        `양도 수락: ${transfer.from_user_id} → ${toUserId}`
                    ]
                );
            } catch (eventError) {
                await connection.rollback();
                await connection.end();
                Logger.error('[WARRANTY_TRANSFER_ACCEPT] warranty_events INSERT 실패 - 트랜잭션 롤백', {
                    warrantyId: transfer.warranty_id,
                    transferId: transfer_id,
                    error: eventError.message
                });
                return res.status(500).json({
                    success: false,
                    message: '양도 이벤트 기록에 실패했습니다.',
                    code: 'EVENT_LOG_FAILED'
                });
            }

            await connection.commit();
            await connection.end();

            Logger.log('[WARRANTY_TRANSFER_ACCEPT] 양도 수락 완료', {
                warrantyId: transfer.warranty_id,
                transferId: transfer_id,
                fromUserId: transfer.from_user_id,
                toUserId
            });

            res.json({
                success: true,
                message: '양도가 완료되었습니다.',
                data: {
                    warranty_id: transfer.warranty_id,
                    transfer_id: transfer_id,
                    from_user_id: transfer.from_user_id,
                    to_user_id: toUserId,
                    completed_at: new Date().toISOString()
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
                Logger.error('[WARRANTY_TRANSFER_ACCEPT] 롤백 실패', {
                    error: rollbackError.message
                });
            }
        }

        Logger.error('[WARRANTY_TRANSFER_ACCEPT] 양도 수락 실패', {
            transferId: req.body?.transfer_id,
            userId: req.user?.userId || req.user?.id,
            error: error.message,
            stack: error.stack
        });

        res.status(500).json({
            success: false,
            message: '양도 수락 중 오류가 발생했습니다.',
            code: 'INTERNAL_ERROR'
        });
    }
});

/**
 * 날짜를 한국어 형식으로 포맷팅 (auth-routes.js와 동일한 함수)
 * @param {string|null} dateValue - MySQL DATETIME 형식 문자열 또는 Date 객체
 * @returns {string} 포맷팅된 날짜 문자열 (예: "2025-12-31 06:13:25")
 */
function formatDateForTemplate(dateValue) {
    if (!dateValue) return '—';
    
    try {
        let date;
        if (dateValue instanceof Date) {
            date = dateValue;
        } else if (typeof dateValue === 'string') {
            // MySQL DATETIME 형식을 Date 객체로 변환
            date = new Date(dateValue.replace(' ', 'T') + 'Z');
        } else {
            return String(dateValue);
        }
        
        // 유효한 날짜인지 확인
        if (isNaN(date.getTime())) {
            return String(dateValue);
        }
        
        // 한국 시간대로 변환 (UTC+9)
        const koreanDate = new Date(date.getTime() + 9 * 60 * 60 * 1000);
        
        const year = koreanDate.getUTCFullYear();
        const month = String(koreanDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(koreanDate.getUTCDate()).padStart(2, '0');
        const hours = String(koreanDate.getUTCHours()).padStart(2, '0');
        const minutes = String(koreanDate.getUTCMinutes()).padStart(2, '0');
        const seconds = String(koreanDate.getUTCSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        Logger.error('[WARRANTY] 날짜 포맷팅 오류:', {
            dateValue,
            error: error.message
        });
        return String(dateValue);
    }
}

/**
 * GET /warranty-activate-success
 * 보증서 활성화 성공 페이지 (HTML 렌더링)
 * 
 * Query Parameters:
 * - public_id: string (필수) - 보증서 public_id
 * 
 * 처리 흐름:
 * 1. 로그인 상태 확인 (requireAuthForHTML)
 * 2. public_id로 보증서 정보 조회
 * 3. success.ejs 렌더링 (보증서 활성화 성공 메시지)
 */
router.get('/warranty-activate-success', requireAuthForHTML, async (req, res) => {
    const { public_id } = req.query;
    const userId = req.user.userId || req.user.id;
    
    let connection;
    
    try {
        if (!public_id || typeof public_id !== 'string' || !public_id.trim()) {
            Logger.warn('[WARRANTY_ACTIVATE_SUCCESS] public_id 없음');
            return res.status(400).render('error', {
                title: '오류 발생 - Pre.p Mood',
                message: '보증서 ID가 올바르지 않습니다.'
            });
        }
        
        connection = await mysql.createConnection(dbConfig);
        
        // public_id로 보증서 정보 조회 (토큰 정보 포함 - QR 스캔과 동일한 구조)
        const [warranties] = await connection.execute(
            `SELECT 
                w.id,
                w.public_id,
                w.status,
                w.activated_at,
                w.created_at,
                tm.token,
                tm.product_name,
                tm.internal_code
            FROM warranties w
            INNER JOIN token_master tm ON w.token_pk = tm.token_pk
            WHERE w.public_id = ? AND w.owner_user_id = ?`,
            [public_id.trim(), userId]
        );
        
        await connection.end();
        
        if (warranties.length === 0) {
            Logger.warn('[WARRANTY_ACTIVATE_SUCCESS] 보증서 없음 또는 소유권 불일치:', {
                public_id: public_id.substring(0, 8) + '...',
                user_id: userId
            });
            return res.status(404).render('error', {
                title: '보증서 없음 - Pre.p Mood',
                message: '보증서를 찾을 수 없습니다.'
            });
        }
        
        const warranty = warranties[0];
        
        // 토큰 정보 검증 (QR 스캔과 동일한 구조)
        if (!warranty.token) {
            Logger.error('[WARRANTY_ACTIVATE_SUCCESS] 토큰 정보 없음:', {
                public_id: public_id.substring(0, 8) + '...',
                warranty_id: warranty.id
            });
            return res.status(500).render('error', {
                title: '오류 발생 - Pre.p Mood',
                message: '보증서의 토큰 정보를 찾을 수 없습니다.'
            });
        }
        
        // 보증서 활성화 성공 페이지 렌더링 (QR 스캔과 동일한 구조로 토큰 정보 전달)
        return res.render('success', {
            title: '보증서 활성화 완료 - Pre.p Mood',
            product: {
                product_name: warranty.product_name || '제품명 없음',
                internal_code: warranty.internal_code || null,
                token: warranty.token // 바코드 생성용
            },
            verified_at: formatDateForTemplate(warranty.activated_at || warranty.created_at),
            warranty_public_id: warranty.public_id,
            warranty_status: warranty.status,
            is_activation: true // 보증서 활성화 성공임을 표시
        });
        
    } catch (error) {
        if (connection) {
            try {
                await connection.end();
            } catch (endError) {
                Logger.error('[WARRANTY_ACTIVATE_SUCCESS] connection.end() 실패:', {
                    error: endError.message
                });
            }
        }
        
        Logger.error('[WARRANTY_ACTIVATE_SUCCESS] 보증서 활성화 성공 페이지 렌더링 실패:', {
            public_id: public_id ? public_id.substring(0, 8) + '...' : null,
            user_id: userId,
            error: error.message,
            stack: error.stack
        });
        
        return res.status(500).render('error', {
            title: '오류 발생 - Pre.p Mood',
            message: '보증서 활성화 성공 페이지를 불러오는 중 오류가 발생했습니다.'
        });
    }
});

module.exports = router;
