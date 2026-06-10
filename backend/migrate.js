// migrate.js — запусти один раз: node migrate.js
// Додає колонку role і нові таблиці до існуючої БД
import initSqlJs from 'sql.js'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir   = dirname(fileURLToPath(import.meta.url))
const DB_PATH = process.env.DB_PATH || join(__dir, 'charsheet.db')

if (!existsSync(DB_PATH)) {
  console.log('charsheet.db не знайдено — міграція не потрібна, initDB створить нову базу.')
  process.exit(0)
}

const SQL = await initSqlJs()
const db  = new SQL.Database(readFileSync(DB_PATH))

// Перевіряємо які колонки вже є
const cols = db.exec("PRAGMA table_info(users)")[0]?.values?.map(r => r[1]) || []
console.log('Поточні колонки users:', cols)

// ALTER TABLE не підтримує IF NOT EXISTS — перевіряємо вручну
if (!cols.includes('role')) {
  db.run("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'player'")
  console.log("✓ Додано колонку role")
} else {
  console.log("· role вже є")
}

// Нові таблиці
db.run(`
  CREATE TABLE IF NOT EXISTS parties (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    gm_id       INTEGER NOT NULL REFERENCES users(id),
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS party_members (
    party_id  INTEGER NOT NULL REFERENCES parties(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    char_id   INTEGER REFERENCES characters(id),
    joined_at TEXT    NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (party_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS gm_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gm_id       INTEGER NOT NULL REFERENCES users(id),
    type        TEXT    NOT NULL DEFAULT 'item',
    name        TEXT    NOT NULL,
    description TEXT    DEFAULT '',
    data        TEXT    NOT NULL DEFAULT '{}',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_items_gm ON gm_items(gm_id);

  CREATE TABLE IF NOT EXISTS gm_actions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    gm_id       INTEGER NOT NULL REFERENCES users(id),
    target_char INTEGER NOT NULL REFERENCES characters(id),
    action      TEXT    NOT NULL,
    value       INTEGER NOT NULL DEFAULT 0,
    note        TEXT    DEFAULT '',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`)

console.log('✓ Нові таблиці (parties, party_members, gm_items, gm_actions) — ОК')

// Зберігаємо
writeFileSync(DB_PATH, Buffer.from(db.export()))
console.log(`✓ Збережено: ${DB_PATH}`)
console.log('\nМіграція завершена. Тепер запускай npm start.')
