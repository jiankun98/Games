/* 商业帝国（移动版）—— 9 大公司专项机制测试
 * 运行：node run/test-empire-industries.mjs
 * 覆盖：公司池/停摆/注资分红、各公司核心机制、P0 回归（资金销毁/carId/NaN/集团入池/清算返还）、
 *       上市/增发/回购/集团、主动清算（12h 拍卖/遣散/声誉）、v2→v3 迁移、回本周期锚
 */
import { EmpireCore } from "../games/empire/src/engine.js";
import { FORMULA as F, TAX, INDUSTRY_TYPES, RATING_NAMES } from "../games/empire/src/data.js";

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? " —— " + detail : "")); }
}
function section(t) { console.log("\n== " + t + " =="); }

const TYPE = Object.fromEntries(INDUSTRY_TYPES.map((t) => [t.id, t]));
function open(e, typeId, name, invest = 0) {
  const r = e.openIndustry(typeId, name);
  if (!r.ok) throw new Error("开设失败: " + r.msg);
  if (invest > 0) e.industryAction(r.ind.uid, "invest", { amount: invest });
  return r.ind;
}
// 机制测试禁用随机新闻（避免经营加成干扰精确断言；新闻系统在 test-empire.mjs 长跑中覆盖）
function muteNews(e) { e.nextNewsAt = 1e18; }

/* ---------- 1. 公司池：注资/分红/停摆/恢复 ---------- */
section("公司池与停摆");
{
  const e = new EmpireCore({ seed: 11 });
  muteNews(e);
  e.cash += 1e7;
  const ind = open(e, "express", "测试快递", 100e4);
  ok(ind.st.treasury === 100e4, "注资入池");
  const c0 = e.cash;
  e.industryAction(ind.uid, "divest", { amount: 40e4 });
  ok(Math.abs(e.cash - c0 - 40e4) < 1e-6 && ind.st.treasury === 60e4, "分红提取到主账户");
  // 停摆：银行利率错配（息差必负）→ 池亏空 → 停摆（无强制清算）
  const ind2 = open(e, "bank", "亏本银行", 10e4);
  ind2.st.depositRate = 0.10; ind2.st.loanRate = 0.05;
  ind2.st.deposits = 5000e4; ind2.st.loans = 0; ind2.st.vault = 5000e4;
  for (let i = 0; i < 120 * 40; i++) e.tick(1);   // 40 游戏日
  ok(ind2.st.stalled === true, "利率错配导致停摆（无强制清算）");
  ok(ind2.st.treasury === 0, "停摆不累积债务（池归零非负数）");
  e.cash += 1e8;
  e.industryAction(ind2.uid, "invest", { amount: 1e8 });
  ok(ind2.st.stalled === false, "注资后自动恢复");
}

/* ---------- 2. P0 回归：购买失败不清零公司池 ---------- */
section("P0 回归：资金不销毁");
{
  const e = new EmpireCore({ seed: 12 });
  muteNews(e);
  e.cash += 1e7;
  const ind = open(e, "express", "保池快递", 90e4);
  const r = e.industryAction(ind.uid, "buy", { fleetId: "ex5" });
  ok(!r.ok, "余额不足购买失败");
  ok(ind.st.treasury === 90e4, "失败后公司池原额保留（不销毁）", ind.st.treasury);
}

