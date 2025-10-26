const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
const Logger = require('./logger');
require('dotenv').config();

// 데이터베이스 연결 설정
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'prepmood',
  charset: 'utf8mb4'
};

// ====================================
// 장바구니 API 라우터
// ====================================

// JWT 인증 미들웨어 사용 (auth-middleware.js에서 import)

// 장바구니 조회
router.get('/cart', authenticateToken, async (req, res) => {
  try {
    Logger.log('사용자 장바구니 조회 요청:', req.user.userId);
    
    const connection = await mysql.createConnection(dbConfig);
    Logger.log('데이터베이스 연결 성공');
    
    try {
      // 사용자의 장바구니 조회 또는 생성
      let [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      let cartId;
      if (carts.length === 0) {
        // 장바구니가 없으면 생성
        const [result] = await connection.execute(
          'INSERT INTO carts (user_id) VALUES (?)',
          [req.user.userId]
        );
        cartId = result.insertId;
        Logger.log('새로운 장바구니 생성:', cartId);
      } else {
        cartId = carts[0].cart_id;
        Logger.log('기존 장바구니 사용:', cartId);
      }

      // 장바구니 아이템 조회 (상품 정보 포함)
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

      Logger.log(`사용자 장바구니 조회: 사용자${req.user.userId} - ${items.length}개 아이템`);

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
    console.error('장바구니 조회 오류:', error);
    res.status(500).json({ 
      success: false, 
      message: '장바구니 조회에 실패했습니다.',
      error: error.message 
    });
  }
});

// 장바구니에 상품 추가
router.post('/cart/add', authenticateToken, async (req, res) => {
  try {
    const { productId, quantity = 1, size = null, color = null } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: '상품 ID가 필요합니다.' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
      // 사용자의 장바구니 조회 또는 생성
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

      // 상품이 이미 장바구니에 있는지 확인
      const [existing] = await connection.execute(`
        SELECT item_id, quantity FROM cart_items 
        WHERE cart_id = ? AND product_id = ? AND 
              (size = ? OR (size IS NULL AND ? IS NULL)) AND 
              (color = ? OR (color IS NULL AND ? IS NULL))
      `, [cartId, productId, size, size, color, color]);

      if (existing.length > 0) {
        // 기존 상품의 수량 증가
        await connection.execute(
          'UPDATE cart_items SET quantity = quantity + ? WHERE item_id = ?',
          [quantity, existing[0].item_id]
        );
        Logger.log(`기존 장바구니 수량 업데이트: 사용자${req.user.userId} - ${productId} (${existing[0].quantity} → ${existing[0].quantity + quantity})`);
      } else {
        // 새로운 상품으로 추가
        await connection.execute(
          'INSERT INTO cart_items (cart_id, product_id, quantity, size, color) VALUES (?, ?, ?, ?, ?)',
          [cartId, productId, quantity, size, color]
        );
        Logger.log(`새로운 장바구니 상품 추가: 사용자${req.user.userId} - ${productId}`);
      }

      // 업데이트된 장바구니 정보 조회
      const [items] = await connection.execute(`
        SELECT COUNT(*) as count, SUM(quantity) as total_quantity
        FROM cart_items WHERE cart_id = ?
      `, [cartId]);

      res.json({
        success: true,
        message: '장바구니에 추가되었습니다.',
        cartSummary: {
          itemCount: items[0].count,
          totalQuantity: items[0].total_quantity
        }
      });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('장바구니 추가 오류:', error);
    
    // 중복 키 오류 처리
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '이미 장바구니에 있는 상품입니다.' });
    }
    
    res.status(500).json({ success: false, message: '장바구니 추가에 실패했습니다.' });
  }
});

// 장바구니 아이템 수량 변경
router.put('/cart/item/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: '수량은 1 이상이어야 합니다.' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
      // 아이템이 사용자의 장바구니에 속하는지 확인
      const [items] = await connection.execute(`
        SELECT ci.item_id FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.cart_id
        WHERE ci.item_id = ? AND c.user_id = ?
      `, [itemId, req.user.userId]);

      if (items.length === 0) {
        return res.status(404).json({ success: false, message: '장바구니 아이템을 찾을 수 없습니다.' });
      }

      // 수량 업데이트
      await connection.execute(
        'UPDATE cart_items SET quantity = ? WHERE item_id = ?',
        [quantity, itemId]
      );

      Logger.log(`장바구니 수량 변경: 사용자${req.user.userId} - 아이템${itemId} → 수량 ${quantity}`);

      res.json({ success: true, message: '수량이 변경되었습니다.' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('장바구니 수량 변경 오류:', error);
    res.status(500).json({ success: false, message: '수량 변경에 실패했습니다.' });
  }
});

// 장바구니 아이템 삭제
router.delete('/cart/item/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;

    const connection = await mysql.createConnection(dbConfig);
    try {
      // 아이템이 사용자의 장바구니에 속하는지 확인
      const [items] = await connection.execute(`
        SELECT ci.item_id, ci.product_id FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.cart_id
        WHERE ci.item_id = ? AND c.user_id = ?
      `, [itemId, req.user.userId]);

      if (items.length === 0) {
        return res.status(404).json({ success: false, message: '장바구니 아이템을 찾을 수 없습니다.' });
      }

      // 아이템 삭제
      await connection.execute(
        'DELETE FROM cart_items WHERE item_id = ?',
        [itemId]
      );

      Logger.log(`장바구니에서 삭제: 사용자${req.user.userId} - ${items[0].product_id}`);

      res.json({ success: true, message: '장바구니에서 삭제되었습니다.' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('장바구니 삭제 오류:', error);
    res.status(500).json({ success: false, message: '삭제에 실패했습니다.' });
  }
});

// 장바구니 전체 비우기
router.delete('/cart/clear', authenticateToken, async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    try {
      // 사용자의 장바구니 조회
      const [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      if (carts.length > 0) {
        await connection.execute(
          'DELETE FROM cart_items WHERE cart_id = ?',
          [carts[0].cart_id]
        );
        Logger.log(`장바구니 전체 비우기: 사용자${req.user.userId}`);
      }

      res.json({ success: true, message: '장바구니가 비워졌습니다.' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('장바구니 비우기 오류:', error);
    res.status(500).json({ success: false, message: '장바구니 비우기에 실패했습니다.' });
  }
});

// 장바구니 아이템 개수 조회 (헤더용)
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
    console.error('장바구니 개수 조회 오류:', error);
    res.json({ success: true, count: 0 }); // 오류 시 0 반환
  }
});

module.exports = router;

