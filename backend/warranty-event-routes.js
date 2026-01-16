/**
 * warranty-event-routes.js
 * 
 * 보증서 이벤트 생성 API (이벤트 기반 구조)
 * 
 * 핵심 원칙:
 * - 관리자는 warranties를 직접 UPDATE하지 않음
 * - 이벤트를 생성하는 API만 호출
 * - 서버가 트랜잭션으로 warranty_events insert + warranties update를 함께 처리
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
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
 * POST /api/admin/warranties/:id/events
 * 보증서 이벤트 생성 (관리자 전용)
 * 
 * Body:
 * - type: 'status_change', 'owner_change', 'suspend', 'unsuspend', 'revoke', 'ownership_transferred'
 * - params: 변경 파라미터 (JSON)
 *   - status_change: { status: 'suspended' }
 *   - owner_change: { owner_user_id: 123 }
 *   - suspend: {}
 *   - unsuspend: {}
 *   - revoke: {}
 * - reason: 변경 사유 (필수)
 */
router.post('/admin/warranties/:id/events', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const { type, params, reason } = req.body;
        const adminId = req.user.userId || req.user.id; // 관리자 ID

        // 유효성 검증
        if (!type) {
            return res.status(400).json({
                success: false,
                message: '이벤트 타입은 필수입니다.'
            });
        }

        if (!reason || reason.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '변경 사유는 필수입니다.'
            });
        }

        const allowedTypes = ['status_change', 'owner_change', 'suspend', 'unsuspend', 'revoke', 'ownership_transferred'];
        if (!allowedTypes.includes(type)) {
            return res.status(400).json({
                success: false,
                message: `유효하지 않은 이벤트 타입입니다: ${type}`
            });
        }

        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // 1. 현재 warranties 상태 조회 (FOR UPDATE)
            const [warranties] = await connection.execute(
                'SELECT * FROM warranties WHERE id = ? FOR UPDATE',
                [id]
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

            // 2. 이벤트 타입별 처리
            let oldValue = {};
            let newValue = {};

            switch (type) {
                case 'status_change':
                    if (!params || !params.status) {
                        await connection.rollback();
                        await connection.end();
                        return res.status(400).json({
                            success: false,
                            message: 'status_change 타입은 params.status가 필요합니다.'
                        });
                    }
                    oldValue = { status: warranty.status };
                    newValue = { status: params.status };
                    break;

                case 'owner_change':
                    if (!params || params.owner_user_id === undefined) {
                        await connection.rollback();
                        await connection.end();
                        return res.status(400).json({
                            success: false,
                            message: 'owner_change 타입은 params.owner_user_id가 필요합니다.'
                        });
                    }
                    oldValue = { owner_user_id: warranty.owner_user_id };
                    newValue = { owner_user_id: params.owner_user_id };
                    break;

                case 'suspend':
                    oldValue = { status: warranty.status };
                    newValue = { status: 'suspended' };
                    break;

                case 'unsuspend':
                    oldValue = { status: warranty.status };
                    newValue = { status: warranty.status === 'suspended' ? 'issued' : warranty.status };
                    break;

                case 'revoke':
                    oldValue = { status: warranty.status };
                    newValue = { status: 'revoked', revoked_at: new Date() };
                    break;
            }

            // 3. 이벤트 생성 (append-only)
            await connection.execute(
                `INSERT INTO warranty_events 
                (warranty_id, event_type, old_value, new_value, changed_by, changed_by_id, reason, created_at) 
                VALUES (?, ?, ?, ?, 'admin', ?, ?, NOW())`,
                [
                    id,
                    type,
                    JSON.stringify(oldValue),
                    JSON.stringify(newValue),
                    adminId,
                    reason
                ]
            );

            // 4. warranties 업데이트
            if (type === 'status_change' || type === 'suspend' || type === 'unsuspend' || type === 'revoke') {
                await connection.execute(
                    `UPDATE warranties 
                     SET status = ?, 
                         updated_at = NOW()
                     WHERE id = ?`,
                    [newValue.status, id]
                );

                if (type === 'revoke') {
                    await connection.execute(
                        `UPDATE warranties 
                         SET revoked_at = NOW() 
                         WHERE id = ?`,
                        [id]
                    );
                }
            }

            if (type === 'owner_change') {
                await connection.execute(
                    `UPDATE warranties 
                     SET owner_user_id = ?, 
                         updated_at = NOW() 
                     WHERE id = ?`,
                    [newValue.owner_user_id, id]
                );
            }

            await connection.commit();
            await connection.end();

            Logger.log('[WARRANTY_EVENT] 보증서 이벤트 생성 완료', {
                warrantyId: id,
                eventType: type,
                adminId,
                reason
            });

            res.json({
                success: true,
                message: '보증서 이벤트가 생성되었습니다.',
                warrantyId: id,
                eventType: type
            });

        } catch (error) {
            await connection.rollback();
            await connection.end();
            throw error;
        }

    } catch (error) {
        Logger.error('[WARRANTY_EVENT] 보증서 이벤트 생성 실패', {
            warrantyId: req.params.id,
            error: error.message,
            error_code: error.code,
            stack: error.stack,
            admin: req.user?.email
        });

        res.status(500).json({
            success: false,
            message: '보증서 이벤트 생성에 실패했습니다.'
        });
    }
});

/**
 * GET /api/admin/warranties/:id/events
 * 보증서 이벤트 이력 조회 (관리자 전용)
 */
router.get('/admin/warranties/:id/events', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;

        connection = await mysql.createConnection(dbConfig);

        const [events] = await connection.execute(
            `SELECT 
                event_id,
                warranty_id,
                event_type,
                old_value,
                new_value,
                changed_by,
                changed_by_id,
                reason,
                created_at
            FROM warranty_events
            WHERE warranty_id = ?
            ORDER BY created_at DESC`,
            [id]
        );

        await connection.end();

        res.json({
            success: true,
            events: events.map(e => ({
                event_id: e.event_id,
                event_type: e.event_type,
                old_value: JSON.parse(e.old_value || '{}'),
                new_value: JSON.parse(e.new_value),
                changed_by: e.changed_by,
                changed_by_id: e.changed_by_id,
                reason: e.reason,
                created_at: e.created_at
            }))
        });

    } catch (error) {
        Logger.error('[WARRANTY_EVENT] 보증서 이벤트 이력 조회 실패', {
            warrantyId: req.params.id,
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        res.status(500).json({
            success: false,
            message: '보증서 이벤트 이력을 불러오는데 실패했습니다.'
        });
    }
});

module.exports = router;
