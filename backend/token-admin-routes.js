/**
 * token-admin-routes.js
 * 관리자 토큰 생성 API (POST /api/admin/tokens)
 * 설계: ADMIN_TOKEN_PRODUCT_STOCK_DESIGN.md §3.2.1, §3.2.2
 */

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { authenticateToken, requireAdmin } = require('./auth-middleware');
const { resolveProductId } = require('./utils/product-id-resolver');
const { generateOneQR } = require('./utils/qr-generator');
const Logger = require('./logger');
require('dotenv').config();

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

/** 20자 랜덤 토큰 (init-token-master-from-xlsx.js와 동일) */
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
                try {
                    await generateOneQR({ token, internal_code });
                } catch (qrErr) {
                    Logger.error('[ADMIN_TOKENS_CREATE] QR PNG 생성 실패 (토큰은 DB에 저장됨)', {
                        internal_code,
                        message: qrErr.message
                    });
                }
            }

            if (createdCount !== count) {
                throw new Error(`created_count(${createdCount}) !== count(${count})`);
            }

            await connection.commit();
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

module.exports = router;
