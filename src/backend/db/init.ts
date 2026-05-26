import db from "./connection.ts";

function safeAddColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as any[];
  if (!cols.find((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

function safeAddIndex(indexName: string, table: string, columns: string, unique = false) {
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?`).all(indexName) as any[];
  if (rows.length === 0) {
    const uniqueKw = unique ? "UNIQUE" : "";
    try {
      db.exec(`CREATE ${uniqueKw} INDEX ${indexName} ON ${table}(${columns})`);
    } catch (e: any) {
      console.warn(`[DB] Cannot create ${uniqueKw} INDEX ${indexName}: ${e.message}`);
    }
  }
}

function migratePlatformSessions() {
  // Check if the old UNIQUE(user_id) constraint is still there
  const sql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'platform_sessions'").get() as any;
  if (sql && sql.sql && sql.sql.includes("user_id INTEGER NOT NULL UNIQUE")) {
    console.log("[DB] Migrating platform_sessions to UNIQUE(user_id, platform)...");
    db.exec(`
      CREATE TABLE IF NOT EXISTS platform_sessions_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        platform TEXT NOT NULL DEFAULT 'boss',
        cookies TEXT,
        is_valid INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(user_id, platform),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      INSERT OR IGNORE INTO platform_sessions_new (id, user_id, platform, cookies, is_valid, updated_at)
        SELECT id, user_id, platform, cookies, is_valid, updated_at FROM platform_sessions;
      DROP TABLE platform_sessions;
      ALTER TABLE platform_sessions_new RENAME TO platform_sessions;
    `);
  }
}

export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      name TEXT,
      education TEXT,
      experience TEXT,
      skills TEXT,
      raw_resume_text TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      target_roles TEXT,
      target_industries TEXT,
      target_locations TEXT,
      availability_days INTEGER,
      availability_months INTEGER,
      salary_min INTEGER,
      salary_max INTEGER,
      company_size TEXT,
      other_notes TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source TEXT,
      source_url TEXT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      description TEXT,
      requirements TEXT,
      responsibilities TEXT,
      salary_min INTEGER,
      salary_max INTEGER,
      salary_currency TEXT,
      deadline DATE,
      job_type TEXT,
      industry TEXT,
      role_type TEXT,
      seniority TEXT,
      tags TEXT,
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS matches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      match_score REAL,
      match_reason TEXT,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      user_id INTEGER,
      payload TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS admin_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      admin_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      target_type TEXT,
      target_id INTEGER,
      details TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (admin_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS system_config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_by INTEGER,
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS platform_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      platform TEXT NOT NULL DEFAULT 'boss',
      cookies TEXT,
      is_valid INTEGER DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, platform),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS boss_greet_settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      greeting_template TEXT NOT NULL DEFAULT '您好，我对{jobName}岗位很感兴趣，希望可以进一步沟通。',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  safeAddColumn("users", "role", "TEXT NOT NULL DEFAULT 'user'");
  safeAddColumn("users", "password_salt", "TEXT");
  safeAddColumn("preferences", "excluded_roles", "TEXT");
  safeAddColumn("preferences", "excluded_locations", "TEXT");
  safeAddColumn("conversations", "created_at", "DATETIME DEFAULT CURRENT_TIMESTAMP");

  // Dedup & tracking columns for multi-platform scraping
  safeAddColumn("jobs", "group_id", "TEXT");
  safeAddColumn("jobs", "first_seen", "DATETIME");
  safeAddColumn("jobs", "last_seen", "DATETIME");
  safeAddColumn("jobs", "seen_count", "INTEGER DEFAULT 1");
  safeAddIndex("idx_jobs_source_url", "jobs", "source, source_url", true);

  // Migrate platform_sessions: old schema had UNIQUE(user_id), new needs UNIQUE(user_id, platform)
  migratePlatformSessions();

  const seedConfig = db.prepare(
    "INSERT OR IGNORE INTO system_config (key, value, description) VALUES (?, ?, ?)"
  );
  seedConfig.run("matching_threshold", "0.5", "Minimum match score to show");
  seedConfig.run("max_daily_matches", "50", "Max matches per user per day");
  seedConfig.run("ai_chat_enabled", "true", "Enable AI chat feature");
  seedConfig.run("maintenance_mode", "false", "Put system in maintenance mode");

  console.log("[DB] Schema initialized.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  initSchema();
}