/* ---------- 3. 快递：槽位区分 + 建造计时 + 维修 ---------- */
section("快递公司");
{
  const e = new EmpireCore({ seed: 13 });
  muteNews(e);
  e.cash += 1e9;
  const ind = open(e, "express", "航空快递", 5000e4);
  ind.profit = 5e10;   // SS 级解锁全部载具
  for (let i = 0; i < 6; i++) e.industryAction(ind.uid, "buy", { fleetId: "ex1" });
  ok(ind.st.fleet.length === 5, "车位 5 满，第 6 辆被拒", ind.st.fleet.length);
  ok(e.industryAction(ind.uid, "buy", { fleetId: "ex19" }).ok, "货机买入成功（评级已解锁）");
  ok(!e.industryAction(ind.uid, "buy", { fleetId: "ex20" }).ok, "机位 1 满，第 2 架被拒");
  ok(ind.st.fleet.length === 6, "飞机不占车位（车队 6 = 5 车 + 1 机）", ind.st.fleet.length);
  const r = e.industryAction(ind.uid, "expandSlot", { kind: "vehicle" });
  ok(r.ok && ind.st.vehicles === 5 && ind.st.slotPending.length === 1, "扩车位进入建造队列（未立即生效）");
  for (let i = 0; i < 3600; i++) e.tick(1);
  ok(ind.st.vehicles === 6 && ind.st.slotPending.length === 0, "1 小时后车位建造完成");
  const car = ind.st.fleet[0];
  car.hours = TYPE.express.fleetSpec.ex1.maxHours - 1;
  for (let i = 0; i < 7200; i++) e.tick(1);
  ok(car.status === "down", "里程满自动停机");
  const tb = ind.st.treasury;
  ok(e.industryAction(ind.uid, "repair", { fleetId: "ex1" }).ok, "发起维修");
  ok(ind.st.treasury < tb, "维修费从公司池扣");
  const rpSpec = TYPE.express.fleetSpec.ex1;
  for (let i = 0; i < (rpSpec.repairHours + 1) * 3600; i++) e.tick(1);
  ok(car.status === "running" && car.hours <= 1, rpSpec.repairHours + " 小时维修完成复位（按价值 1~5h）");
}

/* ---------- 3b. 快递：同款重复购买 + 按实例维修 ---------- */
section("同款载具重复购买");
{
  const e = new EmpireCore({ seed: 25 });
  muteNews(e);
  e.cash += 1e7;
  const ind = open(e, "express", "同款快递", 100e4);
  ok(e.industryAction(ind.uid, "buy", { fleetId: "ex1" }).ok, "买入第 1 辆 ex1");
  ok(e.industryAction(ind.uid, "buy", { fleetId: "ex1" }).ok, "同款第 2 辆可重复购买");
  ok(e.industryAction(ind.uid, "buy", { fleetId: "ex1" }).ok, "同款第 3 辆可重复购买");
  const ex1s = ind.st.fleet.filter((f) => f.fleetId === "ex1");
  ok(ex1s.length === 3 && new Set(ex1s.map((f) => f.fid)).size === 3, "实例 fid 唯一（3 辆互不冲突）");
  ex1s[0].status = "down";
  ex1s[1].status = "down";
  ok(e.industryAction(ind.uid, "repair", { fid: ex1s[1].fid }).ok, "按实例 id 发起维修");
  ok(ex1s[1].status === "repairing" && ex1s[0].status === "down", "只维修目标实例，另一辆不受影响");
}

/* ---------- 4. 银行：利率联动 + 金库 ---------- */
section("银行");
{
  const e = new EmpireCore({ seed: 14 });
  muteNews(e);
  e.cash += 1e9;
  const ind = open(e, "bank", "策略银行", 1e8);
  ind.st.depositRate = 0.01; ind.st.loanRate = 0.05;
  ind.st.deposits = 1000e4; ind.st.vault = 5000e4;
  for (let i = 0; i < 3600 * 10; i++) e.tick(1);
  ok(ind.st.loans > ind.st.deposits * 0.3, "低贷利率下贷款规模增长（利率联动）", `贷 ${ind.st.loans}`);
  ok(ind.st.treasury > 1e8, "正息差持续入池", ind.st.treasury);
  const vault0 = ind.st.vault;
  const r = e.industryAction(ind.uid, "upgradeVault");
  ok(r.ok && ind.st.vault === Math.round(vault0 * 1.5), "金库扩容 ×1.5");
  ind.st.deposits = ind.st.vault;
  for (let i = 0; i < 3600; i++) e.tick(1);
  ok(ind.st.deposits <= ind.st.vault, "存款不超过金库上限");
}

/* ---------- 5. 租车：购车与扩容 ---------- */
section("租车公司");
{
  const e = new EmpireCore({ seed: 15 });
  muteNews(e);
  e.cash += 1e9;
  const ind = open(e, "rental", "神租车", 1000e4);
  ind.profit = 5e10;
  for (let i = 0; i < 11; i++) e.industryAction(ind.uid, "buy", { fleetId: "rt1" });
  ok(ind.st.fleet.length === 10, "车库 10 槽满，第 11 辆被拒", ind.st.fleet.length);
  ok(e.industryAction(ind.uid, "expandGarage").ok, "车库扩容");
  ok(e.industryAction(ind.uid, "buy", { fleetId: "rt1" }).ok, "扩容后可再买");
}

