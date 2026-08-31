"use strict";
// 排行榜：等级榜 / 战力榜（查 characters 索引列，异步刷新即可，单机量级无需缓存）

const { db } = require("./db.js");

function rank(req, res) {
  const type = req.query.type === "level" ? "level" : "power";
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const rows = db.prepare(`
    SELECT name, class, level, battle_power AS battlePower, continent, updated_at AS updatedAt
    FROM characters ORDER BY ${type === "level" ? "level DESC, battle_power DESC" : "battle_power DESC, level DESC"}
    LIMIT ?
  `).all(limit);
  res.json({ ok: true, type, rows });
}

module.exports = { rank };
