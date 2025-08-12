const logger = require('../config/logger');

/**
 * Custom error handler class for API errors
 * Extends the built-in Error class with additional properties
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true; // Operational errors are expected errors

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Creates a custom error for async error handling in routes
 * @param {Function} fn - The async function to catch errors from
 * @returns {Function} - Express middleware function
 */
const catchAsync = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

/**
 * API response standard structure
 * Used to wrap all successful and failed responses
 */
class ApiResponse {
  constructor(statusCode, message = 'Success', data) {
    this.statusCode = statusCode;
    this.message = message;
    this.data = data;
    this.success = statusCode < 400; // Indicates if the response is a success based on status code
  }
}

/**
 * Global error handling middleware for Express
 */
const globalErrorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  const status = err.status || 'error';
  const isDev = process.env.NODE_ENV === 'development';

  // Log the error
  logger.error(`${err.name}: ${err.message}`);
  logger.error(err.stack);

  // If the error is not operational, hide details in production
  const message = err.isOperational ? err.message : 'Something went very wrong!';

  res.status(statusCode).json({
    status,
    message,
    ...(isDev && { stack: err.stack }),
  });
};

module.exports = {
  AppError,
  catchAsync,
  ApiResponse,
  globalErrorHandler,
};
