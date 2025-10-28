// order-routes.js - 주문 관리 API

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const { body, validationResult } = require('express-validator');
const Logger = require('./logger');

// 주문번호 생성 함수
function generateOrderNumber() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const timestamp = now.getTime().toString().slice(-6); // 마지막 6자리
    return `ORD-${year}${month}${day}-${timestamp}`;
}

// MySQL 연결 설정
const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

// 주문 생성 API
router.post('/api/orders', authenticateToken, [
    body('items').isArray().notEmpty().withMessage('주문 상품이 필요합니다'),
    body('items.*.product_id').isInt().withMessage('유효한 상품 ID가 필요합니다'),
    body('items.*.quantity').isInt({ min: 1 }).withMessage('수량은 1 이상이어야 합니다'),
    // 배송 정보 검증
    body('shipping.firstName').notEmpty().trim().withMessage('이름이 필요합니다'),
    body('shipping.lastName').notEmpty().trim().withMessage('성이 필요합니다'),
    body('shipping.email').isEmail().withMessage('유효한 이메일이 필요합니다'),
    body('shipping.phone').notEmpty().trim().withMessage('전화번호가 필요합니다'),
    body('shipping.address').notEmpty().trim().withMessage('주소가 필요합니다'),
    body('shipping.city').notEmpty().trim().withMessage('도시가 필요합니다'),
    body('shipping.postalCode').notEmpty().trim().withMessage('우편번호가 필요합니다'),
    body('shipping.country').notEmpty().trim().withMessage('국가가 필요합니다')
], async (req, res) => {
    let connection;
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const userId = req.user.userId;
        const { items, shipping } = req.body;

        connection = await mysql.createConnection(dbConfig);

        // 총 금액 계산
        let totalPrice = 0;
        const orderItemsData = [];

        for (const item of items) {
            // 상품 정보 조회
            const [productRows] = await connection.execute(
                'SELECT product_id, name, price, image FROM products WHERE product_id = ?',
                [item.product_id]
            );

            if (productRows.length === 0) {
                await connection.end();
                return res.status(400).json({ success: false, error: `상품 ID ${item.product_id}를 찾을 수 없습니다` });
            }

            const product = productRows[0];
            const subtotal = product.price * item.quantity;
            totalPrice += subtotal;

            orderItemsData.push({
                product_id: product.product_id,
                product_name: product.name,
                product_image: product.image,
                quantity: item.quantity,
                unit_price: product.price,
                subtotal: subtotal
            });
        }

        // 배송비 계산 (현재는 무료)
        const shippingCost = 0;
        const finalTotal = totalPrice + shippingCost;

        // 트랜잭션 시작
        await connection.beginTransaction();

        try {
            // 주문번호 생성
            const orderNumber = generateOrderNumber();
            
            // orders 테이블에 주문 생성 (배송 정보 및 주문번호 포함)
            const [orderResult] = await connection.execute(
                `INSERT INTO orders (user_id, order_number, total_price, status, 
                 shipping_first_name, shipping_last_name, shipping_email, shipping_phone,
                 shipping_address, shipping_city, shipping_postal_code, shipping_country,
                 shipping_method, shipping_cost, estimated_delivery) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, orderNumber, finalTotal, 'confirmed',
                 shipping.firstName, shipping.lastName, shipping.email, shipping.phone,
                 shipping.address, shipping.city, shipping.postalCode, shipping.country,
                 'standard', shippingCost, new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)] // 3일 후 배송 예정
            );

            const orderId = orderResult.insertId;

            // order_items 테이블에 주문 상품들 저장
            for (const itemData of orderItemsData) {
                await connection.execute(
                    `INSERT INTO order_items (order_id, product_id, product_name, product_image, quantity, unit_price, subtotal)
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [orderId, itemData.product_id, itemData.product_name, itemData.product_image, 
                     itemData.quantity, itemData.unit_price, itemData.subtotal]
                );
            }

            // 트랜잭션 커밋
            await connection.commit();

            Logger.log('주문 생성 성공', { orderId, orderNumber, userId, totalPrice: finalTotal, shipping });

            res.json({
                success: true,
                message: '주문이 성공적으로 생성되었습니다',
                order: {
                    order_id: orderId,
                    order_number: orderNumber,
                    total_price: finalTotal,
                    shipping_cost: shippingCost,
                    status: 'confirmed',
                    estimated_delivery: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                }
            });

        } catch (error) {
            await connection.rollback();
            throw error;
        }

    } catch (error) {
        Logger.log('주문 생성 오류:', error);
        res.status(500).json({ success: false, error: '주문 생성에 실패했습니다' });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// 주문 목록 조회 API
router.get('/api/orders', authenticateToken, async (req, res) => {
    let connection;
    try {
        const userId = req.user.userId;

        connection = await mysql.createConnection(dbConfig);

        // 주문 목록 조회 (배송 정보 및 주문번호 포함)
        const [orders] = await connection.execute(
            `SELECT order_id, order_number, total_price, order_date, status, 
                    shipping_first_name, shipping_last_name, shipping_city, shipping_country,
                    shipping_method, shipping_cost, estimated_delivery
             FROM orders 
             WHERE user_id = ? 
             ORDER BY order_date DESC`,
            [userId]
        );

        // 각 주문의 상품 정보 조회
        const ordersWithItems = await Promise.all(
            orders.map(async (order) => {
                const [items] = await connection.execute(
                    `SELECT order_item_id, product_id, product_name, product_image, 
                            quantity, unit_price, subtotal 
                     FROM order_items 
                     WHERE order_id = ?`,
                    [order.order_id]
                );

                return {
                    ...order,
                    items: items.map(item => ({
                        item_id: item.order_item_id,
                        product_id: item.product_id,
                        name: item.product_name,
                        image: item.product_image,
                        quantity: item.quantity,
                        unit_price: parseFloat(item.unit_price),
                        subtotal: parseFloat(item.subtotal)
                    }))
                };
            })
        );

        Logger.log('주문 목록 조회 성공', { userId, orderCount: ordersWithItems.length });

        res.json({
            success: true,
            orders: ordersWithItems
        });

    } catch (error) {
        Logger.log('주문 목록 조회 오류:', error);
        res.status(500).json({ success: false, error: '주문 목록 조회에 실패했습니다' });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

// 주문 상세 조회 API
router.get('/api/orders/:orderId', authenticateToken, async (req, res) => {
    let connection;
    try {
        const userId = req.user.userId;
        const orderId = req.params.orderId;

        connection = await mysql.createConnection(dbConfig);

        // 주문 정보 조회
        const [orders] = await connection.execute(
            'SELECT * FROM orders WHERE order_id = ? AND user_id = ?',
            [orderId, userId]
        );

        if (orders.length === 0) {
            return res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다' });
        }

        const order = orders[0];

        // 주문 상품 조회
        const [items] = await connection.execute(
            `SELECT order_item_id, product_id, product_name, product_image, 
                    quantity, unit_price, subtotal 
             FROM order_items 
             WHERE order_id = ?`,
            [orderId]
        );

        const orderDetail = {
            order_id: order.order_id,
            order_number: order.order_number,
            user_id: order.user_id,
            total_price: parseFloat(order.total_price),
            order_date: order.order_date,
            status: order.status,
            shipping: {
                first_name: order.shipping_first_name,
                last_name: order.shipping_last_name,
                email: order.shipping_email,
                phone: order.shipping_phone,
                address: order.shipping_address,
                city: order.shipping_city,
                postal_code: order.shipping_postal_code,
                country: order.shipping_country,
                method: order.shipping_method,
                cost: parseFloat(order.shipping_cost || 0),
                estimated_delivery: order.estimated_delivery
            },
            items: items.map(item => ({
                item_id: item.order_item_id,
                product_id: item.product_id,
                name: item.product_name,
                image: item.product_image,
                quantity: item.quantity,
                unit_price: parseFloat(item.unit_price),
                subtotal: parseFloat(item.subtotal)
            }))
        };

        res.json({
            success: true,
            order: orderDetail
        });

    } catch (error) {
        Logger.log('주문 상세 조회 오류:', error);
        res.status(500).json({ success: false, error: '주문 상세 조회에 실패했습니다' });
    } finally {
        if (connection) {
            await connection.end();
        }
    }
});

module.exports = router;

