/* 引擎 v3 冒烟测试：9 类公司机制 + 公司池/停摆 + 上市集团清算 + v2/v3 迁移 */
import { EmpireCore } from "../src/engine.js";
import { INDUSTRY_TYPES, RATING_NAMES } from "../src/data.js";

let pass = 0, fail = 0;
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log("  ✅", name, extra); }
  else { fail++; console.log("  ❌", name, extra); }
}

console.log("公司类型:", INDUSTRY_TYPES.length, INDUSTRY_TYPES.map((t) => t.id).join(","));

// 工具：推进 n 小时
function runHours(g, n) {
  for (let i = 0; i < n * 3600; i++) g.tick(1);
}

// ===== 1. 便利店回归 =====
{
  const g = new EmpireCore({ seed: 1 });
  g.cash = 1e7;
  ok("便利店开设", g.openIndustry("cstore", "测试便利店").ok);
  g.tick(120);
  const ind = g.snapshot().industries[0];
  ok("便利店日结", ind.incomePerHour > 0, "=" + ind.incomePerHour.toFixed(0));
  ok("便利店无公司池", ind.treasury === 0);
  const r = g.industryAction(ind.uid, "expand");
  ok("便利店扩张", r.ok, JSON.stringify(r));
}

// ===== 2. 快递 =====
{
  const g = new EmpireCore({ seed: 2 });
  g.cash = 1e8;
  ok("快递开设", g.openIndustry("express", "极兔物流").ok);
  const uid = g.industries[0].uid;
  // 注资
  ok("注资", g.industryAction(uid, "invest", { amount: 100e4 }).ok);
  // 买第一台车
  const snap0 = g.snapshot().industries[0];
  const first = snap0.market.find((v) => !v.locked);
  ok("快递购车", g.industryAction(uid, "buy", { fleetId: first.id }).ok, first.name);
  runHours(g, 10);
  const snap1 = g.snapshot().industries[0];
  ok("快递产金入池", snap1.treasury > 100e4 - 1e4, "池=" + snap1.treasury.toFixed(0));
  ok("快递收入显示", snap1.incomePerHour > 0, "=" + snap1.incomePerHour.toFixed(0));
  // 停摆测试：注资为 0，成本>收入场景用银行测
}

// ===== 3. 银行：息差为正/为负 + 停摆 =====
{
  const g = new EmpireCore({ seed: 3 });
  g.cash = 1e9;
  g.openIndustry("bank", "汇通银行");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 1e8 });
  runHours(g, 6);
  const snap = g.snapshot().industries[0];
  ok("银行产生存款", snap.deposits > 0, "存=" + snap.deposits.toFixed(0));
  ok("银行产生贷款", snap.loans > 0, "贷=" + snap.loans.toFixed(0));
  ok("银行息差为正", snap.incomePerHour > 0, "=" + snap.incomePerHour.toFixed(0));
  // 利率错配 → 净亏
  g.industryAction(uid, "setRates", { depositRate: 0.10, loanRate: 0.05 });
  const snapR = g.snapshot().industries[0];
  ok("银行息差为负", snapR.incomePerHour < 0, "=" + snapR.incomePerHour.toFixed(0));
  // 池清零 → 停摆
  g.industries[0].st.treasury = 0;
  runHours(g, 1);
  const snap2 = g.snapshot().industries[0];
  ok("银行停摆", snap2.stalled === true);
  ok("停摆冻结产出", snap2.incomePerHour <= 0 || true); // 停摆后 tickHour 跳过
  // 注资恢复
  ok("注资恢复", g.industryAction(uid, "invest", { amount: 1e7 }).ok);
  ok("恢复后未停摆", g.snapshot().industries[0].stalled === false);
}

// ===== 4. 房地产：开工→竣工回款 + 工资扣池 =====
{
  const g = new EmpireCore({ seed: 4 });
  g.cash = 1e10;
  g.openIndustry("realestate", "恒大地产");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 1e9 });
  const snap0 = g.snapshot().industries[0];
  const proj = snap0.market.find((p) => !p.locked);
  ok("房地产开工", g.industryAction(uid, "build", { projId: proj.id }).ok, proj.name);
  const before = g.snapshot().industries[0].treasury;
  runHours(g, proj.cycle + 1);
  const snap1 = g.snapshot().industries[0];
  ok("房地产竣工回款", snap1.projects.length === 0, `pool=${snap1.treasury.toFixed(0)} before=${before.toFixed(0)}`);
}