/* ---------- 6. 房地产：建筑队/开工/竣工回款/忙队工资 ---------- */
section("房地产开发");
{
  const e = new EmpireCore({ seed: 16 });
  muteNews(e);
  e.cash += 1e9;
  const ind = open(e, "realestate", "巨厦地产", 5000e4);
  const t = TYPE.realestate;
  const p0 = t.projects[0];
  ok(e.industryAction(ind.uid, "build", { projId: "es1" }).ok, "开工基础楼盘");
  const tb = ind.st.treasury;
  for (let i = 0; i < p0.cycle * 3600; i++) e.tick(1);
  ok(ind.st.projects.length === 0, p0.cycle + "h 后项目竣工移除（周期上限 5h）");
  // 引擎按小时计税：前 cycle-1 小时各付工资（不计税不退税），竣工小时 delta=回款-工资 计 25% 税
  const expected = -(p0.cycle - 1) * t.teamWage + (p0.totalIncome - t.teamWage) * (1 - TAX.income);
  ok(Math.abs(ind.st.treasury - (tb + expected)) < 1, '回款入池且忙队工资按小时扣除（竣工小时计税）',
    );
  ind.st.teams = 9;
  e.industryAction(ind.uid, "invest", { amount: 1e8 });
  const cost9 = Math.round(t.teamCost(9));
  const r = e.industryAction(ind.uid, "hireTeam");
  ok(r.ok && r.cost === cost9 && ind.st.teams === 10, "第 10 队费用 = 100万×队数²");
  ok(!e.industryAction(ind.uid, "hireTeam").ok, "建筑队达 10 上限");
  const p29 = t.projects[29];
  const wage29 = p29.teams * t.teamWage * p29.cycle;
  const profit29 = p29.totalIncome - p29.cost - wage29;
  const payback29 = p29.cycle * (p29.cost + wage29) / profit29;
  ok(payback29 > 100 && payback29 < 170, "高阶项目回本 100~170h（利润保持公式）", payback29.toFixed(0) + "h");
}

/* ---------- 7. 经销商：carId 唯一 / 收修售 / 车间并发 / 低档正 EV ---------- */
section("汽车经销商");
{
  const e = new EmpireCore({ seed: 17 });
  muteNews(e);
  e.cash += 1e9;
  const ind = open(e, "dealer", "二手车王", 2e8);
  ind.profit = 5e10;
  for (let i = 0; i < 3600 * 3; i++) e.tick(1);
  const ids = new Set(ind.st.market.map((c) => c.carId));
  ok(ind.st.market.length >= 9 && ids.size === ind.st.market.length, "刷车 carId 全局唯一（P0 回归）");
  const car = ind.st.market[0];
  const price = Math.round(TYPE.dealer.brandSpec[car.brandId].resale * (1 - car.wear));
  const r = e.industryAction(ind.uid, "buy", { carId: car.carId });
  ok(r.ok && r.cost === price, "按残值×(1-损耗)收购");
  ok(e.industryAction(ind.uid, "repair", { carId: car.carId }).ok, "开始维修");
  const c2 = ind.st.market[0], c3 = ind.st.market[1];
  e.industryAction(ind.uid, "buy", { carId: c2.carId });
  e.industryAction(ind.uid, "buy", { carId: c3.carId });
  e.industryAction(ind.uid, "repair", { carId: c2.carId });
  ok(!e.industryAction(ind.uid, "repair", { carId: c3.carId }).ok, "维修车间并发受限（2 车间）");
  const brand = TYPE.dealer.brandSpec[car.brandId];
  const hours = Math.ceil(car.wear * brand.repairMul);
  for (let i = 0; i < (hours + 1) * 3600; i++) e.tick(1);
  const lot = ind.st.lots.find((l) => l.carId === car.carId);
  ok(lot && lot.wear === 0 && lot.status === "stored", "维修完成损耗归零");
  const tb = ind.st.treasury;
  const s = e.industryAction(ind.uid, "sell", { carId: car.carId });
  ok(s.ok && ind.st.treasury - tb === brand.sellPrice, "售出全额入池");
  ok(ind.profit > 0, "差价计入累计利润（驱动评级）");
  const wuling = TYPE.dealer.brands[0];
  const wear = 0.55;
  const ev = wuling.sellPrice - wuling.resale * (1 - wear) - wuling.resale * TYPE.dealer.repairWageRate * wear * wuling.repairMul;
  ok(ev > 0, "低档车维修后为正期望（P1 数值回归）", ev.toFixed(0));
}

