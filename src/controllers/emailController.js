const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const { AppError, catchAsync, ApiResponse } = require('../utils/responseHandler');
const emailService = require('../services/emailService');
const db = require('../config/database');

/**
 * Send a single email
 * POST /api/email/send
 */
const sendEmail = catchAsync(async (req, res, next) => {
  const {
    to, cc, bcc, subject, text, html, attachments,
    enableTracking, templateId, credentialId
  } = req.body;
  
  // Validate required fields
  if (!to) {
    return next(new AppError('Recipient email address is required', 400));
  }
  
  if (!subject) {
    return next(new AppError('Email subject is required', 400));
  }
  
  if (!text && !html) {
    return next(new AppError('Either text or HTML content is required', 400));
  }
  
  // Get credentials from database or use default
  const credentials = await getCredentials(credentialId, req.user.id);
  if (!credentials) {
    return next(new AppError('Email credentials not found', 404));
  }
  
  // Send email
  const result = await emailService.sendEmail(credentials, {
    to,
    cc,
    bcc,
    subject,
    text,
    html,
    attachments,
    enableTracking,
    templateId
  });
  
  res.status(200).json(new ApiResponse(200, 'Email sent successfully', result));
});

/**
 * Send bulk emails
 * POST /api/email/send-bulk
 */
const sendBulkEmails = catchAsync(async (req, res, next) => {
  const {
    recipients, subject, text, html, attachments, 
    enableTracking, templateId, credentialId
  } = req.body;
  
  // Validate required fields
  if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
    return next(new AppError('Valid recipients array is required', 400));
  }
  
  if (!subject) {
    return next(new AppError('Email subject is required', 400));
  }
  
  if (!text && !html) {
    return next(new AppError('Either text or HTML content is required', 400));
  }
  
  // Get credentials from database or use default
  const credentials = await getCredentials(credentialId, req.user.id);
  if (!credentials) {
    return next(new AppError('Email credentials not found', 404));
  }
  
  // Create a campaign ID for tracking
  const campaignId = uuidv4();
  
  // Send bulk emails
  const result = await emailService.sendBulkEmails(
    credentials,
    recipients,
    {
      subject,
      text,
      html,
      attachments,
      enableTracking,
      templateId
    },
    campaignId
  );
  
  res.status(200).json(new ApiResponse(
    200, 
    `Emails sent: ${result.totalSent}, Failed: ${result.totalFailed}`,
    { ...result, campaignId }
  ));
});

/**
 * Track email opens
 * GET /api/email/track/:trackingId
 */
const trackEmailOpen = catchAsync(async (req, res, next) => {
  const { trackingId } = req.params;
  
  // Get IP and user agent
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.get('User-Agent') || '';
  
  // Update tracking information
  await emailService.updateEmailTracking(trackingId, ipAddress, userAgent);
  
  // Return a 1x1 transparent pixel
  const trackingPixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
  res.writeHead(200, {
    'Content-Type': 'image/gif',
    'Content-Length': trackingPixel.length
  });
  
  res.end(trackingPixel);
});

/**
 * Get email campaign statistics
 * GET /api/email/campaigns/:campaignId/stats
 */
const getCampaignStats = catchAsync(async (req, res, next) => {
  const { campaignId } = req.params;
  
  const stats = await emailService.getCampaignStats(campaignId);
  
  if (stats.error) {
    return next(new AppError(stats.error, 404));
  }
  
  res.status(200).json(new ApiResponse(200, 'Campaign statistics retrieved', stats));
});

/**
 * Get all email campaigns
 * GET /api/email/campaigns
 */
const getAllCampaigns = catchAsync(async (req, res, next) => {
  const campaigns = await db.query(`
    SELECT 
      c.*,
      (SELECT COUNT(*) FROM emails WHERE campaign_id = c.id) as total_emails,
      (SELECT COUNT(*) FROM emails WHERE campaign_id = c.id AND status = 'opened') as opened_emails
    FROM email_campaigns c
    WHERE c.sender IN (
      SELECT email FROM email_credentials WHERE user_id = ?
    )
    ORDER BY c.created_at DESC
  `, [req.user.id]);
  
  res.status(200).json(new ApiResponse(200, 'Campaigns retrieved successfully', campaigns));
});

/**
 * Get email templates
 * GET /api/email/templates
 */
const getEmailTemplates = catchAsync(async (req, res, next) => {
  const templates = await emailService.getEmailTemplates(req.user.id);
  
  res.status(200).json(new ApiResponse(200, 'Email templates retrieved', templates));
});

/**
 * Create or update email template
 * POST /api/email/templates
 */
const saveEmailTemplate = catchAsync(async (req, res, next) => {
  const { name, subject, html, text, isPublic, id } = req.body;
  
  // Validate required fields
  if (!name || !subject) {
    return next(new AppError('Template name and subject are required', 400));
  }
  
  if (!html && !text) {
    return next(new AppError('Either HTML or text content is required', 400));
  }
  
  const templateId = await emailService.saveEmailTemplate({
    id,
    name,
    subject,
    html,
    text,
    userId: req.user.id,
    isPublic: isPublic || false
  });
  
  res.status(200).json(new ApiResponse(
    200, 
    id ? 'Email template updated' : 'Email template created', 
    { templateId }
  ));
});