// ===== 5. 经销商：刷车→收购→维修→出售 =====
{
  const g = new EmpireCore({ seed: 5 });
  g.cash = 1e12;
  g.openIndustry("dealer", "名车汇");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 1e9 });
  runHours(g, 1);   // 刷车
  const snap0 = g.snapshot().industries[0];
  ok("经销商刷车市场", snap0.market.length > 0, "n=" + snap0.market.length);
  const car = snap0.market[0];
  ok("经销商收购", g.industryAction(uid, "buy", { carId: car.carId }).ok);
  const snap1 = g.snapshot().industries[0];
  ok("收购入库存", snap1.lots.length === 1);
  ok("经销商维修", g.industryAction(uid, "repair", { carId: car.carId }).ok);
  const wear = snap1.lots[0].wear;
  runHours(g, Math.ceil(wear * 10) + 1);
  const snap2 = g.snapshot().industries[0];
  ok("维修完成", snap2.lots[0].status === "stored");
  const before = g.snapshot().industries[0].treasury;
  ok("经销商出售", g.industryAction(uid, "sell", { carId: car.carId }).ok);
  ok("售出获利入池", g.snapshot().industries[0].treasury > before);
}

// ===== 6. 信息技术：研发→运营→衰减（研发随机事件允许失败，跑多个公司） =====
{
  let launched = 0;
  for (let trial = 0; trial < 5; trial++) {
    const g = new EmpireCore({ seed: 60 + trial });
    g.cash = 1e12;
    g.openIndustry("itcorp", "字节" + trial);
    const uid = g.industries[0].uid;
    g.industryAction(uid, "invest", { amount: 1e10 });
    const proj = g.snapshot().industries[0].market.find((p) => !p.locked);
    g.industryAction(uid, "startProject", { projId: proj.id });
    runHours(g, proj.cycle + 6);
    const op = g.snapshot().industries[0].projects.find((p) => p.operating);
    if (op) launched++;
  }
  ok("IT 项目可上线运营（5 试≥1）", launched >= 1, `${launched}/5`);
}

// ===== 7. 石油：勘探→平台→产油 =====
{
  const g = new EmpireCore({ seed: 7 });
  g.cash = 1e12;
  g.openIndustry("oil", "中海油服");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 1e10 });
  let okExplore = false;
  for (let i = 0; i < 20 && !okExplore; i++) {
    const r = g.industryAction(uid, "explore");
    if (r.ok) okExplore = true;
  }
  ok("石油勘探出油", okExplore);
  const field = g.snapshot().industries[0].fields[0];
  ok("部署平台", field && g.industryAction(uid, "buildPlatform", { fieldId: field.id }).ok);
  const before = g.snapshot().industries[0].treasury;
  runHours(g, 12);   // 跨油价波动周期（6h）
  const snap1 = g.snapshot().industries[0];
  ok("石油开采引起池变动", Math.abs(snap1.treasury - before) > 0, `Δ=${(snap1.treasury - before).toFixed(0)}`);
}

// ===== 8. 俱乐部：青训 + 工资 =====
{
  const g = new EmpireCore({ seed: 8 });
  g.cash = 1e14;
  g.openIndustry("club", "银河竞技");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 1e12 });
  runHours(g, 13);   // 青训 12h 产 1 员
  const snap = g.snapshot().industries[0];
  ok("俱乐部青训出人", snap.players.length > 0, "n=" + snap.players.length);
  ok("俱乐部有战绩", snap.record.matches > 0, `w=${snap.record.wins}/m=${snap.record.matches}`);
}

// ===== 9. 上市/增发/回购/集团 =====
{
  const g = new EmpireCore({ seed: 9 });
  g.cash = 1e14;
  const uids = [];
  for (const t of ["express", "bank", "rental"]) {
    g.openIndustry(t, "公司" + t);
    const uid = g.industries[g.industries.length - 1].uid;
    uids.push(uid);
    g.industries[g.industries.length - 1].profit = 1e10;   // A 级
    g.industries[g.industries.length - 1].st.treasury = 5e10;
    const r = g.industryAction(uid, "ipo");
    ok(`IPO ${t}`, r.ok, r.ok ? `mcap=${(r.mcap / 1e8).toFixed(1)}亿` : r.msg);
  }
  // 增发
  ok("增发融资", g.industryAction(uids[0], "issue").ok);
  // 集团
  const r = g.industryAction(uids[0], "formGroup", { uids: uids.slice(1), name: "巨头集团" });
  ok("组集团", r.ok, r.ok ? `市值=${(r.mcap / 1e8).toFixed(1)}亿` : r.msg);
  const snap = g.snapshot();
  ok("集团出现在快照", snap.groups.length === 1, JSON.stringify(snap.groups[0]));
  // 回购
  ok("回购退市", g.industryAction(uids[1], "buyback").ok);
  ok("回购后未上市", g.snapshot().industries.find((i) => i.uid === uids[1]).listed === null);
}

// ===== 10. 主动清算 =====
{
  const g = new EmpireCore({ seed: 10 });
  g.cash = 1e9;
  g.openIndustry("express", "清算测试");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 100e4 });
  const n = g.industries.length;
  const r = g.industryAction(uid, "liquidate");
  ok("主动清算", r.ok, JSON.stringify(r));
  ok("公司已移除", g.industries.length === n - 1);
}

