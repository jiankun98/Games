"use strict";
// 账号与会话：注册/登录/登出 + 鉴权中间件
//  密码 bcryptjs 哈希；会话为随机 token 存 sessions 表，有效期 30 天

const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { db } = require("./db.js");

const SESSION_DAYS = 30;
const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,16}$/; // 字母/数字/下划线/中文
const PASSWORD_MIN = 6;
const PASSWORD_MAX = 32;

function now() {
  return Date.now();
}

function fail(res, status, msg) {
  return res.status(status).json({ ok: false, msg });
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = now() + SESSION_DAYS * 86400 * 1000;
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(token, userId, expiresAt);
  return { token, expiresAt };
}

function userFromToken(token) {
  if (!token || typeof token !== "string") return null;
  const row = db.prepare(`
    SELECT u.id, u.username FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > ?
  `).get(token, now());
  return row || null;
}

// 从 Authorization: Bearer xxx 或 x-token 头取登录用户，挂到 req.user
function authRequired(req, res, next) {
  let token = req.get("x-token") || "";
  const auth = req.get("authorization") || "";
  if (!token && auth.startsWith("Bearer ")) token = auth.slice(7).trim();
  const user = userFromToken(token);
  if (!user) return fail(res, 401, "未登录或会话已过期");
  req.user = user;
  next();
}

function register(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || !USERNAME_RE.test(username)) {
    return fail(res, 400, "用户名需 2-16 位字母/数字/下划线/中文");
  }
  if (typeof password !== "string" || password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return fail(res, 400, `密码长度需 ${PASSWORD_MIN}-${PASSWORD_MAX} 位`);
  }
  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (exists) return fail(res, 409, "用户名已被占用");
  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare("INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)")
    .run(username, hash, now());
  const sess = createSession(info.lastInsertRowid);
  res.json({ ok: true, token: sess.token, expiresAt: sess.expiresAt, user: { id: info.lastInsertRowid, username } });
}

function login(req, res) {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string") {
    return fail(res, 400, "请输入用户名和密码");
  }
  const row = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username);
  // 统一提示，避免探测已注册用户名
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return fail(res, 401, "用户名或密码错误");
  }
  const sess = createSession(row.id);
  res.json({ ok: true, token: sess.token, expiresAt: sess.expiresAt, user: { id: row.id, username: row.username } });
}

function logout(req, res) {
  let token = req.get("x-token") || "";
  const auth = req.get("authorization") || "";
  if (!token && auth.startsWith("Bearer ")) token = auth.slice(7).trim();
  if (token) db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
  res.json({ ok: true });
}

// 顺手清理过期会话（每次登录/注册时执行，开销可忽略）
db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(now());

module.exports = { authRequired, register, login, logout };
