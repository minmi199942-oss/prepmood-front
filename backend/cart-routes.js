const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const Logger = require('./logger');
require('dotenv').config();

// ?�이?�베?�스 ?�결 ?�정
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'prepmood',
  charset: 'utf8mb4'
};

// ====================================
// ?�바구니 API ?�우??
// ====================================

// JWT ?�증 미들?�어 ?�용 (auth-middleware.js?�서 import)

// ?�바구니 조회
router.get('/cart', authenticateToken, async (req, res) => {
  try {
    Logger.log('?�� ?�바구니 조회 ?�도:', req.user.userId);
    
    const connection = await mysql.createConnection(dbConfig);
    Logger.log('???�이?�베?�스 ?�결 ?�공');
    
    try {
      // ?�용?�의 ?�바구니 조회 ?�는 ?�성
      let [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      let cartId;
      if (carts.length === 0) {
        // ?�바구니가 ?�으�??�성
        const [result] = await connection.execute(
          'INSERT INTO carts (user_id) VALUES (?)',
          [req.user.userId]
        );
        cartId = result.insertId;
        Logger.log('?�� ???�바구니 ?�성:', cartId);
      } else {
        cartId = carts[0].cart_id;
        Logger.log('?�� 기존 ?�바구니 ?�용:', cartId);
      }

      // ?�바구니 ?�이??조회 (?�품 ?�보 ?�함)
      const [items] = await connection.execute(`
        SELECT 
          ci.item_id,
          ci.product_id,
          ci.quantity,
          ci.size,
          ci.color,
          p.name,
          p.price,
          p.image,
          p.category,
          p.type
        FROM cart_items ci
        JOIN admin_products p ON ci.product_id = p.id
        WHERE ci.cart_id = ?
        ORDER BY ci.created_at DESC
      `, [cartId]);

      Logger.log(`?�� ?�바구니 조회: ?�용??${req.user.userId} - ${items.length}�???��`);

      res.json({
        success: true,
        cartId: cartId,
        items: items,
        totalItems: items.reduce((sum, item) => sum + item.quantity, 0),
        totalPrice: items.reduce((sum, item) => sum + (item.price * item.quantity), 0)
      });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???�바구니 조회 ?�류:', error);
    res.status(500).json({ 
      success: false, 
      message: '?�바구니 조회???�패?�습?�다.',
      error: error.message 
    });
  }
});

// ?�바구니???�품 추�?
router.post('/cart/add', authenticateToken, async (req, res) => {
  try {
    const { productId, quantity = 1, size = null, color = null } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: '?�품 ID가 ?�요?�니??' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?�용?�의 ?�바구니 조회 ?�는 ?�성
      let [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      let cartId;
      if (carts.length === 0) {
        const [result] = await connection.execute(
          'INSERT INTO carts (user_id) VALUES (?)',
          [req.user.userId]
        );
        cartId = result.insertId;
      } else {
        cartId = carts[0].cart_id;
      }

      // ?�품???��? ?�바구니???�는지 ?�인
      const [existing] = await connection.execute(`
        SELECT item_id, quantity FROM cart_items 
        WHERE cart_id = ? AND product_id = ? AND 
              (size = ? OR (size IS NULL AND ? IS NULL)) AND 
              (color = ? OR (color IS NULL AND ? IS NULL))
      `, [cartId, productId, size, size, color, color]);

      if (existing.length > 0) {
        // ?��? ?�으�??�량 증�?
        await connection.execute(
          'UPDATE cart_items SET quantity = quantity + ? WHERE item_id = ?',
          [quantity, existing[0].item_id]
        );
        Logger.log(`?�� ?�바구니 ?�량 ?�데?�트: ?�용??${req.user.userId} - ${productId} (${existing[0].quantity} ??${existing[0].quantity + quantity})`);
      } else {
        // ?�으�??�로 추�?
        await connection.execute(
          'INSERT INTO cart_items (cart_id, product_id, quantity, size, color) VALUES (?, ?, ?, ?, ?)',
          [cartId, productId, quantity, size, color]
        );
        Logger.log(`???�바구니??추�?: ?�용??${req.user.userId} - ${productId}`);
      }

      // ?�데?�트???�바구니 ?�보 조회
      const [items] = await connection.execute(`
        SELECT COUNT(*) as count, SUM(quantity) as total_quantity
        FROM cart_items WHERE cart_id = ?
      `, [cartId]);

      res.json({
        success: true,
        message: '?�바구니??추�??�었?�니??',
        cartSummary: {
          itemCount: items[0].count,
          totalQuantity: items[0].total_quantity
        }
      });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???�바구니 추�? ?�류:', error);
    
    // 중복 ???�류 처리
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '?��? ?�바구니???�는 ?�품?�니??' });
    }
    
    res.status(500).json({ success: false, message: '?�바구니 추�????�패?�습?�다.' });
  }
});

