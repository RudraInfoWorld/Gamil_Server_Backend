const nodemailer = require('nodemailer');
const { google } = require('googleapis');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const logger = require('../config/logger');
const db = require('../config/database');

// Create a tracking pixel directory if it doesn't exist
const trackingDir = path.join(__dirname, '../../public/tracking');
if (!fs.existsSync(trackingDir)) {
  fs.mkdirSync(trackingDir, { recursive: true });
}

/**
 * Create OAuth2 client for Gmail authentication
 */
const createOAuth2Client = (credentials) => {
  const { clientId, clientSecret, refreshToken, redirectUri } = credentials;
  const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  
  oAuth2Client.setCredentials({
    refresh_token: refreshToken
  });
  
  return oAuth2Client;
};

/**
 * Create a transporter using OAuth2 authentication
 */
const createTransporter = async (credentials) => {
  try {
    const oauth2Client = createOAuth2Client(credentials);
    const accessToken = await oauth2Client.getAccessToken();
    
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type: 'OAuth2',
        user: credentials.email,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        refreshToken: credentials.refreshToken,
        accessToken: accessToken.token
      }
    });
  } catch (error) {
    logger.error(`Error creating transporter: ${error.message}`);
    throw new Error('Failed to create email transporter');
  }
};

/**
 * Generate tracking ID and HTML pixel for email tracking
 */
const generateTrackingPixel = (emailId) => {
  const trackingId = uuidv4();
  const pixelPath = `/tracking/${trackingId}.png`;
  const trackingPixelHtml = `<img src="${process.env.API_URL || 'http://localhost:3000'}/api/email/track/${trackingId}" width="1" height="1" />`;
  
  // Create an empty tracking pixel file
  fs.writeFileSync(path.join(trackingDir, `${trackingId}.png`), '');
  
  return { trackingId, trackingPixelHtml };
};

/**
 * Save email details in database
 */
const saveEmailToDB = async (emailDetails) => {
  try {
    const { 
      messageId, 
      sender, 
      recipient, 
      subject, 
      trackingId, 
      status, 
      templateId, 
      campaignId 
    } = emailDetails;
    
    const result = await db.query(`
      INSERT INTO emails (
        message_id, 
        sender, 
        recipient, 
        subject, 
        tracking_id, 
        status, 
        template_id, 
        campaign_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [messageId, sender, recipient, subject, trackingId, status, templateId, campaignId]);
    
    return result.insertId;
  } catch (error) {
    logger.error(`Error saving email to DB: ${error.message}`);
    // We don't throw the error here to avoid disrupting the email sending flow
  }
};

/**
 * Update email tracking information
 */
const updateEmailTracking = async (trackingId, ipAddress, userAgent) => {
  try {
    // Record open event
    await db.query(`
      INSERT INTO email_events (
        tracking_id, 
        event_type, 
        ip_address, 
        user_agent
      ) VALUES (?, ?, ?, ?)
    `, [trackingId, 'open', ipAddress, userAgent]);
    
    // Update email status
    await db.query(`
      UPDATE emails 
      SET status = 'opened', opened_at = CURRENT_TIMESTAMP 
      WHERE tracking_id = ? AND status = 'delivered'
    `, [trackingId]);
    
    return true;
  } catch (error) {
    logger.error(`Error updating email tracking: ${error.message}`);
    return false;
  }
};

/**
 * Send a single email
 */
const sendEmail = async (credentials, emailOptions) => {
  try {
    const transporter = await createTransporter(credentials);
    
    // Generate tracking pixel if tracking is enabled
    let trackingId = null;
    let htmlContent = emailOptions.html || '';
    
    if (emailOptions.enableTracking !== false) {
      const tracking = generateTrackingPixel();
      trackingId = tracking.trackingId;
      
      // Append tracking pixel to HTML content
      if (htmlContent) {
        htmlContent = htmlContent + tracking.trackingPixelHtml;
      } else {
        // Create HTML version from text if HTML not provided
        htmlContent = emailOptions.text ? 
          `<div>${emailOptions.text.replace(/\n/g, '<br>')}</div>${tracking.trackingPixelHtml}` : 
          tracking.trackingPixelHtml;
      }
    }
    
    // Prepare email data
    const mailOptions = {
      from: emailOptions.from || credentials.email,
      to: emailOptions.to,
      cc: emailOptions.cc,
      bcc: emailOptions.bcc,
      subject: emailOptions.subject,
      text: emailOptions.text,
      html: htmlContent,
      attachments: emailOptions.attachments
    };
    
    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    // Save to database if tracking is enabled
    if (trackingId) {
      await saveEmailToDB({
        messageId: info.messageId,
        sender: mailOptions.from,
        recipient: mailOptions.to,
        subject: mailOptions.subject,
        trackingId,
        status: 'delivered',
        templateId: emailOptions.templateId,
        campaignId: emailOptions.campaignId
      });
    }
    
    return {
      messageId: info.messageId,
      trackingId,
      envelope: info.envelope,
      response: info.response
    };
  } catch (error) {
    logger.error(`Error sending email: ${error.message}`);
    throw new Error(`Failed to send email: ${error.message}`);
  }
};

/**
 * Send bulk emails
 */
const sendBulkEmails = async (credentials, recipients, emailTemplate, campaignId = null) => {
  const results = {
    successful: [],
    failed: []
  };
  
  // Start transaction for tracking the campaign
  if (campaignId) {
    await db.query(`
      INSERT INTO email_campaigns (
        id, 
        name, 
        sender, 
        status, 
        total_recipients
      ) VALUES (?, ?, ?, ?, ?)
    `, [campaignId, emailTemplate.subject, credentials.email, 'in_progress', recipients.length]);
  }
  
  for (const recipient of recipients) {
    try {
      // Customize email for recipient
      const personalizedSubject = replacePlaceholders(emailTemplate.subject, recipient);
      const personalizedText = emailTemplate.text ? replacePlaceholders(emailTemplate.text, recipient) : null;
      const personalizedHtml = emailTemplate.html ? replacePlaceholders(emailTemplate.html, recipient) : null;
      
      const result = await sendEmail(credentials, {
        to: recipient.email,
        subject: personalizedSubject,
        text: personalizedText,
        html: personalizedHtml,
        attachments: emailTemplate.attachments,
        enableTracking: emailTemplate.enableTracking,
        templateId: emailTemplate.templateId,
        campaignId
      });
      
      results.successful.push({
        email: recipient.email,
        messageId: result.messageId,
        trackingId: result.trackingId
      });
    } catch (error) {
      results.failed.push({
        email: recipient.email,
        error: error.message
      });
      
      logger.error(`Error sending to ${recipient.email}: ${error.message}`);
    }
  }
  
  // Update campaign status
  if (campaignId) {
    await db.query(`
      UPDATE email_campaigns 
      SET 
        status = 'completed', 
        sent_count = ?, 
        failed_count = ?,
        completed_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [results.successful.length, results.failed.length, campaignId]);
  }
  
  return {
    totalSent: results.successful.length,
    totalFailed: results.failed.length,
    successfulRecipients: results.successful,
    failedRecipients: results.failed
  };
};

