/* 商业帝国 —— 数值回归（node 直跑）
 * 用法：node run/test-empire.js
 */
"use strict";

require("../games/empire/data.js");
require("../games/empire/index.js");

var DATA = globalThis.EMPIRE_DATA;
var EmpireEngine = globalThis.EmpireEngine;
var fmt = globalThis.EMPIRE_FMT.fmt;

var passed = 0, failed = 0;
function T(name, fn) {
  try {
    fn();
    passed++;
    console.log("  ok  " + name);
  } catch (e) {
    failed++;
    console.log("FAIL  " + name + " :: " + e.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }

function newEngine(seed) { return new EmpireEngine({ seed: seed || 42 }); }

function finiteDeep(obj, path) {
  path = path || "root";
  if (typeof obj === "number") {
    if (!isFinite(obj)) throw new Error("非有限数 at " + path + " = " + obj);
    return;
  }
  if (obj && typeof obj === "object") {
    for (var k in obj) finiteDeep(obj[k], path + "." + k);
  }
}

/* ---------- 1. 冒烟：一小时模拟全程有限 ---------- */
T("冒烟：1 小时随机模拟数值全部有限", function () {
  var e = newEngine(1);
  for (var s = 0; s < 3600; s++) e.tick(1);
  finiteDeep(e.save(), "save");
  assert(e.cash >= 0, "现金为负");
});

/* ---------- 2. 早餐铺：不雇人几乎无产出 ---------- */
T("产业：不雇人时产出≈0", function () {
  var e = newEngine(2);
  e.cash = 1000;
  assert(e.buyIndustry("breakfast").ok, "开设早餐铺");
  var snap = e.calcIndustry("breakfast");
  assert(snap.q <= 0.0001, "无员工时 Q 应为 0，实际 " + snap.q);
});

/* ---------- 3. 早餐铺：雇人+设备后净利为正 ---------- */
T("产业：雇人+设备+配方后净利>0", function () {
  var e = newEngine(3);
  e.cash = 5000;
  e.buyIndustry("breakfast");
  e.buyEquip("breakfast", "steamer");
  e.buyEquip("breakfast", "steamer");
  // 雇两名帮厨（生成确定候选）
  for (var i = 0; i < 2; i++) {
    var cands = e.candidates.breakfast;
    var idx = 0;
    for (var j = 0; j < cands.length; j++) if (cands[j].posId === "bc") idx = j;
    if (!cands[idx]) idx = 0;
    e.hire("breakfast", idx);
  }
  var snap = e.calcIndustry("breakfast");
  assert(snap.q > 0.5, "应有产出，实际 Q=" + snap.q.toFixed(2));
  assert(snap.net > 0, "合理经营净利应为正，实际 " + snap.net.toFixed(2));
});

/* ---------- 4. 原料暴涨 → 净利转负 ---------- */
T("产业：原料暴涨 3 倍净利转负（非保本）", function () {
  var e = newEngine(4);
  e.cash = 5000;
  e.buyIndustry("breakfast");
  e.buyEquip("breakfast", "griddle");
  var cands = e.candidates.breakfast;
  e.hire("breakfast", 0); e.hire("breakfast", 0);
  e.learnRecipe("breakfast", "baozi");
  e.setRecipe("breakfast", "baozi");
  var snap0 = e.calcIndustry("breakfast");
  assert(snap0.net > 0, "正常原料价应盈利");
  // 强制面粉×3（包子主要成本是肉，一并拉高）
  e.mkt.ings.flour.price = DATA.INGREDIENTS.filter(function (x) { return x.id === "flour"; })[0].base * 3;
  e.mkt.ings.meat.price = DATA.INGREDIENTS.filter(function (x) { return x.id === "meat"; })[0].base * 3;
  var snap1 = e.calcIndustry("breakfast");
  assert(snap1.net < 0, "原料×3 应亏损，实际 " + snap1.net.toFixed(2));
});

/* ---------- 5. 车队：里程耗尽自动报废 ---------- */
T("车队：车辆跑满里程自动报废并回收残值", function () {
  var e = newEngine(5);
  e.cash = 1e7;
  e.buyIndustry("fleet");
  e.buyEquip("fleet", "eco");
  var cands = e.candidates.fleet;
  for (var i = 0; i < 3; i++) if (e.candidates.fleet.length) e.hire("fleet", 0);
  var ind = e.industries.fleet;
  assert(ind.equip.length === 1, "应有一辆车");
  // 加速：直接烧里程
  ind.equip[0].left = 1;
  var cash0 = e.cash;
  for (var s = 0; s < 30 && ind.equip.length === 1; s++) e.tick(1);
  assert(ind.equip.length === 0, "车辆应已报废，剩 " + ind.equip.length);
  assert(e.cash > cash0, "残值应入账");
});

/* ---------- 6. 手游：热度衰减与再立项 ---------- */
T("手游：热度衰减压低需求，再立项重置", function () {
  var e = newEngine(6);
  e.cash = 1e9;
  e.buyIndustry("game");
  e.buyEquip("game", "office");
  var ind = e.industries.game;
  var d0 = e.calcIndustry("game").demand;
  for (var s = 0; s < 300; s++) e.tick(1);
  var d1 = e.calcIndustry("game").demand;
  assert(ind.hype <= 0.25 + 1e-6, "热度应衰减到下限，实际 " + ind.hype.toFixed(3));
  assert(d1 < d0, "需求应随热度下降");
  e.cash = 1e9;
  e.learnRecipe("game", "card");
  e.setRecipe("game", "card");
  assert(ind.hype === 1, "再立项应重置热度");
});

/* ---------- 7. 分红：持有高息股按游戏日入账 ---------- */
T("股市：持有高息股一个游戏日获得分红", function () {
  var e = newEngine(7);
  e.cash = 1e7;
  var r = e.buyStock("sf01", 1000); // 宇宙银行 蓝筹高息
  assert(r.ok, "买入成功");
  var d0 = e.dividendsTotal;
  for (var s = 0; s < 62; s++) e.tick(1);
  assert(e.dividendsTotal > d0, "应获得分红");
  assert(e.portfolio.sf01.div > 0, "持仓累计分红>0");
});

/* ---------- 8. 便利店多 SKU ---------- */
T("便利店：等级开槽后多 SKU 并行销售", function () {
  var e = newEngine(8);
  e.cash = 1e6;
  e.buyIndustry("store");
  e.buyEquip("store", "shelf");
  e.hire("store", 0);
  e.learnRecipe("store", "bianbian");
  var snap1 = e.calcIndustry("store");
  assert(snap1.lines.length === 1, "初始仅主推 SKU");
  var ind = e.industries.store;
  ind.level = 10;
  var snap2 = e.calcIndustry("store");
  assert(snap2.lines.length === 2, "10 级应开 2 槽，实际 " + snap2.lines.length);
  assert(snap2.lines.length <= snap2.slots, "上架数不超槽位");
});

/* ---------- 9. 航天订单制 ---------- */
T("航天：订单周期大额结算入账", function () {
  var e = newEngine(9);
  e.cash = 1e11;
  e.buyIndustry("space");
  e.buyEquip("space", "pad");
  e.hire("space", 0);
  var paid = 0;
  e.onEvent = function (type, p) { if (type === "payout") paid += p.amount; };
  for (var s = 0; s < 70; s++) e.tick(1);
  assert(paid > 0, "70 秒内应有订单结算");
});

/* ---------- 10. 存档 round-trip ---------- */
T("存档：save→load 状态一致", function () {
  var e = newEngine(10);
  e.cash = 1e6;
  e.buyIndustry("breakfast");
  e.buyEquip("breakfast", "steamer");
  e.hire("breakfast", 0);
  e.buyStock("st01", 10);
  e.buyProperty("p1");
  for (var s = 0; s < 120; s++) e.tick(1);
  var sv = JSON.parse(JSON.stringify(e.save()));
  var cashBefore = e.cash;
  var e2 = newEngine(11);
  assert(e2.load(sv), "load 成功");
  var w1 = e.netWorth(), w2 = e2.netWorth();
  assert(Math.abs(w1 - w2) / Math.max(1, w1) < 0.05, "净资产应接近 " + w1 + " vs " + w2);
  assert(e2.industries.breakfast.level === e.industries.breakfast.level, "等级一致");
  assert(e2.portfolio.st01.qty === 10, "持仓一致");
  assert(e2.propsOwned.p1 === 1, "房产一致");
});

/* ---------- 11. 离线收益 ---------- */
T("离线：8 小时按 60% 效率结算", function () {
  var e = newEngine(12);
  e.cash = 1e6;
  e.buyIndustry("breakfast");
  e.buyEquip("breakfast", "steamer");
  e.hire("breakfast", 0);
  var flow = e.cashFlowPerSec().total;
  var res = e.applyOffline(8 * 3600);
  assert(res && res.gain > 0, "应有离线收益");
  var expect = flow * 8 * 3600 * DATA.FORMULA.offlineEff * 0.5; // 分红近似，宽松下界
  assert(res.gain > expect, "离线收益量级正确 " + fmt(res.gain) + " vs " + fmt(expect));
});

/* ---------- 12. 纯挂机 24h 不达标 ---------- */
T("平衡：初期布局后纯挂机 24h 身价 < 10 亿", function () {
  var e = newEngine(13);
  e.cash = 5000;
  e.buyIndustry("breakfast");
  e.buyEquip("breakfast", "steamer");
  e.buyEquip("breakfast", "steamer");
  e.hire("breakfast", 0); e.hire("breakfast", 0);
  for (var s = 0; s < 86400; s++) e.tick(1);
  var w = e.netWorth();
  assert(w < 1e9, "挂机 24h 身价应 <10亿，实际 " + fmt(w));
});

/* ---------- 13. 主动经营：贪心策略登顶万亿 ---------- */
T("平衡：贪心策略 25~50 分钟内登顶万亿", function () {
  var e = newEngine(2024);
  var IND = DATA.INDUSTRIES;

  function manage() {
    var i, j, def, ind;
    for (i = 0; i < IND.length; i++) {
      def = IND[i]; ind = e.industries[def.id];
      if (!ind) {
        if (e.cash > def.unlock * 1.05) e.buyIndustry(def.id);
        continue;
      }
      // 学配方（保留缓冲）并切换到最优主推
      for (j = 0; j < def.recipes.length; j++) {
        var r = def.recipes[j];
        if (ind.recipes.indexOf(r.id) < 0 && e.cash > r.learn * 1.3 + def.unlock * 0.3) {
          e.learnRecipe(def.id, r.id);
        }
      }
      var lastLearned = ind.recipes[ind.recipes.length - 1];
      if (def.special && def.special.type === "lifecycle") {
        if (ind.hype < 0.5) {
          var bd = def.recipes.filter(function (x) { return x.id === lastLearned; })[0];
          if (e.cash > bd.learn * def.special.relaunchCost * 1.5) e.setRecipe(def.id, lastLearned);
        }
      } else if (ind.active !== lastLearned) {
        e.setRecipe(def.id, lastLearned);
      }
      var snap = e.calcIndustry(def.id);
      // 瓶颈补设备：产能被设备卡住时买可负担的最优设备
      if (snap.equipPower <= snap.workerPower && snap.q < snap.demand * 0.95) {
        for (j = def.equipment.length - 1; j >= 0; j--) {
          var eq = def.equipment[j];
          if (e.cash > eq.price * 1.3) { e.buyEquip(def.id, eq.id); break; }
        }
      }
      // 瓶颈雇人：劳动力不足且需求未满足时才雇（避免工资死亡螺旋）
      snap = e.calcIndustry(def.id);
      if (snap.workerPower < snap.equipPower && snap.q < snap.demand * 0.95) {
        var cands = e.candidates[def.id] || [];
        for (j = 0; j < cands.length; j++) {
          if (e.cash > cands[j].fee * 3) { e.hire(def.id, j); break; }
        }
      }
      // 维修
      for (j = 0; j < ind.equip.length; j++) {
        if (!ind.equip[j].left && ind.equip[j].dur < 30 && e.cash > e.repairCost(def.id, j) * 2) e.repairEquip(def.id, j);
      }
      // 升级：需求吃满就升级扩需求；现金充裕也升级
      snap = e.calcIndustry(def.id);
      var uc = e.upgradeCost(def.id);
      if ((snap.q >= snap.demand * 0.9 && e.cash > uc * 1.5) || e.cash > uc * 4) {
        e.upgradeIndustry(def.id, 1);
      }
    }
    // 闲钱投资：蓝筹吃股息 + 一套房产 + 低估蓝筹
    if (e.cash > 3e5) e.buyStock("sf01", "max");
    if (e.cash > 3e5) e.buyStock("sf02", "max");
    if (!e.propsOwned.p1 && e.cash > DATA.PROPERTIES[0].price * 2) e.buyProperty("p1");
  }

  var t = 0, maxT = 3000;
  while (t < maxT) {
    e.tick(1);
    if (t % 5 === 0) manage();
    t++;
    if (e.won) break;
  }
  var w = e.netWorth();
  var mins = (t / 60).toFixed(1);
  console.log("      → 登顶用时 " + mins + " 分钟，终局身价 " + fmt(w) + "，产业 " +
    Object.keys(e.industries).filter(function (k) { return e.industries[k]; }).length + "/12");
  assert(isFinite(w), "身价有限");
  assert(w >= 1e12, "应达万亿，实际 " + fmt(w) + "（用时 " + mins + " 分钟）");
  assert(t <= 50 * 60, "应在 50 分钟内完成，实际 " + mins + " 分钟");
  assert(t >= 25 * 60, "不应快于 25 分钟（缺乏经营深度），实际 " + mins + " 分钟");
});

/* ---------- 汇总 ---------- */
console.log("");
console.log("========================================");
console.log("通过 " + passed + " / 失败 " + failed);
console.log("========================================");
process.exit(failed ? 1 : 0);
