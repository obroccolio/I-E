import db from "../db/connection.ts";
import { parsePagination, PaginationOptions } from "../utils/pagination.ts";

const USER_SORT_COLUMNS = ["id", "email", "role", "created_at"];
const CONVERSATION_SORT_COLUMNS = ["id", "role", "created_at"];
const MATCH_SORT_COLUMNS = ["id", "match_score", "status", "created_at"];

export function listUsers(options: PaginationOptions & { search?: string }) {
  const { page, limit, offset, order, sort } = parsePagination({
    ...options,
    allowedSortColumns: USER_SORT_COLUMNS,
  });

  let where = "1=1";
  const params: any[] = [];

  if (options.search) {
    where += " AND (email LIKE ? OR name LIKE ?)";
    params.push(`%${options.search}%`, `%${options.search}%`);
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM users LEFT JOIN profiles ON users.id = profiles.user_id WHERE ${where}`)
    .get(...params) as any;

  const users = db
    .prepare(
      `SELECT users.id, users.email, users.role, users.created_at, profiles.name
       FROM users LEFT JOIN profiles ON users.id = profiles.user_id
       WHERE ${where}
       ORDER BY users.${sort} ${order}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as any[];

  return {
    data: users,
    total: countRow.total,
    page,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

export function getUser(id: number) {
  return db
    .prepare(
      `SELECT users.id, users.email, users.role, users.created_at, profiles.name
       FROM users LEFT JOIN profiles ON users.id = profiles.user_id
       WHERE users.id = ?`
    )
    .get(id) as any;
}

export function updateUser(id: number, data: { role?: string; email?: string }) {
  const sets: string[] = [];
  const params: any[] = [];

  if (data.email !== undefined) {
    sets.push("email = ?");
    params.push(data.email);
  }
  if (data.role !== undefined) {
    sets.push("role = ?");
    params.push(data.role);
  }

  if (sets.length === 0) return getUser(id);

  params.push(id);
  db.prepare(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`).run(...params);
  return getUser(id);
}

export function deleteUser(id: number) {
  const del = db.transaction(() => {
    db.prepare("DELETE FROM platform_sessions WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM boss_greet_settings WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM events WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM conversations WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM matches WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM preferences WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM profiles WHERE user_id = ?").run(id);
    db.prepare("DELETE FROM users WHERE id = ?").run(id);
  });
  del();
}

export function getUserProfile(userId: number) {
  const row = db.prepare("SELECT * FROM profiles WHERE user_id = ?").get(userId) as any;
  if (row) {
    try { row.education = JSON.parse(row.education); } catch {}
    try { row.experience = JSON.parse(row.experience); } catch {}
  }
  return row;
}

export function getUserPreferences(userId: number) {
  return db.prepare("SELECT * FROM preferences WHERE user_id = ?").get(userId) as any;
}

export function getUserConversations(
  userId: number,
  options: PaginationOptions
) {
  const { page, limit, offset, order, sort } = parsePagination({
    ...options,
    allowedSortColumns: CONVERSATION_SORT_COLUMNS,
  });

  const countRow = db
    .prepare("SELECT COUNT(*) as total FROM conversations WHERE user_id = ?")
    .get(userId) as any;

  const conversations = db
    .prepare(
      `SELECT * FROM conversations WHERE user_id = ? ORDER BY ${sort} ${order} LIMIT ? OFFSET ?`
    )
    .all(userId, limit, offset) as any[];

  return {
    data: conversations,
    total: countRow.total,
    page,
    totalPages: Math.ceil(countRow.total / limit),
  };
}

export function getUserMatches(
  userId: number,
  options: PaginationOptions & { status?: string }
) {
  const { page, limit, offset, order, sort } = parsePagination({
    ...options,
    allowedSortColumns: MATCH_SORT_COLUMNS,
  });

  let where = "user_id = ?";
  const params: any[] = [userId];

  if (options.status) {
    where += " AND status = ?";
    params.push(options.status);
  }

  const countRow = db
    .prepare(`SELECT COUNT(*) as total FROM matches WHERE ${where}`)
    .get(...params) as any;

  const matches = db
    .prepare(
      `SELECT matches.*, jobs.title, jobs.company FROM matches
       LEFT JOIN jobs ON matches.job_id = jobs.id
       WHERE matches.${where}
       ORDER BY matches.${sort} ${order}
       LIMIT ? OFFSET ?`
    )
    .all(...params, limit, offset) as any[];

  return {
    data: matches,
    total: countRow.total,
    page,
    totalPages: Math.ceil(countRow.total / limit),
  };
}
