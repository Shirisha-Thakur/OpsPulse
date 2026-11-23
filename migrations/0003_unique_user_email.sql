
-- Prevent duplicate user accounts with the same email
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
ON users(email COLLATE NOCASE);
