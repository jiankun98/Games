/* 商业帝国（移动版）—— 核心数值回归测试
 * 运行：node run/test-empire.mjs
 * 覆盖：便利店扩充规则、税收机制、打工保底、命名校验、存档 round-trip、离线公式、经济节奏
 * 9 公司专项机制见 run/test-empire-industries.mjs
 */
import { EmpireCore } from "../games/empire/src/engine.js";
import cstoreH from "../games/empire/src/industries/cstore.js";
import { FORMULA as F, TAX, STOCK_SECTORS, PROPERTIES, INDUSTRY_TYPES } from "../games/empire/src/data.js";

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? " —— " + detail : "")); }
}
function section(t) { console.log("\n== " + t + " =="); }

const CS = INDUSTRY_TYPES[0];   // 便利店配置
const P1 = PROPERTIES[0];
// 便利店扩充成本公式（与 handler 一致）
const storeCost = (k) => CS.openCost * (1 + CS.costSlope * (k - 1));
const expandCostOf = (n, m) => { let s = 0; for (let k = n + 1; k <= n + m; k++) s += storeCost(k); return s; };
const storeValue = (n) => CS.openCost * n * (1 + CS.costSlope * (n - 1) / 2);

/* ---------- 1. 便利店扩充规则 ---------- */
section("便利店扩充规则");
{
  const e = new EmpireCore({ seed: 1 });
  e.openIndustry("cstore", "A店");
  const uid = e.industries[0].uid;
  ok(e.industries.length === 1 && e.industries[0].st.stores === 1, "开设后为 1 家门店");

  // 1→10：每次 +1
  const seq = [];
  for (let i = 0; i < 9; i++) { e.cash += expandCostOf(e.industries[0].st.stores, 1) * 2; seq.push(e.industryAction(uid, "expand").count); }
  ok(seq.every((n) => n === 1), "1→10 家每次扩充 1 家", JSON.stringify(seq));
  ok(e.industries[0].st.stores === 10, "9 次扩充后到 10 家");

  // ≥10：每次 +10
  const seq2 = [];
  for (let i = 0; i < 3; i++) { e.cash += expandCostOf(e.industries[0].st.stores, 10) * 2; seq2.push(e.industryAction(uid, "expand").count); }
  ok(seq2.every((n) => n === 10), "满 10 家后每次扩充 10 家", JSON.stringify(seq2));

  // 封顶 1000（含尾部不足 10 的情况）
  e.industries[0].st.stores = 985;
  e.cash += 1e11;
  ok(e.industryAction(uid, "expand").count === 10, "985 → 995 扩 10 家");
  ok(e.industryAction(uid, "expand").count === 5, "995 → 1000 只补 5 家");
  ok(e.industries[0].st.stores === 1000, "恰好到 1000 家");
  ok(!e.industryAction(uid, "expand").ok, "1000 家后拒绝再扩充");

  // 成本曲线与估值（对照 handler 公式）
  const v1000 = cstoreH.value(e.industries[0], e);
  ok(Math.abs(v1000 - storeValue(1000)) / storeValue(1000) < 0.001, "1000 家产业估值 = 重置成本公式", `${v1000} vs ${storeValue(1000)}`);
  const fullBonus = Math.max(...CS.milestones.map((m) => m.bonus));
  ok(cstoreH.grossPerDay(e.industries[0], e) === 1000 * CS.storeIncome * (1 + fullBonus), "1000 家日收益 = 1000×基准×满额加成");
}

