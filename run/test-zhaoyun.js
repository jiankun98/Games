/* 赵云与阿斗 —— 数值平衡模拟回归（node 直跑，无 DOM）
 * 用法：node run/test-zhaoyun.js
 * 验证：
 *   1) 挂机（无操作）应死于第 1 波
 *   2) 基础自动策略（召唤/放置/合并/激活/用铲）应存活 8~30 波
 *   3) 满配理论阵容应存活 30+ 波（无尽后期指数碾压线性，验证存在崩盘点）
 */
"use strict";

/* node 下 IIFE 挂到 globalThis */
require("../games/zhaoyun/data.js");
require("../games/zhaoyun/index.js");

var DATA = globalThis.ZY_DATA;
var ZYEngine = globalThis.ZYEngine;

function fmt(n) { return n === undefined ? "-" : String(n); }

/* ---------------- 自动玩家 ---------------- */
/* 格子贴路度：到最近道路格的距离（越小越优先布防） */
function buildCellScore(eng) {
  var roads = eng.cells.filter(function (c) { return c.type === "path"; });
  var scores = {};
  eng.cells.forEach(function (c, i) {
    var best = 1e9;
    roads.forEach(function (p) {
      var d = Math.abs(p.x - c.x) + Math.abs(p.y - c.y);
      if (d < best) best = d;
    });
    scores[i] = best;
  });
  return scores;
}

function AutoPlayer(engine, policy) {
  this.eng = engine;
  this.policy = policy || {};
  this.actTimer = 0;
  this.generalsActivated = 0;
  this.charsSeen = {};
  this.scores = buildCellScore(engine);
  var self = this;
  var origSummon = engine.summon.bind(engine);
  engine.summon = function () {
    var ok = origSummon();
    if (ok) {
      engine.bench.forEach(function (it) {
        if (it && it.kind === "char") self.charsSeen[it.ch] = (self.charsSeen[it.ch] || 0) + 1;
      });
    }
    return ok;
  };
}
/* 按“贴路优先”排序的可放置格索引 */
AutoPlayer.prototype.buildCells = function () {
  var self = this;
  var idx = [];
  this.eng.cells.forEach(function (c, i) {
    if (c.type === "build") idx.push(i);
  });
  idx.sort(function (a, b) { return self.scores[a] - self.scores[b]; });
  return idx;
};
AutoPlayer.prototype.act = function () {
  var eng = this.eng;
  if (eng.phase === "over") return;

  /* 1. 处理待命区 */
  while (eng.bench.length) {
    var item = eng.bench[0];
    var done = false;
    var cells = this.buildCells();
    if (item.kind === "shovel") {
      /* 优先开垦贴路的未开发格；无则铲最低级兵种 */
      var wildIdx = -1, bestScore = 1e9;
      var self2 = this;
      eng.cells.forEach(function (c, i) {
        if (c.type === "wild" && self2.scores[i] <= 130 && self2.scores[i] < bestScore) { bestScore = self2.scores[i]; wildIdx = i; }
      });
      if (wildIdx >= 0) { eng.place({ from: "bench", idx: 0 }, wildIdx); continue; }
      var lowIdx = -1, lowLv = 99;
      cells.forEach(function (i) {
        var c = eng.cells[i];
        if (c.item && c.item.kind === "troop" && c.item.level < lowLv) { lowLv = c.item.level; lowIdx = i; }
      });
      if (lowIdx >= 0) { eng.place({ from: "bench", idx: 0 }, lowIdx); continue; }
      eng.sell({ from: "bench", idx: 0 });
      continue;
    }
    /* 2. 武将配对（优先） */
    for (var k = 0; k < cells.length && !done; k++) {
      var c = eng.cells[cells[k]];
      if (!c.item) continue;
      var g = eng._pairGeneral(item, c.item);
      if (g) {
        if (eng.place({ from: "bench", idx: 0 }, cells[k])) { this.generalsActivated++; done = true; }
      }
    }
    if (done) continue;
    /* 3. 同类合并 */
    for (k = 0; k < cells.length && !done; k++) {
      var c2 = eng.cells[cells[k]];
      if (!c2.item) continue;
      if (eng._mergeable(item, c2.item) && c2.item.level < DATA.LEVEL_MAX) {
        if (eng.place({ from: "bench", idx: 0 }, cells[k])) done = true;
      }
    }
    if (done) continue;
    /* 4. 空格放置（贴路优先）；碎片字无空格时卖掉场上最低级兵种腾位 */
    var emptyIdx = -1;
    for (k = 0; k < cells.length && emptyIdx < 0; k++)
      if (!eng.cells[cells[k]].item) emptyIdx = cells[k];
    if (emptyIdx < 0 && item.kind === "char") {
      lowIdx = -1; lowLv = 99;
      cells.forEach(function (i) {
        var cc = eng.cells[i];
        if (cc.item && cc.item.kind === "troop" && cc.item.level < lowLv) { lowLv = cc.item.level; lowIdx = i; }
      });
      if (lowIdx >= 0) { eng.sell({ from: "cell", idx: lowIdx }); emptyIdx = lowIdx; }
    }
    if (emptyIdx >= 0) {
      if (eng.place({ from: "bench", idx: 0 }, emptyIdx)) done = true;
    }
    if (done) continue;
    /* 5. 无处安放：出售 */
    eng.sell({ from: "bench", idx: 0 });
  }

  /* 6. 召唤决策 */
  var cost = eng.summonCost();
  var keep = this.policy.keepMantou || 0;
  var wantMore = true;
  if (this.policy.stopAfterSummons && eng.summonCount >= this.policy.stopAfterSummons) wantMore = false;
  if (eng.mantou >= cost + keep && wantMore) eng.summon();
};