/* ---------- 8. IT：立项/运营/离线 NaN 回归 ---------- */
section("信息技术");
{
  const e = new EmpireCore({ seed: 18 });
  muteNews(e);
  e.cash += 1e9;
  const ind = open(e, "itcorp", "极客科技", 5e8);
  const t = TYPE.itcorp;
  ok(e.industryAction(ind.uid, "hire", { kind: "dev" }).ok, "招聘程序员");
  ok(e.industryAction(ind.uid, "startProject", { projId: "it1" }).ok, "立项个人博客");
  const p = ind.st.projects[0];
  for (let i = 0; i < (p.cycle + 2) * 3600; i++) e.tick(1);
  ok(p.operating === true && p.decayIncome > 0, "研发完成进入运营且 decayIncome 有效");
  const tb = ind.st.treasury;
  for (let i = 0; i < 2 * 3600; i++) e.tick(1);
  ok(ind.st.treasury > tb, "运营期持续产金");
  const ind2 = open(e, "itcorp", "离线科技", 5e8);
  e.industryAction(ind2.uid, "startProject", { projId: "it1" });
  const p2 = ind2.st.projects[0];
  p2.progress = p2.cycle - 1;
  e.offlineApply(24 * 3600);
  ok(p2.operating === true && Number.isFinite(p2.decayIncome) && isFinite(ind2.st.treasury), "离线完成项目无 NaN（P0 回归）");
  const p29 = t.projects[29];
  ok(p29.opHours > 200 && p29.opHours < 400, "高阶运营期 200~400h", p29.opHours);
}

/* ---------- 9. 石油：勘探/平台/囤油/离线 ---------- */
section("石油能源");
{
  const e = new EmpireCore({ seed: 19 });
  muteNews(e);
  e.cash += 1e11;
  const ind = open(e, "oil", "黑金能源", 2e9);
  const t = TYPE.oil;
  let found = false;
  for (let i = 0; i < 30 && !found; i++) found = e.industryAction(ind.uid, "explore").ok;
  ok(found, "30 次内勘探出油（期望概率 30%）");
  const field = ind.st.fields[0];
  ok(field.reserve >= 1e5 && field.reserve <= 1e7, "油田储量 10 万~1000 万桶");
  ok(e.industryAction(ind.uid, "buildPlatform", { fieldId: field.id }).ok, "部署平台");
  ok(!e.industryAction(ind.uid, "buildPlatform", { fieldId: field.id }).ok, "同一油田不可重复部署");
  const tb = ind.st.treasury;
  for (let i = 0; i < 2 * 3600; i++) e.tick(1);
  ok(ind.st.treasury !== tb, "平台开采产油入池（扣维护费）");
  e.industryAction(ind.uid, "toggleHoarding");
  const tank0 = ind.st.tank.stock;
  for (let i = 0; i < 3600; i++) e.tick(1);
  ok(ind.st.tank.stock > tank0, "囤油模式产出入罐");
  const dump = e.industryAction(ind.uid, "dumpTank");
  ok(dump.ok && dump.gain > 0, "抛售储油变现");
  const tk = ind.st.tank.stock;
  e.offlineApply(6 * 3600);
  ok(ind.st.tank.stock > tk, "离线囤油继续入罐（P2 回归）");
}