/* ---------- 2. 税收机制 ---------- */
section("税收机制");
{
  // 注意：_daySettle 是全模块结算（分红+租金+便利店），断言需算全期望
  const e = new EmpireCore({ seed: 2 });
  e.cash += 1e8;

  // 股票：卖出印花税 0.1%
  e.mkt.stocks.sf01.price = 100;
  e.buyStock("sf01", 1000);
  const cashBefore = e.cash;
  e.sellStock("sf01", 1000);
  ok(Math.abs(e.cash - (cashBefore + 100000 - 100)) < 1e-6, "卖出印花税 0.1% 扣除");
  ok(Math.abs(e.taxesPaid.stamp - 100) < 1e-6, "印花税累计正确");

  // 股息税 10%（金融板块股息率动态取值）
  const SF01_DIV = STOCK_SECTORS.finance.div * 1.6;
  e.mkt.stocks.sf01.price = 100;
  e.buyStock("sf01", 1000);
  const cash2 = e.cash;
  e._daySettle();
  const divGross = 1000 * 100 * SF01_DIV;
  ok(Math.abs(e.cash - cash2 - divGross * 0.9 - F.baseSalary) < 1e-6, "股息税 10% 后入账（含无产业保底）");

  // 房产：契税 1.5% / 卖出 5% / 租金税 10%
  const propPrice = 50000;
  e.mkt.props.p1.price = propPrice;
  const cash3 = e.cash;
  e.buyProperty("p1");
  ok(Math.abs(cash3 - e.cash - propPrice * 1.015) < 1e-6, "买房含 1.5% 契税");
  const cash4 = e.cash;
  e._daySettle();
  const rentNet = propPrice * P1.yield * 0.9;
  ok(Math.abs(e.cash - cash4 - divGross * 0.9 - rentNet - F.baseSalary) < 1e-6, "租金扣 10% 税后入账", (e.cash - cash4) + " vs " + (divGross * 0.9 + rentNet));
  const cash5 = e.cash;
  e.sellProperty("p1");
  ok(Math.abs(e.cash - cash5 - propPrice * 0.95) < 1e-6, "卖房扣 5% 综合税");

  // 藏品：消费税 3% / 交易税 2%
  e.mkt.items.l01.price = 100000;
  const cash6 = e.cash;
  e.buyItem("l01", 2);
  ok(Math.abs(cash6 - e.cash - 206000) < 1e-6, "买藏品含 3% 消费税", (cash6 - e.cash));
  const cash7 = e.cash;
  e.sellItem("l01", 2);
  ok(Math.abs(e.cash - cash7 - 200000 * 0.98) < 1e-6, "卖藏品扣 2% 交易税");

  // 便利店所得税 25%（无其他持仓）
  e.sellStock("sf01", "all");
  e.openIndustry("cstore", "B店");
  const ind = e.industries[e.industries.length - 1];
  ind.st.stores = 10;
  const gross = cstoreH.grossPerDay(ind, e);
  const cash9 = e.cash;
  e._daySettle();
  ok(Math.abs(e.cash - cash9 - gross * 0.75) < 1e-3, "便利店利润扣 25% 所得税直进主账户", `${e.cash - cash9} vs ${gross * 0.75}`);
  ok(Math.abs(e.taxesPaid.income - gross * 0.25) < 1e-3, "所得税累计正确");
}

/* ---------- 3. 打工保底 ---------- */
section("打工保底");
{
  const e = new EmpireCore({ seed: 8 });
  const c0 = e.cash;
  e._daySettle();
  ok(Math.abs(e.cash - c0 - F.baseSalary) < 1e-9, "无产业时每日结算打工保底");
  const snap = e.snapshot();
  ok(Math.abs(snap.flowPerHour - F.baseSalary * F.hourDays) < 1e-6, "保底计入每小时现金流");
  e.cash += 1e6;
  e.openIndustry("cstore", "有产业后");
  e.cash = 0;
  const c1 = e.cash;
  e._daySettle();
  ok(Math.abs(e.cash - c1 - cstoreH.grossPerDay(e.industries[0], e) * 0.75) < 1e-3, "有产业后不再发保底");
}

