CREATE TABLE IF NOT EXISTS `store_state` (
  `id` text PRIMARY KEY NOT NULL,
  `state_json` text NOT NULL,
  `updated_at` text NOT NULL
);
