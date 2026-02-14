/**
 * token-admin-routes.js
 * 관리자 토큰 생성 API (POST /api/admin/tokens)
 * 관리자 토큰 수정 API (PATCH /api/admin/tokens/:tokenPk) — TOKEN_XLSX_REMOVAL_AND_ADMIN_SSOT.md §6
 * 설계: ADMIN_TOKEN_PRODUCT_STOCK_DESIGN.md §3.2.1, §3.2.2
 */

const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const { resolveProductId } = require('./utils/product-id-resolver');
const Logger = require('./logger');
require('dotenv').config();

const OUTPUT_QR_DIR = path.join(__dirname, '..', 'output_qrcodes');

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
};

/** 색상 정규화 (product_options/color_standards SSOT에 맞춤) */
function normalizeColor(color) {
    if (!color) return '';
    const normalized = String(color).trim();
    if (!normalized) return '';
    const upper = normalized.toUpperCase();
    if (upper === 'LIGHTBLUE' || /^LightBlue$/i.test(normalized) || /^Light-Blue$/i.test(normalized) || upper === 'LB') return 'Light Blue';
    if (upper === 'LIGHTGREY' || /^LightGrey$/i.test(normalized) || /^Light-Grey$/i.test(normalized) || upper === 'LG' || upper === 'LGY') return 'Light Grey';
    if (upper === 'BK') return 'Black';
    if (upper === 'NV') return 'Navy';
    if (upper === 'WH' || upper === 'WT') return 'White';
    if (upper === 'GY' || upper === 'GRAY') return 'Grey';
    return normalized;
}

/** 20자 랜덤 토큰 */
function generateToken() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let token = '';
    for (let i = 0; i < 20; i++) {
        token += chars[crypto.randomInt(0, chars.length)];
    }
    return token;
}

/** DB 중복 제외 고유 토큰 생성 */
async function generateUniqueToken(connection, existingTokens) {
    const maxAttempts = 100;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const token = generateToken();
        if (existingTokens.has(token)) continue;
        const [rows] = await connection.execute('SELECT token FROM token_master WHERE token = ?', [token]);
        if (rows.length === 0) {
            existingTokens.add(token);
            return token;
        }
    }
    throw new Error('토큰 생성 실패: 최대 시도 횟수 초과');
}

/** 8~10자 영숫자 internal_code */
function generateInternalCode() {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const len = 8 + crypto.randomInt(0, 3);
    let code = '';
    for (let i = 0; i < len; i++) {
        code += chars[crypto.randomInt(0, chars.length)];
    }
    return code;
}

function maskToken(token) {
    if (!token || token.length < 8) return token;
    return token.substring(0, 4) + '...' + token.substring(token.length - 4);
}

/**
 * POST /api/admin/tokens
 * 상품+사이즈+색상+개수 → 토큰 N개 생성 (풀 메타 자동 생성)
 * Body: { product_id, size?, color?, count? }  count 1~100, 기본 1
 */
