const mysql = require('mysql2/promise');
const logger = require('./logger');

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Test database connection
const testConnection = async () => {
  try {
    const connection = await pool.getConnection();
    logger.info('Database connection established successfully');
    connection.release();
    return true;
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    return false;
  }
};

// Execute SQL query
const query = async (sql, params) => {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    logger.error(`Database query error: ${error.message}`);
    logger.error(`SQL: ${sql}`);
    logger.error(`Params: ${JSON.stringify(params)}`);
    throw error;
  }
};

// Execute transaction
const transaction = async (callback) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    logger.error(`Transaction error: ${error.message}`);
    throw error;
  } finally {
    connection.release();
  }
};

// Setup database - create tables if they don't exist
const setupDatabase = async () => {
  try {
    // Users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        phone VARCHAR(20) UNIQUE,
        email VARCHAR(255) UNIQUE,
        username VARCHAR(50) UNIQUE,
        password VARCHAR(255),
        bio TEXT,
        profile_picture VARCHAR(255),
        pic_id VARCHAR(36),
        is_admin BOOLEAN DEFAULT FALSE,
        interests JSON,
        vibe_preference VARCHAR(50),
        account_status ENUM('active', 'ghost', 'private', 'deleted') DEFAULT 'active',
        mode_preference ENUM('light', 'dark', 'party') DEFAULT 'light',
        auth_provider ENUM('local', 'google', 'apple') DEFAULT 'local',
        auth_provider_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    logger.info('Database setup completed successfully');
  } catch (error) {
    logger.error(`Database setup error: ${error.message}`);
    throw error;
  }
};

module.exports = {
  query,
  transaction,
  testConnection,
  setupDatabase,
};
