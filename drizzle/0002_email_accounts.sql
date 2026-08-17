CREATE TABLE IF NOT EXISTS `auth_users` (`email` text PRIMARY KEY NOT NULL,`name` text NOT NULL,`password_hash` text NOT NULL,`password_salt` text NOT NULL,`created_at` text NOT NULL,`updated_at` text NOT NULL);
CREATE TABLE IF NOT EXISTS `auth_sessions` (`token_hash` text PRIMARY KEY NOT NULL,`email` text NOT NULL,`expires_at` text NOT NULL,`created_at` text NOT NULL);
CREATE INDEX IF NOT EXISTS `auth_sessions_email_idx` ON `auth_sessions` (`email`);