/**
 * Replace placeholders in content with recipient data
 */
const replacePlaceholders = (content, recipientData) => {
  if (!content) return content;
  
  let result = content;
  
  // Replace all {{variable}} with corresponding values from recipientData
  const placeholderRegex = /\{\{([^}]+)\}\}/g;
  result = result.replace(placeholderRegex, (match, placeholder) => {
    const value = recipientData[placeholder.trim()];
    return value !== undefined ? value : match; // Return original if not found
  });
  
  return result;
};

/**
 * Get email tracking stats by campaign
 */
const getCampaignStats = async (campaignId) => {
  try {
    // Get overall stats
    const campaign = await db.query(`
      SELECT * FROM email_campaigns WHERE id = ?
    `, [campaignId]);
    
    if (campaign.length === 0) {
      return { error: 'Campaign not found' };
    }
    
    // Get detailed email stats
    const emails = await db.query(`
      SELECT 
        status,
        COUNT(*) as count,
        MIN(sent_at) as first_sent,
        MAX(opened_at) as last_opened
      FROM emails 
      WHERE campaign_id = ?
      GROUP BY status
    `, [campaignId]);
    
    // Get open rate over time
    const openRateOverTime = await db.query(`
      SELECT 
        DATE(e.opened_at) as date,
        COUNT(*) as opens
      FROM emails e
      JOIN email_events ev ON e.tracking_id = ev.tracking_id
      WHERE e.campaign_id = ? AND ev.event_type = 'open'
      GROUP BY DATE(e.opened_at)
      ORDER BY date
    `, [campaignId]);
    
    return {
      campaign: campaign[0],
      stats: {
        delivered: emails.find(s => s.status === 'delivered')?.count || 0,
        opened: emails.find(s => s.status === 'opened')?.count || 0,
        failed: emails.find(s => s.status === 'failed')?.count || 0,
      },
      openRateOverTime
    };
  } catch (error) {
    logger.error(`Error getting campaign stats: ${error.message}`);
    throw new Error('Failed to retrieve campaign statistics');
  }
};

/**
 * Get email templates from database
 */
const getEmailTemplates = async (userId) => {
  try {
    return await db.query(`
      SELECT * FROM email_templates 
      WHERE user_id = ? OR is_public = TRUE
      ORDER BY created_at DESC
    `, [userId]);
  } catch (error) {
    logger.error(`Error getting email templates: ${error.message}`);
    throw new Error('Failed to retrieve email templates');
  }
};

/**
 * Save email template to database
 */
const saveEmailTemplate = async (templateData) => {
  try {
    const { name, subject, html, text, userId } = templateData;
    const templateId = templateData.id || uuidv4();
    
    const result = await db.query(`
      INSERT INTO email_templates (
        id, name, subject, html_content, text_content, user_id, is_public
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        name = VALUES(name),
        subject = VALUES(subject),
        html_content = VALUES(html_content),
        text_content = VALUES(text_content),
        is_public = VALUES(is_public),
        updated_at = CURRENT_TIMESTAMP
    `, [templateId, name, subject, html, text, userId, templateData.isPublic || false]);
    
    return templateId;
  } catch (error) {
    logger.error(`Error saving email template: ${error.message}`);
    throw new Error('Failed to save email template');
  }
};

module.exports = {
  sendEmail,
  sendBulkEmails,
  updateEmailTracking,
  getCampaignStats,
  getEmailTemplates,
  saveEmailTemplate
};