const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /quiz/:quizId/students
// Returns students enrolled in the quiz's course with their grant status and attempt count
router.get('/quiz/:quizId/students', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { quizId } = req.params;

    // Get course for this quiz
    const [quizRows] = await pool.execute(
      `SELECT q.id, q.max_attempts, a.course_id
       FROM quizzes q JOIN activities a ON q.activity_id = a.id
       WHERE q.id = ?`,
      [quizId]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    const courseId = quizRows[0].course_id;

    // Get all students enrolled in the course, with grant status and attempt count
    const [students] = await pool.execute(
      `SELECT u.id, u.name, u.email,
              CASE WHEN grg.student_id IS NOT NULL THEN 1 ELSE 0 END as has_grant,
              COALESCE(g.attempt_count, 0) as attempt_count,
              g.best_score
       FROM course_assignments ca
       JOIN users u ON ca.student_id = u.id
       LEFT JOIN quiz_retake_grants grg ON grg.quiz_id = ? AND grg.student_id = u.id
       LEFT JOIN (
         SELECT student_id, COUNT(*) as attempt_count, MAX(percentage) as best_score
         FROM grades WHERE quiz_id = ? GROUP BY student_id
       ) g ON g.student_id = u.id
       WHERE ca.course_id = ? AND u.role = 'estudiante'
       ORDER BY u.name ASC`,
      [quizId, quizId, courseId]
    );

    res.json({ students, quiz: quizRows[0] });
  } catch (error) {
    console.error('Get quiz retake students error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /quiz/:quizId/grant
// Grant a retake to a specific student
router.post('/quiz/:quizId/grant', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { quizId } = req.params;
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ message: 'student_id is required' });
    }

    await pool.execute(
      `INSERT IGNORE INTO quiz_retake_grants (quiz_id, student_id, granted_by)
       VALUES (?, ?, ?)`,
      [quizId, student_id, req.user.id]
    );

    res.json({ message: 'Retake grant added successfully' });
  } catch (error) {
    console.error('Grant retake error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /quiz/:quizId/grant/:studentId
// Revoke a retake grant for a specific student
router.delete('/quiz/:quizId/grant/:studentId', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { quizId, studentId } = req.params;

    await pool.execute(
      'DELETE FROM quiz_retake_grants WHERE quiz_id = ? AND student_id = ?',
      [quizId, studentId]
    );

    res.json({ message: 'Retake grant removed successfully' });
  } catch (error) {
    console.error('Revoke retake error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