/* ---------- 10. 俱乐部：青训/转会/实力胜率 ---------- */
section("俱乐部");
{
  const e = new EmpireCore({ seed: 20 });
  muteNews(e);
  e.cash += 1e11;
  const ind = open(e, "club", "银河俱乐部", 1e10);
  e.offlineApply(13 * 3600);
  ok(ind.st.players.length >= 1, "青训 13 小时产出球员");
  for (let i = 0; i < 3600; i++) e.tick(1);
  ok(ind.st.market.length >= 3, "转会市场每小时刷 3 名");
  const ids = new Set([...ind.st.market.map((p) => p.id), ...ind.st.players.map((p) => p.id)]);
  ok(ids.size === ind.st.market.length + ind.st.players.length, "球员 id 唯一（P0 回归）");
  const target = ind.st.market[0];
  const r = e.industryAction(ind.uid, "buyPlayer", { id: target.id });
  ok(r.ok && ind.st.players.some((p) => p.id === target.id), "按 id 签入球员（重名安全）");
  // 实力胜率：强阵容 200 场 vs 弱阵容 200 场
  ind.st.players = [];
  ind.st.academy.progress = -1e9;   // 冻结青训，防止测试期产出球员稀释阵容
  for (let i = 0; i < 5; i++) ind.st.players.push({ id: "x" + i, name: "强" + i, ability: 90, wage: 9e4 });
  let m1 = 0, w1 = 0;
  for (let h = 0; h < 200; h++) { for (let i = 0; i < 3600; i++) e.tick(1); }
  m1 = ind.st.matches; w1 = ind.st.wins;
  const m0 = m1, w0 = w1;
  ind.st.academy.progress = -1e9;
  ind.st.players = [{ id: "y0", name: "弱0", ability: 5, wage: 5e3 }];
  for (let h = 0; h < 200; h++) { for (let i = 0; i < 3600; i++) e.tick(1); }
  const strongRate = w1 / m1;
  const weakRate = (ind.st.wins - w0) / (ind.st.matches - m0);
  ok(strongRate > weakRate + 0.15, "强阵容胜率显著高于弱阵容（实力对抗生效）", `强 ${(strongRate * 100).toFixed(0)}% vs 弱 ${(weakRate * 100).toFixed(0)}%`);
}

/* ---------- 11. 上市：IPO/增发/回购 ---------- */
section("上市与资本操作");
{
  const e = new EmpireCore({ seed: 21 });
  muteNews(e);
  e.cash += 1e12;
  const ind = open(e, "express", "上市快递", 2e9);
  ind.profit = 5e8;
  ok(!e.industryAction(ind.uid, "ipo").ok, "评级不足 A 级拒绝上市");
  ind.profit = 5e10;
  const tb = ind.st.treasury;
  const r = e.industryAction(ind.uid, "ipo");
  ok(r.ok && ind.st.listed, "A 级 + 估值达标成功上市");
  ok(Math.abs(ind.st.treasury - tb - Math.round(ind.st.listed.mcap * F.ipoInject)) < 1, "IPO 注入净资产 50% 进池");
  const mc0 = ind.st.listed.mcap;
  const r2 = e.industryAction(ind.uid, "issue");
  ok(r2.ok && Math.abs(ind.st.listed.mcap - Math.round(mc0 * F.issueMcapMul)) < 1, "增发市值 ×0.92");
  const pool = ind.st.treasury;
  const r3 = e.industryAction(ind.uid, "buyback");
  ok(r3.ok && !ind.st.listed, "回购退市（支付市值 90%）");
  ok(ind.st.treasury === pool - Math.round(mc0 * F.issueMcapMul * F.buybackPct), "回购款从公司池扣");
}

/* ---------- 12. 集团：组建/排他/加成入池 ---------- */
section("集团");
{
  const e = new EmpireCore({ seed: 22 });
  muteNews(e);
  e.cash += 1e13;
  const inds = [];
  for (const n of ["甲", "乙", "丙", "丁"]) {
    const ind = open(e, "express", n + "快递", 1e10);
    ind.profit = 5e10;
    e.industryAction(ind.uid, "ipo");
    inds.push(ind);
  }
  const bad = e.industryAction(inds[0].uid, "formGroup", { uids: [inds[0].uid, inds[1].uid] });
  ok(!bad.ok, "重复 uid 不能凑数（去重校验）");
  const r = e.industryAction(inds[0].uid, "formGroup", { uids: [inds[1].uid, inds[2].uid], name: "三兄弟" });
  ok(r.ok && e.groups.length === 1, "3 家上市公司组建集团");
  ok(!e.industryAction(inds[3].uid, "formGroup", { uids: [inds[0].uid, inds[1].uid] }).ok, "已入团成员不能重复入团（排他）");
  const a = inds[0];
  e.industryAction(a.uid, "buy", { fleetId: "ex1" });
  const spec = TYPE.express.fleetSpec.ex1;
  const tb = a.st.treasury;
  for (let i = 0; i < 2 * 3600; i++) e.tick(1);
  const expect = spec.incomePerHour * 2 * (1 + F.groupBoost) * (1 - TAX.income);
  ok(Math.abs(a.st.treasury - tb - expect) < 1, "集团 +10% 加成真正入池（P0 回归）", `${a.st.treasury - tb} vs ${expect}`);
}

