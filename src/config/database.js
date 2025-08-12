const logger = require('./logger');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Create database directory if it doesn't exist
const dbDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'gmail_server.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error(`Error opening database: ${err.message}`);
  } else {
    logger.info(`Connected to SQLite database at ${dbPath}`);
  }
});

// Promisify database operations
const runAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        logger.error(`Database error: ${err.message}`);
        logger.error(`SQL: ${sql}`);
        logger.error(`Params: ${JSON.stringify(params)}`);
        return reject(err);
      }
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
};

const getAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        logger.error(`Database error: ${err.message}`);
        logger.error(`SQL: ${sql}`);
        logger.error(`Params: ${JSON.stringify(params)}`);
        return reject(err);
      }
      resolve(row);
    });
  });
};

const allAsync = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        logger.error(`Database error: ${err.message}`);
        logger.error(`SQL: ${sql}`);
        logger.error(`Params: ${JSON.stringify(params)}`);
        return reject(err);
      }
      resolve(rows);
    });
  });
};

// Test database connection
const testConnection = async () => {
  try {
    await runAsync('SELECT 1');
    logger.info('Database connection established successfully');
    return true;
  } catch (error) {
    logger.error(`Database connection failed: ${error.message}`);
    return false;
  }
};

// Execute SQL query - Adapter for SQLite
const query = async (sql, params = []) => {
  // Convert MySQL queries to SQLite format
  let sqliteSql = sql
    .replace(/`/g, '"')  // Replace backticks with double quotes
    .replace(/AUTO_INCREMENT/g, 'AUTOINCREMENT') // Fix autoincrement syntax
    .replace(/CURRENT_TIMESTAMP/g, "datetime('now')") // Fix timestamp
    
    // Handle MySQL JSON data type
    .replace(/JSON/g, 'TEXT')
    
    // Handle INSERT ... ON DUPLICATE KEY UPDATE
    .replace(/ON DUPLICATE KEY UPDATE/g, 'ON CONFLICT(id) DO UPDATE SET');

  // Handle ENUM type
  const enumRegex = /ENUM\([^)]+\)/g;
  if (enumRegex.test(sqliteSql)) {
    sqliteSql = sqliteSql.replace(enumRegex, 'TEXT');
  }

  try {
    // For SELECT queries
    if (sqliteSql.trim().toUpperCase().startsWith('SELECT')) {
      return await allAsync(sqliteSql, params);
    }
    
    // For INSERT, UPDATE, DELETE
    const result = await runAsync(sqliteSql, params);
    return result;
  } catch (error) {
    logger.error(`Database query error: ${error.message}`);
    throw error;
  }
};

// Execute transaction
const transaction = async (callback) => {
  try {
    await runAsync('BEGIN TRANSACTION');
    const result = await callback(db);
    await runAsync('COMMIT');
    return result;
  } catch (error) {
    await runAsync('ROLLBACK');
    logger.error(`Transaction error: ${error.message}`);
    throw error;
  }
};

// Load SQL file and execute it
const executeSqlFile = async (filePath) => {
  try {
    const sqlContent = fs.readFileSync(filePath, 'utf8')
      .replace(/`/g, '"')  // Replace backticks with double quotes
      .replace(/AUTO_INCREMENT/g, 'AUTOINCREMENT') // Fix autoincrement syntax
      .replace(/CURRENT_TIMESTAMP/g, "datetime('now')") // Fix timestamp
      .replace(/JSON/g, 'TEXT'); // Handle MySQL JSON data type
    
    // Split by semicolons but ignore semicolons in quotes or parentheses
    const statements = [];
    let currentStmt = '';
    let inQuote = false;
    let quoteChar = '';
    let depth = 0;
    
    for (let i = 0; i < sqlContent.length; i++) {
      const char = sqlContent[i];
      
      if ((char === "'" || char === '"') && (i === 0 || sqlContent[i - 1] !== '\\')) {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
        }
      } else if (char === '(' && !inQuote) {
        depth++;
      } else if (char === ')' && !inQuote) {
        depth--;
      } else if (char === ';' && !inQuote && depth === 0) {
        currentStmt = currentStmt.trim();
        if (currentStmt) {
          statements.push(currentStmt);
        }
        currentStmt = '';
        continue;
      }
      
      currentStmt += char;
    }
    
    // Add the last statement if it exists
    currentStmt = currentStmt.trim();
    if (currentStmt) {
      statements.push(currentStmt);
    }

    // Execute each statement
    for (const statement of statements) {
      // Skip empty statements and comments
      if (!statement.trim() || statement.trim().startsWith('--')) {
        continue;
      }
      
      // Handle ENUM types
      let stmt = statement;
      const enumRegex = /ENUM\(([^)]+)\)/g;
      if (enumRegex.test(stmt)) {
        stmt = stmt.replace(enumRegex, 'TEXT');
      }
      
      await runAsync(stmt);
    }
    
    logger.info(`Executed SQL file: ${filePath}`);
    return true;
  } catch (error) {
    logger.error(`Error executing SQL file ${filePath}: ${error.message}`);
    return false;
  }
};

// Setup database - create tables if they don't exist
const setupDatabase = async () => {
  try {
    // Create users table first with SQLite syntax
    await runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE,
        email TEXT UNIQUE,
        username TEXT UNIQUE,
        password TEXT,
        bio TEXT,
        profile_picture TEXT,
        pic_id TEXT,
        is_admin INTEGER DEFAULT 0,
        interests TEXT,
        vibe_preference TEXT,
        account_status TEXT DEFAULT 'active',
        mode_preference TEXT DEFAULT 'light',
        auth_provider TEXT DEFAULT 'local',
        auth_provider_id TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Execute all migration SQL files with SQLite syntax adaptations
    const migrationsDir = path.join(__dirname, '../migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter(file => file.endsWith('.sql'));
      
      for (const file of files) {
        await executeSqlFile(path.join(migrationsDir, file));
      }
    }

    logger.info('Database setup completed successfully');
  } catch (error) {
    logger.error(`Database setup error: ${error.message}`);
    throw error;
  }
};

// Close database connection
const close = () => {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) {
        logger.error(`Error closing database: ${err.message}`);
        return reject(err);
      }
      logger.info('Database connection closed');
      resolve();
    });
  });
};

module.exports = {
  query,
  transaction,
  testConnection,
  setupDatabase,
  close
};