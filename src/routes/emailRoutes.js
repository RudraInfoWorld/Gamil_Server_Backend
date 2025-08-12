const express = require('express');
const router = express.Router();
const emailController = require('../controllers/emailController');
const authMiddleware = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Email sending endpoints
router.post('/send', emailController.sendEmail);
router.post('/send-bulk', emailController.sendBulkEmails);

// Tracking endpoint (public, no auth required)
router.get('/track/:trackingId', emailController.trackEmailOpen);

// Email campaigns
router.get('/campaigns', emailController.getAllCampaigns);
router.get('/campaigns/:campaignId/stats', emailController.getCampaignStats);

// Email templates
router.get('/templates', emailController.getEmailTemplates);
router.post('/templates', emailController.saveEmailTemplate);
router.delete('/templates/:templateId', emailController.deleteEmailTemplate);

// Email credentials
router.get('/credentials', emailController.getEmailCredentialsList);
router.post('/credentials', emailController.saveEmailCredentials);
router.delete('/credentials/:credentialId', emailController.deleteEmailCredentials);

module.exports = router;