# Gmail Server Backend

A comprehensive backend service for managing email services, including sending emails via Gmail, tracking email opens, sending bulk emails, and managing email templates.

## Features

- **Email Sending**: Send individual emails with HTML content and attachments
- **Email Tracking**: Track when emails are opened with invisible tracking pixels
- **Bulk Email Sending**: Send emails to multiple recipients with personalized content
- **Email Templates**: Create and manage reusable email templates
- **Campaign Management**: Organize emails into campaigns and track campaign performance
- **Authentication**: Secure user authentication system
- **Multiple Email Provider Support**: Support for Gmail through OAuth2 (expandable to other providers)

## Setup

### Prerequisites

- Node.js (v14+ recommended)
- MySQL database
- Gmail account with OAuth2 credentials

### Installation

1. Clone this repository
   ```bash
   git clone https://github.com/YourUsername/Gamil_Server_Backend.git
   cd Gamil_Server_Backend
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Create a `.env` file based on `.env.example`
   ```bash
   cp .env.example .env
   ```

4. Update the `.env` file with your database and Google OAuth credentials

5. Run the server
   ```bash
   npm run dev
   ```

## Getting Gmail OAuth2 Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project
3. Enable the Gmail API
4. Go to "Credentials" and create an OAuth client ID
5. Set the authorized redirect URIs
6. Download the client secret JSON file
7. Use the client ID and secret in your application

## API Documentation

### Authentication Endpoints

- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user profile
- `PATCH /api/auth/update-password` - Update user password
- `POST /api/auth/forgot-password` - Request password reset
- `POST /api/auth/reset-password/:token` - Reset password with token

### Email Endpoints

- `POST /api/email/send` - Send a single email
- `POST /api/email/send-bulk` - Send emails to multiple recipients
- `GET /api/email/track/:trackingId` - Track email opens (called automatically)
- `GET /api/email/campaigns` - Get all email campaigns
- `GET /api/email/campaigns/:campaignId/stats` - Get campaign statistics
- `GET /api/email/templates` - Get email templates
- `POST /api/email/templates` - Create or update email template
- `DELETE /api/email/templates/:templateId` - Delete email template
- `GET /api/email/credentials` - Get email credentials
- `POST /api/email/credentials` - Save email credentials
- `DELETE /api/email/credentials/:credentialId` - Delete email credentials

## Example: Sending an Email

```javascript
// Request
fetch('http://localhost:3000/api/email/send', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN_HERE'
  },
  body: JSON.stringify({
    to: 'recipient@example.com',
    subject: 'Hello from Gmail Server',
    html: '<h1>Hello!</h1><p>This is a test email.</p>',
    enableTracking: true
  })
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

## Example: Sending Bulk Emails

```javascript
// Request
fetch('http://localhost:3000/api/email/send-bulk', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_TOKEN_HERE'
  },
  body: JSON.stringify({
    recipients: [
      { email: 'user1@example.com', name: 'User 1' },
      { email: 'user2@example.com', name: 'User 2' }
    ],
    subject: 'Hello {{name}}',
    html: '<h1>Hello {{name}}!</h1><p>This is a personalized email.</p>',
    enableTracking: true
  })
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));
```

## License

ISC License

## Author

Uday Shankar Purbey