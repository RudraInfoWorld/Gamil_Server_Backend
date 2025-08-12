const jwt = require('jsonwebtoken');
const { AppError } = require('../utils/responseHandler');
const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Middleware to authenticate requests using JWT
 */
const authMiddleware = async (req, res, next) => {
  try {
    // 1) Check if token exists in headers
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Authentication required. Please login.', 401));
    }
    
    const token = authHeader.split(' ')[1];
    
    // 2) Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        return next(new AppError('Your token has expired. Please login again.', 401));
      }
      return next(new AppError('Invalid token. Please login again.', 401));
    }
    
    // 3) Check if user still exists
    const user = await db.query('SELECT * FROM users WHERE id = ?', [decoded.id]);
    
    if (!user || user.length === 0) {
      return next(new AppError('The user belonging to this token no longer exists.', 401));
    }
    
    // 4) Check if user changed password after token was issued
    if (user[0].password_changed_at) {
      const changedTimestamp = parseInt(
        new Date(user[0].password_changed_at).getTime() / 1000,
        10
      );
      
      if (decoded.iat < changedTimestamp) {
        return next(new AppError('User recently changed password. Please login again.', 401));
      }
    }
    
    // 5) Grant access to protected route
    req.user = user[0];
    next();
  } catch (error) {
    logger.error(`Auth middleware error: ${error.message}`);
    next(new AppError('Authentication failed', 500));
  }
};

module.exports = authMiddleware;