// ?�바구니 ?�이???�량 변�?
router.put('/cart/item/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: '?�량?� 1 ?�상?�어???�니??' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?�이?�이 ?�용?�의 ?�바구니???�하?��? ?�인
      const [items] = await connection.execute(`
        SELECT ci.item_id FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.cart_id
        WHERE ci.item_id = ? AND c.user_id = ?
      `, [itemId, req.user.userId]);

      if (items.length === 0) {
        return res.status(404).json({ success: false, message: '?�바구니 ?�이?�을 찾을 ???�습?�다.' });
      }

      // ?�량 ?�데?�트
      await connection.execute(
        'UPDATE cart_items SET quantity = ? WHERE item_id = ?',
        [quantity, itemId]
      );

      Logger.log(`?�� ?�바구니 ?�량 변�? ?�용??${req.user.userId} - ?�이??${itemId} ???�량 ${quantity}`);

      res.json({ success: true, message: '?�량??변경되?�습?�다.' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???�바구니 ?�량 변�??�류:', error);
    res.status(500).json({ success: false, message: '?�량 변경에 ?�패?�습?�다.' });
  }
});

// ?�바구니 ?�이????��
router.delete('/cart/item/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;

    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?�이?�이 ?�용?�의 ?�바구니???�하?��? ?�인
      const [items] = await connection.execute(`
        SELECT ci.item_id, ci.product_id FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.cart_id
        WHERE ci.item_id = ? AND c.user_id = ?
      `, [itemId, req.user.userId]);

      if (items.length === 0) {
        return res.status(404).json({ success: false, message: '?�바구니 ?�이?�을 찾을 ???�습?�다.' });
      }

      // ?�이????��
      await connection.execute(
        'DELETE FROM cart_items WHERE item_id = ?',
        [itemId]
      );

      Logger.log(`?���??�바구니?�서 ??��: ?�용??${req.user.userId} - ${items[0].product_id}`);

      res.json({ success: true, message: '?�바구니?�서 ??��?�었?�니??' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???�바구니 ??�� ?�류:', error);
    res.status(500).json({ success: false, message: '??��???�패?�습?�다.' });
  }
});

// ?�바구니 ?�체 비우�?
router.delete('/cart/clear', authenticateToken, async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?�용?�의 ?�바구니 조회
      const [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      if (carts.length > 0) {
        await connection.execute(
          'DELETE FROM cart_items WHERE cart_id = ?',
          [carts[0].cart_id]
        );
        Logger.log(`?���??�바구니 ?�체 비우�? ?�용??${req.user.userId}`);
      }

      res.json({ success: true, message: '?�바구니가 비워졌습?�다.' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???�바구니 비우�??�류:', error);
    res.status(500).json({ success: false, message: '?�바구니 비우기에 ?�패?�습?�다.' });
  }
});

// ?�바구니 ?�이??개수 조회 (?�더??
router.get('/cart/count', authenticateToken, async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    try {
      const [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      if (carts.length === 0) {
        return res.json({ success: true, count: 0 });
      }

      const [result] = await connection.execute(
        'SELECT SUM(quantity) as count FROM cart_items WHERE cart_id = ?',
        [carts[0].cart_id]
      );

      res.json({ success: true, count: result[0].count || 0 });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???�바구니 개수 조회 ?�류:', error);
    res.json({ success: true, count: 0 }); // ?�류 ??0 반환
  }
});

module.exports = router;