/**
 * Delete email template
 * DELETE /api/email/templates/:templateId
 */
const deleteEmailTemplate = catchAsync(async (req, res, next) => {
  const { templateId } = req.params;
  
  // Check if template exists and belongs to user
  const template = await db.query(`
    SELECT * FROM email_templates WHERE id = ? AND user_id = ?
  `, [templateId, req.user.id]);
  
  if (template.length === 0) {
    return next(new AppError('Template not found or unauthorized', 404));
  }
  
  // Delete template
  await db.query(`DELETE FROM email_templates WHERE id = ?`, [templateId]);
  
  res.status(200).json(new ApiResponse(200, 'Email template deleted successfully'));
});

/**
 * Save email credentials
 * POST /api/email/credentials
 */
const saveEmailCredentials = catchAsync(async (req, res, next) => {
  const {
    email, provider, clientId, clientSecret, refreshToken, accessToken,
    redirectUri, isDefault
  } = req.body;
  
  // Validate required fields
  if (!email || !provider) {
    return next(new AppError('Email address and provider are required', 400));
  }
  
  if (provider === 'gmail' && (!clientId || !clientSecret || !refreshToken)) {
    return next(new AppError('OAuth2 credentials are required for Gmail', 400));
  }
  
  // If setting as default, update all others to non-default
  if (isDefault) {
    await db.query(`
      UPDATE email_credentials SET is_default = FALSE 
      WHERE user_id = ? AND provider = ?
    `, [req.user.id, provider]);
  }
  
  // Check if credentials already exist
  const existingCreds = await db.query(`
    SELECT id FROM email_credentials WHERE user_id = ? AND email = ? AND provider = ?
  `, [req.user.id, email, provider]);
  
  let credentialId;
  
  if (existingCreds.length > 0) {
    // Update existing credentials
    credentialId = existingCreds[0].id;
    
    await db.query(`
      UPDATE email_credentials 
      SET 
        client_id = ?,
        client_secret = ?,
        refresh_token = ?,
        access_token = ?,
        redirect_uri = ?,
        is_default = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
      redirectUri,
      isDefault || false,
      credentialId
    ]);
  } else {
    // Create new credentials
    const result = await db.query(`
      INSERT INTO email_credentials (
        user_id, email, provider, client_id, client_secret, 
        refresh_token, access_token, redirect_uri, is_default
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      req.user.id,
      email,
      provider,
      clientId,
      clientSecret,
      refreshToken,
      accessToken,
      redirectUri,
      isDefault || false
    ]);
    
    credentialId = result.insertId;
  }
  
  res.status(200).json(new ApiResponse(
    200, 
    'Email credentials saved successfully', 
    { credentialId }
  ));
});

/**
 * Get email credentials
 * GET /api/email/credentials
 */
const getEmailCredentialsList = catchAsync(async (req, res, next) => {
  const credentials = await db.query(`
    SELECT 
      id, user_id, email, provider, redirect_uri, is_default, created_at, updated_at
    FROM email_credentials 
    WHERE user_id = ?
    ORDER BY is_default DESC, updated_at DESC
  `, [req.user.id]);
  
  // Remove sensitive data
  credentials.forEach(cred => {
    delete cred.client_id;
    delete cred.client_secret;
    delete cred.refresh_token;
    delete cred.access_token;
  });
  
  res.status(200).json(new ApiResponse(200, 'Credentials retrieved successfully', credentials));
});

/**
 * Delete email credentials
 * DELETE /api/email/credentials/:credentialId
 */
const deleteEmailCredentials = catchAsync(async (req, res, next) => {
  const { credentialId } = req.params;
  
  // Check if credentials exist and belong to user
  const credential = await db.query(`
    SELECT * FROM email_credentials WHERE id = ? AND user_id = ?
  `, [credentialId, req.user.id]);
  
  if (credential.length === 0) {
    return next(new AppError('Credentials not found or unauthorized', 404));
  }
  
  // Delete credentials
  await db.query(`DELETE FROM email_credentials WHERE id = ?`, [credentialId]);
  
  res.status(200).json(new ApiResponse(200, 'Email credentials deleted successfully'));
});

/**
 * Helper function to get credentials from database
 */
const getCredentials = async (credentialId, userId) => {
  let query = `
    SELECT * FROM email_credentials 
    WHERE user_id = ? 
  `;
  
  const params = [userId];
  
  if (credentialId) {
    query += ` AND id = ?`;
    params.push(credentialId);
  } else {
    query += ` AND is_default = TRUE`;
  }
  
  query += ` LIMIT 1`;
  
  const credentials = await db.query(query, params);
  
  if (credentials.length === 0) {
    return null;
  }
  
  return {
    email: credentials[0].email,
    clientId: credentials[0].client_id,
    clientSecret: credentials[0].client_secret,
    refreshToken: credentials[0].refresh_token,
    accessToken: credentials[0].access_token,
    redirectUri: credentials[0].redirect_uri
  };
};

module.exports = {
  sendEmail,
  sendBulkEmails,
  trackEmailOpen,
  getCampaignStats,
  getAllCampaigns,
  getEmailTemplates,
  saveEmailTemplate,
  deleteEmailTemplate,
  saveEmailCredentials,
  getEmailCredentialsList,
  deleteEmailCredentials
};