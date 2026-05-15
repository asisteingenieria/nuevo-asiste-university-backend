const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/workshops/activity/{activityId}:
 *   get:
 *     summary: Get workshops for an activity
 *     tags: [Workshops]
 *     security:
 *       - bearerAuth: []
 */
router.get('/activity/:activityId', auth, async (req, res) => {
  try {
    const { activityId } = req.params;

    const [activityRows] = await pool.execute(
      'SELECT course_id FROM activities WHERE id = ?',
      [activityId]
    );

    if (activityRows.length === 0) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    if (req.user.role === 'estudiante') {
      const [assignmentRows] = await pool.execute(
        'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
        [activityRows[0].course_id, req.user.id]
      );

      if (assignmentRows.length === 0) {
        return res.status(403).json({ message: 'You are not assigned to this course' });
      }
    }

    const studentId = req.user.role === 'estudiante' ? req.user.id : null;
    const [rows] = await pool.execute(
      `SELECT w.*, COUNT(DISTINCT wq.id) as question_count,
              CASE WHEN wrg.student_id IS NOT NULL THEN 1 ELSE 0 END as has_grant,
              COALESCE(g.attempt_count, 0) as attempt_count,
              g.best_score as completed_score,
              CASE
                WHEN COALESCE(g.attempt_count, 0) = 0 THEN 0
                WHEN wrg.student_id IS NOT NULL AND COALESCE(w.max_attempts, 1) >= 2 AND COALESCE(g.attempt_count, 0) < 2 THEN 0
                ELSE 1
              END as is_completed
       FROM workshops w
       LEFT JOIN workshop_questions wq ON w.id = wq.workshop_id
       LEFT JOIN workshop_retake_grants wrg ON w.id = wrg.workshop_id AND wrg.student_id = ?
       LEFT JOIN (
         SELECT workshop_id, COUNT(*) as attempt_count, MAX(percentage) as best_score
         FROM workshop_grades WHERE student_id = ? GROUP BY workshop_id
       ) g ON g.workshop_id = w.id
       WHERE w.activity_id = ?
       GROUP BY w.id, wrg.student_id, g.attempt_count, g.best_score
       ORDER BY w.order_index ASC`,
      [studentId, studentId, activityId]
    );

    res.json({ workshops: rows });
  } catch (error) {
    console.error('Get workshops error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshops/{id}:
 *   get:
 *     summary: Get workshop by ID
 *     tags: [Workshops]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const studentId = req.user.role === 'estudiante' ? req.user.id : null;
    const [workshopRows] = await pool.execute(
      `SELECT w.*, a.course_id,
              CASE WHEN wrg.student_id IS NOT NULL THEN 1 ELSE 0 END as has_grant,
              COALESCE(g.attempt_count, 0) as attempt_count,
              g.best_score as completed_score,
              CASE
                WHEN COALESCE(g.attempt_count, 0) = 0 THEN 0
                WHEN wrg.student_id IS NOT NULL AND COALESCE(w.max_attempts, 1) >= 2 AND COALESCE(g.attempt_count, 0) < 2 THEN 0
                ELSE 1
              END as is_completed
       FROM workshops w
       JOIN activities a ON w.activity_id = a.id
       LEFT JOIN workshop_retake_grants wrg ON w.id = wrg.workshop_id AND wrg.student_id = ?
       LEFT JOIN (
         SELECT workshop_id, COUNT(*) as attempt_count, MAX(percentage) as best_score
         FROM workshop_grades WHERE student_id = ? GROUP BY workshop_id
       ) g ON g.workshop_id = w.id
       WHERE w.id = ?`,
      [studentId, studentId, id]
    );

    if (workshopRows.length === 0) {
      return res.status(404).json({ message: 'Workshop not found' });
    }

    const workshop = workshopRows[0];

    if (req.user.role === 'estudiante') {
      const [assignmentRows] = await pool.execute(
        'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
        [workshop.course_id, req.user.id]
      );

      if (assignmentRows.length === 0) {
        return res.status(403).json({ message: 'You are not assigned to this course' });
      }
    }

    // Get workshop questions with images
    const [questions] = await pool.execute(
      'SELECT * FROM workshop_questions WHERE workshop_id = ? ORDER BY order_index ASC',
      [id]
    );

    workshop.questions = questions;

    res.json({ workshop });
  } catch (error) {
    console.error('Get workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshops:
 *   post:
 *     summary: Create a new workshop
 *     tags: [Workshops]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { title, description, activity_id, order_index } = req.body;

    if (!title || !activity_id) {
      return res.status(400).json({ message: 'Title and activity_id are required' });
    }

    const { max_attempts } = req.body;
    const [result] = await pool.execute(
      'INSERT INTO workshops (title, description, activity_id, order_index, max_attempts) VALUES (?, ?, ?, ?, ?)',
      [title, description || '', activity_id, order_index || 0, max_attempts || 1]
    );

    res.status(201).json({
      message: 'Workshop created successfully',
      workshop: {
        id: result.insertId,
        title,
        description,
        activity_id,
        order_index
      }
    });
  } catch (error) {
    console.error('Create workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshops/{id}:
 *   put:
 *     summary: Update workshop
 *     tags: [Workshops]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, order_index, max_attempts } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const [result] = await pool.execute(
      'UPDATE workshops SET title = ?, description = ?, order_index = ?, max_attempts = ? WHERE id = ?',
      [title, description || '', order_index || 0, max_attempts || 1, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Workshop not found' });
    }

    res.json({ message: 'Workshop updated successfully' });
  } catch (error) {
    console.error('Update workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshops/{id}:
 *   delete:
 *     summary: Delete workshop
 *     tags: [Workshops]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM workshops WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Workshop not found' });
    }

    res.json({ message: 'Workshop deleted successfully' });
  } catch (error) {
    console.error('Delete workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;