/* ---------------- 模拟一局 ---------------- */
function simulate(name, policy, silent) {
  var eng = new ZYEngine({ onEvent: function (type) {
    if (type === "gameover") { /* 结束由 update 返回后检测 */ }
  }});
  if (policy && policy.setup) policy.setup(eng);
  var player = new AutoPlayer(eng, policy);
  var dt = 0.1, steps = 0, maxSteps = 60 * 60 * 60;  // 最多模拟 60 分钟
  var lastAct = 0;
  while (eng.phase !== "over" && steps < maxSteps) {
    eng.update(dt);
    lastAct += dt;
    if (!policy.idle && lastAct >= 0.5) { lastAct = 0; player.act(); }
    steps++;
  }
  if (!silent) {
    var stat = "波数=" + fmt(eng.wave) + " 斩敌=" + fmt(eng.kills) +
      " 用时=" + Math.round(eng.elapsed) + "s 召唤=" + eng.summonCount + "次 武将=" + player.generalsActivated + "名" +
      " 碎片=" + Object.keys(player.charsSeen).map(function (k) { return k + "×" + player.charsSeen[k]; }).join("");
    console.log("  [" + name + "] " + stat);
  }
  return { wave: eng.wave, kills: eng.kills, generals: player.generalsActivated, summon: eng.summonCount };
}

/* 满配开局：开垦 10 个贴路格，布满 7 级阵容 */
function setupFull(eng) {
  var scores = buildCellScore(eng);
  var idx = [];
  eng.cells.forEach(function (c, i) { if (c.type !== "path") idx.push(i); });
  idx.sort(function (a, b) { return scores[a] - scores[b]; });
  var spots = idx.slice(0, 10);
  spots.forEach(function (i) { eng.cells[i].type = "build"; });
  var setup = [
    { kind: "general", gid: "zhaoyun", ch: "赵云", level: 7, exp: 0, troop: "qiang", quality: "gold",
      skillT: 3, skillCd: 15, buffSpdT: 0, buffSpdV: 0, buffAtkT: 0, buffAtkV: 0, rapidT: 0, tiredT: 0 },
    { kind: "general", gid: "huangzhong", ch: "黄忠", level: 7, exp: 0, troop: "gong", quality: "gold",
      skillT: 3, skillCd: 14, buffSpdT: 0, buffSpdV: 0, buffAtkT: 0, buffAtkV: 0, rapidT: 0, tiredT: 0 },
    { kind: "general", gid: "caocao", ch: "曹操", level: 7, exp: 0, troop: "jian", quality: "gold",
      skillT: 3, skillCd: 16, buffSpdT: 0, buffSpdV: 0, buffAtkT: 0, buffAtkV: 0, rapidT: 0, tiredT: 0 },
    { kind: "general", gid: "zhouyu", ch: "周瑜", level: 7, exp: 0, troop: "gong", quality: "gold",
      skillT: 3, skillCd: 16, buffSpdT: 0, buffSpdV: 0, buffAtkT: 0, buffAtkV: 0, rapidT: 0, tiredT: 0 },
    { kind: "troop", id: "gong", ch: "弓", level: 7 },
    { kind: "troop", id: "gong", ch: "弓", level: 7 },
    { kind: "troop", id: "qiang", ch: "枪", level: 7 },
    { kind: "troop", id: "qiang", ch: "枪", level: 7 },
    { kind: "troop", id: "dao", ch: "刀", level: 7 },
    { kind: "troop", id: "dao", ch: "刀", level: 7 }
  ];
  for (var i = 0; i < setup.length; i++) eng.cells[spots[i]].item = JSON.parse(JSON.stringify(setup[i]));
  eng.mantou = 500;
}

