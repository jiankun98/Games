"use strict";
// 云存档：拉取/创建角色/保存（带校验、限频、历史日志）
//  POST 间隔下限 SAVE_MIN_INTERVAL_MS；save_log 每角色保留最近 20 份

const { db, pruneSaveLog } = require("./db.js");
const { validateSavePayload, SIZE_MAX } = require("./validate.js");
const C = require("../src/data/constants.mjs");

const SAVE_MIN_INTERVAL_MS = 8 * 1000; // 自动存档最快 8 秒一次（强制保存不受限）
const lastSaveAt = new Map();          // character_id -> ts（内存即可，单进程）

function fail(res, status, msg) {
  return res.status(status).json({ ok: false, msg });
}

function rowToCharacter(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    class: row.class,
    level: row.level,
    battlePower: row.battle_power,
    continent: row.continent,
    state: row.state_json ? JSON.parse(row.state_json) : null,
    updatedAt: row.updated_at
  };
}

// GET /save —— 拉取当前账号的角色（无角色返回 null，客户端进建角流程）
function getSave(req, res) {
  const row = db.prepare("SELECT * FROM characters WHERE user_id = ?").get(req.user.id);
  res.json({ ok: true, character: rowToCharacter(row) });
}

// POST /character —— 创建角色（每账号 1 个；state 为客户端引擎生成的初始档）
function createCharacter(req, res) {
  const exists = db.prepare("SELECT id FROM characters WHERE user_id = ?").get(req.user.id);
  if (exists) return fail(res, 409, "该账号已有角色");
  const { state } = req.body || {};
  const err = validateSavePayload({ state, level: state && state.level, battlePower: 0 });
  if (err) return fail(res, 400, err);
  const ts = Date.now();
  const info = db.prepare(`
    INSERT INTO characters (user_id, name, class, level, battle_power, continent, state_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.user.id, state.name, state.class, state.level, 0, state.continent || 1, JSON.stringify(state), ts);
  res.json({ ok: true, characterId: info.lastInsertRowid });
}

// POST /save —— 保存云存档
function saveGame(req, res) {
  const row = db.prepare("SELECT id, name, class FROM characters WHERE user_id = ?").get(req.user.id);
  if (!row) return fail(res, 404, "尚无角色，请先创建");
  const body = req.body || {};
  const err = validateSavePayload(body);
  if (err) return fail(res, 400, err);

  const ts = Date.now();
  if (!body.force) {
    const last = lastSaveAt.get(row.id) || 0;
    if (ts - last < SAVE_MIN_INTERVAL_MS) {
      return res.status(429).json({ ok: false, msg: "保存过于频繁，稍后再试" });
    }
  }

  const stateJson = JSON.stringify(body.state);
  if (Buffer.byteLength(stateJson) > SIZE_MAX) return fail(res, 413, "存档体积超限");

  db.prepare(`
    UPDATE characters SET level = ?, battle_power = ?, continent = ?, state_json = ?, updated_at = ?
    WHERE id = ?
  `).run(body.state.level, body.battlePower ?? 0, body.state.continent, stateJson, ts, row.id);
  db.prepare("INSERT INTO save_log (character_id, state_json, saved_at) VALUES (?, ?, ?)").run(row.id, stateJson, ts);
  pruneSaveLog(row.id);
  lastSaveAt.set(row.id, ts);
  res.json({ ok: true, savedAt: ts });
}

module.exports = { getSave, createCharacter, saveGame };
