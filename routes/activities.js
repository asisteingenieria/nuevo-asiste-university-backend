const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/activities/course/{courseId}:
 *   get:
 *     summary: Get activities for a course
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 */
router.get('/course/:courseId', auth, async (req, res) => {
  try {
    const { courseId } = req.params;

    if (req.user.role === 'estudiante') {
      const [assignmentRows] = await pool.execute(
        'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
        [courseId, req.user.id]
      );

      if (assignmentRows.length === 0) {
        return res.status(403).json({ message: 'You are not assigned to this course' });
      }
    }

    const [rows] = await pool.execute(
      `SELECT a.*, 
              COUNT(DISTINCT w.id) as workshop_count,
              COUNT(DISTINCT q.id) as quiz_count,
              MAX(ap.completed) as is_completed
       FROM activities a
       LEFT JOIN workshops w ON a.id = w.activity_id
       LEFT JOIN quizzes q ON a.id = q.activity_id
       LEFT JOIN activity_progress ap ON a.id = ap.activity_id AND ap.student_id = ?
       WHERE a.course_id = ?
       GROUP BY a.id, a.title, a.description, a.content_type, a.content_url, a.course_id, a.order_index, a.created_at
       ORDER BY a.order_index ASC`,
      [req.user.id, courseId]
    );

    res.json({ activities: rows });
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/activities/{id}:
 *   get:
 *     summary: Get activity by ID
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const [activityRows] = await pool.execute(
      `SELECT a.*, 
              COALESCE(ap.completed, 0) as is_completed
       FROM activities a
       LEFT JOIN activity_progress ap ON a.id = ap.activity_id AND ap.student_id = ?
       WHERE a.id = ?`,
      [req.user.role === 'estudiante' ? req.user.id : null, id]
    );

    if (activityRows.length === 0) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    const activity = activityRows[0];

    if (req.user.role === 'estudiante') {
      const [assignmentRows] = await pool.execute(
        'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
        [activity.course_id, req.user.id]
      );

      if (assignmentRows.length === 0) {
        return res.status(403).json({ message: 'You are not assigned to this course' });
      }
    }

    // Get content blocks
    const [contentBlocks] = await pool.execute(
      'SELECT * FROM activity_content_blocks WHERE activity_id = ? ORDER BY order_index ASC',
      [id]
    );

    const [workshopRows] = await pool.execute(
      'SELECT * FROM workshops WHERE activity_id = ? ORDER BY order_index ASC',
      [id]
    );

    const [quizRows] = await pool.execute(
      'SELECT * FROM quizzes WHERE activity_id = ? ORDER BY id ASC',
      [id]
    );

    activity.content_blocks = contentBlocks;
    activity.workshops = workshopRows;
    activity.quizzes = quizRows;

    res.json({ activity });
  } catch (error) {
    console.error('Get activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/activities:
 *   post:
 *     summary: Create a new activity
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { title, description, course_id, order_index } = req.body;

    if (!title || !course_id) {
      return res.status(400).json({ message: 'Title and course_id are required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO activities (title, description, course_id, order_index) VALUES (?, ?, ?, ?)',
      [title, description || '', course_id, order_index || 0]
    );

    res.status(201).json({
      message: 'Activity created successfully',
      activity: {
        id: result.insertId,
        title,
        description,
        course_id,
        order_index
      }
    });
  } catch (error) {
    console.error('Create activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/activities/{id}:
 *   put:
 *     summary: Update activity
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, order_index } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const [result] = await pool.execute(
      'UPDATE activities SET title = ?, description = ?, order_index = ? WHERE id = ?',
      [title, description || '', order_index || 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    res.json({ message: 'Activity updated successfully' });
  } catch (error) {
    console.error('Update activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/activities/{id}/complete:
 *   post:
 *     summary: Mark activity as completed
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/complete', auth, authorize('estudiante'), async (req, res) => {
  try {
    const { id } = req.params;

    const [activityRows] = await pool.execute(
      'SELECT course_id FROM activities WHERE id = ?',
      [id]
    );

    if (activityRows.length === 0) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    const [assignmentRows] = await pool.execute(
      'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
      [activityRows[0].course_id, req.user.id]
    );

    if (assignmentRows.length === 0) {
      return res.status(403).json({ message: 'You are not assigned to this course' });
    }

    await pool.execute(
      `INSERT INTO activity_progress (student_id, activity_id, completed, completed_at) 
       VALUES (?, ?, TRUE, NOW()) 
       ON DUPLICATE KEY UPDATE completed = TRUE, completed_at = NOW()`,
      [req.user.id, id]
    );

    res.json({ message: 'Activity marked as completed' });
  } catch (error) {
    console.error('Complete activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/activities/{id}:
 *   delete:
 *     summary: Delete activity
 *     tags: [Activities]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM activities WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('Delete activity error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;