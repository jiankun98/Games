"use strict";
// 传奇觉醒数据库：Node 22 内置 node:sqlite（同步 API，零原生依赖）
//  库文件 games/legend/server/legend.db（已 gitignore）
//  表结构：users(账号) / sessions(会话) / characters(角色，快照+排行榜索引列) / save_log(存档历史)

const { DatabaseSync } = require("node:sqlite");
const path = require("path");
const fs = require("fs");

const DATA_DIR = __dirname;
const DB_PATH = path.join(DATA_DIR, "legend.db");

const db = new DatabaseSync(DB_PATH);

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS characters (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  class        TEXT NOT NULL,             -- warrior | mage | taoist
  level        INTEGER NOT NULL DEFAULT 1,
  battle_power INTEGER NOT NULL DEFAULT 0,
  continent    INTEGER NOT NULL DEFAULT 1,
  state_json   TEXT,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chars_power ON characters(battle_power DESC);
CREATE INDEX IF NOT EXISTS idx_chars_level ON characters(level DESC);

CREATE TABLE IF NOT EXISTS save_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
  state_json   TEXT NOT NULL,
  saved_at     INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_savelog_char ON save_log(character_id, saved_at);
`);

// 存档历史每角色最多保留条数（防库膨胀，便于回档排查）
const SAVE_LOG_KEEP = 20;

function pruneSaveLog(characterId) {
  db.prepare(`
    DELETE FROM save_log WHERE character_id = ? AND id NOT IN (
      SELECT id FROM save_log WHERE character_id = ? ORDER BY saved_at DESC LIMIT ${SAVE_LOG_KEEP}
    )
  `).run(characterId, characterId);
}

module.exports = { db, pruneSaveLog, DB_PATH };
