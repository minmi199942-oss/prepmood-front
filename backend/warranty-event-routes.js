/**
 * warranty-event-routes.js
 * 
 * 보증서 이벤트 생성 API 및 관리자 보증서 조회 API
 * 
 * 핵심 원칙:
 * - 관리자는 warranties를 직접 UPDATE하지 않음
 * - 이벤트를 생성하는 API만 호출
 * - 서버가 트랜잭션으로 warranty_events insert + warranties update를 함께 처리
 * - 보증서 검색은 SSOT 기준 (token_master → warranties)
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
 * GET /api/admin/warranties/search
 * 보증서 검색 API (관리자 전용)
 * 
 * Query Parameters:
 * - q: 검색어 (토큰, public_id, 시리얼 넘버, ROT 코드, 보증서 하단 코드)
 * 
 * 검색 경로 (SSOT 기준):
 * - 토큰 (20자): token_master.token → token_master.token_pk → warranties.token_pk
 * - public_id (UUID): warranties.public_id
 * - 시리얼 넘버: token_master.serial_number → token_master.token_pk → warranties.token_pk
 * - ROT 코드: token_master.rot_code → token_master.token_pk → warranties.token_pk
 * - 보증서 하단 코드: token_master.warranty_bottom_code → token_master.token_pk → warranties.token_pk
 */
router.get('/admin/warranties/search', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { q } = req.query;

        if (!q || typeof q !== 'string' || q.trim().length === 0) {
            return res.status(400).json({
                success: false,
                message: '검색어는 필수입니다.',
                code: 'MISSING_QUERY'
            });
        }

        const searchTerm = q.trim();
        connection = await mysql.createConnection(dbConfig);

        // 검색어 형식 판단
        let warranties = [];
        
        // 1. UUID 형식 (public_id)
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(searchTerm)) {
            const [results] = await connection.execute(
                `SELECT w.id, w.public_id, w.status, w.owner_user_id, w.product_name,
                        w.activated_at, w.revoked_at, w.created_at,
                        tm.token, tm.serial_number, tm.rot_code, tm.warranty_bottom_code
                 FROM warranties w
                 JOIN token_master tm ON w.token_pk = tm.token_pk
                 WHERE w.public_id = ? AND w.deleted_at IS NULL`,
                [searchTerm]
            );
            warranties = results;
        }
        // 2. 토큰 형식 (20자 영숫자)
        else if (/^[a-zA-Z0-9]{20}$/.test(searchTerm)) {
            const [results] = await connection.execute(
                `SELECT w.id, w.public_id, w.status, w.owner_user_id, w.product_name,
                        w.activated_at, w.revoked_at, w.created_at,
                        tm.token, tm.serial_number, tm.rot_code, tm.warranty_bottom_code
                 FROM warranties w
                 JOIN token_master tm ON w.token_pk = tm.token_pk
                 WHERE tm.token = ? AND w.deleted_at IS NULL`,
                [searchTerm]
            );
            warranties = results;
        }
        // 3. 시리얼 넘버, ROT 코드, 보증서 하단 코드 (부분 일치)
        else {
            const [results] = await connection.execute(
                `SELECT w.id, w.public_id, w.status, w.owner_user_id, w.product_name,
                        w.activated_at, w.revoked_at, w.created_at,
                        tm.token, tm.serial_number, tm.rot_code, tm.warranty_bottom_code
                 FROM warranties w
                 JOIN token_master tm ON w.token_pk = tm.token_pk
                 WHERE (tm.serial_number = ? OR tm.rot_code = ? OR tm.warranty_bottom_code = ?)
                   AND w.deleted_at IS NULL
                 LIMIT 50`,
                [searchTerm, searchTerm, searchTerm]
            );
            warranties = results;
        }

        await connection.end();

        // 소유자 정보 조회
        const warrantyIds = warranties.map(w => w.id);
        if (warrantyIds.length > 0) {
            connection = await mysql.createConnection(dbConfig);
            const placeholders = warrantyIds.map(() => '?').join(',');
            const [owners] = await connection.execute(
                `SELECT user_id, email, name FROM users WHERE user_id IN (${placeholders})`,
                warrantyIds.map(w => warranties.find(wa => wa.id === w)?.owner_user_id).filter(Boolean)
            );
            await connection.end();

            const ownerMap = new Map(owners.map(o => [o.user_id, o]));
            warranties = warranties.map(w => ({
                ...w,
                owner: w.owner_user_id ? ownerMap.get(w.owner_user_id) || null : null
            }));
        }

        res.json({
            success: true,
            count: warranties.length,
            warranties: warranties.map(w => ({
                id: w.id,
                public_id: w.public_id,
                status: w.status,
                product_name: w.product_name,
                token: w.token,
                serial_number: w.serial_number,
                rot_code: w.rot_code,
                warranty_bottom_code: w.warranty_bottom_code,
                owner: w.owner ? {
                    user_id: w.owner.user_id,
                    email: w.owner.email,
                    name: w.owner.name
                } : null,
                activated_at: w.activated_at,
                revoked_at: w.revoked_at,
                created_at: w.created_at,
                is_resold: w.revoked_at !== null && w.status !== 'revoked'
            }))
        });

    } catch (error) {
        Logger.error('[WARRANTY_SEARCH] 보증서 검색 실패', {
            query: req.query.q,
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        res.status(500).json({
            success: false,
            message: '보증서 검색 중 오류가 발생했습니다.'
        });
    }
});

