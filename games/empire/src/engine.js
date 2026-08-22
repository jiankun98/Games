/* 商业帝国（移动版）—— 纯逻辑引擎 v3（无 DOM 依赖，Node 可直跑供测试）
 * 引擎只负责：市场演化、日结算（分红/租金/便利店+税收）、交易（含税）、
 * 公司开设与运营（handler 注册表）、独立公司池/停摆、上市/集团/清算、
 * 存档(v3)/离线、快照（snapshot 输出 UI 所需全部派生数据）。
 * 时间口径：t 为游戏秒，与现实秒 1:1；1 游戏日 = FORMULA.gameDay = 120s；
 * 8 家新公司每现实小时（F.hourTick=3600s）结算一次（tickHour）。
 */
import {
  FORMULA as F, TAX, STOCKS, STOCK_SECTORS, PROPERTIES, COLLECTIBLES,
  COLLECT_CATS, INDUSTRY_TYPES, TITLES, NEWS,
  RATING_NAMES, RATING_THRESHOLDS
} from "./data.js";
import { IND_HANDLERS } from "./industries/registry.js";
import { ratingOf } from "./industries/base.js";
import * as IPO from "./industries/ipo.js";

const STOCK_BY_ID = Object.fromEntries(STOCKS.map((s) => [s.id, s]));
const PROP_BY_ID = Object.fromEntries(PROPERTIES.map((p) => [p.id, p]));
const ITEM_BY_ID = Object.fromEntries(COLLECTIBLES.map((i) => [i.id, i]));
const IND_BY_ID = Object.fromEntries(INDUSTRY_TYPES.map((i) => [i.id, i]));

