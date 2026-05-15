const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const promisePool = pool.promise();

const createDatabase = async () => {
  try {
    const connection = mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });

    await connection.promise().execute(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    console.log('Database created or already exists');
    connection.end();
  } catch (error) {
    console.error('Error creating database:', error);
  }
};

const createTables = async () => {
  try {
    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role ENUM('admin', 'formador', 'estudiante') NOT NULL,
        profile_image VARCHAR(500) NULL,
        bio TEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS activities (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        course_id INT NOT NULL,
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS activity_content_blocks (
        id INT AUTO_INCREMENT PRIMARY KEY,
        activity_id INT NOT NULL,
        block_type ENUM('text', 'image', 'video') NOT NULL,
        content_text TEXT,
        content_url VARCHAR(500),
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS workshops (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        activity_id INT NOT NULL,
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workshop_id INT NOT NULL,
        question TEXT NOT NULL,
        option_a_image VARCHAR(500),
        option_b_image VARCHAR(500),
        option_c_image VARCHAR(500),
        option_d_image VARCHAR(500),
        correct_answer ENUM('A', 'B', 'C', 'D') NOT NULL,
        points INT DEFAULT 1,
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        activity_id INT NOT NULL,
        total_questions INT DEFAULT 0,
        passing_score INT DEFAULT 70,
        max_attempts INT DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
      )
    `);

    // Add max_attempts column to existing quizzes table if it doesn't exist
    await promisePool.execute(`
      ALTER TABLE quizzes ADD COLUMN IF NOT EXISTS max_attempts INT DEFAULT 1
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS quiz_questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id INT NOT NULL,
        question TEXT NOT NULL,
        options JSON NOT NULL,
        correct_answer INT NOT NULL,
        points INT DEFAULT 1,
        order_index INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS course_assignments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        course_id INT NOT NULL,
        student_id INT NOT NULL,
        assigned_by INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_assignment (course_id, student_id)
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS student_formador (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        formador_id INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (formador_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_student_formador (student_id, formador_id)
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS grades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        quiz_id INT NOT NULL,
        score DECIMAL(5,2) NOT NULL,
        max_score DECIMAL(5,2) NOT NULL,
        percentage DECIMAL(5,2) NOT NULL,
        attempt_number INT DEFAULT 1,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_grades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        workshop_id INT NOT NULL,
        score DECIMAL(5,2) NOT NULL,
        max_score DECIMAL(5,2) NOT NULL,
        percentage DECIMAL(5,2) NOT NULL,
        student_answers JSON,
        attempt_number INT DEFAULT 1,
        completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE
      )
    `);

    // Add student_answers column to existing workshop_grades table if it doesn't exist
    await promisePool.execute(`
      ALTER TABLE workshop_grades ADD COLUMN IF NOT EXISTS student_answers JSON
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS activity_progress (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        activity_id INT NOT NULL,
        completed BOOLEAN DEFAULT FALSE,
        completed_at TIMESTAMP NULL,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE,
        UNIQUE KEY unique_progress (student_id, activity_id)
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS satisfaction_surveys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        course_id INT NOT NULL,
        overall_rating INT NOT NULL CHECK (overall_rating >= 1 AND overall_rating <= 5),
        content_quality INT NOT NULL CHECK (content_quality >= 1 AND content_quality <= 5),
        instructor_rating INT NOT NULL CHECK (instructor_rating >= 1 AND instructor_rating <= 5),
        difficulty_level INT NOT NULL CHECK (difficulty_level >= 1 AND difficulty_level <= 5),
        comments TEXT,
        would_recommend BOOLEAN DEFAULT TRUE,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        UNIQUE KEY unique_survey (student_id, course_id)
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS formador_courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        formador_id INT NOT NULL,
        course_id INT NOT NULL,
        assigned_by INT NOT NULL,
        assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (formador_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_formador_course (formador_id, course_id)
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS quiz_retake_grants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id INT NOT NULL,
        student_id INT NOT NULL,
        granted_by INT NOT NULL,
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_grant (quiz_id, student_id)
      )
    `);

    await promisePool.execute(`
      CREATE TABLE IF NOT EXISTS general_satisfaction_surveys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        overall_experience INT NOT NULL CHECK (overall_experience >= 1 AND overall_experience <= 5),
        content_quality INT NOT NULL CHECK (content_quality >= 1 AND content_quality <= 5),
        platform_usability INT NOT NULL CHECK (platform_usability >= 1 AND platform_usability <= 5),
        formador_support INT NOT NULL CHECK (formador_support >= 1 AND formador_support <= 5),
        time_management INT NOT NULL CHECK (time_management >= 1 AND time_management <= 5),
        would_recommend BOOLEAN DEFAULT TRUE,
        comments TEXT,
        suggestions TEXT,
        submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_general_survey (student_id)
      )
    `);

    console.log('All tables created successfully');
  } catch (error) {
    console.error('Error creating tables:', error);
  }
};

const initializeDatabase = async () => {
  await createDatabase();
  await createTables();
};

module.exports = { pool: promisePool, initializeDatabase };