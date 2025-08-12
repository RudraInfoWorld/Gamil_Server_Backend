const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const fs = require('fs');
const path = require('path');
const { configDotenv } = require('dotenv');

configDotenv();

// Import configuration
const logger = require('./src/config/logger');
const db = require('./src/config/database');
const { globalErrorHandler, AppError } = require('./src/utils/responseHandler');

// Import routes
const authRoutes = require('./src/routes/authRoutes');
const emailRoutes = require('./src/routes/emailRoutes');

// Initialize Express app
const app = express();

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create public directory for tracking pixel images
const publicDir = path.join(__dirname, 'public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

const trackingDir = path.join(publicDir, 'tracking');
if (!fs.existsSync(trackingDir)) {
  fs.mkdirSync(trackingDir, { recursive: true });
}

// Middleware
app.use(
  cors({
    origin: process.env.CLIENT_URL || '*',
    credentials: true,
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies
app.use(morgan('combined', { stream: logger.stream })); // HTTP request logging

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/email', emailRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'UP',
    timestamp: new Date(),
    service: 'gmail-server-backend',
  });
});

// Handle unknown routes
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server`, 404));
});

// Global error handler middleware
app.use(globalErrorHandler);

// Start the server
const PORT = process.env.PORT || 3000;
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await db.testConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Setup database tables
    await db.setupDatabase();

    // Start listening for requests
    const server = app.listen(PORT, () => {
      logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (err) => {
      logger.error(`Unhandled Rejection: ${err.message}`);
      logger.error(err.stack);
      // Close server & exit process
      server.close(() => process.exit(1));
    });

  } catch (error) {
    logger.error(`Failed to start server: ${error.message}`);
    process.exit(1);
  }
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error(`Uncaught Exception: ${err.message}`);
  logger.error(err.stack);
  // Exit process
  process.exit(1);
});

// Initialize server
startServer();