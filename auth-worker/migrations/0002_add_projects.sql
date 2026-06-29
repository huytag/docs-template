ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer';

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  repo TEXT DEFAULT '',
  icon TEXT DEFAULT '📦',
  version TEXT DEFAULT '',
  download_url TEXT DEFAULT '',
  tags TEXT DEFAULT '[]',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_projects (
  user_id INTEGER NOT NULL,
  project_id TEXT NOT NULL,
  PRIMARY KEY (user_id, project_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

UPDATE users SET role = 'admin' WHERE username = 'thangnh';
