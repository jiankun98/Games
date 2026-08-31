"use strict";
// 传奇觉醒 API 路由：挂载于 run/game.js 的 /api/legend/*
//  POST /auth/register|login|logout · GET /save · POST /character · POST /save · GET /rank

const express = require("express");
const { authRequired, register, login, logout } = require("./auth.js");
const { getSave, createCharacter, saveGame } = require("./saves.js");
const { rank } = require("./rank.js");

const router = express.Router();
router.use(express.json({ limit: "2mb" }));

// —— 账号 ——
router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/logout", logout);

// —— 云存档（需登录） ——
router.get("/save", authRequired, getSave);
router.post("/character", authRequired, createCharacter);
router.post("/save", authRequired, saveGame);

// —— 排行榜（公开） ——
router.get("/rank", rank);

// 统一错误兜底，避免栈信息泄露
router.use((err, req, res, next) => {
  console.error("[legend]", err);
  if (res.headersSent) return next(err);
  res.status(500).json({ ok: false, msg: "服务器内部错误" });
});

module.exports = router;