/**
 * GET /api/admin/warranties/:id
 * 보증서 상세 조회 API (관리자 전용)
 * 
 * 응답 구조:
 * - warranty: 보증서 기본 정보
 * - status_card: 보증서 상태 카드 정보
 * - owner_card: 소유자 정보 카드
 * - connection_card: 연결 정보 카드 (주문, 재고, 인보이스)
 * - events: 보증서 이력 타임라인
 */
router.get('/admin/warranties/:id', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { id } = req.params;
        const warrantyId = parseInt(id, 10);

        if (isNaN(warrantyId)) {
            return res.status(400).json({
                success: false,
                message: '잘못된 보증서 ID입니다.',
                code: 'INVALID_WARRANTY_ID'
            });
        }

        connection = await mysql.createConnection(dbConfig);

        // 1. 보증서 기본 정보 조회
        const [warranties] = await connection.execute(
            `SELECT w.*, tm.token, tm.serial_number, tm.rot_code, tm.warranty_bottom_code
             FROM warranties w
             JOIN token_master tm ON w.token_pk = tm.token_pk
             WHERE w.id = ? AND w.deleted_at IS NULL`,
            [warrantyId]
        );

        if (warranties.length === 0) {
            await connection.end();
            return res.status(404).json({
                success: false,
                message: '보증서를 찾을 수 없습니다.',
                code: 'WARRANTY_NOT_FOUND'
            });
        }

        const warranty = warranties[0];

        // 2. 소유자 정보 조회
        let owner = null;
        if (warranty.owner_user_id) {
            const [owners] = await connection.execute(
                'SELECT user_id, email, name, phone FROM users WHERE user_id = ?',
                [warranty.owner_user_id]
            );
            if (owners.length > 0) {
                owner = owners[0];
            }
        }

        // 3. 소유자 변경 이력 조회
        const [ownerEvents] = await connection.execute(
            `SELECT event_id, event_type, old_value, new_value, changed_by, changed_by_id, reason, created_at
             FROM warranty_events
             WHERE warranty_id = ? AND event_type IN ('owner_change', 'ownership_transferred')
             ORDER BY created_at DESC`,
            [warrantyId]
        );

        // 4. 연결 정보 조회 (주문, 재고, 인보이스)
        let connectionInfo = null;
        if (warranty.source_order_item_unit_id) {
            // order_item_units → order_items → orders
            const [units] = await connection.execute(
                `SELECT oiu.order_item_unit_id, oiu.order_item_id, oiu.order_id, oiu.stock_unit_id,
                        oi.product_name, oi.quantity, oi.price,
                        o.order_number, o.order_date, o.status as order_status, 
                        o.user_id as order_user_id, o.guest_id as order_guest_id
                 FROM order_item_units oiu
                 JOIN order_items oi ON oiu.order_item_id = oi.order_item_id
                 JOIN orders o ON oi.order_id = o.order_id
                 WHERE oiu.order_item_unit_id = ?`,
                [warranty.source_order_item_unit_id]
            );

            if (units.length > 0) {
                const unit = units[0];
                
                // stock_units 정보
                let stockUnit = null;
                if (unit.stock_unit_id) {
                    const [stocks] = await connection.execute(
                        `SELECT stock_unit_id, serial_number, rot_code, warranty_bottom_code, status
                         FROM stock_units
                         WHERE stock_unit_id = ?`,
                        [unit.stock_unit_id]
                    );
                    if (stocks.length > 0) {
                        stockUnit = stocks[0];
                    }
                }

                // 인보이스 정보 (원본 invoice + credit_note)
                const [invoices] = await connection.execute(
                    `SELECT invoice_id, invoice_number, type, issued_at, total_amount, status,
                            related_invoice_id
                     FROM invoices
                     WHERE order_id = ?
                     ORDER BY type ASC, issued_at ASC`,
                    [unit.order_id]
                );

                const originalInvoice = invoices.find(inv => inv.type === 'invoice');
                const creditNotes = invoices.filter(inv => inv.type === 'credit_note');

                // 인보이스 연동 상태 판정 (3분류 + 환불 우선 상태)
                let invoiceLinkageStatus = null;
                
                // 환불 상태 우선 확인 (위 3분류를 덮어쓰는 우선 상태)
                if (unit.order_status === 'refunded') {
                    invoiceLinkageStatus = {
                        status: 'refunded',
                        label: '환불됨',
                        badge_type: 'danger'
                    };
                } else {
                    // 3분류 판정
                    if (unit.order_user_id !== null && unit.order_guest_id === null) {
                        // 회원 주문(원래 회원)
                        invoiceLinkageStatus = {
                            status: 'linked_member',
                            label: '연동됨 (회원 주문)',
                            badge_type: 'success'
                        };
                    } else if (unit.order_user_id === null && unit.order_guest_id !== null) {
                        // 비회원 주문(미클레임)
                        invoiceLinkageStatus = {
                            status: 'unlinked_guest',
                            label: '미연동 (비회원, 미클레임)',
                            badge_type: 'warning'
                        };
                    } else if (unit.order_user_id !== null && unit.order_guest_id !== null) {
                        // 비회원 주문(클레임됨)
                        invoiceLinkageStatus = {
                            status: 'linked_from_guest',
                            label: '연동됨 (비회원 주문, 클레임됨)',
                            badge_type: 'success'
                        };
                    }
                }

                connectionInfo = {
                    order: {
                        order_id: unit.order_id,
                        order_number: unit.order_number,
                        order_date: unit.order_date,
                        status: unit.order_status,
                        user_id: unit.order_user_id,
                        guest_id: unit.order_guest_id
                    },
                    order_item: {
                        order_item_id: unit.order_item_id,
                        product_name: unit.product_name,
                        quantity: unit.quantity,
                        price: unit.price
                    },
                    order_item_unit: {
                        order_item_unit_id: unit.order_item_unit_id,
                        stock_unit_id: unit.stock_unit_id
                    },
                    stock_unit: stockUnit,
                    invoices: {
                        original: originalInvoice || null,
                        credit_notes: creditNotes
                    },
                    invoice_linkage_status: invoiceLinkageStatus
                };
            }
        }

        // 5. 보증서 이력 타임라인 조회
        const [events] = await connection.execute(
            `SELECT event_id, event_type, old_value, new_value, changed_by, changed_by_id, reason, created_at
             FROM warranty_events
             WHERE warranty_id = ?
             ORDER BY created_at DESC`,
            [warrantyId]
        );

        await connection.end();

        // 정책 경고 배지 결정
        let policyBadge = null;
        switch (warranty.status) {
            case 'active':
                policyBadge = { type: 'info', message: '양도 가능 / 환불 불가(정책)' };
                break;
            case 'issued':
            case 'issued_unassigned':
                policyBadge = { type: 'warning', message: '활성화 전 / 환불 가능' };
                break;
            case 'revoked':
                policyBadge = { type: 'error', message: 'QR 접근 차단 대상' };
                break;
            case 'suspended':
                policyBadge = { type: 'warning', message: '제재 상태' };
                break;
        }

        res.json({
            success: true,
            warranty: {
                id: warranty.id,
                public_id: warranty.public_id,
                status: warranty.status,
                product_name: warranty.product_name,
                token: warranty.token,
                serial_number: warranty.serial_number,
                rot_code: warranty.rot_code,
                warranty_bottom_code: warranty.warranty_bottom_code,
                created_at: warranty.created_at,
                verified_at: warranty.verified_at
            },
            status_card: {
                status: warranty.status,
                activated_at: warranty.activated_at,
                revoked_at: warranty.revoked_at,
                is_resold: warranty.revoked_at !== null && warranty.status !== 'revoked',
                policy_badge: policyBadge
            },
            owner_card: {
                current_owner: owner ? {
                    user_id: owner.user_id,
                    email: owner.email,
                    name: owner.name,
                    phone: owner.phone
                } : null,
                ownership_history: ownerEvents.map(e => ({
                    event_id: e.event_id,
                    event_type: e.event_type,
                    old_value: JSON.parse(e.old_value || '{}'),
                    new_value: JSON.parse(e.new_value),
                    changed_by: e.changed_by,
                    changed_by_id: e.changed_by_id,
                    reason: e.reason,
                    created_at: e.created_at
                }))
            },
            connection_card: connectionInfo,
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
        Logger.error('[WARRANTY_DETAIL] 보증서 상세 조회 실패', {
            warrantyId: req.params.id,
            error: error.message,
            stack: error.stack
        });

        if (connection) {
            await connection.end();
        }

        res.status(500).json({
            success: false,
            message: '보증서 상세 정보를 불러오는데 실패했습니다.'
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