// 为各机队/清单类型构造 id -> spec 映射（handler 内以 type.fleetSpec / brandSpec 访问）
for (const t of INDUSTRY_TYPES) {
  if (t.fleet) t.fleetSpec = Object.fromEntries(t.fleet.map((v) => [v.id, v]));
  if (t.brands) t.brandSpec = Object.fromEntries(t.brands.map((b) => [b.id, b]));
  if (t.projects) t.projectSpec = Object.fromEntries(t.projects.map((p) => [p.id, p]));
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class EmpireCore {
  constructor(opts = {}) {
    this.rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    this.onEvent = opts.onEvent || function () {};
    this._init();
  }

  _init() {
    this.v = 3;                 // 存档版本
    this.t = 0;                 // 游戏秒
    this.cash = F.startCash;
    this.totalEarned = 0;       // 累计已实现净收益（不含浮盈）
    this.won = false;
    this.uidSeq = 1;
    // 暴露给 handler 的常量引用
    this.IND_BY_ID = IND_BY_ID;
    this.F = F;
    this.TAX = TAX;

    this.taxesPaid = {
      stamp: 0, dividend: 0, deed: 0, propertySale: 0,
      rent: 0, consume: 0, trade: 0, income: 0
    };

    this.records = [];          // 收支流水 [{t, text, amt, kind}]

    // 市场行情
    this.mkt = { stocks: {}, props: {}, items: {} };
    for (const s of STOCKS) this.mkt.stocks[s.id] = { price: s.price0, hist: [s.price0], boost: 0, boostUntil: 0 };
    for (const p of PROPERTIES) this.mkt.props[p.id] = { price: p.price, hist: [p.price], boost: 0, boostUntil: 0 };
    for (const i of COLLECTIBLES) this.mkt.items[i.id] = { price: i.price, hist: [i.price], boost: 0, boostUntil: 0 };

    // 持仓
    this.portfolio = {};        // stockId -> {qty, cost}
    this.propsOwned = {};       // propId -> {count, cost}
    this.itemsOwned = {};       // itemId -> {qty, cost}

    // 公司实例（9 类）
    this.industries = [];       // [{uid, typeId, name, rating, profit, invested, st}]
    // 集团
    this.groups = [];           // [{id, name, members:[uid]}]
    this.groupSeq = 1;
    this.reputationUntil = 0;   // 清算声誉 debuff 截止（游戏秒）
    this.pendingAuctions = [];  // 清算拍卖待到账 [{dueAt, amount, name}]
    this.indNewsMult = 1;       // 公司经营新闻加成（利润乘数）
    this.indNewsUntil = 0;      // 加成截止（游戏秒）

    // 分模块累计净收益
    this.stats = {
      dividends: 0, stockRealized: 0,
      rent: 0, propsRealized: 0,
      industry: 0,
      itemsRealized: 0
    };

    // 调度
    this._acc = { stock: 0, prop: 0, item: 0, day: 0, hour: 0 };
    this.nextNewsAt = F.newsMin + this.rng() * (F.newsMax - F.newsMin);
    this.news = null;           // {text, until}

    this.realStart = Date.now();
    this.lastActiveAt = Date.now();
    this.savedAt = 0;
  }

  reset() { this._init(); }

  /* ---------- 基础工具 ---------- */
  _gauss() {
    let u = 0, v = 0;
    while (u === 0) u = this.rng();
    while (v === 0) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  _pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }
  _clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  _record(text, amt, kind) {
    this.records.push({ t: this.t, text, amt: Math.round(amt * 100) / 100, kind });
    if (this.records.length > F.recordsMax) this.records.splice(0, this.records.length - F.recordsMax);
  }
  _payTax(kind, amount) { this.taxesPaid[kind] += amount; }

  /* ---------- 市场步进 ---------- */
  _stepStocks() {
    for (const s of STOCKS) {
      const sec = STOCK_SECTORS[s.sector];
      const st = this.mkt.stocks[s.id];
      let vol = sec.vol * s.volMul;
      let drift = sec.drift;
      if (s.region === "overseas") { vol *= 1.25; drift *= 1.1; }
      if (s.cyc) drift += 0.02 * Math.sin(2 * Math.PI * this.t / 600);
      if (st.boostUntil > this.t) drift += st.boost * 0.004;
      const chg = Math.exp(this._gauss() * vol + drift) - 1;
      st.price = Math.max(0.1, st.price * (1 + this._clamp(chg, -F.stockClamp, F.stockClamp)));
      st.hist.push(st.price);
      if (st.hist.length > F.histLen) st.hist.splice(0, st.hist.length - F.histLen);
    }
  }

  _stepMarket(kind, defs, loMul, hiMul, boostScale) {
    const bag = this.mkt[kind];
    for (const d of defs) {
      const m = bag[d.id];
      let drift = d.drift;
      if (m.boostUntil > this.t) drift += m.boost * boostScale;
      const chg = Math.exp(this._gauss() * d.vol + drift) - 1;
      m.price = this._clamp(m.price * (1 + chg), d.price * loMul, d.price * hiMul);
      m.hist.push(m.price);
      if (m.hist.length > F.histLen) m.hist.splice(0, m.hist.length - F.histLen);
    }
  }

  /* ---------- 新闻 ---------- */
  _fireNews() {
    const n = this._pick(NEWS);
    let text = n.text;
    if (n.target === "stock") {
      const s = this._pick(STOCKS);
      this.mkt.stocks[s.id].boost = n.power;
      this.mkt.stocks[s.id].boostUntil = this.t + n.dur;
      text = text.replace("{s}", s.name);
    } else if (n.target === "prop") {
      for (const p of PROPERTIES) {
        this.mkt.props[p.id].boost = n.power;
        this.mkt.props[p.id].boostUntil = this.t + n.dur;
      }
    } else if (n.target.startsWith("item:")) {
      const cat = n.target.slice(5);
      for (const i of COLLECTIBLES) if (i.cat === cat) {
        this.mkt.items[i.id].boost = n.power;
        this.mkt.items[i.id].boostUntil = this.t + n.dur;
      }
    } else if (n.target === "indBoost" || n.target === "indCut") {
      // 公司经营事件：全产业结算利润增益/减益（仅影响正利润）
      this.indNewsMult = 1 + n.power;
      this.indNewsUntil = this.t + n.dur;
    }
    this.news = { text, until: this.t + n.dur };
    this.onEvent("news", this.news);
    this.nextNewsAt = this.t + F.newsMin + this.rng() * (F.newsMax - F.newsMin);
  }

  /* ---------- 公司通用工具 ---------- */
  ratingOf(profit) { return ratingOf(profit); }
  _indRating(ind) { return ratingOf(ind.profit || 0); }

  handlerOf(ind) { return IND_HANDLERS[ind.typeId] || null; }

  // 公司估值（上市后按市值，集团溢价由 netWorth 汇总）
  handlerValue(ind) {
    const h = this.handlerOf(ind);
    if (!h) return 0;
    let v = h.value ? h.value(ind, this) : 0;
    if (ind.st && ind.st.listed) v = Math.max(v, ind.st.listed.mcap);
    return v;
  }

  // 每小时净收益（税前，展示/现金流用）
  handlerIncome(ind) {
    const h = this.handlerOf(ind);
    if (!h || !h.incomePerHour) return 0;
    const v = h.incomePerHour(ind, this);
    return ind.typeId === "cstore" ? v : v * (1 - TAX.income);
  }

  /* ---------- 主循环 ---------- */
  tick(dt) {
    dt = Math.min(dt, 1);
    this.t += dt;
    this._acc.stock += dt;
    this._acc.prop += dt;
    this._acc.item += dt;
    this._acc.day += dt;
    this._acc.hour += dt;
    while (this._acc.stock >= F.stockStep) { this._acc.stock -= F.stockStep; this._stepStocks(); }
    while (this._acc.prop >= F.propStep) { this._acc.prop -= F.propStep; this._stepMarket("props", PROPERTIES, 0.5, 12, 0.002); }
    while (this._acc.item >= F.itemStep) { this._acc.item -= F.itemStep; this._stepMarket("items", COLLECTIBLES, 0.3, 8, 0.003); }
    if (this._acc.hour >= F.hourTick) { this._acc.hour = 0; this._tickHourAll(); }
    while (this._acc.day >= F.dayTick) { this._acc.day -= F.dayTick; this._daySettle(); }
    this._processAuctions();
    if (this.t >= this.nextNewsAt) this._fireNews();
    this._checkWin();
  }

  /* 清算拍卖到期入账 */
  _processAuctions() {
    if (!this.pendingAuctions.length) return;
    const remain = [];
    for (const a of this.pendingAuctions) {
      if (a.dueAt <= this.t) {
        this.cash += a.amount;
        this.totalEarned += a.amount;
        this._record(`🔨 「${a.name}」清算拍卖回款到账 ${this._fmt(a.amount)}`, a.amount, "income");
      } else remain.push(a);
    }
    this.pendingAuctions = remain;
  }

  /* ---------- 每小时结算（8 家新公司：收支经公司池，池空停摆） ---------- */
  _tickHourAll() {
    for (const ind of this.industries) {
      const h = this.handlerOf(ind);
      // 便利店走游戏日直进主账户；银行走游戏日结算（dayTick）
      if (!h || ind.typeId === "cstore" || ind.typeId === "bank") continue;
      this._settleCompany(ind, (i, e) => h.tickHour && h.tickHour(i, e));
    }
  }

  /* 公司结算统一入口：stepFn 推进收支 → 集团加成入池 → 计税 → 停摆判定 → 评级 */
  _settleCompany(ind, stepFn) {
    const st = ind.st;
    if (st.stalled) return;                     // 停摆：产出/成本/市值波动全部冻结
    IPO.tickListed(ind, this);
    const before = st.treasury;
    stepFn(ind, this);
    const rawDelta = st.treasury - before;      // 本小时原始收支
    // 集团加成（盈利 +10% 入池 / 亏损减免 10%）+ 经营新闻加成（仅正利润）
    let bonus = 0;
    if (rawDelta !== 0) {
      if (st.listed && st.listed.groupId != null) {
        bonus += rawDelta > 0 ? rawDelta * F.groupBoost : -rawDelta * F.groupCostCut;
      }
      if (rawDelta > 0 && this.indNewsUntil > this.t && this.indNewsMult > 1) {
        bonus += rawDelta * (this.indNewsMult - 1);
      }
      if (bonus) st.treasury += bonus;
    }
    const delta = rawDelta + bonus;             // 实际入池变动（税基）
    if (delta > 0) {
      const tax = delta * TAX.income;
      st.treasury -= tax;
      this._payTax("income", tax);
      this.stats.industry += delta - tax;
      ind.profit = (ind.profit || 0) + (delta - tax);
    } else {
      ind.profit = (ind.profit || 0) + delta;
    }
    // 池空 → 停摆（不累积债务）
    if (st.treasury < 0) {
      st.treasury = 0;
      st.stalled = true;
      this._record(`⛔ ${ind.name}：公司池亏空，进入停摆（注资即恢复）`, 0, "bad");
    }
    this._refreshRating(ind);
  }

  _refreshRating(ind) {
    const r = ratingOf(ind.profit || 0);
    if (r > (ind.rating || 0)) {
      this._record(`⭐ ${ind.name} 评级提升：${RATING_NAMES[ind.rating || 0]} → ${RATING_NAMES[r]}`, 0, "good");
      ind.rating = r;
    }
  }

  /* ---------- 每游戏日结算：分红 / 租金 / 便利店 ---------- */
  _daySettle() {
    let inc = 0;

    // 无产业时的打工保底（不计税）
    if (!this.industries.length) {
      this.cash += F.baseSalary;
      this.totalEarned += F.baseSalary;
      inc += F.baseSalary;
    }

    // 股票分红（股息税）
    let divGross = 0;
    for (const id in this.portfolio) {
      const p = this.portfolio[id];
      if (!p.qty) continue;
      const s = STOCK_BY_ID[id];
      divGross += p.qty * this.mkt.stocks[id].price * STOCK_SECTORS[s.sector].div * s.divMul;
    }
    if (divGross > 0) {
      const tax = divGross * TAX.dividend;
      const net = divGross - tax;
      this._payTax("dividend", tax);
      this.cash += net; this.totalEarned += net; this.stats.dividends += net;
      inc += net;
    }

    // 房租（租金税）
    let rentGross = 0;
    for (const id in this.propsOwned) {
      const o = this.propsOwned[id];
      if (!o.count) continue;
      rentGross += this.mkt.props[id].price * PROP_BY_ID[id].yield * o.count;
    }
    if (rentGross > 0) {
      const tax = rentGross * TAX.rent;
      const net = rentGross - tax;
      this._payTax("rent", tax);
      this.cash += net; this.totalEarned += net; this.stats.rent += net;
      inc += net;
    }

    // 便利店利润（直进主账户，所得税）；上市公司市值波动在此推进
    for (const ind of this.industries) {
      if (ind.typeId !== "cstore") continue;
      IPO.tickListed(ind, this);
      const h = this.handlerOf(ind);
      const newsMul = (this.indNewsUntil > this.t && this.indNewsMult > 1) ? this.indNewsMult : 1;
      const gross = h.grossPerDay(ind, this) * newsMul;
      if (gross <= 0) continue;
      const tax = gross * TAX.income;
      const net = gross - tax;
      this._payTax("income", tax);
      this.cash += net; this.totalEarned += net; this.stats.industry += net;
      ind.profit = (ind.profit || 0) + net;
      inc += net;
      this._refreshRating(ind);
    }

    // 银行：每游戏日结算存贷流量与息差（走公司池）
    for (const ind of this.industries) {
      if (ind.typeId !== "bank") continue;
      const h = this.handlerOf(ind);
      this._settleCompany(ind, (i, e) => h.dayTick && h.dayTick(i, e));
    }

    if (inc > 0) this._record(this.industries.length ? "经营日结算（分红/租金/便利店）" : "打工日结（还没有产业，加油）", inc, "income");
  }

  _checkWin() {
    if (!this.won && this.netWorth() >= F.winTarget) {
      this.won = true;
      this.onEvent("win", {});
    }
  }

  /* ---------- 股票交易 ---------- */
  buyStock(stockId, qty) {
    const st = this.mkt.stocks[stockId];
    if (!st) return { ok: false, msg: "无此股票" };
    if (qty === "max") qty = Math.floor(this.cash / st.price);
    qty = Math.floor(qty || 0);
    if (qty <= 0) return { ok: false, msg: "数量无效" };
    const cost = st.price * qty;
    if (this.cash < cost) return { ok: false, msg: "现金不足" };
    this.cash -= cost;
    const p = this.portfolio[stockId] || (this.portfolio[stockId] = { qty: 0, cost: 0 });
    p.qty += qty; p.cost += cost;
    this._record(`买入 ${STOCK_BY_ID[stockId].name} ×${qty}`, -cost, "buy");
    return { ok: true, qty, cost };
  }

  sellStock(stockId, qty) {
    const p = this.portfolio[stockId];
    if (!p || p.qty <= 0) return { ok: false, msg: "无持仓" };
    if (qty === "all") qty = p.qty;
    qty = Math.min(p.qty, Math.floor(qty || 0));
    if (qty <= 0) return { ok: false, msg: "数量无效" };
    const gain = this.mkt.stocks[stockId].price * qty;
    const tax = gain * TAX.stamp;
    const basis = p.cost * (qty / p.qty);
    const net = gain - tax;
    p.cost -= basis; p.qty -= qty;
    if (!p.qty) delete this.portfolio[stockId];
    this.cash += net;
    const realized = gain - basis - tax;
    this.totalEarned += Math.max(0, realized);
    this.stats.stockRealized += realized;
    this._payTax("stamp", tax);
    this._record(`卖出 ${STOCK_BY_ID[stockId].name} ×${qty}（印花税 ${this._fmt(tax)}）`, net, "sell");
    return { ok: true, qty, net, tax };
  }

  /* ---------- 房产交易 ---------- */
  buyProperty(propId) {
    const m = this.mkt.props[propId];
    if (!m) return { ok: false, msg: "无此房产" };
    const price = m.price;
    const tax = price * TAX.deed;
    const total = price + tax;
    if (this.cash < total) return { ok: false, msg: "现金不足" };
    this.cash -= total;
    const o = this.propsOwned[propId] || (this.propsOwned[propId] = { count: 0, cost: 0 });
    o.count += 1; o.cost += total;
    this._payTax("deed", tax);
    this._record(`购入 ${PROP_BY_ID[propId].name}（含契税 ${this._fmt(tax)}）`, -total, "buy");
    return { ok: true, total, tax };
  }

  sellProperty(propId) {
    const o = this.propsOwned[propId];
    if (!o || o.count <= 0) return { ok: false, msg: "无房产" };
    const gain = this.mkt.props[propId].price;
    const tax = gain * TAX.propertySale;
    const basis = o.cost / o.count;
    const net = gain - tax;
    o.cost -= basis; o.count -= 1;
    if (!o.count) delete this.propsOwned[propId];
    this.cash += net;
    const realized = gain - basis - tax;
    this.totalEarned += Math.max(0, realized);
    this.stats.propsRealized += realized;
    this._payTax("propertySale", tax);
    this._record(`出售 ${PROP_BY_ID[propId].name}（税费 ${this._fmt(tax)}）`, net, "sell");
    return { ok: true, net, tax };
  }

  /* ---------- 藏品交易 ---------- */
  buyItem(itemId, qty) {
    const m = this.mkt.items[itemId];
    if (!m) return { ok: false, msg: "无此藏品" };
    if (qty === "max") qty = Math.floor(this.cash / (m.price * (1 + TAX.consume)));
    qty = Math.floor(qty || 0);
    if (qty <= 0) return { ok: false, msg: "数量无效" };
    const total = m.price * qty * (1 + TAX.consume);
    if (this.cash < total) return { ok: false, msg: "现金不足" };
    this.cash -= total;
    const o = this.itemsOwned[itemId] || (this.itemsOwned[itemId] = { qty: 0, cost: 0 });
    o.qty += qty; o.cost += total;
    this._payTax("consume", total - m.price * qty);
    this._record(`购入 ${ITEM_BY_ID[itemId].name} ×${qty}（含消费税）`, -total, "buy");
    return { ok: true, total };
  }

  sellItem(itemId, qty) {
    const o = this.itemsOwned[itemId];
    if (!o || o.qty <= 0) return { ok: false, msg: "无藏品" };
    if (qty === "all") qty = o.qty;
    qty = Math.min(o.qty, Math.floor(qty || 0));
    if (qty <= 0) return { ok: false, msg: "数量无效" };
    const gain = this.mkt.items[itemId].price * qty;
    const tax = gain * TAX.trade;
    const basis = o.cost * (qty / o.qty);
    const net = gain - tax;
    o.cost -= basis; o.qty -= qty;
    if (!o.qty) delete this.itemsOwned[itemId];
    this.cash += net;
    const realized = gain - basis - tax;
    this.totalEarned += Math.max(0, realized);
    this.stats.itemsRealized += realized;
    this._payTax("trade", tax);
    this._record(`出售 ${ITEM_BY_ID[itemId].name} ×${qty}（交易税 ${this._fmt(tax)}）`, net, "sell");
    return { ok: true, net, tax };
  }

  /* ---------- 公司：开设 / 通用操作入口 ---------- */
  openIndustry(typeId, name) {
    const type = IND_BY_ID[typeId];
    if (!type) return { ok: false, msg: "无此产业" };
    name = (name || "").trim();
    if (!name) return { ok: false, msg: "请输入名称" };
    if (name.length > 12) return { ok: false, msg: "名称过长（≤12字）" };
    if (this.industries.some((i) => i.name === name)) return { ok: false, msg: "已有同名公司" };
    let cost = type.openCost;
    if (this.t < this.reputationUntil) cost = Math.round(cost * (1 + F.reputationPenalty));
    if (this.cash < cost) return { ok: false, msg: "现金不足" };
    this.cash -= cost;
    const h = IND_HANDLERS[typeId];
    const ind = { uid: this.uidSeq++, typeId, name, invested: cost, rating: 0, profit: 0, st: {} };
    if (h && h.defaults) ind.st = h.defaults(ind, type);
    this.industries.push(ind);
    this._record(`开设「${name}」（${type.name}）`, -cost, "open");
    return { ok: true, ind };
  }

  // 统一操作入口：invest/divest/ipo/issue/buyback/liquidate/formGroup + handler 专属
  industryAction(uid, action, payload) {
    const ind = this.industries.find((i) => i.uid === uid);
    if (!ind) return { ok: false, msg: "无此公司" };
    if (action === "invest") {
      let amt = Math.floor(payload && payload.amount != null ? payload.amount : 1e6);
      amt = Math.min(amt, this.cash);
      if (amt <= 0) return { ok: false, msg: "金额无效或现金不足" };
      this.cash -= amt;
      ind.st.treasury = (ind.st.treasury || 0) + amt;
      ind.st.stalled = false;
      ind.invested += amt;
      this._record(`💼 ${ind.name}：注资 ${this._fmt(amt)}`, -amt, "invest");
      return { ok: true, amt };
    }
    if (action === "divest") {
      let amt = Math.floor(payload && payload.amount != null ? payload.amount : ind.st.treasury);
      amt = Math.min(amt, ind.st.treasury || 0);
      if (amt <= 0) return { ok: false, msg: "公司池为空" };
      ind.st.treasury -= amt;
      this.cash += amt;
      this._record(`💵 ${ind.name}：分红提取 ${this._fmt(amt)}`, amt, "income");
      return { ok: true, amt };
    }
    if (action === "ipo") {
      if (IPO.canList(ind, this)) return IPO.doList(ind, this);
      const v = this.handlerValue(ind);
      if (this._indRating(ind) < F.ipoRating) return { ok: false, msg: "评级需达 A 级" };
      if (v < F.ipoThreshold) return { ok: false, msg: `估值需达 ${this._fmt(F.ipoThreshold)}` };
      return { ok: false, msg: "已上市" };
    }
    if (action === "issue") return IPO.doIssue(ind, this);
    if (action === "buyback") return IPO.doBuyback(ind, this);
    if (action === "liquidate") return IPO.doLiquidate(ind, this);
    if (action === "formGroup") {
      const others = (payload && payload.uids || [])
        .map((u) => this.industries.find((i) => i.uid === u))
        .filter(Boolean);
      return IPO.formGroup([ind, ...others], this, payload && payload.name);
    }
    const h = this.handlerOf(ind);
    if (h && h.actions && h.actions[action]) return h.actions[action](ind, this, payload || {});
    return { ok: false, msg: "未知操作" };
  }

  /* ---------- 快照（UI 全量派生数据） ---------- */
  _histChg(hist, stepsBack) {
    const ref = hist[Math.max(0, hist.length - 1 - stepsBack)];
    return hist[hist.length - 1] / ref - 1;
  }

  netWorth() {
    let w = this.cash;
    for (const id in this.portfolio) w += this.portfolio[id].qty * this.mkt.stocks[id].price;
    for (const id in this.propsOwned) w += this.propsOwned[id].count * this.mkt.props[id].price;
    for (const id in this.itemsOwned) w += this.itemsOwned[id].qty * this.mkt.items[id].price;
    for (const ind of this.industries) w += this.handlerValue(ind);
    // 集团市值溢价：成员市值 × 1.2（成员市值已计入，此处补 0.2）
    for (const g of this.groups) {
      for (const uid of g.members) {
        const ind = this.industries.find((i) => i.uid === uid);
        if (ind && ind.st.listed) w += ind.st.listed.mcap * (F.groupMcapMul - 1);
      }
    }
    return w;
  }

  snapshot() {
    // ---- 股票 ----
    let stockValue = 0, stockCost = 0;
    const holdings = [];
    for (const id in this.portfolio) {
      const p = this.portfolio[id];
      if (!p.qty) continue;
      const s = STOCK_BY_ID[id];
      const sec = STOCK_SECTORS[s.sector];
      const st = this.mkt.stocks[id];
      const value = p.qty * st.price;
      stockValue += value; stockCost += p.cost;
      holdings.push({
        id, name: s.name, region: s.region, sectorName: sec.name, blurb: s.blurb,
        price: st.price, chgDay: this._histChg(st.hist, 30), hist: st.hist,
        qty: p.qty, cost: p.cost, value,
        pnl: value - p.cost, pnlPct: p.cost > 0 ? (value - p.cost) / p.cost : 0,
        marketCap: st.price * s.shares * 1e8,
        divYieldDay: sec.div * s.divMul,
        divPerHour: p.qty * st.price * sec.div * s.divMul * (1 - TAX.dividend) * F.hourDays
      });
    }
    const market = STOCKS.map((s) => {
      const sec = STOCK_SECTORS[s.sector];
      const st = this.mkt.stocks[s.id];
      const held = this.portfolio[s.id];
      return {
        id: s.id, name: s.name, region: s.region, sectorName: sec.name, blurb: s.blurb,
        price: st.price, chgDay: this._histChg(st.hist, 30), hist: st.hist,
        marketCap: st.price * s.shares * 1e8,
        divYieldDay: sec.div * s.divMul,
        heldQty: held ? held.qty : 0,
        divPerHour: (held ? held.qty : 0) * st.price * sec.div * s.divMul * (1 - TAX.dividend) * F.hourDays
      };
    });
    let divPerHourAll = 0;
    for (const id in this.portfolio) {
      const p = this.portfolio[id];
      const s = STOCK_BY_ID[id];
      divPerHourAll += p.qty * this.mkt.stocks[id].price * STOCK_SECTORS[s.sector].div * s.divMul * (1 - TAX.dividend) * F.hourDays;
    }
    const stocks = {
      totalValue: stockValue, totalCost: stockCost,
      unrealized: stockValue - stockCost,
      totalGain: this.stats.dividends + this.stats.stockRealized + (stockValue - stockCost),
      dividendsEarned: this.stats.dividends, realized: this.stats.stockRealized,
      divPerHour: divPerHourAll, holdings, market
    };

    // ---- 房产 ----
    let propValue = 0, rentPerHour = 0;
    const propsOwnedList = [];
    for (const id in this.propsOwned) {
      const o = this.propsOwned[id];
      const d = PROP_BY_ID[id];
      const m = this.mkt.props[id];
      propValue += o.count * m.price;
      const rph = m.price * d.yield * (1 - TAX.rent) * F.hourDays * o.count;
      rentPerHour += rph;
      propsOwnedList.push({
        id, name: d.name, region: d.region, icon: d.icon, desc: d.desc,
        price: m.price, chgDay: this._histChg(m.hist, 12), hist: m.hist,
        yieldDay: d.yield, count: o.count, cost: o.cost,
        value: o.count * m.price, rentPerHour: rph,
        rentPerHourEach: m.price * d.yield * (1 - TAX.rent) * F.hourDays
      });
    }
    const propMarket = PROPERTIES.map((d) => {
      const m = this.mkt.props[d.id];
      const o = this.propsOwned[d.id];
      return {
        id: d.id, name: d.name, region: d.region, icon: d.icon, desc: d.desc,
        price: m.price, chgDay: this._histChg(m.hist, 12), hist: m.hist,
        yieldDay: d.yield, deedRate: TAX.deed, saleRate: TAX.propertySale,
        count: o ? o.count : 0,
        rentPerHourEach: m.price * d.yield * (1 - TAX.rent) * F.hourDays
      };
    });
    const props = {
      totalValue: propValue, rentPerHour,
      rentEarned: this.stats.rent, realized: this.stats.propsRealized,
      owned: propsOwnedList, market: propMarket
    };

    // ---- 公司（9 类） ----
    let indValue = 0, indIncomePerHour = 0;
    const industries = this.industries.map((ind) => {
      const type = IND_BY_ID[ind.typeId];
      const h = this.handlerOf(ind);
      const rating = ratingOf(ind.profit || 0);
      ind.rating = rating;
      const value = this.handlerValue(ind);
      const income = this.handlerIncome(ind);
      indValue += value;
      indIncomePerHour += Math.max(0, income);
      const detail = h && h.snapshot ? h.snapshot(ind, this) : {};
      const nextRating = rating < 7 ? {
        name: RATING_NAMES[rating + 1],
        need: RATING_THRESHOLDS[rating],
        progress: Math.min(1, (ind.profit || 0) / RATING_THRESHOLDS[rating])
      } : null;
      return {
        uid: ind.uid, name: ind.name, typeName: type.name, icon: type.icon, color: type.color,
        typeId: ind.typeId, rating, ratingName: RATING_NAMES[rating], nextRating,
        profit: ind.profit || 0, invested: ind.invested,
        value, treasury: (ind.st && ind.st.treasury) || 0,
        stalled: !!(ind.st && ind.st.stalled),
        listed: ind.st && ind.st.listed ? { mcap: ind.st.listed.mcap, groupId: ind.st.listed.groupId, hist: ind.st.listed.hist } : null,
        canList: IPO.canList(ind, this),
        desc: type.desc, ratingText: type.ratingText, openCost: type.openCost,
        ...detail,
        // 税后口径最后覆盖（handler snapshot 里的 incomePerHour 为税前，避免展示口径不一致）
        incomePerHour: income, incomePerDay: income / 30
      };
    });

    // ---- 集团 ----
    const groups = this.groups.map((g) => {
      const members = g.members.map((u) => this.industries.find((i) => i.uid === u)).filter(Boolean);
      const mcap = members.reduce((a, i) => a + ((i.st.listed && i.st.listed.mcap) || 0), 0);
      return {
        id: g.id, name: g.name,
        members: members.map((i) => ({ uid: i.uid, name: i.name, icon: IND_BY_ID[i.typeId].icon, mcap: (i.st.listed && i.st.listed.mcap) || 0 })),
        mcap: mcap * F.groupMcapMul
      };
    });

    // ---- 藏品 ----
    let itemValue = 0;
    const cats = {};
    for (const c of COLLECT_CATS) cats[c.id] = { ...c, count: 0, value: 0 };
    const itemsOwnedList = [];
    for (const id in this.itemsOwned) {
      const o = this.itemsOwned[id];
      const d = ITEM_BY_ID[id];
      const value = o.qty * this.mkt.items[id].price;
      itemValue += value;
      cats[d.cat].count += o.qty; cats[d.cat].value += value;
      itemsOwnedList.push({
        id, name: d.name, cat: d.cat, catName: cats[d.cat].name, desc: d.desc,
        price: this.mkt.items[id].price, hist: this.mkt.items[id].hist,
        chgDay: this._histChg(this.mkt.items[id].hist, 12),
        qty: o.qty, cost: o.cost, value,
        pnl: value - o.cost, pnlPct: o.cost > 0 ? (value - o.cost) / o.cost : 0
      });
    }
    const itemMarket = COLLECTIBLES.map((d) => {
      const m = this.mkt.items[d.id];
      const o = this.itemsOwned[d.id];
      return {
        id: d.id, name: d.name, cat: d.cat, catName: cats[d.cat].name, desc: d.desc,
        price: m.price, hist: m.hist, chgDay: this._histChg(m.hist, 12),
        consumeRate: TAX.consume, tradeRate: TAX.trade,
        qty: o ? o.qty : 0, cost: o ? o.cost : 0
      };
    });
    const items = { totalValue: itemValue, realized: this.stats.itemsRealized, cats, owned: itemsOwnedList, market: itemMarket };

    // ---- 汇总 ----
    const nw = this.netWorth();
    let title = TITLES[0].name;
    for (const t of TITLES) if (nw >= t.worth) title = t.name;
    const flowPerHour = divPerHourAll + rentPerHour + indIncomePerHour
      + (this.industries.length ? 0 : F.baseSalary * F.hourDays);
    const taxesTotal = Object.values(this.taxesPaid).reduce((a, b) => a + b, 0);

    return {
      v: this.v, t: this.t, cash: this.cash, won: this.won,
      totalEarned: this.totalEarned, netWorth: nw, title,
      stocks, props, industries, groups, items,
      taxesPaid: { ...this.taxesPaid }, taxesTotal,
      flowPerHour,
      reputation: this.t < this.reputationUntil ? { until: this.reputationUntil, leftHours: Math.ceil((this.reputationUntil - this.t) / 3600) } : null,
      records: this.records.slice().reverse(),
      news: this.news && this.news.until > this.t ? this.news : null
    };
  }

  /* ---------- 存档 ---------- */
  save() {
    const data = {
      v: this.v, t: this.t, cash: this.cash, totalEarned: this.totalEarned, won: this.won,
      uidSeq: this.uidSeq, taxesPaid: this.taxesPaid, records: this.records,
      portfolio: this.portfolio, propsOwned: this.propsOwned, itemsOwned: this.itemsOwned,
      industries: this.industries, stats: this.stats,
      groups: this.groups, groupSeq: this.groupSeq, reputationUntil: this.reputationUntil,
      pendingAuctions: this.pendingAuctions,
      indNewsMult: this.indNewsMult, indNewsUntil: this.indNewsUntil,
      nextNewsAt: this.nextNewsAt, news: this.news,
      realStart: this.realStart, savedAt: Date.now(),
      mkt: {
        stocks: this._trimHist(this.mkt.stocks), props: this._trimHist(this.mkt.props), items: this._trimHist(this.mkt.items)
      }
    };
    return JSON.stringify(data);
  }

  _trimHist(bag) {
    const out = {};
    for (const id in bag) {
      const m = bag[id];
      out[id] = { price: m.price, boost: m.boost, boostUntil: m.boostUntil, hist: m.hist.slice(-60) };
    }
    return out;
  }

  _migrateIndustries(list) {
    const out = [];
    for (const ind of list) {
      const type = IND_BY_ID[ind.typeId];
      const h = IND_HANDLERS[ind.typeId];
      if (!type || !h) continue;                    // 丢弃未知/旧类型
      const oldStores = ind.stores;
      delete ind.stores;
      if (!ind.st) {
        ind.st = h.defaults ? h.defaults(ind, type) : {};
        if (oldStores != null && ind.typeId === "cstore") ind.st.stores = oldStores;
      }
      if (ind.rating == null) ind.rating = 0;
      if (ind.profit == null) ind.profit = 0;
      if (ind.st.treasury == null) ind.st.treasury = 0;
      if (ind.st.stalled == null) ind.st.stalled = false;
      // 旧档车队实例补唯一 fid（同款多辆修复定位/渲染 key）
      if (Array.isArray(ind.st.fleet)) {
        let n = 0;
        for (const f of ind.st.fleet) if (!f.fid) f.fid = "fm" + ind.uid + "_" + (++n);
      }
      ind.rating = ratingOf(ind.profit);
      out.push(ind);
    }
    return out;
  }

  load(json) {
    try {
      const d = typeof json === "string" ? JSON.parse(json) : json;
      if (!d || (d.v !== 3 && d.v !== 2)) return false;
      this._init();
      this.t = d.t || 0;
      this.cash = d.cash ?? F.startCash;
      this.totalEarned = d.totalEarned || 0;
      this.won = !!d.won;
      this.uidSeq = d.uidSeq || 1;
      Object.assign(this.taxesPaid, d.taxesPaid || {});
      this.records = Array.isArray(d.records) ? d.records : [];
      this.portfolio = d.portfolio || {};
      this.propsOwned = d.propsOwned || {};
      this.itemsOwned = d.itemsOwned || {};
      this.industries = this._migrateIndustries(Array.isArray(d.industries) ? d.industries : []);
      Object.assign(this.stats, d.stats || {});
      this.groups = Array.isArray(d.groups) ? d.groups : [];
      this.groupSeq = d.groupSeq || 1;
      this.reputationUntil = d.reputationUntil || 0;
      this.pendingAuctions = Array.isArray(d.pendingAuctions) ? d.pendingAuctions : [];
      this.indNewsMult = d.indNewsMult || 1;
      this.indNewsUntil = d.indNewsUntil || 0;
      // 集团成员排他清理：只保留 listed.groupId 指向本集团的成员，防止旧档双份市值溢价
      for (const g of this.groups) {
        g.members = (g.members || []).filter((u) => {
          const i = this.industries.find((x) => x.uid === u);
          return i && i.st && i.st.listed && i.st.listed.groupId === g.id;
        });
      }
      this.groups = this.groups.filter((g) => (g.members || []).length >= F.groupCount);
      this.nextNewsAt = d.nextNewsAt || (F.newsMin + this.rng() * (F.newsMax - F.newsMin));
      this.news = d.news || null;
      this.realStart = d.realStart || Date.now();
      this.savedAt = d.savedAt || 0;
      for (const kind of ["stocks", "props", "items"]) {
        const saved = (d.mkt && d.mkt[kind]) || {};
        for (const id in this.mkt[kind]) {
          const s = saved[id];
          if (s) {
            this.mkt[kind][id].price = s.price;
            this.mkt[kind][id].boost = s.boost || 0;
            this.mkt[kind][id].boostUntil = s.boostUntil || 0;
            this.mkt[kind][id].hist = Array.isArray(s.hist) && s.hist.length ? s.hist : [s.price];
          }
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  exportSave() { return this.save(); }

  importSave(str) {
    const ok = this.load(str);
    return { ok, msg: ok ? "导入成功" : "存档无效或版本不兼容" };
  }

  /* ---------- 离线收益 ---------- */
  offlineApply(realSec) {
    if (realSec < F.offlineMinGap) return null;
    const secs = Math.min(realSec, F.offlineCap);
    const days = secs / F.gameDay;
    const hours = secs / 3600;
    const details = [];

    let divGross = 0;
    for (const id in this.portfolio) {
      const p = this.portfolio[id];
      const s = STOCK_BY_ID[id];
      divGross += p.qty * this.mkt.stocks[id].price * STOCK_SECTORS[s.sector].div * s.divMul;
    }
    let rentGross = 0;
    for (const id in this.propsOwned) {
      const o = this.propsOwned[id];
      rentGross += this.mkt.props[id].price * PROP_BY_ID[id].yield * o.count;
    }

    // 公司离线：便利店并入主账户；8 家新公司按各自实际净额折算后直接入池（亏损不扣主账户，池空停摆）
    let cstoreGross = 0;
    for (const ind of this.industries) {
      const h = this.handlerOf(ind);
      if (!h) continue;
      if (ind.typeId === "cstore") {
        cstoreGross += h.grossPerDay(ind, this);   // 每游戏日口径，统一在 parts 里 × days
        continue;
      }
      if (ind.st.stalled) continue;                       // 停摆：离线零产出
      const r = h.offline ? h.offline(ind, hours, this) : { income: 0, cost: 0 };
      let net0 = (r.income || 0) - (r.cost || 0);
      if (!isFinite(net0)) net0 = 0;                      // 防御旧档 NaN 状态
      const eff = net0 * F.offlineEff;
      let net;
      if (eff > 0) {
        const tax = eff * TAX.income;
        this._payTax("income", tax);
        net = eff - tax;
        this.stats.industry += net;
        this.totalEarned += net;
      } else {
        net = eff;                                        // 亏损：公司池自担
      }
      ind.st.treasury = (ind.st.treasury || 0) + net;
      if (ind.st.treasury < 0) {
        ind.st.treasury = 0;
        ind.st.stalled = true;
        this._record(`⛔ ${ind.name}：离线期间公司池亏空，停摆（注资即恢复）`, 0, "bad");
      } else {
        ind.profit = (ind.profit || 0) + net;
        this._refreshRating(ind);
      }
      if (net > 0) details.push({ name: `${ind.name} 经营`, amount: net });
    }

    const parts = [
      { name: "股票分红", gross: divGross, taxKey: "dividend", stat: "dividends" },
      { name: "房租收入", gross: rentGross, taxKey: "rent", stat: "rent" },
      { name: "便利店利润", gross: cstoreGross, taxKey: "income", stat: "industry" }
    ];
    if (!this.industries.length) parts.push({ name: "打工保底", gross: F.baseSalary, taxKey: null, stat: null });
    let gain = 0;
    for (const pt of parts) {
      if (pt.gross <= 0) continue;
      const effGross = pt.gross * days * F.offlineEff;
      const tax = pt.taxKey ? effGross * TAX[pt.taxKey] : 0;
      const net = effGross - tax;
      if (net <= 0) continue;
      if (pt.taxKey) this._payTax(pt.taxKey, tax);
      if (pt.stat) this.stats[pt.stat] += net;
      this.cash += net; this.totalEarned += net;
      details.push({ name: pt.name, amount: net });
      gain += net;
    }

    if (gain > 0) this._record("离线收益结算", gain, "income");

    // 市场粗步进（封顶次数）
    this.t += secs;
    const stockSteps = Math.min(Math.floor(secs / F.stockStep), 900);
    for (let i = 0; i < stockSteps; i++) this._stepStocks();
    const mktSteps = Math.min(Math.floor(secs / F.propStep), 700);
    for (let i = 0; i < mktSteps; i++) {
      this._stepMarket("props", PROPERTIES, 0.5, 12, 0.002);
      this._stepMarket("items", COLLECTIBLES, 0.3, 8, 0.003);
    }
    this.nextNewsAt = this.t + F.newsMin;
    this._processAuctions();   // 离线期间到期的拍卖款入账
    return gain > 0 ? { seconds: secs, cash: gain, details } : { seconds: secs, cash: 0, details: [] };
  }

  _fmt(v) {
    if (v >= 1e8) return (v / 1e8).toFixed(2) + "亿";
    if (v >= 1e4) return (v / 1e4).toFixed(2) + "万";
    return v.toFixed(0);
  }
}

export { STOCK_BY_ID, PROP_BY_ID, ITEM_BY_ID, IND_BY_ID };