/* ---------------- 基准数值打印 ---------------- */
console.log("== 《赵云与阿斗》无尽波次曲线采样 ==");
console.log("  波次   小兵HP   每波数量   出怪间隔   击杀馒头");
[1, 3, 5, 8, 10, 12, 15, 20, 25, 30, 35, 40].forEach(function (w) {
  var eng = new ZYEngine({});
  var hp = Math.round(eng._waveHp(w));
  console.log("  " + pad(w, 4) + pad(hp, 9) + pad(DATA.WAVES.count(w), 10) +
    pad(DATA.WAVES.spawnGap(w).toFixed(2), 11) + pad(DATA.WAVES.killReward(w), 9));
});
function pad(v, n) { v = String(v); while (v.length < n) v += " "; return v; }

/* 多跑几局取中位数，消除随机方差 */
function median(arr) {
  var s = arr.slice().sort(function (a, b) { return a - b; });
  return s[Math.floor(s.length / 2)];
}

console.log("\n== 模拟对局（各 5 局取中位数）==");

var fails = [];

/* 1. 挂机 */
console.log("· 挂机（不征兵不布阵）:");
var idleWaves = [];
for (var r = 0; r < 3; r++) idleWaves.push(simulate("idle", { idle: true }, true).wave);
console.log("  存活波数: " + idleWaves.join(", ") + "（预期 1）");
if (idleWaves.some(function (w) { return w !== 1; })) fails.push("挂机应死于第 1 波，实际 " + idleWaves.join(","));

/* 2. 基础自动策略 */
console.log("· 自动策略（召唤→配对→合并→放置）:");
var autoWaves = [], autoGenerals = 0;
for (r = 0; r < 5; r++) {
  var res = simulate("auto", {}, r < 2);
  autoWaves.push(res.wave); autoGenerals += res.generals;
}
var autoMed = median(autoWaves);
console.log("  存活波数: " + autoWaves.join(", ") + "（中位 " + autoMed + "，预期 8~30；累计激活武将 " + autoGenerals + " 名）");
if (autoMed < 8 || autoMed > 30) fails.push("自动策略中位存活波数超出 8~30 区间: " + autoMed);

/* 3. 满配理论阵容 */
console.log("· 满配阵容（10 格 7 级，含 4 金将）:");
var fullWaves = [];
for (r = 0; r < 3; r++) fullWaves.push(simulate("full", { setup: setupFull, keepMantou: 0 }, true).wave);
var fullMed = median(fullWaves);
console.log("  存活波数: " + fullWaves.join(", ") + "（中位 " + fullMed + "，预期 30+ 且 < 60：后期指数碾压）");
if (fullMed < 30) fails.push("满配阵容应存活 30+ 波，实际中位 " + fullMed);
if (fullMed > 60) fails.push("满配阵容活过 60 波，无尽崩盘点过远: " + fullMed);

/* ---------------- 结果 ---------------- */
console.log("\n== 回归结果 ==");
if (fails.length) {
  fails.forEach(function (f) { console.log("  ✗ " + f); });
  process.exitCode = 1;
} else {
  console.log("  ✓ 全部通过");
}