router.post('/admin/tokens', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const { product_id, size = '', color = '', count: reqCount } = req.body || {};
        const count = Math.min(Math.max(parseInt(reqCount, 10) || 1, 1), 100);

        if (!product_id || typeof product_id !== 'string' || !product_id.trim()) {
            return res.status(400).json({ success: false, message: 'product_id는 필수입니다.' });
        }

        connection = await mysql.createConnection(dbConfig);
        const canonicalId = await resolveProductId(product_id.trim(), connection);
        if (!canonicalId) {
            await connection.end();
            return res.status(404).json({ success: false, message: '상품을 찾을 수 없습니다.' });
        }

        const sizeNorm = (size && typeof size === 'string') ? size.trim() : '';
        const colorNorm = normalizeColor(color);

        const [optionRows] = await connection.execute(
            `SELECT po.option_id, po.rot_code, po.warranty_bottom_prefix, po.serial_prefix,
                    po.digital_warranty_code, po.digital_warranty_collection, po.season_code,
                    ap.name AS product_name, ap.short_name
             FROM product_options po
             INNER JOIN admin_products ap ON ap.id = po.product_id
             WHERE po.product_id = ? AND po.size = ? AND po.color = ? AND po.is_active = 1
             LIMIT 1`,
            [canonicalId, sizeNorm, colorNorm]
        );
        if (optionRows.length === 0) {
            await connection.end();
            return res.status(400).json({
                success: false,
                message: '해당 상품·사이즈·색상 조합이 없습니다. product_options를 확인하세요.'
            });
        }

        const opt = optionRows[0];
        const requiredMeta = [
            ['rot_code', opt.rot_code],
            ['warranty_bottom_prefix', opt.warranty_bottom_prefix],
            ['serial_prefix', opt.serial_prefix],
            ['digital_warranty_code', opt.digital_warranty_code],
            ['digital_warranty_collection', opt.digital_warranty_collection]
        ];
        for (const [name, val] of requiredMeta) {
            if (val == null || String(val).trim() === '') {
                await connection.end();
                return res.status(400).json({
                    success: false,
                    message: `옵션 메타가 설정되지 않았습니다. ${name}을(를) 설정한 뒤 토큰을 생성하세요.`
                });
            }
        }

        const productName = (opt.short_name && String(opt.short_name).trim()) || opt.product_name || '';

        await connection.beginTransaction();
        try {
            await connection.execute(
                `INSERT INTO token_variant_sequence (option_id, last_number)
                 VALUES (?, 0)
                 ON DUPLICATE KEY UPDATE last_number = last_number`,
                [opt.option_id]
            );

            const [seqRows] = await connection.execute(
                'SELECT last_number FROM token_variant_sequence WHERE option_id = ? FOR UPDATE',
                [opt.option_id]
            );
            const oldLast = seqRows[0] ? seqRows[0].last_number : 0;
            const start = oldLast + 1;
            const end = oldLast + count;

            await connection.execute(
                'UPDATE token_variant_sequence SET last_number = ? WHERE option_id = ?',
                [end, opt.option_id]
            );

            const existingTokens = new Set();
            const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
            const created = [];
            const forQr = [];
            let createdCount = 0;

            for (let seq = start; seq <= end; seq++) {
                const token = await generateUniqueToken(connection, existingTokens);
                const internal_code = generateInternalCode();
                const warranty_bottom_code = (opt.warranty_bottom_prefix || '') + String(seq).padStart(6, '0');
                const serial_number = (opt.serial_prefix || '') + String(seq).padStart(6, '0');

                const [insertResult] = await connection.execute(
                    `INSERT INTO token_master (
                      token, internal_code, product_name, product_id, option_id,
                      serial_number, rot_code, warranty_bottom_code, digital_warranty_code, digital_warranty_collection,
                      is_blocked, scan_count, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`,
                    [
                        token,
                        internal_code,
                        productName,
                        canonicalId,
                        opt.option_id,
                        serial_number,
                        opt.rot_code,
                        warranty_bottom_code,
                        opt.digital_warranty_code,
                        opt.digital_warranty_collection,
                        now,
                        now
                    ]
                );
                const tokenPk = insertResult.insertId;
                createdCount++;
                created.push({
                    token_pk: tokenPk,
                    token_masked: maskToken(token),
                    internal_code,
                    warranty_bottom_code
                });
                forQr.push({ token, internal_code, token_pk });
            }

            if (createdCount !== count) {
                throw new Error(`created_count(${createdCount}) !== count(${count})`);
            }

            await connection.commit();

            const { generateOneQR } = require('./utils/qr-generator');
            for (const item of forQr) {
                try {
                    const filepath = await generateOneQR({ token: item.token, internal_code: item.internal_code });
                    const stat = filepath && fs.existsSync(filepath) ? fs.statSync(filepath) : null;
                    if (stat && stat.size > 0) {
                        await connection.execute(
                            'UPDATE token_master SET qr_generated_at = NOW(), qr_last_error = NULL WHERE token_pk = ?',
                            [item.token_pk]
                        );
                    } else {
                        await connection.execute(
                            'UPDATE token_master SET qr_last_error = ? WHERE token_pk = ?',
                            ['file size 0 or missing', item.token_pk]
                        );
                    }
                } catch (qrErr) {
                    const errMsg = (qrErr && qrErr.message) ? String(qrErr.message).slice(0, 255) : 'QR 생성 실패';
                    await connection.execute(
                        'UPDATE token_master SET qr_last_error = ? WHERE token_pk = ?',
                        [errMsg, item.token_pk]
                    );
                    Logger.error('[ADMIN_TOKENS_CREATE] QR PNG 생성 실패 (토큰은 DB에 저장됨)', {
                        internal_code: item.internal_code,
                        message: qrErr.message
                    });
                }
            }

            Logger.log('[ADMIN_TOKENS_CREATE]', {
                userId: req.user?.user_id,
                option_id: opt.option_id,
                count,
                start,
                end,
                created_count: createdCount
            });

            return res.json({
                success: true,
                created,
                count: createdCount
            });
        } catch (txErr) {
            await connection.rollback();
            Logger.error('[ADMIN_TOKENS_CREATE] rollback', { message: txErr.message, option_id: opt.option_id });
            throw txErr;
        }
    } catch (error) {
        Logger.error('[ADMIN_TOKENS_CREATE] 실패', {
            message: error.message,
            stack: error.stack
        });
        return res.status(500).json({
            success: false,
            message: error.message || '토큰 생성 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) {
            try { await connection.end(); } catch (_) {}
        }
    }
});

