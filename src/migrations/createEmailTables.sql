-- Email records table
CREATE TABLE IF NOT EXISTS emails (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id TEXT UNIQUE,
  tracking_id TEXT UNIQUE,
  sender TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT,
  status TEXT DEFAULT 'sent',
  template_id TEXT,
  campaign_id TEXT,
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  delivered_at TIMESTAMP NULL,
  opened_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_emails_tracking_id ON emails(tracking_id);
CREATE INDEX IF NOT EXISTS idx_emails_campaign_id ON emails(campaign_id);
CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);

-- Email events (opens, clicks, etc.)
CREATE TABLE IF NOT EXISTS email_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tracking_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  link_url TEXT,
  event_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  -- SQLite doesn't support foreign keys by default
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_email_events_tracking_id ON email_events(tracking_id);
CREATE INDEX IF NOT EXISTS idx_email_events_event_type ON email_events(event_type);

-- Email campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sender TEXT NOT NULL,
  status TEXT DEFAULT 'draft',
  total_recipients INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  schedule_time TIMESTAMP NULL,
  started_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Email templates
CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  html_content TEXT,
  text_content TEXT,
  user_id TEXT NOT NULL,
  is_public INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index
CREATE INDEX IF NOT EXISTS idx_email_templates_user_id ON email_templates(user_id);

-- Email credentials (encrypted)
CREATE TABLE IF NOT EXISTS email_credentials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  provider TEXT DEFAULT 'gmail',
  client_id TEXT,
  client_secret TEXT,
  refresh_token TEXT,
  access_token TEXT,
  redirect_uri TEXT,
  is_default INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create a unique index for user_id + email
CREATE UNIQUE INDEX IF NOT EXISTS idx_credentials_user_email ON email_credentials(user_id, email);

-- Create index
CREATE INDEX IF NOT EXISTS idx_email_credentials_user_id ON email_credentials(user_id);