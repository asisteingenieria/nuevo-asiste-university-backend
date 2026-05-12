const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/content-blocks/activity/{activityId}:
 *   get:
 *     summary: Get content blocks for an activity
 *     tags: [Content Blocks]
 *     security:
 *       - bearerAuth: []
 */
router.get('/activity/:activityId', auth, async (req, res) => {
  try {
    const { activityId } = req.params;

    const [rows] = await pool.execute(
      'SELECT * FROM activity_content_blocks WHERE activity_id = ? ORDER BY order_index ASC',
      [activityId]
    );

    res.json({ blocks: rows });
  } catch (error) {
    console.error('Get content blocks error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/content-blocks:
 *   post:
 *     summary: Create a new content block
 *     tags: [Content Blocks]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { activity_id, block_type, content_text, content_url, order_index } = req.body;

    if (!activity_id || !block_type) {
      return res.status(400).json({ message: 'Activity ID and block type are required' });
    }

    if (!['text', 'image', 'video'].includes(block_type)) {
      return res.status(400).json({ message: 'Invalid block type' });
    }

    if (block_type === 'text' && !content_text) {
      return res.status(400).json({ message: 'Content text is required for text blocks' });
    }

    if ((block_type === 'image' || block_type === 'video') && !content_url) {
      return res.status(400).json({ message: 'Content URL is required for media blocks' });
    }

    const [result] = await pool.execute(
      'INSERT INTO activity_content_blocks (activity_id, block_type, content_text, content_url, order_index) VALUES (?, ?, ?, ?, ?)',
      [activity_id, block_type, content_text || null, content_url || null, order_index || 0]
    );

    res.status(201).json({
      message: 'Content block created successfully',
      block: {
        id: result.insertId,
        activity_id,
        block_type,
        content_text,
        content_url,
        order_index
      }
    });
  } catch (error) {
    console.error('Create content block error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/content-blocks/{id}:
 *   put:
 *     summary: Update content block
 *     tags: [Content Blocks]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { block_type, content_text, content_url, order_index } = req.body;

    if (!block_type || !['text', 'image', 'video'].includes(block_type)) {
      return res.status(400).json({ message: 'Valid block type is required' });
    }

    const [result] = await pool.execute(
      'UPDATE activity_content_blocks SET block_type = ?, content_text = ?, content_url = ?, order_index = ? WHERE id = ?',
      [block_type, content_text || null, content_url || null, order_index || 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Content block not found' });
    }

    res.json({ message: 'Content block updated successfully' });
  } catch (error) {
    console.error('Update content block error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/content-blocks/{id}:
 *   delete:
 *     summary: Delete content block
 *     tags: [Content Blocks]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM activity_content_blocks WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Content block not found' });
    }

    res.json({ message: 'Content block deleted successfully' });
  } catch (error) {
    console.error('Delete content block error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;