/** §6.2 허용 컬럼 (화이트리스트) */
const PATCH_ALLOWED_COLUMNS = [
    'product_name',
    'rot_code',
    'serial_number',
    'warranty_bottom_code',
    'digital_warranty_code',
    'digital_warranty_collection'
];

/** §6.2 컬럼별 최대 길이 (db_structure_actual.txt 기준) */
const PATCH_COLUMN_MAX_LEN = {
    product_name: 255,
    rot_code: 100,
    serial_number: 100,
    warranty_bottom_code: 100,
    digital_warranty_code: 100,
    digital_warranty_collection: 100
};

/**
 * PATCH /api/admin/tokens/:tokenPk
 * 관리자 token_master 수정. TOKEN_XLSX_REMOVAL_AND_ADMIN_SSOT.md §6.5 순서 준수.
 * Body: 허용 컬럼만 { product_name?, rot_code?, serial_number?, warranty_bottom_code?, digital_warranty_code?, digital_warranty_collection? }
 */
router.patch('/admin/tokens/:tokenPk', authenticateToken, requireAdmin, async (req, res) => {
    let connection;
    try {
        const tokenPk = parseInt(req.params.tokenPk, 10);
        if (Number.isNaN(tokenPk) || tokenPk < 1) {
            return res.status(422).json({ success: false, message: 'tokenPk는 양의 정수여야 합니다.', code: 'INVALID_TOKEN_PK' });
        }

        const body = req.body && typeof req.body === 'object' ? req.body : {};
        const keys = Object.keys(body);

        // §6.5 1) 화이트리스트 — 허용 컬럼 외 포함 시 422
        const invalidKeys = keys.filter(k => !PATCH_ALLOWED_COLUMNS.includes(k));
        if (invalidKeys.length > 0) {
            return res.status(422).json({
                success: false,
                message: '허용되지 않은 컬럼이 포함되어 있습니다.',
                code: 'WHITELIST_VIOLATION',
                invalid_keys: invalidKeys
            });
        }

        if (keys.length === 0) {
            return res.status(422).json({ success: false, message: '수정할 필드가 없습니다.', code: 'NO_FIELDS' });
        }

        // 값 검증: string 또는 null만 허용, 길이 제한
        const updates = {};
        for (const k of keys) {
            const v = body[k];
            if (v !== null && typeof v !== 'string') {
                return res.status(422).json({
                    success: false,
                    message: `컬럼 값은 문자열 또는 null이어야 합니다: ${k}`,
                    code: 'INVALID_TYPE'
                });
            }
            const str = v == null ? '' : String(v).trim();
            const maxLen = PATCH_COLUMN_MAX_LEN[k];
            if (str.length > maxLen) {
                return res.status(422).json({
                    success: false,
                    message: `컬럼 길이 초과: ${k} (최대 ${maxLen})`,
                    code: 'MAX_LENGTH'
                });
            }
            updates[k] = v == null ? null : str || null;
        }

        // 단일 커넥션·단일 트랜잭션: FOR UPDATE 잠금이 유효하도록 모든 쿼리를 이 connection으로만 실행(pool 혼용 금지)
        connection = await mysql.createConnection(dbConfig);
        await connection.beginTransaction();

        try {
            // §6.5 2) 행 잠금
            const [rows] = await connection.execute(
                `SELECT token_pk, token, scan_count, product_name, rot_code, serial_number,
                        warranty_bottom_code, digital_warranty_code, digital_warranty_collection
                 FROM token_master WHERE token_pk = ? FOR UPDATE`,
                [tokenPk]
            );
            if (rows.length === 0) {
                await connection.rollback();
                return res.status(404).json({ success: false, message: '해당 토큰을 찾을 수 없습니다.', code: 'NOT_FOUND' });
            }

            const row = rows[0];

            // §6.5 3) §6.1 조건: scan_count=0
            if (row.scan_count !== 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: '이미 스캔된 토큰은 수정할 수 없습니다.',
                    code: 'SCAN_COUNT_NOT_ZERO'
                });
            }

            // scan_logs 불일치 검사
            const [scanRows] = await connection.execute(
                'SELECT 1 FROM scan_logs WHERE token = ? LIMIT 1',
                [row.token]
            );
            if (scanRows.length > 0) {
                await connection.rollback();
                return res.status(409).json({
                    success: false,
                    message: '데이터 불일치 점검 필요 (scan_count=0인데 scan_logs에 기록 존재).',
                    code: 'SCAN_LOGS_MISMATCH'
                });
            }

            const hasCustomerFacing = ['rot_code', 'serial_number', 'warranty_bottom_code', 'digital_warranty_code', 'digital_warranty_collection']
                .some(c => keys.includes(c));

            if (hasCustomerFacing) {
                const [w] = await connection.execute('SELECT 1 FROM warranties WHERE token_pk = ? LIMIT 1', [tokenPk]);
                const [s] = await connection.execute('SELECT 1 FROM stock_units WHERE token_pk = ? LIMIT 1', [tokenPk]);
                const [o] = await connection.execute('SELECT 1 FROM order_item_units WHERE token_pk = ? LIMIT 1', [tokenPk]);
                if (w.length > 0 || s.length > 0 || o.length > 0) {
                    await connection.rollback();
                    return res.status(409).json({
                        success: false,
                        message: '이미 보증/재고/주문에 연결된 토큰의 고객 노출값은 수정할 수 없습니다.',
                        code: 'LINKED_TOKEN'
                    });
                }
            } else {
                // product_name만 변경: warranties, order_item_units 미연결이면 허용 (stock_units 허용)
                const [w] = await connection.execute('SELECT 1 FROM warranties WHERE token_pk = ? LIMIT 1', [tokenPk]);
                const [o] = await connection.execute('SELECT 1 FROM order_item_units WHERE token_pk = ? LIMIT 1', [tokenPk]);
                if (w.length > 0 || o.length > 0) {
                    await connection.rollback();
                    return res.status(409).json({
                        success: false,
                        message: '이미 보증/주문에 연결된 토큰은 수정할 수 없습니다.',
                        code: 'LINKED_TOKEN'
                    });
                }
            }

            // 실제 변경분만 추출 (old_value === new_value면 미기록)
            const adminUserId = req.user?.userId;
            if (adminUserId == null) {
                await connection.rollback();
                return res.status(403).json({ success: false, message: '인증 정보가 없습니다.', code: 'UNAUTHORIZED' });
            }

            const auditRows = [];
            const setParts = [];
            const setValues = [];

            for (const col of keys) {
                const oldVal = row[col] != null ? String(row[col]) : '';
                const newVal = updates[col] != null ? String(updates[col]) : '';
                if (oldVal === newVal) continue;
                auditRows.push({ column_name: col, old_value: row[col], new_value: updates[col] });
                setParts.push(`${col} = ?`);
                setValues.push(updates[col]);
            }

            if (auditRows.length === 0) {
                await connection.rollback();
                return res.json({ success: true, message: '변경 없음', updated: [] });
            }

            // §6.5 4) 감사 로그 N행 INSERT
            // 출처: request_id=X-Request-Id 헤더(없으면 null), ip=req.ip|connection.remoteAddress, user_agent=req.get('User-Agent')
            // 운영 조회 예시: SELECT * FROM token_admin_audit_logs WHERE token_pk=? ORDER BY changed_at DESC LIMIT 20 (idx_token_pk_changed_at)
            const requestId = req.headers['x-request-id'] ? String(req.headers['x-request-id']).slice(0, 64) : null;
            const ip = req.ip || req.connection?.remoteAddress || null;
            const userAgent = req.get('User-Agent') || null;

            for (const a of auditRows) {
                await connection.execute(
                    `INSERT INTO token_admin_audit_logs
                     (token_pk, admin_user_id, column_name, old_value, new_value, request_id, ip, user_agent)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        tokenPk,
                        adminUserId,
                        a.column_name,
                        a.old_value ?? null,
                        a.new_value ?? null,
                        requestId,
                        ip ? String(ip).slice(0, 45) : null,
                        userAgent
                    ]
                );
            }

            // §6.5 5) token_master UPDATE
            setParts.push('updated_at = NOW()');
            await connection.execute(
                `UPDATE token_master SET ${setParts.join(', ')} WHERE token_pk = ?`,
                [...setValues, tokenPk]
            );

            await connection.commit();

            Logger.log('[ADMIN_TOKENS_PATCH]', {
                userId: adminUserId,
                tokenPk,
                columns: auditRows.map(a => a.column_name)
            });

            return res.json({
                success: true,
                updated: auditRows.map(a => ({ column: a.column_name, old_value: a.old_value, new_value: a.new_value }))
            });
        } catch (txErr) {
            await connection.rollback();
            throw txErr;
        }
    } catch (error) {
        Logger.error('[ADMIN_TOKENS_PATCH] 실패', { message: error.message, stack: error.stack });
        return res.status(500).json({
            success: false,
            message: error.message || '토큰 수정 중 오류가 발생했습니다.'
        });
    } finally {
        if (connection) {
            try { await connection.end(); } catch (_) {}
        }
    }
});

module.exports = router;
