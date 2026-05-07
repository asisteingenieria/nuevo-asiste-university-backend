const express = require('express');
const { pool } = require('../config/database');
const { auth, authorize } = require('../middleware/auth');

const router = express.Router();

/**
 * @swagger
 * /api/workshop-questions/workshop/{workshopId}:
 *   get:
 *     summary: Get questions for a workshop
 *     tags: [Workshop Questions]
 *     security:
 *       - bearerAuth: []
 */
router.get('/workshop/:workshopId', auth, async (req, res) => {
  try {
    const { workshopId } = req.params;

    const [rows] = await pool.execute(
      'SELECT * FROM workshop_questions WHERE workshop_id = ? ORDER BY order_index ASC',
      [workshopId]
    );

    res.json({ questions: rows });
  } catch (error) {
    console.error('Get workshop questions error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshop-questions:
 *   post:
 *     summary: Create a new workshop question
 *     tags: [Workshop Questions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/', auth, authorize('admin'), async (req, res) => {
  try {
    const {
      workshop_id,
      question,
      question_image,
      option_a_text,
      option_b_text,
      option_c_text,
      option_d_text,
      option_a_image,
      option_b_image,
      option_c_image,
      option_d_image,
      correct_answer,
      points,
      order_index
    } = req.body;

    if (!workshop_id || !question || !correct_answer) {
      return res.status(400).json({ message: 'Workshop ID, question, and correct answer are required' });
    }

    if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
      return res.status(400).json({ message: 'Correct answer must be A, B, C, or D' });
    }

    // At least one option must have text or image, and the correct answer option must have content
    const optionMap = {
      A: [option_a_text, option_a_image],
      B: [option_b_text, option_b_image],
      C: [option_c_text, option_c_image],
      D: [option_d_text, option_d_image]
    };
    const hasAtLeastOne = Object.values(optionMap).some(([txt, img]) => txt?.trim() || img?.trim());
    if (!hasAtLeastOne) {
      return res.status(400).json({ message: 'At least one option must have text or image' });
    }
    const [correctTxt, correctImg] = optionMap[correct_answer];
    if (!correctTxt?.trim() && !correctImg?.trim()) {
      return res.status(400).json({ message: `The correct answer option (${correct_answer}) must have text or image` });
    }

    const [result] = await pool.execute(
      `INSERT INTO workshop_questions
       (workshop_id, question, question_image,
        option_a_text, option_b_text, option_c_text, option_d_text,
        option_a_image, option_b_image, option_c_image, option_d_image,
        correct_answer, points, order_index)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        workshop_id,
        question,
        question_image || null,
        option_a_text || null,
        option_b_text || null,
        option_c_text || null,
        option_d_text || null,
        option_a_image || null,
        option_b_image || null,
        option_c_image || null,
        option_d_image || null,
        correct_answer,
        points || 1,
        order_index || 0
      ]
    );

    res.status(201).json({
      message: 'Workshop question created successfully',
      question: {
        id: result.insertId,
        workshop_id,
        question,
        question_image: question_image || null,
        option_a_text, option_b_text, option_c_text, option_d_text,
        option_a_image, option_b_image, option_c_image, option_d_image,
        correct_answer,
        points: points || 1,
        order_index: order_index || 0
      }
    });
  } catch (error) {
    console.error('Create workshop question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshop-questions/{id}:
 *   put:
 *     summary: Update workshop question
 *     tags: [Workshop Questions]
 *     security:
 *       - bearerAuth: []
 */
router.put('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const {
      question,
      question_image,
      option_a_text,
      option_b_text,
      option_c_text,
      option_d_text,
      option_a_image,
      option_b_image,
      option_c_image,
      option_d_image,
      correct_answer,
      points,
      order_index
    } = req.body;

    if (!question || !correct_answer) {
      return res.status(400).json({ message: 'Question and correct answer are required' });
    }

    if (!['A', 'B', 'C', 'D'].includes(correct_answer)) {
      return res.status(400).json({ message: 'Correct answer must be A, B, C, or D' });
    }

    const [result] = await pool.execute(
      `UPDATE workshop_questions
       SET question = ?, question_image = ?,
           option_a_text = ?, option_b_text = ?, option_c_text = ?, option_d_text = ?,
           option_a_image = ?, option_b_image = ?, option_c_image = ?, option_d_image = ?,
           correct_answer = ?, points = ?, order_index = ?
       WHERE id = ?`,
      [
        question,
        question_image || null,
        option_a_text || null,
        option_b_text || null,
        option_c_text || null,
        option_d_text || null,
        option_a_image || null,
        option_b_image || null,
        option_c_image || null,
        option_d_image || null,
        correct_answer,
        points || 1,
        order_index || 0,
        id
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Workshop question not found' });
    }

    res.json({ message: 'Workshop question updated successfully' });
  } catch (error) {
    console.error('Update workshop question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshop-questions/{id}:
 *   delete:
 *     summary: Delete workshop question
 *     tags: [Workshop Questions]
 *     security:
 *       - bearerAuth: []
 */
router.delete('/:id', auth, authorize('admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const [result] = await pool.execute('DELETE FROM workshop_questions WHERE id = ?', [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Workshop question not found' });
    }

    res.json({ message: 'Workshop question deleted successfully' });
  } catch (error) {
    console.error('Delete workshop question error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

/**
 * @swagger
 * /api/workshop-questions/{workshopId}/submit:
 *   post:
 *     summary: Submit workshop answers and get grade
 *     tags: [Workshop Questions]
 *     security:
 *       - bearerAuth: []
 */
router.post('/:workshopId/submit', auth, authorize('estudiante'), async (req, res) => {
  try {
    const { workshopId } = req.params;
    const { answers } = req.body; // Array of {questionId, selectedAnswer}

    if (!answers || !Array.isArray(answers)) {
      return res.status(400).json({ message: 'Answers array is required' });
    }

    // Get all questions for this workshop
    const [questions] = await pool.execute(
      'SELECT * FROM workshop_questions WHERE workshop_id = ?',
      [workshopId]
    );

    if (questions.length === 0) {
      return res.status(404).json({ message: 'No questions found for this workshop' });
    }

    // Calculate score
    let score = 0;
    let maxScore = 0;
    const results = [];

    for (const question of questions) {
      maxScore += question.points;
      const userAnswer = answers.find(a => a.questionId == question.id);
      
      if (userAnswer && userAnswer.selectedAnswer === question.correct_answer) {
        score += question.points;
        results.push({
          questionId: question.id,
          correct: true,
          userAnswer: userAnswer.selectedAnswer,
          correctAnswer: question.correct_answer
        });
      } else {
        results.push({
          questionId: question.id,
          correct: false,
          userAnswer: userAnswer?.selectedAnswer || null,
          correctAnswer: question.correct_answer
        });
      }
    }

    const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

    // Check if student has already completed this workshop
    const [existingGrades] = await pool.execute(
      'SELECT id FROM workshop_grades WHERE student_id = ? AND workshop_id = ?',
      [req.user.id, workshopId]
    );

    if (existingGrades.length > 0) {
      return res.status(400).json({ message: 'Ya has presentado este taller anteriormente. Solo se permite un intento.' });
    }

    const attemptNumber = 1; // Always first attempt since we block multiple attempts

    // Save grade
    await pool.execute(
      'INSERT INTO workshop_grades (student_id, workshop_id, score, max_score, percentage, attempt_number) VALUES (?, ?, ?, ?, ?, ?)',
      [req.user.id, workshopId, score, maxScore, percentage, attemptNumber]
    );

    res.json({
      message: 'Workshop completed successfully',
      score,
      maxScore,
      percentage,
      attemptNumber,
      results
    });
  } catch (error) {
    console.error('Submit workshop error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;