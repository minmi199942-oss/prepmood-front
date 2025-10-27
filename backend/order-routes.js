// order-routes.js - 주문 관리 API

const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const { body, validationResult } = require('express-validator');
const Logger = require('./logger');

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
    body('items.*.quantity').isInt({ min: 1 }).withMessage('수량은 1 이상이어야 합니다')
], async (req, res) => {
    let connection;
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ success: false, errors: errors.array() });
        }

        const userId = req.user.userId;
        const { items } = req.body;

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

        // 트랜잭션 시작
        await connection.beginTransaction();

        try {
            // orders 테이블에 주문 생성
            const [orderResult] = await connection.execute(
                'INSERT INTO orders (user_id, total_price, status) VALUES (?, ?, ?)',
                [userId, totalPrice, 'confirmed']
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

            Logger.log('주문 생성 성공', { orderId, userId, totalPrice });

            res.json({
                success: true,
                message: '주문이 성공적으로 생성되었습니다',
                order: {
                    order_id: orderId,
                    total_price: totalPrice,
                    status: 'confirmed'
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

        // 주문 목록 조회
        const [orders] = await connection.execute(
            `SELECT order_id, total_price, order_date, status 
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
            user_id: order.user_id,
            total_price: parseFloat(order.total_price),
            order_date: order.order_date,
            status: order.status,
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

