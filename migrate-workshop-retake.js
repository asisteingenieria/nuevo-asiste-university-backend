const { pool } = require('./config/database');

async function migrate() {
  try {
    console.log('Running workshop retake migration...');

    await pool.execute(`
      ALTER TABLE workshops
      ADD COLUMN IF NOT EXISTS max_attempts INT DEFAULT 1
    `).catch(() =>
      pool.execute(`
        ALTER TABLE workshops ADD COLUMN max_attempts INT DEFAULT 1
      `).catch(e => {
        if (e.code === 'ER_DUP_FIELDNAME') console.log('Column max_attempts already exists, skipping.');
        else throw e;
      })
    );
    console.log('✓ max_attempts column added to workshops');

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS workshop_retake_grants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        workshop_id INT NOT NULL,
        student_id INT NOT NULL,
        granted_by INT NOT NULL,
        granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY unique_grant (workshop_id, student_id),
        FOREIGN KEY (workshop_id) REFERENCES workshops(id) ON DELETE CASCADE,
        FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (granted_by) REFERENCES users(id)
      )
    `);
    console.log('✓ workshop_retake_grants table created');

    console.log('Migration completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