/* ---------- 13. 主动清算：池返还/12h 拍卖/遣散声誉 ---------- */
section("主动清算");
{
  const e = new EmpireCore({ seed: 23 });
  muteNews(e);
  e.cash += 1e9;
  const ind = open(e, "express", "清算快递", 500e4);
  ind.st.fleet.push({ fleetId: "ex1", status: "running", hours: 0 });
  const pool = ind.st.treasury;
  const c0 = e.cash;
  const r = e.industryAction(ind.uid, "liquidate");
  const comp = 1 * 1e4 * 5;
  ok(r.ok && !e.industries.some((i) => i.uid === ind.uid), "公司移除");
  ok(Math.abs(e.cash - c0 - (pool - comp)) < 1e-6, "剩余池全额返还主账户（扣遣散费）", `${e.cash - c0} vs ${pool - comp}`);
  ok(e.pendingAuctions.length === 1, "拍卖款进入 12h 待到账队列");
  const auction = e.pendingAuctions[0].amount;
  const c1 = e.cash;
  for (let i = 0; i < 6 * 3600; i++) e.tick(1);
  ok(e.pendingAuctions.length === 0 && e.cash - c1 >= auction - 1 && e.cash - c1 <= auction + 5e4, "按价值 1~5h 后拍卖款到账（含少量打工保底）", e.cash - c1 + " vs " + auction);
  const ind2 = open(e, "itcorp", "欠薪科技", 0);
  ind2.st.staff = { pm: 1000, dev: 30, design: 15, test: 15 };
  e.industryAction(ind2.uid, "liquidate");
  ok(e.t < e.reputationUntil, "遣散费不足触发声誉 debuff");
  const baseCost = TYPE.express.openCost;
  e.cash += 1e9;
  const r3 = e.openIndustry("express", "贵快递");
  ok(r3.ok && Math.abs(r3.ind.invested - Math.round(baseCost * 1.1)) < 1, "声誉期内开设费 +10%", r3.ind.invested);
}

/* ---------- 14. v2 → v3 存档迁移 ---------- */
section("存档迁移 v2→v3");
{
  const e = new EmpireCore({ seed: 24 });
  muteNews(e);
  e.cash += 1e7;
  e.openIndustry("cstore", "老档便利店");
  e.buyStock("sf01", 200);
  const v3 = JSON.parse(e.save());
  const old = {
    ...v3, v: 2,
    industries: v3.industries.map((i) => ({ uid: i.uid, typeId: i.typeId, name: i.name, invested: i.invested, stores: 66 }))
  };
  const e2 = new EmpireCore({ seed: 99 });
  ok(e2.load(JSON.stringify(old)), "v2 存档可读取");
  ok(e2.industries[0].st.stores === 66, "v2 stores 迁移到 st.stores");
  ok(e2.portfolio.sf01.qty === 200, "持仓迁移无损");
  ok(e2.v === 3, "读档后版本升 v3");
}

/* ---------- 15. 回本周期锚（满配抽检） ---------- */
section("回本周期锚");
{
  const t = TYPE.express;
  const pb = (spec) => spec.cost / spec.incomePerHour;
  ok(pb(t.fleet[0]) > 20 && pb(t.fleet[0]) < 40, "快递入门回本 20~40h", pb(t.fleet[0]).toFixed(0) + "h");
  ok(pb(t.fleet[29]) > 60 && pb(t.fleet[29]) < 100, "快递满配回本 60~100h", pb(t.fleet[29]).toFixed(0) + "h");
  const rt = TYPE.rental;
  ok(rt.fleet[29].cost / rt.fleet[29].incomePerHour > 60, "租车满配回本 >60h");
  ok(TYPE.club.stadiumIncome[6] === 1e8, "俱乐部顶级体育场门票 1 亿/时");
}

console.log(`\n结果：${pass} 通过，${fail} 失败`);
process.exit(fail ? 1 : 0);
