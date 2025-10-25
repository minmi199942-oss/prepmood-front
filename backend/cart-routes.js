const express = require('express');
const router = express.Router();
const mysql = require('mysql2/promise');
const { authenticateToken } = require('./auth-middleware');
require('dotenv').config();

// ?°ì´?°ë² ?´ìŠ¤ ?°ê²° ?¤ì •
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'prepmood',
  charset: 'utf8mb4'
};

// ====================================
// ?¥ë°”êµ¬ë‹ˆ API ?¼ìš°??
// ====================================

// JWT ?¸ì¦ ë¯¸ë“¤?¨ì–´ ?¬ìš© (auth-middleware.js?ì„œ import)

// ?¥ë°”êµ¬ë‹ˆ ì¡°íšŒ
router.get('/cart', authenticateToken, async (req, res) => {
  try {
    Logger.log('?›’ ?¥ë°”êµ¬ë‹ˆ ì¡°íšŒ ?œë„:', req.user.userId);
    
    const connection = await mysql.createConnection(dbConfig);
    Logger.log('???°ì´?°ë² ?´ìŠ¤ ?°ê²° ?±ê³µ');
    
    try {
      // ?¬ìš©?ì˜ ?¥ë°”êµ¬ë‹ˆ ì¡°íšŒ ?ëŠ” ?ì„±
      let [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      let cartId;
      if (carts.length === 0) {
        // ?¥ë°”êµ¬ë‹ˆê°€ ?†ìœ¼ë©??ì„±
        const [result] = await connection.execute(
          'INSERT INTO carts (user_id) VALUES (?)',
          [req.user.userId]
        );
        cartId = result.insertId;
        Logger.log('?†• ???¥ë°”êµ¬ë‹ˆ ?ì„±:', cartId);
      } else {
        cartId = carts[0].cart_id;
        Logger.log('?“‹ ê¸°ì¡´ ?¥ë°”êµ¬ë‹ˆ ?¬ìš©:', cartId);
      }

      // ?¥ë°”êµ¬ë‹ˆ ?„ì´??ì¡°íšŒ (?í’ˆ ?•ë³´ ?¬í•¨)
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

      Logger.log(`?“‹ ?¥ë°”êµ¬ë‹ˆ ì¡°íšŒ: ?¬ìš©??${req.user.userId} - ${items.length}ê°???ª©`);

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
    console.error('???¥ë°”êµ¬ë‹ˆ ì¡°íšŒ ?¤ë¥˜:', error);
    res.status(500).json({ 
      success: false, 
      message: '?¥ë°”êµ¬ë‹ˆ ì¡°íšŒ???¤íŒ¨?ˆìŠµ?ˆë‹¤.',
      error: error.message 
    });
  }
});

// ?¥ë°”êµ¬ë‹ˆ???í’ˆ ì¶”ê?
router.post('/cart/add', authenticateToken, async (req, res) => {
  try {
    const { productId, quantity = 1, size = null, color = null } = req.body;

    if (!productId) {
      return res.status(400).json({ success: false, message: '?í’ˆ IDê°€ ?„ìš”?©ë‹ˆ??' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?¬ìš©?ì˜ ?¥ë°”êµ¬ë‹ˆ ì¡°íšŒ ?ëŠ” ?ì„±
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

      // ?í’ˆ???´ë? ?¥ë°”êµ¬ë‹ˆ???ˆëŠ”ì§€ ?•ì¸
      const [existing] = await connection.execute(`
        SELECT item_id, quantity FROM cart_items 
        WHERE cart_id = ? AND product_id = ? AND 
              (size = ? OR (size IS NULL AND ? IS NULL)) AND 
              (color = ? OR (color IS NULL AND ? IS NULL))
      `, [cartId, productId, size, size, color, color]);

      if (existing.length > 0) {
        // ?´ë? ?ˆìœ¼ë©??˜ëŸ‰ ì¦ê?
        await connection.execute(
          'UPDATE cart_items SET quantity = quantity + ? WHERE item_id = ?',
          [quantity, existing[0].item_id]
        );
        Logger.log(`?”„ ?¥ë°”êµ¬ë‹ˆ ?˜ëŸ‰ ?…ë°?´íŠ¸: ?¬ìš©??${req.user.userId} - ${productId} (${existing[0].quantity} ??${existing[0].quantity + quantity})`);
      } else {
        // ?†ìœ¼ë©??ˆë¡œ ì¶”ê?
        await connection.execute(
          'INSERT INTO cart_items (cart_id, product_id, quantity, size, color) VALUES (?, ?, ?, ?, ?)',
          [cartId, productId, quantity, size, color]
        );
        Logger.log(`???¥ë°”êµ¬ë‹ˆ??ì¶”ê?: ?¬ìš©??${req.user.userId} - ${productId}`);
      }

      // ?…ë°?´íŠ¸???¥ë°”êµ¬ë‹ˆ ?•ë³´ ì¡°íšŒ
      const [items] = await connection.execute(`
        SELECT COUNT(*) as count, SUM(quantity) as total_quantity
        FROM cart_items WHERE cart_id = ?
      `, [cartId]);

      res.json({
        success: true,
        message: '?¥ë°”êµ¬ë‹ˆ??ì¶”ê??˜ì—ˆ?µë‹ˆ??',
        cartSummary: {
          itemCount: items[0].count,
          totalQuantity: items[0].total_quantity
        }
      });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???¥ë°”êµ¬ë‹ˆ ì¶”ê? ?¤ë¥˜:', error);
    
    // ì¤‘ë³µ ???¤ë¥˜ ì²˜ë¦¬
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, message: '?´ë? ?¥ë°”êµ¬ë‹ˆ???ˆëŠ” ?í’ˆ?…ë‹ˆ??' });
    }
    
    res.status(500).json({ success: false, message: '?¥ë°”êµ¬ë‹ˆ ì¶”ê????¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// ?¥ë°”êµ¬ë‹ˆ ?„ì´???˜ëŸ‰ ë³€ê²?
router.put('/cart/item/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;
    const { quantity } = req.body;

    if (!quantity || quantity < 1) {
      return res.status(400).json({ success: false, message: '?˜ëŸ‰?€ 1 ?´ìƒ?´ì–´???©ë‹ˆ??' });
    }

    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?„ì´?œì´ ?¬ìš©?ì˜ ?¥ë°”êµ¬ë‹ˆ???í•˜?”ì? ?•ì¸
      const [items] = await connection.execute(`
        SELECT ci.item_id FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.cart_id
        WHERE ci.item_id = ? AND c.user_id = ?
      `, [itemId, req.user.userId]);

      if (items.length === 0) {
        return res.status(404).json({ success: false, message: '?¥ë°”êµ¬ë‹ˆ ?„ì´?œì„ ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
      }

      // ?˜ëŸ‰ ?…ë°?´íŠ¸
      await connection.execute(
        'UPDATE cart_items SET quantity = ? WHERE item_id = ?',
        [quantity, itemId]
      );

      Logger.log(`?”„ ?¥ë°”êµ¬ë‹ˆ ?˜ëŸ‰ ë³€ê²? ?¬ìš©??${req.user.userId} - ?„ì´??${itemId} ???˜ëŸ‰ ${quantity}`);

      res.json({ success: true, message: '?˜ëŸ‰??ë³€ê²½ë˜?ˆìŠµ?ˆë‹¤.' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???¥ë°”êµ¬ë‹ˆ ?˜ëŸ‰ ë³€ê²??¤ë¥˜:', error);
    res.status(500).json({ success: false, message: '?˜ëŸ‰ ë³€ê²½ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// ?¥ë°”êµ¬ë‹ˆ ?„ì´???? œ
router.delete('/cart/item/:itemId', authenticateToken, async (req, res) => {
  try {
    const { itemId } = req.params;

    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?„ì´?œì´ ?¬ìš©?ì˜ ?¥ë°”êµ¬ë‹ˆ???í•˜?”ì? ?•ì¸
      const [items] = await connection.execute(`
        SELECT ci.item_id, ci.product_id FROM cart_items ci
        JOIN carts c ON ci.cart_id = c.cart_id
        WHERE ci.item_id = ? AND c.user_id = ?
      `, [itemId, req.user.userId]);

      if (items.length === 0) {
        return res.status(404).json({ success: false, message: '?¥ë°”êµ¬ë‹ˆ ?„ì´?œì„ ì°¾ì„ ???†ìŠµ?ˆë‹¤.' });
      }

      // ?„ì´???? œ
      await connection.execute(
        'DELETE FROM cart_items WHERE item_id = ?',
        [itemId]
      );

      Logger.log(`?—‘ï¸??¥ë°”êµ¬ë‹ˆ?ì„œ ?? œ: ?¬ìš©??${req.user.userId} - ${items[0].product_id}`);

      res.json({ success: true, message: '?¥ë°”êµ¬ë‹ˆ?ì„œ ?? œ?˜ì—ˆ?µë‹ˆ??' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???¥ë°”êµ¬ë‹ˆ ?? œ ?¤ë¥˜:', error);
    res.status(500).json({ success: false, message: '?? œ???¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// ?¥ë°”êµ¬ë‹ˆ ?„ì²´ ë¹„ìš°ê¸?
router.delete('/cart/clear', authenticateToken, async (req, res) => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    try {
      // ?¬ìš©?ì˜ ?¥ë°”êµ¬ë‹ˆ ì¡°íšŒ
      const [carts] = await connection.execute(
        'SELECT cart_id FROM carts WHERE user_id = ?',
        [req.user.userId]
      );

      if (carts.length > 0) {
        await connection.execute(
          'DELETE FROM cart_items WHERE cart_id = ?',
          [carts[0].cart_id]
        );
        Logger.log(`?—‘ï¸??¥ë°”êµ¬ë‹ˆ ?„ì²´ ë¹„ìš°ê¸? ?¬ìš©??${req.user.userId}`);
      }

      res.json({ success: true, message: '?¥ë°”êµ¬ë‹ˆê°€ ë¹„ì›Œì¡ŒìŠµ?ˆë‹¤.' });
    } finally {
      connection.end();
    }
  } catch (error) {
    console.error('???¥ë°”êµ¬ë‹ˆ ë¹„ìš°ê¸??¤ë¥˜:', error);
    res.status(500).json({ success: false, message: '?¥ë°”êµ¬ë‹ˆ ë¹„ìš°ê¸°ì— ?¤íŒ¨?ˆìŠµ?ˆë‹¤.' });
  }
});

// ?¥ë°”êµ¬ë‹ˆ ?„ì´??ê°œìˆ˜ ì¡°íšŒ (?¤ë”??
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
    console.error('???¥ë°”êµ¬ë‹ˆ ê°œìˆ˜ ì¡°íšŒ ?¤ë¥˜:', error);
    res.json({ success: true, count: 0 }); // ?¤ë¥˜ ??0 ë°˜í™˜
  }
});

module.exports = router;