/* ---------- 4. 命名校验 ---------- */
section("命名校验");
{
  const e = new EmpireCore({ seed: 3 });
  e.cash += 1e6;
  ok(!e.openIndustry("cstore", "").ok, "空名称拒绝");
  ok(!e.openIndustry("cstore", "  ").ok, "纯空白拒绝");
  ok(!e.openIndustry("cstore", "一二三四五六七八九十一二三四五").ok, "超长名称拒绝（15字）");
  ok(e.openIndustry("cstore", "宇宙连锁").ok, "正常名称成功");
  ok(!e.openIndustry("cstore", "宇宙连锁").ok, "重名拒绝");
  ok(e.openIndustry("cstore", "第二家分号").ok, "不同名可重复开设");
}

/* ---------- 5. 存档 round-trip ---------- */
section("存档");
{
  const e = new EmpireCore({ seed: 4 });
  e.cash += 1e7;
  e.openIndustry("cstore", "测试店");
  e.industryAction(e.industries[0].uid, "expand");
  e.buyStock("sf01", 500);
  e.buyProperty("p1");
  for (let i = 0; i < 1000; i++) e.tick(1);

  const json = e.save();
  const e2 = new EmpireCore({ seed: 99 });
  ok(e2.load(json), "存档可读取");
  ok(e2.cash === e.cash && e2.t === e.t, "现金与时间一致");
  ok(e2.industries.length === 1 && e2.industries[0].st.stores === 2, "便利店门店状态一致");
  ok(e2.portfolio.sf01.qty === 500, "持仓一致");
  ok(e2.propsOwned.p1.count === 1, "房产一致");
  ok(JSON.stringify(e2.taxesPaid) === JSON.stringify(e.taxesPaid), "税费累计一致");

  ok(!new EmpireCore({ seed: 5 }).load("{bad json"), "损坏 JSON 拒绝");
  ok(!new EmpireCore({ seed: 5 }).load(JSON.stringify({ v: 1 })), "旧版本存档拒绝");
  ok(e2.importSave(json).ok, "导入合法存档成功");
}

/* ---------- 6. 离线收益（便利店口径） ---------- */
section("离线收益");
{
  const e = new EmpireCore({ seed: 6 });
  e.openIndustry("cstore", "离线店");
  e.cash += 1e7;
  e.buyStock("sf01", 100);
  const cash0 = e.cash;
  const px = e.mkt.stocks.sf01.price;
  const r = e.offlineApply(3600 * 5);
  ok(r && r.seconds === 18000, "离线 5 小时封顶正确");
  ok(r.cash > 0 && e.cash > cash0, "离线收益入账");
  const days = (5 * 3600 / F.gameDay) * F.offlineEff;
  const divNet = 100 * px * SF01_DIV_VAL() * 0.9 * days;
  const cstoreNet = cstoreH.grossPerDay(e.industries[0], e) * days * 0.75;
  const expect = divNet + cstoreNet;
  ok(Math.abs(r.cash - expect) / expect < 0.01, "离线 = (分红税后+便利店税后)×效率×时长", `${r.cash} vs ${expect}`);
  ok(e.offlineApply(30) === null, "短于阈值无离线结算");

  function SF01_DIV_VAL() { return STOCK_SECTORS.finance.div * 1.6; }
}

