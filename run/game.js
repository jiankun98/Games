"use strict";
// 小游戏合集本地服务（根路径 / 返回展厅 index.html，列出所有游戏）
//  1) 托管项目静态文件（根路径 / 返回展厅 index.html）
//  2) POST /api/llm —— OpenAI 兼容接口的流式透传代理，规避浏览器 CORS，密钥可放在服务端
//
// 启动： node run/game.js
// 可选：run/config.json 放服务端密钥 { "baseUrl": "...", "apiKey": "..." }（已 gitignore）

const express = require("express");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(express.json({ limit: "8mb" }));

const PORT = (() => {
  const arg = process.argv.find((a) => a.startsWith("--port="));
  if (arg) return parseInt(arg.slice("--port=".length), 10);
  return process.env.PORT || 5173;
})();
const ROOT = path.resolve(__dirname, "..");

// 服务端密钥配置（可选）
let serverCfg = {};
const cfgPath = path.join(__dirname, "config.json");
try {
  serverCfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
} catch (e) {
  // 无配置文件，忽略
}

// 静态文件托管（根路径 / 由 express.static 返回根目录 index.html 展厅）
app.use(express.static(ROOT));

// OpenAI 兼容代理：转发到 ${baseUrl}/chat/completions
app.post("/api/llm", async (req, res) => {
  try {
    const { baseUrl, apiKey, model, messages, temperature, stream } = req.body || {};
    const base = (baseUrl || serverCfg.baseUrl || "").replace(/\/+$/, ""); 
    const key = apiKey || serverCfg.apiKey || "";
    if (!base) return res.status(400).json({ error: "缺少 baseUrl（请在「大模型」页填写 Base URL）" });

    const url = base + "/chat/completions";
    // 白名单透传：thinking/max_tokens/response_format 供思考型模型与结构化输出使用
    const payload = { model, messages, temperature, stream: !!stream };
    for (const k of ["thinking", "max_tokens", "response_format", "reasoning_effort"])
      if (req.body && req.body[k] !== undefined) payload[k] = req.body[k];
    const headers = { "Content-Type": "application/json" };
    if (key) headers["Authorization"] = "Bearer " + key;

    const upstream = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
    console.log(url); // 日志

    const ct = upstream.headers.get("content-type") || "";

    if (!stream || !upstream.body || !ct.includes("event-stream")) {
      // 非流式：原样回传
      const text = await upstream.text();
      res
        .status(upstream.status)
        .set("Content-Type", ct || "application/json");
      return res.send(text);
    }

    // 流式透传
    res
      .status(upstream.status)
      .set("Content-Type", "text/event-stream; charset=utf-8")
      .set("Cache-Control", "no-cache")
      .set("Connection", "keep-alive");

    const reader = upstream.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (!res.headersSent) res.status(502).json({ error: "代理失败：" + msg });
    else res.end();
  }
});

// 传奇觉醒后端：账号 / 云存档 / 排行榜（SQLite 存 games/legend/server/legend.db）
try {
  const legendRouter = require("../games/legend/server/router.js");
  app.use("/api/legend", legendRouter);
} catch (e) {
  console.warn("  [legend] 传奇后端加载失败：" + ((e && e.message) || e));
}

// 胡莱三国后端：账号 / 云存档（SQLite 存 games/hulai/server/hulai.db）
try {
  const hulaiRouter = require("../games/hulai/server/router.cjs");
  app.use("/api/hulai", hulaiRouter);
} catch (e) {
  console.warn("  [hulai] 胡莱三国后端加载失败：" + ((e && e.message) || e));
}

// 图片代理：3D 游戏王立绘等外域图片（Canvas 纹理必须同源，故本地代理）
// 仅允许 https 且域名白名单，防止 SSRF
const IMG_HOSTS = new Set(["images.ygoprodeck.com"]);
app.get("/api/img", async (req, res) => {
  try {
    const raw = String(req.query.url || "");
    let u;
    try { u = new URL(raw); } catch (e) { return res.status(400).json({ error: "无效的 url 参数" }); }
    if (u.protocol !== "https:" || !IMG_HOSTS.has(u.hostname)) {
      return res.status(400).json({ error: "仅允许白名单域名的 https 图片" });
    }
    const upstream = await fetch(u.href, { redirect: "follow" });
    if (!upstream.ok) return res.status(upstream.status).end();
    const buf = Buffer.from(await upstream.arrayBuffer());
    res
      .status(200)
      .set("Content-Type", upstream.headers.get("content-type") || "image/jpeg")
      .set("Cache-Control", "public, max-age=86400");
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: "代理失败：" + ((e && e.message) || String(e)) });
  }
});

app.listen(PORT, () => {
  console.log("  游戏主页: http://localhost:" + PORT + "/index.html");
  console.log("  代理接口: POST /api/llm  GET /api/img");
  if (serverCfg.baseUrl) console.log("  已加载服务端配置: " + serverCfg.baseUrl + (serverCfg.apiKey ? "（含密钥）" : "（无密钥）"));
  // 局域网地址（手机同 WiFi 访问；首次需在 Windows 防火墙放行 Node）
  const os = require("os");
  const lan = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) lan.push("http://" + ni.address + ":" + PORT + "/games/legend/");
    }
  }
  if (lan.length) console.log("  手机访问(传奇觉醒): " + lan.join("  "));
});
