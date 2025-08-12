CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(255) PRIMARY KEY,
  phone VARCHAR(255) UNIQUE,
  email VARCHAR(255) UNIQUE,
  username VARCHAR(255) UNIQUE,
  password TEXT,
  bio TEXT,
  profile_picture TEXT,
  pic_id VARCHAR(255),
  is_admin TINYINT(1) DEFAULT 0,
  interests TEXT,
  vibe_preference TEXT,
  account_status VARCHAR(50) DEFAULT 'active',
  mode_preference VARCHAR(50) DEFAULT 'light',
  auth_provider VARCHAR(50) DEFAULT 'local',
  auth_provider_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  password_changed_at TIMESTAMP NULL DEFAULT NULL,
  password_reset_token TEXT,
  password_reset_expires TIMESTAMP NULL DEFAULT NULL,
  auth_verified TINYINT(1) DEFAULT 0,
  verification_token TEXT,
  verification_expires TIMESTAMP NULL DEFAULT NULL
);


-- Create sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  token VARCHAR(255) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_sessions_token (token),
  INDEX idx_sessions_user_id (user_id)
);

-- Create audit log for security events
CREATE TABLE IF NOT EXISTS auth_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255),
  event_type VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_auth_logs_user_id (user_id),
  INDEX idx_auth_logs_event_type (event_type)
);


-- Email records table
CREATE TABLE IF NOT EXISTS emails (
  id INT AUTO_INCREMENT PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE,
  tracking_id VARCHAR(255) UNIQUE,
  sender VARCHAR(255) NOT NULL,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  status VARCHAR(50) DEFAULT 'sent',
  template_id VARCHAR(255),
  campaign_id VARCHAR(255),
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL DEFAULT NULL,
  opened_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_emails_tracking_id (tracking_id),
  INDEX idx_emails_campaign_id (campaign_id),
  INDEX idx_emails_status (status)
);

-- Email events (opens, clicks, etc.)
CREATE TABLE IF NOT EXISTS email_events (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tracking_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(100) NOT NULL,
  ip_address VARCHAR(45),
  user_agent TEXT,
  link_url TEXT,
  event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_email_events_tracking_id (tracking_id),
  INDEX idx_email_events_event_type (event_type)
);

-- Email campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  sender VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'draft',
  total_recipients INT DEFAULT 0,
  sent_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  schedule_time TIMESTAMP NULL DEFAULT NULL,
  started_at TIMESTAMP NULL DEFAULT NULL,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(255) NOT NULL,
  html_content TEXT,
  text_content TEXT,
  user_id VARCHAR(255) NOT NULL,
  is_public TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email_templates_user_id (user_id)
);

-- Email credentials (encrypted)
CREATE TABLE IF NOT EXISTS email_credentials (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  provider VARCHAR(100) DEFAULT 'gmail',
  client_id VARCHAR(255),
  client_secret TEXT,
  refresh_token TEXT,
  access_token TEXT,
  redirect_uri VARCHAR(255),
  is_default TINYINT(1) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  UNIQUE INDEX idx_credentials_user_email (user_id, email),
  INDEX idx_email_credentials_user_id (user_id)
);
