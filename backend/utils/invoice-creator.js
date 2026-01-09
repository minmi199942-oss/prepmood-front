/**
 * 인보이스 생성 유틸리티
 * 
 * 결제 완료 시 주문 정보를 스냅샷하여 인보이스를 생성합니다.
 */

const crypto = require('crypto');
const { generateUniqueInvoiceNumber } = require('./invoice-number-generator');
const Logger = require('../logger');

/**
 * 주문 정보로부터 인보이스 생성
 * @param {Object} connection - MySQL 연결 (트랜잭션 내)
 * @param {number} orderId - 주문 ID
 * @returns {Promise<Object>} 생성된 인보이스 정보 { invoice_id, invoice_number }
 */
async function createInvoiceFromOrder(connection, orderId) {
    try {
        // 1. 주문 정보 조회 (회원 정보 포함)
        const [orderRows] = await connection.execute(
            `SELECT 
                o.order_id,
                o.order_number,
                o.user_id,
                o.total_price,
                o.shipping_name,
                o.shipping_email,
                o.shipping_phone,
                o.shipping_address,
                o.shipping_city,
                o.shipping_postal_code,
                o.shipping_country,
                o.created_at,
                u.email as user_email,
                u.name as user_name,
                u.phone as user_phone
            FROM orders o
            LEFT JOIN users u ON o.user_id = u.user_id
            WHERE o.order_id = ?`,
            [orderId]
        );

        if (orderRows.length === 0) {
            throw new Error(`주문을 찾을 수 없습니다: order_id=${orderId}`);
        }

        const order = orderRows[0];

        // 2. 주문 상품 정보 조회 (라인 아이템)
        const [orderItems] = await connection.execute(
            `SELECT 
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

        // 3. 통화 결정
        const currency = order.shipping_country === 'KR' ? 'KRW' : 
                        order.shipping_country === 'US' ? 'USD' : 
                        order.shipping_country === 'JP' ? 'JPY' : 'KRW';

        // 4. 금액 계산 (세금 포함/제외)
        const totalAmount = parseFloat(order.total_price);
        const taxAmount = 0; // 부가세 별도 계산 시 수정 필요
        const netAmount = totalAmount - taxAmount;

        // 5. Billing 정보 (회원 정보 또는 배송 정보 사용)
        const billingName = order.user_name || order.shipping_name || '고객';
        const billingEmail = order.user_email || order.shipping_email;
        const billingPhone = order.user_phone || order.shipping_phone || null;
        
        // 필수 필드 검증 (billing_email은 NOT NULL이므로 반드시 필요)
        if (!billingEmail) {
            Logger.error('[INVOICE] Billing email 누락', {
                order_id: orderId,
                user_email: order.user_email,
                shipping_email: order.shipping_email
            });
            throw new Error(`Billing email이 없습니다: order_id=${orderId}, user_email=${order.user_email || 'null'}, shipping_email=${order.shipping_email || 'null'}`);
        }

        // 6. Shipping 정보
        const shippingName = order.shipping_name || billingName || '고객';
        const shippingEmail = order.shipping_email || billingEmail;
        const shippingPhone = order.shipping_phone || billingPhone || null;
        
        // 필수 필드 검증 (shipping_name은 NOT NULL이므로 반드시 필요)
        if (!shippingName || shippingName.trim() === '') {
            Logger.error('[INVOICE] Shipping name 누락', {
                order_id: orderId,
                shipping_name: order.shipping_name,
                billing_name: billingName
            });
            throw new Error(`Shipping name이 없습니다: order_id=${orderId}, shipping_name=${order.shipping_name || 'null'}`);
        }

        // 7. 주소 JSON 생성
        const billingAddressJson = {
            address: order.shipping_address || '',
            city: order.shipping_city || '',
            postal_code: order.shipping_postal_code || '',
            country: order.shipping_country || 'KR'
        };

        const shippingAddressJson = {
            address: order.shipping_address || '',
            city: order.shipping_city || '',
            postal_code: order.shipping_postal_code || '',
            country: order.shipping_country || 'KR'
        };

        // 8. Payload JSON 생성 (전체 인보이스 스냅샷)
        const payloadJson = {
            order_id: order.order_id,
            order_number: order.order_number,
            issued_at: new Date().toISOString(),
            currency: currency,
            amounts: {
                total: totalAmount,
                tax: taxAmount,
                net: netAmount
            },
            billing: {
                name: billingName,
                email: billingEmail,
                phone: billingPhone,
                address: billingAddressJson
            },
            shipping: {
                name: shippingName,
                email: shippingEmail,
                phone: shippingPhone,
                address: shippingAddressJson
            },
            items: orderItems.map(item => ({
                product_id: item.product_id,
                product_name: item.product_name,
                size: item.size,
                color: item.color,
                quantity: item.quantity,
                unit_price: parseFloat(item.unit_price),
                subtotal: parseFloat(item.subtotal)
            }))
        };

        // 9. Payload 해시 생성 (위변조/동일문서 판별)
        const payloadString = JSON.stringify(payloadJson);
        const orderSnapshotHash = crypto.createHash('sha256').update(payloadString).digest('hex');

        // 10. 인보이스 번호 생성
        const invoiceNumber = await generateUniqueInvoiceNumber(connection);

        // 11. 인보이스 INSERT
        let invoiceResult;
        try {
            [invoiceResult] = await connection.execute(
                `INSERT INTO invoices (
                    order_id, invoice_number, type, status,
                    currency, total_amount, tax_amount, net_amount,
                    billing_name, billing_email, billing_phone, billing_address_json,
                    shipping_name, shipping_email, shipping_phone, shipping_address_json,
                    payload_json, order_snapshot_hash, version,
                    issued_by, issued_at
                ) VALUES (?, ?, 'invoice', 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'system', NOW())`,
                [
                    order.order_id,
                    invoiceNumber,
                    currency,
                    totalAmount,
                    taxAmount,
                    netAmount,
                    billingName,
                    billingEmail,
                    billingPhone,
                    JSON.stringify(billingAddressJson),
                    shippingName,
                    shippingEmail,
                    shippingPhone,
                    JSON.stringify(shippingAddressJson),
                    payloadString,
                    orderSnapshotHash
                ]
            );
        } catch (sqlError) {
            Logger.error('[INVOICE] SQL INSERT 실패', {
                order_id: orderId,
                invoice_number: invoiceNumber,
                error: sqlError.message,
                error_code: sqlError.code,
                sql_state: sqlError.sqlState,
                sql_message: sqlError.sqlMessage,
                billing_name: billingName,
                billing_email: billingEmail,
                shipping_name: shippingName,
                shipping_email: shippingEmail
            });
            throw sqlError;
        }

        const invoiceId = invoiceResult.insertId;

        Logger.log('[INVOICE] 인보이스 생성 완료', {
            invoice_id: invoiceId,
            invoice_number: invoiceNumber,
            order_id: orderId,
            order_number: order.order_number,
            total_amount: totalAmount,
            currency: currency
        });

        return {
            invoice_id: invoiceId,
            invoice_number: invoiceNumber
        };

    } catch (error) {
        Logger.error('[INVOICE] 인보이스 생성 실패', {
            order_id: orderId,
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

module.exports = {
    createInvoiceFromOrder
};