/* ---------- 7. 经济节奏（休闲玩家：便利店+快递+股票+房产） ---------- */
section("经济节奏（休闲玩家模拟）");
console.log("  （模拟耗时约 2 分钟…）");
function casualDays(days, seed) {
  const e = new EmpireCore({ seed });
  e.openIndustry("cstore", "A");
  let ex = null;
  const exType = e.IND_BY_ID.express;
  for (let d = 0; d < days; d++) {
    for (let t = 0; t < 1800; t++) {
      e.tick(1);
      if (t % 300 === 0 && t > 0) {
        const uid0 = e.industries[0].uid;
        const stores = e.industries[0].st.stores;
        const m = stores < 10 ? 1 : 10;
        const cost = expandCostOf(stores, m);
        if (e.cash > cost * 1.15) { e.industryAction(uid0, "expand"); continue; }
        // 第 3 天后开快递公司（20 万）并持续买车
        if (!ex && d >= 3 && e.cash > 80e4) {
          const r = e.openIndustry("express", "顺达");
          if (r.ok) { ex = r.ind; e.industryAction(ex.uid, "invest", { amount: Math.min(e.cash * 0.5, 60e4) }); }
          continue;
        }
        if (ex) {
          // 盈余回流：快递池超过 100 万时分红一半回主账户参与复利
          if (ex.st.treasury > 100e4) e.industryAction(ex.uid, "divest", { amount: Math.floor(ex.st.treasury / 2) });
          // 主账户宽裕时才给快递注资买车
          if (ex.st.treasury < 20e4 && e.cash > 80e4) e.industryAction(ex.uid, "invest", { amount: Math.min(e.cash * 0.3, 100e4) });
          let best = null;
          for (const v of exType.fleet) {
            if (v.rating > e.ratingOf(ex.profit || 0)) continue;
            if (v.cost <= ex.st.treasury * 0.9) best = v;
          }
          if (best) e.industryAction(ex.uid, "buy", { fleetId: best.id });
          for (const f of ex.st.fleet) if (f.status === "down") e.industryAction(ex.uid, "repair", { fleetId: f.fleetId });
        }
        if (e.cash > 200000) {
          let best = null, bestDiv = 0;
          const snap = e.snapshot();
          for (const s of snap.stocks.market) if (s.divYieldDay > bestDiv) { bestDiv = s.divYieldDay; best = s.id; }
          if (best) e.buyStock(best, Math.floor((e.cash * 0.55) / e.mkt.stocks[best].price));
        }
        if (e.cash > 60000) e.buyProperty("p1");
      }
    }
    e.offlineApply(23.5 * 3600);
  }
  return e.snapshot().netWorth;
}
{
  const nw5 = casualDays(5, 12345);
  ok(nw5 > 3e5 && nw5 < 1.5e6, "休闲 5 天：30万~150万（起步期）", (nw5 / 1e4).toFixed(1) + "万");
  const nw10 = casualDays(10, 777);
  ok(nw10 > 3e6 && nw10 < 2e7, "休闲 10 天：300万~2000万（扩张期）", (nw10 / 1e4).toFixed(1) + "万");
  const nw15 = casualDays(15, 2024);
  ok(nw15 > 1.5e7 && nw15 < 1e8, "休闲 15 天：1500万~1亿（资本期）", (nw15 / 1e4).toFixed(1) + "万");
  const nw30 = casualDays(30, 31337);
  ok(nw30 >= 1e8 && nw30 < 2e9, "休闲 30 天：1亿~20亿（含新公司加速，约一个月达标）", (nw30 / 1e8).toFixed(2) + "亿");
}

/* ---------- 8. 快照完整性 ---------- */
section("快照");
{
  const e = new EmpireCore({ seed: 7 });
  e.cash += 1e6;
  e.openIndustry("cstore", "快照店");
  e.buyStock("sf01", 100);
  e.buyProperty("p1");
  e.buyItem("l01", 1);
  for (let i = 0; i < 300; i++) e.tick(1);
  const s = e.snapshot();
  ok(s.netWorth === e.netWorth(), "netWorth 与快照一致");
  ok(s.stocks.market.length === 45, "股票市场 45 支");
  ok(s.props.market.length === 10, "房产市场 10 套");
  ok(s.items.market.length === 32, "藏品 32 件");
  const domestic = s.stocks.market.filter((x) => x.region === "domestic").length;
  ok(domestic === 30, "国内 30 支");
  ok(s.records.length > 0, "流水有记录");
  ok(Math.abs(s.taxesTotal - Object.values(s.taxesPaid).reduce((a, b) => a + b, 0)) < 1e-6, "税费合计一致");
  ok(s.industries.length === 1 && s.industries[0].stores === 1, "产业快照含便利店门店");
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
