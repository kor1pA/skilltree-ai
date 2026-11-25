import type { SqlExecutor } from './SqlExecutor.ts';

export const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK(role IN ('LEARNER', 'MENTOR', 'HR')),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  target_profession TEXT,
  skill_level TEXT,
  points INTEGER NOT NULL DEFAULT 0,
  badges_json TEXT NOT NULL DEFAULT '[]',
  bio TEXT,
  hourly_rate REAL,
  rating REAL NOT NULL DEFAULT 5.0,
  specialization TEXT,
  company TEXT
);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  device_label TEXT NOT NULL,
  user_agent TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at INTEGER NOT NULL,
  blocked_until INTEGER
);

CREATE TABLE IF NOT EXISTS skill_trees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  target_profession TEXT NOT NULL,
  level TEXT NOT NULL CHECK(level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  created_at TEXT NOT NULL,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS skill_nodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tree_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  order_number INTEGER NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE')),
  description TEXT NOT NULL DEFAULT '',
  FOREIGN KEY (tree_id) REFERENCES skill_trees(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS learning_materials (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  author_id INTEGER,
  title TEXT NOT NULL,
  type TEXT NOT NULL CHECK(type IN ('TEXT', 'LINK', 'VIDEO')),
  url TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES skill_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  node_id INTEGER NOT NULL,
  learner_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  response_time_ms INTEGER NOT NULL,
  is_helpful INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (node_id) REFERENCES skill_nodes(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS mentor_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  learner_id INTEGER NOT NULL,
  mentor_id INTEGER NOT NULL,
  topic TEXT NOT NULL,
  start_at TEXT NOT NULL,
  duration_min INTEGER NOT NULL,
  price REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('BOOKED', 'CONFIRMED', 'DONE', 'CANCELLED')),
  payment_status TEXT NOT NULL CHECK(payment_status IN ('PENDING', 'PAID', 'REFUNDED')),
  rating INTEGER,
  feedback TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (mentor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS payment_receipts (
  transaction_id TEXT PRIMARY KEY,
  session_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING', 'PAID', 'REFUNDED')),
  processed_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES mentor_sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  hr_manager_id INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (hr_manager_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL,
  learner_id INTEGER NOT NULL,
  added_at TEXT NOT NULL,
  PRIMARY KEY (team_id, learner_id),
  FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY (learner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_skill_trees_learner_id ON skill_trees(learner_id);
CREATE INDEX IF NOT EXISTS idx_skill_nodes_tree_id_order ON skill_nodes(tree_id, order_number);
CREATE INDEX IF NOT EXISTS idx_learning_materials_node_id ON learning_materials(node_id);
CREATE INDEX IF NOT EXISTS idx_learning_materials_author_id ON learning_materials(author_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_node_id ON chat_messages(node_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_learner_id ON chat_messages(learner_id);
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_learner_id ON mentor_sessions(learner_id);
CREATE INDEX IF NOT EXISTS idx_mentor_sessions_mentor_id ON mentor_sessions(mentor_id);
CREATE INDEX IF NOT EXISTS idx_payment_receipts_session_id ON payment_receipts(session_id);
CREATE INDEX IF NOT EXISTS idx_teams_hr_manager_id ON teams(hr_manager_id);
`;

export async function initializeSchema(db: SqlExecutor): Promise<void> {
  await db.execScript(SCHEMA_DDL);
}
