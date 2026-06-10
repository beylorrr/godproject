// db.js — SQLite через sql.js (pure JS, без компіляції)
import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir  = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dir, 'charsheet.db')

let db

function persist() {
  writeFileSync(DB_PATH, Buffer.from(db.export()))
}

export function getDB()    { return db }
export function saveToDB() { persist() }

// ── Хелпери для зручності ──────────────────────────
export function dbGet(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const row = stmt.step() ? stmt.getAsObject() : null
  stmt.free()
  return row
}

export function dbAll(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  const rows = []
  while (stmt.step()) rows.push(stmt.getAsObject())
  stmt.free()
  return rows
}

export function dbRun(sql, params = []) {
  db.run(sql, params)
}

export async function initDB() {
  const SQL = await initSqlJs()

  if (existsSync(DB_PATH)) {
    db = new SQL.Database(readFileSync(DB_PATH))
    console.log(`✅ SQLite завантажено: ${DB_PATH}`)
  } else {
    db = new SQL.Database()
    console.log(`✅ SQLite: нова база ${DB_PATH}`)
  }

  db.run(`
    -- ── Журнал дій (для майстра) ──────────────────────
    CREATE TABLE IF NOT EXISTS action_logs (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      ts      INTEGER NOT NULL,
      user_id INTEGER,
      char_id INTEGER,
      party_id INTEGER,         -- пачка, до якої стосується дія (для фільтра)
      actor   TEXT,             -- ім'я того, хто діяв (персонаж або Майстер)
      type    TEXT,             -- roll | hp | money | item | spell | level | party | gm
      message TEXT
    );

    -- ── Користувачі ──────────────────────────────────
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT    NOT NULL,
      role          TEXT    NOT NULL DEFAULT 'player',  -- player | gm | admin
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Персонажі ─────────────────────────────────────
    CREATE TABLE IF NOT EXISTS characters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      slot_name   TEXT    NOT NULL DEFAULT 'Новий персонаж',
      is_active   INTEGER NOT NULL DEFAULT 0,
      sheet_data  TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chars_user ON characters(user_id);

    -- ── Пачки (квести/сесії) ──────────────────────────
    CREATE TABLE IF NOT EXISTS parties (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      gm_id       INTEGER NOT NULL REFERENCES users(id),
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ── Члени пачки ───────────────────────────────────
    CREATE TABLE IF NOT EXISTS party_members (
      party_id     INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
      user_id      INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
      char_id      INTEGER REFERENCES characters(id),
      joined_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (party_id, user_id)
    );

    -- ── База GM: предмети/закляття/інше ───────────────
    CREATE TABLE IF NOT EXISTS gm_items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      gm_id       INTEGER NOT NULL REFERENCES users(id),
      type        TEXT    NOT NULL DEFAULT 'item',  -- item | spell | creature | other
      name        TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      data        TEXT    NOT NULL DEFAULT '{}',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_items_gm ON gm_items(gm_id);

    -- ── Лог дій GM (видача XP, урон) ──────────────────
    CREATE TABLE IF NOT EXISTS gm_actions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      gm_id       INTEGER NOT NULL REFERENCES users(id),
      target_char INTEGER NOT NULL REFERENCES characters(id),
      action      TEXT    NOT NULL,  -- 'xp' | 'damage' | 'heal' | 'award_pts'
      value       INTEGER NOT NULL DEFAULT 0,
      note        TEXT    DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `)

  persist()
}


// Міграція: додаємо party_id у старі бази (нові отримують зі схеми)
try { db.run('ALTER TABLE action_logs ADD COLUMN party_id INTEGER') } catch { /* колонка вже є */ }

// ── Журнал дій гравців і майстра ─────────────────────────
// Пише запис і тримає журнал не довшим за 2000 рядків.
export function logAction({ userId = null, charId = null, actor = '', type = '', message = '', partyId = null }) {
  try {
    // Пачку резолвимо автоматично: явна → за власником персонажа → за користувачем
    let pid = partyId
    if (!pid && charId) {
      const owner = dbGet('SELECT user_id FROM characters WHERE id = ?', [charId])
      if (owner) pid = dbGet('SELECT party_id FROM party_members WHERE user_id = ?', [owner.user_id])?.party_id || null
    }
    if (!pid && userId) pid = dbGet('SELECT party_id FROM party_members WHERE user_id = ?', [userId])?.party_id || null
    dbRun('INSERT INTO action_logs (ts, user_id, char_id, party_id, actor, type, message) VALUES (?,?,?,?,?,?,?)',
      [Date.now(), userId, charId, pid, actor, type, message])
    dbRun(`DELETE FROM action_logs WHERE id NOT IN (SELECT id FROM action_logs ORDER BY id DESC LIMIT 2000)`)
    saveToDB()
  } catch { /* журнал не має ламати основну дію */ }
}
