const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/quizzes/activity/{activityId}:
 *   get:
 *     summary: Get quizzes for an activity
 *     tags: [Quizzes]
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

    const [rows] = await pool.execute(
      `SELECT q.*, 
              MAX(g.percentage) as best_score,
              COUNT(g.id) as attempts
       FROM quizzes q
       LEFT JOIN grades g ON q.id = g.quiz_id AND g.student_id = ?
       WHERE q.activity_id = ?
       GROUP BY q.id
       ORDER BY q.id ASC`,
      [req.user.id, activityId]
    );

    // Add questions to each quiz for admin users
    if (req.user.role === 'admin' || req.user.role === 'formador') {
      for (let quiz of rows) {
        const [questionRows] = await pool.execute(
          'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
          [quiz.id]
        );
        quiz.questions = questionRows;
      }
    }

    res.json({ quizzes: rows });
  } catch (error) {
    console.error('Get quizzes error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/quizzes/{id}:
 *   get:
 *     summary: Get quiz by ID with questions
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const studentId = req.user.role === 'estudiante' ? req.user.id : null;

    const [quizRows] = await pool.execute(
      `SELECT q.*, a.course_id,
              COALESCE(gi.attempt_count, 0) as attempt_number,
              CASE WHEN COALESCE(gi.attempt_count, 0) >= q.max_attempts THEN 1 ELSE 0 END as is_completed,
              gi.best_score as completed_score,
              gi.best_max_score as completed_max_score
       FROM quizzes q
       JOIN activities a ON q.activity_id = a.id
       LEFT JOIN (
         SELECT quiz_id,
                COUNT(*) as attempt_count,
                MAX(percentage) as best_score,
                MAX(max_score) as best_max_score
         FROM grades
         WHERE student_id = ?
         GROUP BY quiz_id
       ) gi ON q.id = gi.quiz_id
       WHERE q.id = ?`,
      [studentId, id]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    const quiz = quizRows[0];

    if (req.user.role === 'estudiante') {
      const [assignmentRows] = await pool.execute(
        'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
        [quiz.course_id, req.user.id]
      );

      if (assignmentRows.length === 0) {
        return res.status(403).json({ message: 'You are not assigned to this course' });
      }
    }

    const [questionRows] = await pool.execute(
      'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
      [id]
    );

    quiz.questions = questionRows;

    res.json({ quiz });
  } catch (error) {
    console.error('Get quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/quizzes:
 *   post:
 *     summary: Create a new quiz
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { title, description, activity_id, passing_score, max_attempts, questions } = req.body;

    if (!title || !activity_id) {
      return res.status(400).json({ message: 'Title and activity_id are required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO quizzes (title, description, activity_id, passing_score, max_attempts, total_questions) VALUES (?, ?, ?, ?, ?, ?)',
      [title, description || '', activity_id, passing_score || 70, max_attempts || 1, questions ? questions.length : 0]
    );

    const quizId = result.insertId;

    if (questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        await pool.execute(
          'INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, points, order_index) VALUES (?, ?, ?, ?, ?, ?)',
          [quizId, question.question, JSON.stringify(question.options), question.correct_answer, question.points || 1, i]
        );
      }
    }

    res.status(201).json({
      message: 'Quiz created successfully',
      quiz: {
        id: quizId,
        title,
        description,
        activity_id,
        passing_score,
        total_questions: questions ? questions.length : 0
      }
    });
  } catch (error) {
    console.error('Create quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/quizzes/{id}/submit:
 *   post:
 *     summary: Submit quiz answers
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:id/submit', auth, authorize('estudiante'), async (req, res) => {
  try {
    const { id } = req.params;
    const { answers } = req.body;

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers array is required' });
    }

    const [quizRows] = await pool.execute(
      `SELECT q.*, a.course_id 
       FROM quizzes q 
       JOIN activities a ON q.activity_id = a.id 
       WHERE q.id = ?`,
      [id]
    );

    if (quizRows.length === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    const quiz = quizRows[0];

    const [assignmentRows] = await pool.execute(
      'SELECT id FROM course_assignments WHERE course_id = ? AND student_id = ?',
      [quiz.course_id, req.user.id]
    );

    if (assignmentRows.length === 0) {
      return res.status(403).json({ message: 'You are not assigned to this course' });
    }

    const [questionRows] = await pool.execute(
      'SELECT * FROM quiz_questions WHERE quiz_id = ? ORDER BY order_index ASC',
      [id]
    );

    let totalScore = 0;
    let maxScore = 0;

    questionRows.forEach((question, index) => {
      maxScore += question.points;
      if (answers[index] !== undefined && answers[index] === question.correct_answer) {
        totalScore += question.points;
      }
    });

    const percentage = maxScore > 0 ? (totalScore / maxScore) * 100 : 0;

    // Check if student has already completed this quiz
    const [existingGrades] = await pool.execute(
      'SELECT id FROM grades WHERE quiz_id = ? AND student_id = ?',
      [id, req.user.id]
    );

    if (existingGrades.length > 0) {
      return res.status(400).json({ message: 'Ya has presentado este quiz anteriormente. Solo se permite un intento.' });
    }

    const attemptNumber = 1; // Always first attempt since we block multiple attempts

    await pool.execute(
      'INSERT INTO grades (student_id, quiz_id, score, max_score, percentage, attempt_number) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, id, totalScore, maxScore, percentage, attemptNumber]
    );

    res.json({
      message: 'Quiz submitted successfully',
      score: totalScore,
      maxScore,
      percentage: Math.round(percentage * 100) / 100,
      passed: percentage >= quiz.passing_score,
      attemptNumber
    });
  } catch (error) {
    console.error('Submit quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/quizzes/{id}:
 *   put:
 *     summary: Update quiz
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, passing_score, max_attempts, questions } = req.body;

    if (!title) {
      return res.status(400).json({ message: 'Title is required' });
    }

    // Update quiz basic info
    const [result] = await pool.execute(
      'UPDATE quizzes SET title = ?, description = ?, passing_score = ?, max_attempts = ?, total_questions = ? WHERE id = ?',
      [title, description || '', passing_score || 70, max_attempts || 1, questions ? questions.length : 0, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    // Update questions if provided
    if (questions && Array.isArray(questions)) {
      // Delete existing questions
      await pool.execute('DELETE FROM quiz_questions WHERE quiz_id = ?', [id]);
      
      // Insert new questions
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        await pool.execute(
          'INSERT INTO quiz_questions (quiz_id, question, options, correct_answer, points, order_index) VALUES (?, ?, ?, ?, ?, ?)',
          [id, question.question, JSON.stringify(question.options), question.correct_answer, question.points || 1, i]
        );
      }
    }

    res.json({ message: 'Quiz updated successfully' });
  } catch (error) {
    console.error('Update quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/quizzes/{id}:
 *   delete:
 *     summary: Delete quiz
 *     tags: [Quizzes]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', auth, authorize('admin', 'formador'), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM quizzes WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Quiz not found' });
    }

    res.json({ message: 'Quiz deleted successfully' });
  } catch (error) {
    console.error('Delete quiz error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;