const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/courses:
 *   get:
 *     summary: Get courses
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get('/', auth, async (req, res) => {
  try {
    let query = `
      SELECT c.*, u.name as created_by_name,
             COUNT(DISTINCT ca.student_id) as student_count,
             COUNT(DISTINCT a.id) as activity_count
      FROM courses c
      LEFT JOIN users u ON c.created_by = u.id
      LEFT JOIN course_assignments ca ON c.id = ca.course_id
      LEFT JOIN activities a ON c.id = a.course_id
    `;

    let params = [];

    if (req.user.role === 'estudiante') {
      query += ' WHERE ca.student_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'formador') {
      query += ` WHERE c.id IN (
        SELECT DISTINCT course_id 
        FROM formador_courses 
        WHERE formador_id = ?
      )`;
      params.push(req.user.id);
    }

    query += ' GROUP BY c.id ORDER BY c.created_at DESC';

    const [rows] = await pool.execute(query, params);

    res.json({ courses: rows });
  } catch (error) {
    console.error('Get courses error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/courses/{id}:
 *   get:
 *     summary: Get course by ID
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const [courseRows] = await pool.execute(
      `SELECT c.*, u.name as created_by_name
       FROM courses c
       LEFT JOIN users u ON c.created_by = u.id
       WHERE c.id = ?`,
      [id]
    );

    if (courseRows.length === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    if (req.user.role === 'estudiante') {
      const [assignmentRows] = await pool.execute(
        'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
        [id, req.user.id]
      );

      if (assignmentRows.length === 0) {
        return res.status(403).json({ message: 'You are not assigned to this course' });
      }
    }

    const [activityRows] = await pool.execute(
      `SELECT a.*, 
              COUNT(DISTINCT w.id) as workshop_count,
              COUNT(DISTINCT q.id) as quiz_count
       FROM activities a
       LEFT JOIN workshops w ON a.id = w.activity_id
       LEFT JOIN quizzes q ON a.id = q.activity_id
       WHERE a.course_id = ?
       GROUP BY a.id
       ORDER BY a.order_index ASC`,
      [id]
    );

    const course = courseRows[0];
    course.activities = activityRows;

    res.json({ course });
  } catch (error) {
    console.error('Get course error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/courses:
 *   post:
 *     summary: Create a new course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO courses (title, description, created_by) VALUES (?, ?, ?)',
      [title, description || '', req.user.id]
    );

    res.status(201).json({
      message: 'Course created successfully',
      course: {
        id: result.insertId,
        title,
        description,
        created_by: req.user.id
      }
    });
  } catch (error) {
    console.error('Create course error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/courses/{id}:
 *   put:
 *     summary: Update course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    const [result] = await pool.execute(
      'UPDATE courses SET title = ?, description = ? WHERE id = ?',
      [title, description || '', id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json({ message: 'Course updated successfully' });
  } catch (error) {
    console.error('Update course error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/courses/{id}:
 *   delete:
 *     summary: Delete course
 *     tags: [Courses]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM courses WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Course not found' });
    }

    res.json({ message: 'Course deleted successfully' });
  } catch (error) {
    console.error('Delete course error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;