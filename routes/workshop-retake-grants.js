const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

// GET /workshop/:workshopId/students
router.get('/workshop/:workshopId/students', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { workshopId } = req.params;

    const [workshopRows] = await pool.execute(
      `SELECT w.id, w.max_attempts, a.course_id
       FROM workshops w JOIN activities a ON w.activity_id = a.id
       WHERE w.id = ?`,
      [workshopId]
    );

    if (workshopRows.length === 0) {
      return res.status(404).json({ message: 'Workshop not found' });
    }

    const courseId = workshopRows[0].course_id;

    const [students] = await pool.execute(
      `SELECT u.id, u.name, u.email,
              CASE WHEN wrg.student_id IS NOT NULL THEN 1 ELSE 0 END as has_grant,
              COALESCE(g.attempt_count, 0) as attempt_count,
              g.best_score
       FROM course_assignments ca
       JOIN users u ON ca.student_id = u.id
       LEFT JOIN workshop_retake_grants wrg ON wrg.workshop_id = ? AND wrg.student_id = u.id
       LEFT JOIN (
         SELECT student_id, COUNT(*) as attempt_count, MAX(percentage) as best_score
         FROM workshop_grades WHERE workshop_id = ? GROUP BY student_id
       ) g ON g.student_id = u.id
       WHERE ca.course_id = ? AND u.role = 'estudiante'
       ORDER BY u.name ASC`,
      [workshopId, workshopId, courseId]
    );

    res.json({ students, workshop: workshopRows[0] });
  } catch (error) {
    console.error('Get workshop retake students error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /workshop/:workshopId/grant
router.post('/workshop/:workshopId/grant', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { workshopId } = req.params;
    const { student_id } = req.body;

    if (!student_id) {
      return res.status(400).json({ message: 'student_id is required' });
    }

    await pool.execute(
      `INSERT IGNORE INTO workshop_retake_grants (workshop_id, student_id, granted_by)
       VALUES (?, ?, ?)`,
      [workshopId, student_id, req.user.id]
    );

    res.json({ message: 'Retake grant added successfully' });
  } catch (error) {
    console.error('Grant workshop retake error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// DELETE /workshop/:workshopId/grant/:studentId
router.delete('/workshop/:workshopId/grant/:studentId', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { workshopId, studentId } = req.params;

    await pool.execute(
      'DELETE FROM workshop_retake_grants WHERE workshop_id = ? AND student_id = ?',
      [workshopId, studentId]
    );

    res.json({ message: 'Retake grant removed successfully' });
  } catch (error) {
    console.error('Revoke workshop retake error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