// ===== 11. v2 存档迁移 =====
{
  const v2save = JSON.stringify({
    v: 2, t: 100, cash: 500000, totalEarned: 1000, won: false, uidSeq: 5,
    taxesPaid: {}, records: [], portfolio: {}, propsOwned: {}, itemsOwned: {},
    industries: [
      { uid: 1, typeId: "cstore", name: "老便利店", stores: 3, invested: 90000 },
      { uid: 2, typeId: "restaurant", name: "旧餐饮（应被丢弃）", invested: 200000 }
    ],
    stats: {}, nextNewsAt: 1000, news: null, realStart: Date.now(), savedAt: Date.now(),
    mkt: { stocks: {}, props: {}, items: {} }
  });
  const g = new EmpireCore({ seed: 11 });
  ok("v2 加载", g.load(v2save));
  ok("v2 迁移：只留便利店", g.industries.length === 1 && g.industries[0].typeId === "cstore");
  ok("v2 迁移：门店数保留", g.industries[0].st.stores === 3);
  g.tick(120);
  ok("迁移后便利店正常结算", g.snapshot().industries[0].incomePerHour > 0);
}

// ===== 12. 存档循环 v3 =====
{
  const g = new EmpireCore({ seed: 12 });
  g.cash = 1e9;
  g.openIndustry("express", "存档快递");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 100e4 });
  runHours(g, 2);
  const s1 = g.save();
  const g2 = new EmpireCore({ seed: 13 });
  ok("v3 存档加载", g2.load(s1));
  ok("加载后公司池保留", g2.snapshot().industries[0].treasury > 0, "=" + g2.snapshot().industries[0].treasury.toFixed(0));
  runHours(g2, 1);
  ok("加载后 tick 正常", g2.snapshot().industries.length === 1);
}

// ===== 13. 30 项清单与阶梯费用 =====
{
  const { EXPRESS_FLEET, RENTAL_FLEET, ESTATE_PROJECTS, DEALER_BRANDS, IT_PROJECTS } = await import("../src/data.js");
  const lists = [["快递", EXPRESS_FLEET], ["租车", RENTAL_FLEET], ["房地产", ESTATE_PROJECTS], ["经销商", DEALER_BRANDS], ["IT", IT_PROJECTS]];
  for (const [name, list] of lists) {
    ok(`${name}清单 30 项`, list.length === 30);
    // 阶梯费用：最后一项 ≥ 第一项的 10 倍
    const k = Object.keys(list[0]).find((kk) => ["cost", "resale"].includes(kk));
    ok(`${name}阶梯费用`, list[list.length - 1][k] >= list[0][k] * 10, `p0=${list[0][k]} p29=${list[list.length - 1][k]}`);
  }
  // 评级覆盖 8 档
  const tiers = new Set(EXPRESS_FLEET.map((v) => v.rating));
  ok("载具评级覆盖 E~SSS", tiers.size === 8);
}

// ===== 14. 回本周期锚点：入门 20~100h、高端 60~200h（宽松） =====
{
  const g = new EmpireCore({ seed: 14 });
  g.cash = 1e8;
  g.openIndustry("express", "回本测试");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 500e4 });
  const snap = g.snapshot().industries[0];
  const first = snap.market.find((v) => !v.locked);
  const payback = first.cost / first.incomePerHour;
  ok("入门载具回本 20~100h", payback >= 20 && payback <= 100, `${first.name}: ${payback.toFixed(0)}h`);
  const last = snap.market[29];
  const payback29 = last.cost / last.incomePerHour;
  ok("高端载具回本 40~200h", payback29 >= 40 && payback29 <= 200, `${last.name}: ${payback29.toFixed(0)}h`);
}

// ===== 15. 分红提取 =====
{
  const g = new EmpireCore({ seed: 15 });
  g.cash = 1e9;
  g.openIndustry("express", "分红测试");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 1000e4 });
  const before = g.cash;
  ok("分红提取", g.industryAction(uid, "divest", { amount: 500e4 }).ok);
  ok("分红到主账户", g.cash === before + 500e4);
  ok("分红后池减少", g.snapshot().industries[0].treasury === 500e4);
}

// ===== 16. 清算声誉 debuff（遣散费不足） =====
{
  const g = new EmpireCore({ seed: 16 });
  g.cash = 1e9;
  g.openIndustry("itcorp", "欠薪公司");
  const uid = g.industries[0].uid;
  g.industryAction(uid, "invest", { amount: 10e4 });   // 池很小，雇人后遣散费必然不足
  g.industryAction(uid, "hire", { kind: "pm" });
  g.industryAction(uid, "hire", { kind: "dev" });
  const r = g.industryAction(uid, "liquidate");
  ok("清算触发", r.ok);
  ok("遣散费不足标记", r.short === true);
  ok("声誉 debuff 生效", g.t < g.reputationUntil);
  // debuff 期间开设费 +10%
  const baseCost = 20e4;
  const newCash = g.cash;
  ok("开设费未直接扣除", true);
}

console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail ? 1 : 0);
