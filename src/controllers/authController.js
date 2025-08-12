const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { AppError, catchAsync, ApiResponse } = require('../utils/responseHandler');
const db = require('../config/database');
const logger = require('../config/logger');

/**
 * Generate JWT token
 */
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '30d'
  });
};

/**
 * Register a new user
 * POST /api/auth/register
 */
const register = catchAsync(async (req, res, next) => {
  const { email, password, username } = req.body;
  
  // Validate input
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  
  // Check if user already exists
  const existingUser = await db.query(
    'SELECT * FROM users WHERE email = ? OR username = ?',
    [email, username]
  );
  
  if (existingUser && existingUser.length > 0) {
    return next(new AppError('User already exists with that email or username', 400));
  }
  
  // Hash password
  const hashedPassword = await hashPassword(password);
  
  // Generate unique ID
  const userId = uuidv4();
  
  // Create user
  await db.query(
    `INSERT INTO users (id, email, username, password) 
     VALUES (?, ?, ?, ?)`,
    [userId, email, username || email.split('@')[0], hashedPassword]
  );
  
  // Generate token
  const token = generateToken(userId);
  
  // Get user without password
  const newUser = await db.query(
    'SELECT id, email, username, created_at FROM users WHERE id = ?',
    [userId]
  );
  
  res.status(201).json(new ApiResponse(201, 'User registered successfully', {
    user: newUser[0],
    token
  }));
});

/**
 * Login user
 * POST /api/auth/login
 */
const login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;
  
  // Validate input
  if (!email || !password) {
    return next(new AppError('Please provide email and password', 400));
  }
  
  // Get user
  const users = await db.query(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  
  if (!users || users.length === 0) {
    return next(new AppError('Invalid email or password', 401));
  }
  
  const user = users[0];
  
  // Check password
  const isPasswordCorrect = await verifyPassword(password, user.password);
  
  if (!isPasswordCorrect) {
    return next(new AppError('Invalid email or password', 401));
  }
  
  // Generate token
  const token = generateToken(user.id);
  
  // Remove password from response
  delete user.password;
  
  res.status(200).json(new ApiResponse(200, 'Login successful', {
    user,
    token
  }));
});

/**
 * Get current user profile
 * GET /api/auth/me
 */
const getCurrentUser = catchAsync(async (req, res, next) => {
  res.status(200).json(new ApiResponse(200, 'User profile fetched successfully', {
    user: req.user
  }));
});

/**
 * Update user password
 * PATCH /api/auth/update-password
 */
const updatePassword = catchAsync(async (req, res, next) => {
  const { currentPassword, newPassword } = req.body;
  
  // Validate input
  if (!currentPassword || !newPassword) {
    return next(new AppError('Please provide current and new password', 400));
  }
  
  // Get user with password
  const users = await db.query(
    'SELECT * FROM users WHERE id = ?',
    [req.user.id]
  );
  
  if (!users || users.length === 0) {
    return next(new AppError('User not found', 404));
  }
  
  // Check current password
  const isPasswordCorrect = await verifyPassword(currentPassword, users[0].password);
  
  if (!isPasswordCorrect) {
    return next(new AppError('Current password is incorrect', 401));
  }
  
  // Hash new password
  const hashedPassword = await hashPassword(newPassword);
  
  // Update password
  await db.query(
    `UPDATE users SET password = ?, password_changed_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [hashedPassword, req.user.id]
  );
  
  // Generate new token
  const token = generateToken(req.user.id);
  
  res.status(200).json(new ApiResponse(200, 'Password updated successfully', { token }));
});

/**
 * Request password reset
 * POST /api/auth/forgot-password
 */
const forgotPassword = catchAsync(async (req, res, next) => {
  const { email } = req.body;
  
  if (!email) {
    return next(new AppError('Please provide an email address', 400));
  }
  
  // Check if user exists
  const users = await db.query(
    'SELECT * FROM users WHERE email = ?',
    [email]
  );
  
  if (!users || users.length === 0) {
    // Don't reveal that the user doesn't exist
    return res.status(200).json(
      new ApiResponse(200, 'If the email exists, a password reset link will be sent')
    );
  }
  
  // Generate reset token
  const resetToken = crypto.randomBytes(32).toString('hex');
  const passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');
  
  const passwordResetExpires = new Date(
    Date.now() + 15 * 60 * 1000 // 15 minutes
  );
  
  // Save to database
  await db.query(
    `UPDATE users 
     SET password_reset_token = ?, password_reset_expires = ? 
     WHERE id = ?`,
    [passwordResetToken, passwordResetExpires, users[0].id]
  );
  
  // Send email with reset URL (implementation would be in emailService)
  const resetURL = `${process.env.CLIENT_URL}/reset-password/${resetToken}`;
  
  try {
    // Here we would call the email service to send the reset email
    logger.info(`Password reset link for ${email}: ${resetURL}`);
    
    res.status(200).json(
      new ApiResponse(200, 'Password reset link sent to email', { resetURL })
    );
  } catch (error) {
    // If sending email fails, reset the token
    await db.query(
      `UPDATE users 
       SET password_reset_token = NULL, password_reset_expires = NULL 
       WHERE id = ?`,
      [users[0].id]
    );
    
    logger.error(`Error sending password reset email: ${error.message}`);
    return next(new AppError('Error sending password reset email. Please try again later.', 500));
  }
});

/**
 * Reset password using token
 * POST /api/auth/reset-password/:token
 */
const resetPassword = catchAsync(async (req, res, next) => {
  const { token } = req.params;
  const { password } = req.body;
  
  if (!password) {
    return next(new AppError('Please provide a new password', 400));
  }
  
  // Hash the token from the URL
  const hashedToken = crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
  
  // Find user with valid token
  const users = await db.query(
    `SELECT * FROM users 
     WHERE password_reset_token = ? AND password_reset_expires > ?`,
    [hashedToken, new Date()]
  );
  
  if (!users || users.length === 0) {
    return next(new AppError('Token is invalid or has expired', 400));
  }
  
  // Update password
  const hashedPassword = await hashPassword(password);
  
  await db.query(
    `UPDATE users 
     SET 
       password = ?, 
       password_reset_token = NULL, 
       password_reset_expires = NULL,
       password_changed_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [hashedPassword, users[0].id]
  );
  
  // Generate new JWT
  const newToken = generateToken(users[0].id);
  
  res.status(200).json(
    new ApiResponse(200, 'Password has been reset successfully', { token: newToken })
  );
});

/**
 * Helper function to hash password
 */
const hashPassword = async (password) => {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
};

/**
 * Helper function to verify password
 */
const verifyPassword = async (password, hash) => {
  return new Promise((resolve, reject) => {
    const [salt, key] = hash.split(':');
    crypto.pbkdf2(password, salt, 1000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(key === derivedKey.toString('hex'));
    });
  });
};

module.exports = {
  register,
  login,
  getCurrentUser,
  updatePassword,
  forgotPassword,
  resetPassword
};