/* 商业帝国 —— 引擎与渲染（IIFE，浏览器与 node 共用）
 * EmpireEngine  纯逻辑：产业经营内核 / 市场随机漫步 / 分红 / 存档 / 离线
 * EmpireUI      Canvas UI 组件库
 * EmpireGame    渲染 + 输入 + 音效（浏览器壳）
 */
(function (global) {
  "use strict";

  var DATA = global.EMPIRE_DATA;
  var F = DATA.FORMULA;

  /* ================= 工具 ================= */

  // 可种子随机数（mulberry32），测试可复现
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 中文单位格式化：1234.5 -> 1235；1.23e5 -> 12.3万；4.5e8 -> 4.50亿
  function fmt(v, digits) {
    if (!isFinite(v)) return "∞";
    var neg = v < 0 ? "-" : "";
    v = Math.abs(v);
    var d = digits == null ? 2 : digits;
    if (v < 1e4) { neg += v >= 100 || d === 0 ? Math.round(v) : v.toFixed(v >= 100 ? 0 : 1); return neg; }
    if (v < 1e8) return neg + (v / 1e4).toFixed(v / 1e4 >= 100 ? 0 : d) + "万";
    if (v < 1e12) return neg + (v / 1e8).toFixed(v / 1e8 >= 100 ? 0 : d) + "亿";
    if (v < 1e16) return neg + (v / 1e12).toFixed(v / 1e12 >= 100 ? 0 : d) + "万亿";
    return neg + "∞";
  }
  function fmtInt(v) { return fmt(v, 0); }
  function fmtPct(v, d) { return (v * 100).toFixed(d == null ? 1 : d) + "%"; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /* ================= 引擎 ================= */

  /**
   * EmpireEngine
   * opts: { seed, rng, onEvent }
   * onEvent(type, payload) 可选回调：
   *   toast {text, kind}  news {text}  promo {on}  antiEvent {}
   *   payout {name, amount}  win {}  autoClosed {name}
   */
  function EmpireEngine(opts) {
    opts = opts || {};
    this.rng = opts.rng || (opts.seed != null ? mulberry32(opts.seed) : Math.random);
    this.onEvent = opts.onEvent || function () {};
    this._init();
  }

  EmpireEngine.prototype._init = function () {
    var i, k;
    this.t = 0;                                  // 游戏时间（秒）
    this.cash = F.startCash;
    this.totalEarned = 0;
    this.dividendsTotal = 0;
    this.won = false;
    this.realStart = Date.now();

    // 市场状态
    this.mkt = { ings: {}, stocks: {}, props: {}, antis: {} };
    for (i = 0; i < DATA.INGREDIENTS.length; i++) {
      k = DATA.INGREDIENTS[i];
      this.mkt.ings[k.id] = { price: k.base, boost: 0, boostUntil: 0 };
    }
    for (i = 0; i < DATA.STOCKS.length; i++) {
      k = DATA.STOCKS[i];
      this.mkt.stocks[k.id] = { price: k.price0, boost: 0, boostUntil: 0, hist: [k.price0] };
    }
    for (i = 0; i < DATA.PROPERTIES.length; i++) {
      k = DATA.PROPERTIES[i];
      this.mkt.props[k.id] = { price: k.price, boost: 0, boostUntil: 0 };
    }
    for (i = 0; i < DATA.ANTIQUES.length; i++) {
      k = DATA.ANTIQUES[i];
      this.mkt.antis[k.id] = { price: k.price, boost: 0, boostUntil: 0 };
    }

    this.portfolio = {};   // stockId -> {qty, cost, div}
    this.star = {};        // stockId -> bool 自选
    this.propsOwned = {};  // propId -> count
    this.antisOwned = {};  // antiId -> {qty, cost}

    this.shop = { books: [], lux: [], buffs: [] };
    this.newsList = [];    // {text, until}

    this.industries = {};  // indId -> 实例（未开设为 null）
    this.candidates = {};  // indId -> [候选×3]
    for (i = 0; i < DATA.INDUSTRIES.length; i++) this.industries[DATA.INDUSTRIES[i].id] = null;

    // 步进累积器与调度
    this._acc = { ing: 0, stock: 0, anti: 0, div: 0 };
    this.nextNewsAt = 35 + this.rng() * 30;
    this.nextAntiEvtAt = 50 + this.rng() * 40;
    this.antiEvent = null; // {type:'bargain'|'seek', id, until}

    this.lastSaveAt = Date.now();
  };

  EmpireEngine.prototype._def = function (indId) {
    for (var i = 0; i < DATA.INDUSTRIES.length; i++) if (DATA.INDUSTRIES[i].id === indId) return DATA.INDUSTRIES[i];
    return null;
  };
  EmpireEngine.prototype._ingDef = function (id) {
    for (var i = 0; i < DATA.INGREDIENTS.length; i++) if (DATA.INGREDIENTS[i].id === id) return DATA.INGREDIENTS[i];
    return null;
  };
  EmpireEngine.prototype._stockDef = function (id) {
    for (var i = 0; i < DATA.STOCKS.length; i++) if (DATA.STOCKS[i].id === id) return DATA.STOCKS[i];
    return null;
  };
  EmpireEngine.prototype._gauss = function () {
    var u = 0, v = 0;
    while (u === 0) u = this.rng();
    while (v === 0) v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  EmpireEngine.prototype._pick = function (arr) { return arr[Math.floor(this.rng() * arr.length)]; };
  EmpireEngine.prototype._addCash = function (v) {
    this.cash += v;
    if (v > 0) this.totalEarned += v;
  };

  /* ---------- 招聘候选 ---------- */

  EmpireEngine.prototype._rollQuality = function () {
    var r = this.rng(), acc = 0;
    for (var i = 0; i < DATA.QUALITIES.length; i++) {
      acc += DATA.QUALITIES[i].weight;
      if (r < acc) return DATA.QUALITIES[i];
    }
    return DATA.QUALITIES[0];
  };

  EmpireEngine.prototype.refreshCost = function (indId) {
    return Math.max(10, this._def(indId).unlock * 0.02);
  };

  EmpireEngine.prototype._genCandidates = function (indId) {
    var def = this._def(indId), out = [], i, pos, q;
    for (i = 0; i < 3; i++) {
      pos = this._pick(def.positions);
      q = this._rollQuality();
      out.push({
        posId: pos.id, posName: pos.name, qId: q.id, qName: q.name, color: q.color,
        eff: pos.eff * q.effMult, salary: pos.salary * q.salaryMult,
        fee: pos.salary * q.salaryMult * F.hireFeeSeconds
      });
    }
    this.candidates[indId] = out;
    return out;
  };

  /* ---------- 产业：开设 / 升级 / 开关 ---------- */

  EmpireEngine.prototype.buyIndustry = function (indId) {
    var def = this._def(indId);
    if (this.industries[indId]) return { ok: false, msg: "已开设" };
    if (this.cash < def.unlock) return { ok: false, msg: "现金不足" };
    this.cash -= def.unlock;
    this.industries[indId] = {
      level: 1, closed: false, rep: 1, hype: 1,
      workers: [], equip: [],
      recipes: [def.recipes[0].id], active: def.recipes[0].id,
      stock: {}, invested: def.unlock,
      _orderAcc: 0, _orderNext: (def.special && def.special.type === "order") ? this.t + def.special.period : 0,
      _promoNext: (def.special && def.special.type === "promo") ? this.t + def.special.period : 0
    };
    this._genCandidates(indId);
    return { ok: true };
  };

  EmpireEngine.prototype.upgradeCost = function (indId) {
    var ind = this.industries[indId], def = this._def(indId);
    return def.levelCost * Math.pow(F.levelCostGrowth, ind.level - 1);
  };

  EmpireEngine.prototype.upgradeIndustry = function (indId, times) {
    var ind = this.industries[indId];
    if (!ind) return { ok: false, msg: "未开设" };
    times = times === "max" ? 1000 : (times || 1);
    var n = 0, c;
    while (n < times) {
      c = this.upgradeCost(indId);
      if (this.cash < c) break;
      this.cash -= c; ind.invested += c;
      ind.level++; n++;
    }
    return { ok: n > 0, n: n, msg: n > 0 ? null : "现金不足" };
  };

  EmpireEngine.prototype.toggleClosed = function (indId) {
    var ind = this.industries[indId];
    if (!ind) return { ok: false };
    ind.closed = !ind.closed;
    return { ok: true, closed: ind.closed };
  };

  /* ---------- 员工 ---------- */

  EmpireEngine.prototype.hire = function (indId, candIdx) {
    var ind = this.industries[indId], cands = this.candidates[indId] || this._genCandidates(indId);
    if (!ind) return { ok: false, msg: "未开设" };
    var c = cands[candIdx];
    if (!c) return { ok: false, msg: "无此候选" };
    if (this.cash < c.fee) return { ok: false, msg: "现金不足" };
    this.cash -= c.fee;
    ind.workers.push({ posId: c.posId, posName: c.posName, qId: c.qId, qName: c.qName, color: c.color, eff: c.eff, salary: c.salary });
    cands.splice(candIdx, 1);
    if (!cands.length) this._genCandidates(indId);
    return { ok: true };
  };

  EmpireEngine.prototype.fire = function (indId, wIdx) {
    var ind = this.industries[indId];
    if (!ind) return { ok: false };
    ind.workers.splice(wIdx, 1);
    return { ok: true };
  };

  EmpireEngine.prototype.refreshCandidates = function (indId) {
    var cost = this.refreshCost(indId);
    if (this.cash < cost) return { ok: false, msg: "现金不足" };
    this.cash -= cost;
    this._genCandidates(indId);
    return { ok: true };
  };

  /* ---------- 设备 / 车辆 ---------- */

  EmpireEngine.prototype._equipDef = function (indId, eqId) {
    var def = this._def(indId);
    for (var i = 0; i < def.equipment.length; i++) if (def.equipment[i].id === eqId) return def.equipment[i];
    return null;
  };

  EmpireEngine.prototype.buyEquip = function (indId, eqId) {
    var ind = this.industries[indId], eq = this._equipDef(indId, eqId);
    if (!ind || !eq) return { ok: false, msg: "参数错误" };
    if (this.cash < eq.price) return { ok: false, msg: "现金不足" };
    this.cash -= eq.price; ind.invested += eq.price;
    var inst = { defId: eqId, dur: 100, maxDur: 100, left: eq.mileage || 0, uses: 0 };
    ind.equip.push(inst);
    return { ok: true };
  };

  EmpireEngine.prototype.repairCost = function (indId, idx) {
    var ind = this.industries[indId], inst = ind.equip[idx], eq = this._equipDef(indId, inst.defId);
    return eq.price * F.repairRatio * (1 - inst.dur / inst.maxDur);
  };

  EmpireEngine.prototype.repairEquip = function (indId, idx) {
    var ind = this.industries[indId], inst = ind && ind.equip[idx];
    if (!inst) return { ok: false, msg: "参数错误" };
    var eq = this._equipDef(indId, inst.defId);
    if (eq.mileage) return { ok: false, msg: "车辆只能报废，不能维修" };
    if (inst.dur >= inst.maxDur) return { ok: false, msg: "无需维修" };
    var cost = this.repairCost(indId, idx);
    if (this.cash < cost) return { ok: false, msg: "现金不足" };
    this.cash -= cost;
    inst.dur = inst.maxDur;
    return { ok: true };
  };

  EmpireEngine.prototype.scrapEquip = function (indId, idx) {
    var ind = this.industries[indId], inst = ind && ind.equip[idx];
    if (!inst) return { ok: false, msg: "参数错误" };
    var eq = this._equipDef(indId, inst.defId);
    var residual = eq.price * F.scrapRatio * (eq.mileage ? clamp(inst.left / eq.mileage, 0, 1) : clamp(inst.dur / inst.maxDur, 0, 1));
    ind.equip.splice(idx, 1);
    this._addCash(residual);
    return { ok: true, residual: residual };
  };

  /* ---------- 配方 ---------- */

  EmpireEngine.prototype._recipeDef = function (indId, recId) {
    var def = this._def(indId);
    for (var i = 0; i < def.recipes.length; i++) if (def.recipes[i].id === recId) return def.recipes[i];
    return null;
  };

  EmpireEngine.prototype.canLearn = function (indId, recId) {
    var ind = this.industries[indId], r = this._recipeDef(indId, recId);
    if (!ind || !r) return { ok: false, msg: "参数错误" };
    if (ind.recipes.indexOf(recId) >= 0) return { ok: false, msg: "已学会" };
    if (r.pre && ind.recipes.indexOf(r.pre) < 0) return { ok: false, msg: "需先学前置配方" };
    if (this.cash < r.learn) return { ok: false, msg: "现金不足" };
    return { ok: true };
  };

  EmpireEngine.prototype.learnRecipe = function (indId, recId) {
    var chk = this.canLearn(indId, recId);
    if (!chk.ok) return chk;
    var ind = this.industries[indId], r = this._recipeDef(indId, recId);
    this.cash -= r.learn; ind.invested += r.learn;
    ind.recipes.push(recId);
    return { ok: true };
  };

  // 切换主推配方；lifecycle 产业 = 再立项/版本更新（付费重置热度）
  EmpireEngine.prototype.setRecipe = function (indId, recId) {
    var ind = this.industries[indId], def = this._def(indId);
    if (!ind || ind.recipes.indexOf(recId) < 0) return { ok: false, msg: "尚未学会" };
    var isLife = def.special && def.special.type === "lifecycle" && ind.active !== recId;
    if (isLife) {
      var r = this._recipeDef(indId, recId);
      var cost = r.learn * def.special.relaunchCost;
      if (this.cash < cost) return { ok: false, msg: "立项资金不足" };
      this.cash -= cost; ind.invested += cost;
      ind.hype = 1;
      this.onEvent("toast", { text: def.name + " 新项目《" + r.name + "》立项！", kind: "good" });
    }
    ind.active = recId;
    return { ok: true };
  };

  /* ---------- 原料囤货 ---------- */

  EmpireEngine.prototype.stockIng = function (indId, ingId, qty) {
    var ind = this.industries[indId];
    if (!ind) return { ok: false, msg: "未开设" };
    var price = this.mkt.ings[ingId].price;
    var cost = price * qty;
    if (this.cash < cost) return { ok: false, msg: "现金不足" };
    this.cash -= cost;
    ind.stock[ingId] = (ind.stock[ingId] || 0) + qty;
    return { ok: true, cost: cost };
  };

  /* ---------- 股票 ---------- */

  EmpireEngine.prototype.buyStock = function (stockId, qty) {
    var st = this.mkt.stocks[stockId], price = st.price;
    if (qty === "max") qty = Math.floor(this.cash / price);
    qty = Math.max(0, Math.floor(qty || 0));
    if (qty <= 0) return { ok: false, msg: "数量无效" };
    var cost = price * qty;
    if (this.cash < cost) { qty = Math.floor(this.cash / price); cost = price * qty; }
    if (qty <= 0) return { ok: false, msg: "现金不足" };
    this.cash -= cost;
    var p = this.portfolio[stockId] || (this.portfolio[stockId] = { qty: 0, cost: 0, div: 0 });
    p.qty += qty; p.cost += cost;
    return { ok: true, qty: qty, cost: cost };
  };

  EmpireEngine.prototype.sellStock = function (stockId, qty) {
    var p = this.portfolio[stockId];
    if (!p || p.qty <= 0) return { ok: false, msg: "无持仓" };
    if (qty === "all") qty = p.qty;
    qty = Math.min(p.qty, Math.floor(qty || 0));
    if (qty <= 0) return { ok: false, msg: "数量无效" };
    var gain = this.mkt.stocks[stockId].price * qty;
    p.cost *= (p.qty - qty) / p.qty;
    p.qty -= qty;
    this._addCash(gain);
    return { ok: true, qty: qty, gain: gain };
  };

  EmpireEngine.prototype.toggleStar = function (stockId) {
    this.star[stockId] = !this.star[stockId];
    return { ok: true };
  };

  /* ---------- 房产 / 古董 ---------- */

  EmpireEngine.prototype.buyProperty = function (propId) {
    var price = this.mkt.props[propId].price;
    if (this.cash < price) return { ok: false, msg: "现金不足" };
    this.cash -= price;
    this.propsOwned[propId] = (this.propsOwned[propId] || 0) + 1;
    return { ok: true };
  };

  EmpireEngine.prototype.sellProperty = function (propId) {
    if (!this.propsOwned[propId]) return { ok: false, msg: "无房产" };
    var gain = this.mkt.props[propId].price;
    this.propsOwned[propId]--;
    this._addCash(gain);
    return { ok: true, gain: gain };
  };

  EmpireEngine.prototype.antiPrice = function (antiId) {
    var a = this.mkt.antis[antiId];
    if (this.antiEvent && this.antiEvent.id === antiId && this.antiEvent.until > this.t) {
      return a.price * (this.antiEvent.type === "bargain" ? 0.6 : 1.8);
    }
    return a.price;
  };

  EmpireEngine.prototype.buyAntique = function (antiId) {
    var price = this.antiPrice(antiId);
    if (this.cash < price) return { ok: false, msg: "现金不足" };
    this.cash -= price;
    var a = this.antisOwned[antiId] || (this.antisOwned[antiId] = { qty: 0, cost: 0 });
    a.qty++; a.cost += price;
    return { ok: true };
  };

  EmpireEngine.prototype.sellAntique = function (antiId) {
    var a = this.antisOwned[antiId];
    if (!a || a.qty <= 0) return { ok: false, msg: "无藏品" };
    var gain = this.antiPrice(antiId);
    a.cost *= (a.qty - 1) / a.qty;
    a.qty--;
    this._addCash(gain);
    return { ok: true, gain: gain };
  };

  /* ---------- 商店 ---------- */

  EmpireEngine.prototype.buyShop = function (cat, itemId) {
    var list = DATA.SHOP[cat], item = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === itemId) item = list[i];
    if (!item) return { ok: false, msg: "参数错误" };
    if (cat === "books" || cat === "luxuries") {
      if (this.shop[cat].indexOf(itemId) >= 0) return { ok: false, msg: "已拥有" };
      if (this.cash < item.price) return { ok: false, msg: "现金不足" };
      this.cash -= item.price;
      this.shop[cat].push(itemId);
      return { ok: true };
    }
    // 消耗品
    if (this.cash < item.price) return { ok: false, msg: "现金不足" };
    this.cash -= item.price;
    this.shop.buffs.push({ until: this.t + item.dur, mult: item.mult });
    return { ok: true };
  };

  EmpireEngine.prototype._globalMult = function () {
    var i, b = DATA.SHOP.books, lux = DATA.SHOP.luxuries, bookSum = 0, luxSum = 0;
    for (i = 0; i < b.length; i++) if (this.shop.books.indexOf(b[i].id) >= 0) bookSum += b[i].bonus;
    for (i = 0; i < lux.length; i++) if (this.shop.lux.indexOf(lux[i].id) >= 0) luxSum += lux[i].bonus;
    var buff = 1;
    for (i = 0; i < this.shop.buffs.length; i++) if (this.shop.buffs[i].until > this.t) buff = Math.max(buff, this.shop.buffs[i].mult);
    this.shop.buffs = this.shop.buffs.filter(function (x) { return x.until > this.t; });
    return (1 + bookSum) * (1 + luxSum) * buff;
  };

  /* ---------- 产业每秒结算（核心公式，UI 亦调用此快照） ---------- */

  EmpireEngine.prototype._demandMult = function (def, ind) {
    var sp = def.special, m = 1;
    if (!sp) return m;
    var t = this.t;
    if (sp.type === "season") {
      m *= 1 + sp.amp * Math.sin(2 * Math.PI * t / sp.period);
    } else if (sp.type === "multisku") {
      m *= sp.stable;
    } else if (sp.type === "fleet") {
      m *= 1 + sp.rushAmp * Math.pow(Math.abs(Math.sin(Math.PI * t / 60)), 6);
    } else if (sp.type === "coffee") {
      var cp = this.mkt.ings[sp.ingId].price / this._ingDef(sp.ingId).base;
      if (cp > sp.thresh) m *= 1 - sp.demandPenalty;
    } else if (sp.type === "promo") {
      if (ind._promoOn) m *= sp.mult;
    } else if (sp.type === "lifecycle") {
      m *= Math.max(sp.floor, ind.hype);
    } else if (sp.type === "lithium") {
      var lp = this.mkt.ings[sp.ingId].price / this._ingDef(sp.ingId).base;
      if (lp > sp.thresh) m *= 1 - sp.band;
    } else if (sp.type === "cycle") {
      m *= sp.base + sp.amp * Math.sin(2 * Math.PI * t / sp.period);
    } else if (sp.type === "flywheel") {
      // 需求本身不吃加成，口碑上限更高（见 rep 更新）
    }
    return m;
  };

  // 计算单个产业的实时经营快照
  EmpireEngine.prototype.calcIndustry = function (indId) {
    var def = this._def(indId), ind = this.industries[indId];
    var out = {
      def: def, level: ind.level, closed: ind.closed, rep: ind.rep, hype: ind.hype,
      cap: 0, demand: 0, q: 0, revenue: 0, ingCost: 0, wage: 0, maint: 0, net: 0,
      workerPower: 0, equipPower: 0,
      ingBreak: {}, active: ind.active, slots: 1, lines: []
    };
    var i, w, e, eq;
    var workerPower = 0, equipPower = 0, activeEquips = [];
    for (i = 0; i < ind.workers.length; i++) workerPower += ind.workers[i].eff;
    for (i = 0; i < ind.equip.length; i++) {
      e = ind.equip[i]; eq = this._equipDef(indId, e.defId);
      if (eq.mileage ? e.left > 0 : e.dur > 0) { equipPower += eq.cap; activeEquips.push(e); }
    }
    if (!activeEquips.length) equipPower = F.noEquipCap;
    out.workerPower = workerPower;
    out.equipPower = equipPower;
    out.brokenCount = ind.equip.length - activeEquips.length;
    var levelMult = 1 + F.levelCapBonus * (ind.level - 1);
    out.cap = Math.min(workerPower, equipPower) * levelMult;
    var demandBase = def.demandBase * (1 + F.levelDemandLin * (ind.level - 1));
    if (ind.level > F.levelDemandMile) demandBase *= Math.pow(F.levelDemandMileMult, Math.floor(ind.level / F.levelDemandMile));
    out.demand = demandBase * ind.rep * this._demandMult(def, ind);
    var gm = this._globalMult();
    var sp = def.special;

    if (ind.closed) {
      out.maint = (ind.level * def.upkeep) * 0.3;
      for (i = 0; i < ind.equip.length; i++) out.maint += this._equipDef(indId, ind.equip[i].defId).upkeep * 0.3;
      out.net = -out.maint;
      out.q = 0;
      return out;
    }

    out.q = Math.min(out.cap, out.demand);

    // 多 SKU（便利店）：主推 60%，其余上架配方分剩余需求
    var lines = [];
    if (sp && sp.type === "multisku") {
      out.slots = 1 + Math.min(4, Math.floor(ind.level / 8));
      var others = ind.recipes.filter(function (r) { return r !== ind.active; }).slice(0, out.slots - 1);
      lines.push({ recId: ind.active, share: 0.6 });
      for (i = 0; i < others.length; i++) lines.push({ recId: others[i], share: 0.4 / others.length });
    } else {
      lines.push({ recId: ind.active, share: 1 });
    }

    var costMult = (sp && sp.type === "promo" && ind._promoOn) ? sp.costMult : 1;
    // 车队能源结构：燃油车/电车占比决定消耗燃料类型
    var fuelShare = 0, elecShare = 0;
    if (sp && sp.type === "fleet" && equipPower > 0) {
      for (i = 0; i < activeEquips.length; i++) {
        eq = this._equipDef(indId, activeEquips[i].defId);
        if (eq.fuelType === "elec") elecShare += eq.cap / equipPower; else fuelShare += eq.cap / equipPower;
      }
    }

    for (i = 0; i < lines.length; i++) {
      var r = this._recipeDef(indId, lines[i].recId);
      var qv = out.q * lines[i].share * r.eff;
      var rev = qv * r.price;
      var ing = {};
      for (var g in r.ings) {
        var use = r.ings[g] * costMult;
        if (g === "fuel" && fuelShare + elecShare > 0) {
          ing.fuel = (ing.fuel || 0) + use * fuelShare;
          ing.elec = (ing.elec || 0) + use * elecShare * 0.35;
        } else {
          ing[g] = (ing[g] || 0) + use;
        }
      }
      var ingCost = 0;
      for (g in ing) {
        var need = ing[g] * qv;
        var have = ind.stock[g] || 0;
        var fromStock = Math.min(have, need);
        if (fromStock > 0) ind.stock[g] = have - fromStock;
        ingCost += need * this.mkt.ings[g].price;   // 囤货部分按 0 成本（购入时已付）
        out.ingBreak[g] = (out.ingBreak[g] || 0) + need;
      }
      if (sp && sp.type === "prepaid") rev *= 1 + sp.bonus;
      out.revenue += rev * gm;
      out.ingCost += ingCost;
      out.lines.push({ rec: r, q: out.q * lines[i].share, rev: rev * gm, ingCost: ingCost });
    }

    out.wage = 0;
    for (i = 0; i < ind.workers.length; i++) out.wage += ind.workers[i].salary;
    out.maint = ind.level * def.upkeep;
    for (i = 0; i < ind.equip.length; i++) out.maint += this._equipDef(indId, ind.equip[i].defId).upkeep;
    out.net = out.revenue - out.ingCost - out.wage - out.maint;

    // 订单制（航天）：收入累积，周期性大额结算
    if (sp && sp.type === "order") {
      ind._orderAcc += Math.max(0, out.revenue);
      out.revenueShown = ind._orderAcc;
      out.net = -out.ingCost - out.wage - out.maint; // 每秒口径净利（收入延迟）
    }
    return out;
  };

  /* ---------- 每帧推进 ---------- */

  EmpireEngine.prototype.tick = function (dt) {
    if (dt <= 0) return;
    this.t += dt;
    var i, id, ind, def;

    // --- 市场步进 ---
    this._acc.ing += dt;
    while (this._acc.ing >= F.ingStep) {
      this._acc.ing -= F.ingStep;
      this._stepIngredients(F.ingStep);
    }
    this._acc.stock += dt;
    while (this._acc.stock >= F.stockStep) {
      this._acc.stock -= F.stockStep;
      this._stepStocks(F.stockStep);
    }
    this._acc.anti += dt;
    while (this._acc.anti >= F.antiqueStep) {
      this._acc.anti -= F.antiqueStep;
      this._stepAntiques(F.antiqueStep);
    }
    this._acc.div += dt;
    while (this._acc.div >= F.divDay) {
      this._acc.div -= F.divDay;
      this._payDividends();
    }

    // --- 新闻 ---
    if (this.t >= this.nextNewsAt) {
      this.nextNewsAt = this.t + 45 + this.rng() * 45;
      this._fireNews();
    }
    this.newsList = this.newsList.filter(function (n) { return n.until > this.t; }, this);

    // --- 古董限时事件 ---
    if (this.antiEvent && this.antiEvent.until <= this.t) this.antiEvent = null;
    if (!this.antiEvent && this.t >= this.nextAntiEvtAt) {
      this.nextAntiEvtAt = this.t + 55 + this.rng() * 45;
      var anti = this._pick(DATA.ANTIQUES);
      this.antiEvent = {
        type: this.rng() < 0.55 ? "bargain" : "seek", id: anti.id, until: this.t + 15
      };
      this.onEvent("antiEvent", {
        type: this.antiEvent.type, id: anti.id,
        text: this.antiEvent.type === "bargain"
          ? "【捡漏】急售人现身：" + anti.name + " 六折甩卖（15 秒）！"
          : "【求购】神秘藏家高价求购：" + anti.name + "（1.8 倍，15 秒）！"
      });
    }

    // --- 产业结算 ---
    var flow = F.baseSalary;
    for (id in this.industries) {
      ind = this.industries[id];
      if (!ind) continue;
      def = this._def(id);
      var snap = this.calcIndustry(id);
      flow += snap.net;

      // 口碑演化
      if (!ind.closed && snap.demand > 0) {
        var ratio = snap.demand / Math.max(0.001, snap.cap);
        var sp = def.special || {};
        var repMax = sp.type === "flywheel" ? sp.repMax : F.repMax;
        var upRate = F.repUpRate * (sp.repWeight || 1);
        if (ratio > 1.05) ind.rep = Math.max(F.repMin, ind.rep - F.repDownRate * dt);
        else if (ratio < 0.85) ind.rep = Math.min(repMax, ind.rep + upRate * dt);
      }
      // 热度衰减（手游）
      if (def.special && def.special.type === "lifecycle") {
        ind.hype = Math.max(def.special.floor, ind.hype - def.special.decay * dt);
      }
      // 大促窗口（电商）
      if (def.special && def.special.type === "promo" && this.t >= ind._promoNext) {
        ind._promoOn = !ind._promoOn;
        ind._promoNext = this.t + (ind._promoOn ? def.special.promoLen : def.special.period - def.special.promoLen);
        if (ind._promoOn) this.onEvent("promo", { on: true, name: def.name });
      }
      // 订单结算（航天）
      if (def.special && def.special.type === "order" && this.t >= ind._orderNext) {
        ind._orderNext = this.t + def.special.period;
        if (ind._orderAcc > 0) {
          var pay = ind._orderAcc * def.special.bonus;
          ind._orderAcc = 0;
          this._addCash(pay);
          this.onEvent("payout", { name: def.name, amount: pay });
        }
      }
      // 设备耐久 / 车辆里程（倒序遍历，报废即移除）
      var util = snap.q / Math.max(0.001, snap.cap);
      for (i = ind.equip.length - 1; i >= 0; i--) {
        var e = ind.equip[i];
        if (snap.q > 0) {
          if (e.left > 0) { // 车辆：里程损耗
            e.left -= def.special.kmPerUnit * snap.q * dt / Math.max(1, this._activeEquipCap(id));
            if (e.left <= 0) {
              var res = this._equipDef(id, e.defId).price * F.scrapRatio;
              ind.equip.splice(i, 1);
              this._addCash(res);
              this.onEvent("toast", { text: "一辆" + this._equipDef(id, e.defId).name + "跑满里程报废，残值 +" + fmtInt(res), kind: "info" });
            }
          } else if (e.dur > 0) {
            e.dur -= this._equipDef(id, e.defId).wearRate * util * dt * 10;
            if (e.dur <= 0) { e.dur = 0; this.onEvent("toast", { text: def.name + " 的" + this._equipDef(id, e.defId).name + "故障停机，请维修", kind: "bad" }); }
          }
        }
      }
    }

    // --- 房租 ---
    var rent = 0;
    for (id in this.propsOwned) {
      var pd = null;
      for (i = 0; i < DATA.PROPERTIES.length; i++) if (DATA.PROPERTIES[i].id === id) pd = DATA.PROPERTIES[i];
      if (pd) rent += this.mkt.props[id].price * pd.yield * this.propsOwned[id];
    }
    flow += rent;

    this._addCash(flow * dt);
    if (this.cash < 0) this._autoClose(flow);

    // --- 胜利判定 ---
    if (!this.won && this.netWorth() >= F.winTarget) {
      this.won = true;
      this.onEvent("win", { time: this.t, worth: this.netWorth() });
    }
    this._trimHist();
  };

  EmpireEngine.prototype._activeEquipCap = function (indId) {
    var ind = this.industries[indId], sum = 0, i, eq;
    for (i = 0; i < ind.equip.length; i++) {
      eq = this._equipDef(indId, ind.equip[i].defId);
      if (ind.equip[i].left > 0 || ind.equip[i].dur > 0) sum += eq.cap;
    }
    return Math.max(1, sum);
  };

  EmpireEngine.prototype._autoClose = function (flow) {
    var list = [], id, snap;
    for (id in this.industries) {
      if (!this.industries[id] || this.industries[id].closed) continue;
      snap = this.calcIndustry(id);
      if (snap.net < 0) list.push({ id: id, net: snap.net });
    }
    list.sort(function (a, b) { return a.net - b.net; });
    for (var i = 0; i < list.length && this.cash + flow * 5 < 0; i++) {
      this.industries[list[i].id].closed = true;
      this.onEvent("autoClosed", { name: this._def(list[i].id).name });
    }
    if (this.cash < 0) this.cash = 0;
  };

  /* ---------- 市场步进 ---------- */

  EmpireEngine.prototype._stepIngredients = function (step) {
    for (var i = 0; i < DATA.INGREDIENTS.length; i++) {
      var d = DATA.INGREDIENTS[i], m = this.mkt.ings[d.id];
      var boost = m.boostUntil > this.t ? m.boost : 0;
      var p = m.price * Math.exp(d.rev * Math.log(d.base / m.price) + (d.vol * this._gauss()) * 0.5 + boost * step);
      m.price = clamp(p, d.base * 0.35, d.base * 4);
    }
  };

  EmpireEngine.prototype._stepStocks = function (step) {
    var cyc = Math.sin(2 * Math.PI * this.t / 600);
    for (var i = 0; i < DATA.STOCKS.length; i++) {
      var s = DATA.STOCKS[i], sec = DATA.STOCK_SECTORS[s.sector], m = this.mkt.stocks[s.id];
      var drift = sec.drift;
      if (s.cyc) drift += cyc * 0.00006;
      if (s.ing) drift += (this.mkt.ings[s.ing].price / this._ingDef(s.ing).base - 1) * 0.00002;
      if (m.boostUntil > this.t) drift += m.boost;
      var vol = sec.vol * s.volMul * Math.sqrt(step / 2);
      var p0 = m.price;
      var p = p0 * Math.exp(drift * step + vol * this._gauss());
      p = clamp(p, p0 * (1 - F.stockClamp), p0 * (1 + F.stockClamp));
      p = Math.max(0.5, p);
      m.price = p;
      m.hist.push(p);
    }
  };

  EmpireEngine.prototype._stepAntiques = function (step) {
    var boost = 0;
    for (var b = 0; b < this.newsList.length; b++) if (this.newsList[b].anti) boost += this.newsList[b].anti;
    for (var i = 0; i < DATA.ANTIQUES.length; i++) {
      var d = DATA.ANTIQUES[i], m = this.mkt.antis[d.id];
      var p = m.price * Math.exp(d.drift + d.vol * this._gauss() + boost * step);
      m.price = clamp(p, d.price * 0.3, d.price * 8);
    }
    // 房产慢波动（复用古董节拍，参数自帶）
    for (i = 0; i < DATA.PROPERTIES.length; i++) {
      var pd = DATA.PROPERTIES[i], pm = this.mkt.props[pd.id];
      var pboost = pm.boostUntil > this.t ? pm.boost : 0;
      var pp = pm.price * Math.exp(pd.drift * step + pd.vol * this._gauss() * Math.sqrt(step) + pboost * step);
      pm.price = clamp(pp, pd.price * 0.5, pd.price * 12);
    }
  };

  EmpireEngine.prototype._payDividends = function () {
    var total = 0;
    for (var id in this.portfolio) {
      var p = this.portfolio[id];
      if (p.qty <= 0) continue;
      var s = this._stockDef(id), sec = DATA.STOCK_SECTORS[s.sector];
      var div = p.qty * this.mkt.stocks[id].price * sec.div * s.divMul;
      p.div += div; total += div;
      this.mkt.stocks[id].price *= F.divPriceDip;
    }
    if (total > 0) {
      this._addCash(total);
      this.dividendsTotal += total;
      this.onEvent("toast", { text: "股息到账 +" + fmtInt(total) + "（每游戏日派发）", kind: "good" });
    }
  };

  EmpireEngine.prototype._fireNews = function () {
    var def = this._pick(DATA.NEWS), text = def.text, antiBoost = 0;
    if (def.target === "stock") {
      var s = this._pick(DATA.STOCKS);
      var m = this.mkt.stocks[s.id];
      m.boost = def.power * 0.0015;
      m.boostUntil = this.t + def.dur;
      text = text.replace("{s}", s.name);
    } else if (def.target === "ing") {
      var ing = this._pick(DATA.INGREDIENTS);
      this.mkt.ings[ing.id].boost = def.power * 0.0006;
      this.mkt.ings[ing.id].boostUntil = this.t + def.dur;
      text = text.replace("{g}", ing.name);
    } else if (def.target === "property") {
      for (var i = 0; i < DATA.PROPERTIES.length; i++) {
        this.mkt.props[DATA.PROPERTIES[i].id].boost = def.power * 0.0004;
        this.mkt.props[DATA.PROPERTIES[i].id].boostUntil = this.t + def.dur;
      }
    } else if (def.target === "antique") {
      antiBoost = def.power * 0.0008;
    }
    this.newsList.push({ text: text, until: this.t + 40, anti: antiBoost });
    if (this.newsList.length > 6) this.newsList.shift();
    this.onEvent("news", { text: text });
  };

  EmpireEngine.prototype._trimHist = function () {
    for (var id in this.mkt.stocks) {
      var h = this.mkt.stocks[id].hist;
      if (h.length > F.stockHistLen) h.splice(0, h.length - F.stockHistLen);
    }
  };

  /* ---------- 汇总 ---------- */

  EmpireEngine.prototype.cashFlowPerSec = function () {
    var flow = F.baseSalary, rent = 0, i, id;
    for (id in this.industries) {
      if (!this.industries[id]) continue;
      var snap = this.calcIndustry(id);
      flow += snap.net;
    }
    for (id in this.propsOwned) {
      for (i = 0; i < DATA.PROPERTIES.length; i++) {
        if (DATA.PROPERTIES[i].id === id) rent += this.mkt.props[id].price * DATA.PROPERTIES[i].yield * this.propsOwned[id];
      }
    }
    return { total: flow + rent, industry: flow, rent: rent };
  };

  EmpireEngine.prototype._industryValue = function (indId) {
    var ind = this.industries[indId];
    if (!ind) return 0;
    var v = ind.invested;
    for (var i = 0; i < ind.equip.length; i++) {
      var eq = this._equipDef(indId, ind.equip[i].defId);
      v += eq.price * (eq.mileage ? clamp(ind.equip[i].left / eq.mileage, 0, 1) : clamp(ind.equip[i].dur / ind.equip[i].maxDur, 0, 1));
    }
    for (var g in ind.stock) v += ind.stock[g] * this.mkt.ings[g].price;
    return v;
  };

  EmpireEngine.prototype.netWorth = function () {
    var v = this.cash, id;
    for (id in this.portfolio) v += this.portfolio[id].qty * this.mkt.stocks[id].price;
    for (id in this.propsOwned) v += (this.propsOwned[id] || 0) * this.mkt.props[id].price;
    for (id in this.antisOwned) v += (this.antisOwned[id] || { qty: 0 }).qty * this.mkt.antis[id].price;
    for (id in this.industries) if (this.industries[id]) v += this._industryValue(id);
    var i;
    for (i = 0; i < DATA.SHOP.luxuries.length; i++) {
      if (this.shop.lux.indexOf(DATA.SHOP.luxuries[i].id) >= 0) v += DATA.SHOP.luxuries[i].price;
    }
    return v;
  };

  EmpireEngine.prototype.title = function () {
    var t = DATA.TITLES[0];
    var w = this.netWorth();
    for (var i = 0; i < DATA.TITLES.length; i++) if (w >= DATA.TITLES[i].worth) t = DATA.TITLES[i];
    return t.name;
  };

  // 股票日涨跌幅（对比 30 步前 ≈ 一游戏日）
  EmpireEngine.prototype.stockChange = function (stockId) {
    var h = this.mkt.stocks[stockId].hist;
    if (h.length < 2) return 0;
    var ref = h[Math.max(0, h.length - 1 - 30)];
    return h[h.length - 1] / ref - 1;
  };

  /* ---------- 存档 / 离线 ---------- */

  EmpireEngine.prototype.save = function () {
    var indSave = {}, id, ind;
    for (id in this.industries) {
      ind = this.industries[id];
      if (ind) indSave[id] = ind;
    }
    var histSave = {};
    for (id in this.mkt.stocks) {
      var h = this.mkt.stocks[id].hist;
      histSave[id] = h.slice(Math.max(0, h.length - 30));
    }
    this.lastSaveAt = Date.now();
    return {
      v: 1, t: this.t, cash: this.cash,
      totalEarned: this.totalEarned, dividendsTotal: this.dividendsTotal,
      won: this.won, realStart: this.realStart,
      industries: indSave, candidates: this.candidates,
      mkt: { ings: this.mkt.ings, stocks: histSave, props: this.mkt.props, antis: this.mkt.antis },
      portfolio: this.portfolio, star: this.star,
      propsOwned: this.propsOwned, antisOwned: this.antisOwned,
      shop: this.shop, newsList: this.newsList,
      nextNewsAt: this.nextNewsAt, nextAntiEvtAt: this.nextAntiEvtAt,
      lastSaveAt: this.lastSaveAt
    };
  };

  EmpireEngine.prototype.load = function (s) {
    if (!s || s.v !== 1) return false;
    try {
      this.t = s.t; this.cash = s.cash;
      this.totalEarned = s.totalEarned || 0;
      this.dividendsTotal = s.dividendsTotal || 0;
      this.won = !!s.won;
      this.realStart = s.realStart || Date.now();
      this.industries = {};
      for (var i = 0; i < DATA.INDUSTRIES.length; i++) {
        var id = DATA.INDUSTRIES[i].id;
        this.industries[id] = s.industries[id] || null;
      }
      this.candidates = s.candidates || {};
      for (id in s.mkt.stocks) {
        if (this.mkt.stocks[id]) {
          this.mkt.stocks[id].price = s.mkt.stocks[id][s.mkt.stocks[id].length - 1] || this.mkt.stocks[id].price;
          this.mkt.stocks[id].hist = s.mkt.stocks[id].slice();
        }
      }
      for (id in s.mkt.ings) if (this.mkt.ings[id]) this.mkt.ings[id].price = s.mkt.ings[id].price;
      for (id in s.mkt.props) if (this.mkt.props[id]) this.mkt.props[id].price = s.mkt.props[id].price;
      for (id in s.mkt.antis) if (this.mkt.antis[id]) this.mkt.antis[id].price = s.mkt.antis[id].price;
      this.portfolio = s.portfolio || {};
      this.star = s.star || {};
      this.propsOwned = s.propsOwned || {};
      this.antisOwned = s.antisOwned || {};
      this.shop = s.shop || { books: [], lux: [], buffs: [] };
      this.newsList = s.newsList || [];
      this.nextNewsAt = s.nextNewsAt || 40;
      this.nextAntiEvtAt = s.nextAntiEvtAt || 60;
      this.lastSaveAt = s.lastSaveAt || Date.now();
      return true;
    } catch (e) {
      return false;
    }
  };

  // 离线收益：按停业前稳定净现金流（亏损产业计 0），市场同步推进
  EmpireEngine.prototype.applyOffline = function (elapsedSec) {
    elapsedSec = Math.min(elapsedSec, F.offlineCap);
    if (elapsedSec < 10) return null;
    var flow = F.baseSalary, rent = 0, id;
    for (id in this.industries) {
      if (!this.industries[id]) continue;
      var snap = this.calcIndustry(id);
      if (snap.net > 0) flow += snap.net;
    }
    for (id in this.propsOwned) {
      for (var i = 0; i < DATA.PROPERTIES.length; i++) {
        if (DATA.PROPERTIES[i].id === id) rent += this.mkt.props[id].price * DATA.PROPERTIES[i].yield * this.propsOwned[id];
      }
    }
    // 市场粗步进（最多 240 步）
    var steps = Math.min(240, Math.floor(elapsedSec / F.stockStep));
    for (i = 0; i < steps; i++) {
      this.t += elapsedSec / steps;
      this._stepIngredients(elapsedSec / steps);
      this._stepStocks(elapsedSec / steps);
      this._stepAntiques(elapsedSec / steps);
    }
    // 离线分红（按当前价近似）
    var divDays = Math.min(1440, Math.floor(elapsedSec / F.divDay)), divTotal = 0;
    for (id in this.portfolio) {
      var p = this.portfolio[id];
      if (p.qty <= 0) continue;
      var s = this._stockDef(id), sec = DATA.STOCK_SECTORS[s.sector];
      var d = p.qty * this.mkt.stocks[id].price * sec.div * s.divMul * divDays;
      p.div += d; divTotal += d;
    }
    var gain = (flow + rent + divTotal) * elapsedSec * F.offlineEff;
    this._addCash(gain);
    this.dividendsTotal += divTotal * F.offlineEff;
    return { elapsed: elapsedSec, gain: gain, flow: flow + rent, div: divTotal * F.offlineEff };
  };

  global.EmpireEngine = EmpireEngine;
  global.EMPIRE_FMT = { fmt: fmt, fmtInt: fmtInt, fmtPct: fmtPct, clamp: clamp, mulberry32: mulberry32 };

  /* ================= Canvas UI 组件（立即模式） ================= */

  var W = 960, H = 640;                 // 逻辑分辨率
  var COL = {
    bg: "#10141f", panel: "#1a2130", panel2: "#212a3c", panel3: "#2a3548",
    line: "#2e3a52", text: "#e8ecf4", dim: "#8b96ac", faint: "#5a6478",
    gold: "#e8b64c", goldDark: "#c9a02a", goldBg: "rgba(232,182,76,0.12)",
    up: "#e05545", down: "#3fa46a", good: "#4dc878", bad: "#e05545", info: "#5aa2e8"
  };
  var FONT = '"Noto Serif SC","PingFang SC","Microsoft YaHei",serif';

  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function truncText(g, text, maxW) {
    if (g.measureText(text).width <= maxW) return text;
    var t = text;
    while (t.length > 1 && g.measureText(t + "…").width > maxW) t = t.slice(0, -1);
    return t + "…";
  }

  /** 立即模式 UI：每帧 draw 时注册控件，输入事件查上一帧的控件表 */
  function EmpireUI() {
    this.widgets = [];
    this.hoverId = null;
    this._id = 0;
  }
  EmpireUI.prototype.begin = function () { this.widgets.length = 0; this._id = 0; };
  EmpireUI.prototype.button = function (g, x, y, w, h, opts) {
    opts = opts || {};
    var label = opts.label || "";
    var disabled = !!opts.disabled;
    var kind = opts.kind || "default"; // default / primary / gold / danger / ghost
    var id = "b" + (this._id++);
    var hovered = this.hoverId === id && !disabled;
    var bg, fg, border;
    if (disabled) { bg = "#1c2230"; fg = "#4a5262"; border = "#262e40"; }
    else if (kind === "primary") { bg = hovered ? "#2d4d78" : "#27436a"; fg = "#dbe8f8"; border = "#3d6aa8"; }
    else if (kind === "gold") { bg = hovered ? "#d8ab48" : "#c9993c"; fg = "#1c1608"; border = "#e8c563"; }
    else if (kind === "danger") { bg = hovered ? "#7c3a32" : "#6d332c"; fg = "#f2d5d0"; border = "#9e453b"; }
    else if (kind === "ghost") { bg = hovered ? "rgba(255,255,255,0.08)" : "transparent"; fg = hovered ? COL.text : COL.dim; border = hovered ? COL.line : "transparent"; }
    else { bg = hovered ? "#323e54" : "#2a3548"; fg = COL.text; border = "#3d4a64"; }
    g.fillStyle = bg;
    rr(g, x, y, w, h, 8); g.fill();
    if (border !== "transparent" && !disabled) { g.strokeStyle = border; g.lineWidth = 1; g.stroke(); }
    g.fillStyle = fg;
    g.font = (opts.bold ? "700 " : "600 ") + (opts.size || 15) + "px " + FONT;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(truncText(g, label, w - 14), x + w / 2, y + h / 2 + 1);
    if (!disabled && opts.cb) this.widgets.push({ id: id, x: x, y: y, w: w, h: h, cb: opts.cb, cursor: "pointer" });
    return { x: x, y: y, w: w, h: h };
  };
  EmpireUI.prototype.hit = function (mx, my) {
    for (var i = this.widgets.length - 1; i >= 0; i--) {
      var wgt = this.widgets[i];
      if (mx >= wgt.x && mx <= wgt.x + wgt.w && my >= wgt.y && my <= wgt.y + wgt.h) return wgt;
    }
    return null;
  };
  EmpireUI.prototype.click = function (mx, my) {
    var wgt = this.hit(mx, my);
    if (wgt && wgt.cb) { wgt.cb(); return true; }
    return !!wgt;
  };

  /* ================= 音效（WebAudio 程序化） ================= */

  function Sound() {
    this.ctx = null;
    this.on = true;
    try { this.on = localStorage.getItem("empire_sound") !== "0"; } catch (e) {}
  }
  Sound.prototype.toggle = function () {
    this.on = !this.on;
    try { localStorage.setItem("empire_sound", this.on ? "1" : "0"); } catch (e) {}
    return this.on;
  };
  Sound.prototype._tone = function (freq, dur, delay, type, vol) {
    if (!this.on) return;
    try {
      if (!this.ctx) this.ctx = new (global.AudioContext || global.webkitAudioContext)();
      var t0 = this.ctx.currentTime + (delay || 0);
      var osc = this.ctx.createOscillator(), gain = this.ctx.createGain();
      osc.type = type || "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(vol || 0.12, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.02);
    } catch (e) {}
  };
  Sound.prototype.click = function () { this._tone(660, 0.06, 0, "triangle", 0.05); };
  Sound.prototype.buy = function () { this._tone(520, 0.09, 0); this._tone(780, 0.12, 0.07); };
  Sound.prototype.sell = function () { this._tone(780, 0.09, 0); this._tone(520, 0.12, 0.07); };
  Sound.prototype.bad = function () { this._tone(180, 0.22, 0, "sawtooth", 0.07); };
  Sound.prototype.payout = function () {
    this._tone(660, 0.08, 0); this._tone(880, 0.08, 0.06); this._tone(1100, 0.14, 0.12);
  };
  Sound.prototype.win = function () {
    var notes = [523, 659, 784, 1047, 784, 1047];
    for (var i = 0; i < notes.length; i++) this._tone(notes[i], 0.22, i * 0.14, "triangle", 0.1);
  };

  /* ================= 游戏壳（渲染 + 输入） ================= */

  /**
   * EmpireGame(page)
   * page: { canvas, toast(text,kind), showWin(info), showOffline(info), confirmReset(cb) }
   */
  function EmpireGame(page) {
    this.page = page;
    this.canvas = page.canvas;
    this.g = this.canvas.getContext("2d");
    this.sound = new Sound();
    this.ui = new EmpireUI();

    this.engine = new EmpireEngine({
      onEvent: this._onEvent.bind(this)
    });
    this._loadSave();

    this.view = {
      tab: "industry",                       // industry | stock | property | antique | shop
      industryId: null, indSub: "overview",  // overview | staff | equip | recipe | material
      stockId: null, stockFilter: "all", stockSort: "default",
      buyAmt: "max", upAmt: 1
    };
    this.scroll = {};
    this.floats = [];
    this.msg = null; this.msgUntil = 0;
    this.saveTimer = 0;
    this.lastFrame = performance.now();
    this.hiddenAt = 0;
    this.winShown = false;
    this._debug = typeof location !== "undefined" && location.search.indexOf("debug=1") >= 0;
    this._lastClick = null;

    this._bindInput();
    this._resize();
    global.addEventListener("resize", this._resize.bind(this));
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) {
        this.hiddenAt = performance.now();
        this._saveNow();
      } else if (this.hiddenAt && performance.now() - this.hiddenAt > 8000) {
        var dt = (performance.now() - this.hiddenAt) / 1000;
        var res = this.engine.applyOffline(dt);
        if (res && res.gain > 1) this.page.showOffline(res);
        this.hiddenAt = 0;
      }
    }.bind(this));
    global.addEventListener("beforeunload", this._saveNow.bind(this));
    if (location.search.indexOf("debug=1") >= 0) global.__empire = this;

    this._raf = requestAnimationFrame(this._loop.bind(this));
  }

  /* ---------- 存档 ---------- */

  EmpireGame.prototype._saveNow = function () {
    try {
      var sv = this.engine.save();
      localStorage.setItem(F.saveKey, JSON.stringify(sv));
    } catch (e) {}
  };

  EmpireGame.prototype._loadSave = function () {
    try {
      var raw = localStorage.getItem(F.saveKey);
      if (!raw) return;
      var sv = JSON.parse(raw);
      if (this.engine.load(sv)) {
        var elapsed = (Date.now() - (sv.lastSaveAt || Date.now())) / 1000;
        if (elapsed > 60) {
          var res = this.engine.applyOffline(elapsed);
          if (res && res.gain > 1) {
            setTimeout(function () { this.page.showOffline(res); }.bind(this), 300);
          }
        }
      }
    } catch (e) {}
  };

  EmpireGame.prototype.resetGame = function () {
    try { localStorage.removeItem(F.saveKey); } catch (e) {}
    location.reload();
  };

  /* ---------- 事件桥 ---------- */

  EmpireGame.prototype._onEvent = function (type, p) {
    if (type === "toast") {
      this.page.toast(p.text, p.kind || "info");
      if (p.kind === "bad") this.sound.bad();
    } else if (type === "news") {
      this.page.toast("📰 " + p.text, "info");
    } else if (type === "promo") {
      this.page.toast("🔥 " + p.name + " 大促开启！需求 ×3（25 秒）", "good");
    } else if (type === "payout") {
      this.sound.payout();
      this.floats.push({ text: "+" + fmt(p.amount), x: 200, y: 60, life: 1.6, color: COL.gold });
      this.page.toast("🚀 " + p.name + " 完成订单结算 +" + fmt(p.amount), "good");
    } else if (type === "antiEvent") {
      this.page.toast(p.text, "gold");
    } else if (type === "autoClosed") {
      this.page.toast("💀 " + p.name + " 亏损拖垮现金流，已自动停业", "bad");
    } else if (type === "win") {
      if (!this.winShown) {
        this.winShown = true;
        this.sound.win();
        this.page.showWin({ time: p.time, worth: p.worth, stats: this._winStats() });
      }
    }
  };

  EmpireGame.prototype._winStats = function () {
    var e = this.engine, n = 0, id;
    for (id in e.industries) if (e.industries[id]) n++;
    return {
      industries: n,
      dividends: e.dividendsTotal,
      earned: e.totalEarned,
      props: Object.keys(e.propsOwned).reduce(function (a, k) { return a + (e.propsOwned[k] || 0); }, 0),
      time: e.t
    };
  };

  /* ---------- 输入 ---------- */

  EmpireGame.prototype._bindInput = function () {
    var self = this;
    var cvs = this.canvas;
    this._scrollKey = null;

    function pos(ev) {
      var r = cvs.getBoundingClientRect();
      var cx = (ev.clientX - r.left) * (W / r.width);
      var cy = (ev.clientY - r.top) * (H / r.height);
      return { x: cx, y: cy };
    }
    cvs.addEventListener("mousemove", function (ev) {
      var p = pos(ev);
      var wgt = self.ui.hit(p.x, p.y);
      self.ui.hoverId = wgt ? wgt.id : null;
      cvs.style.cursor = wgt ? (wgt.cursor || "default") : "default";
      self._hover(p.x, p.y);
    });
    cvs.addEventListener("click", function (ev) {
      var p = pos(ev);
      self._lastClick = p;
      if (self.ui.click(p.x, p.y)) self.sound.click();
      else self._clickBg(p.x, p.y);
    });
    cvs.addEventListener("wheel", function (ev) {
      ev.preventDefault();
      var p = pos(ev);
      var key = self._scrollKeyAt(p.x, p.y);
      if (key && self.scroll[key] != null) {
        self.scroll[key] = clamp((self.scroll[key] || 0) + (ev.deltaY > 0 ? 56 : -56), 0, 1e9);
      }
    }, { passive: false });
    // 触屏：拖动滚动，轻点点击
    var touchStart = null;
    cvs.addEventListener("touchstart", function (ev) {
      if (ev.touches.length === 1) {
        var p = pos(ev.touches[0]);
        touchStart = { x: p.x, y: p.y, t: Date.now(), moved: false, key: self._scrollKeyAt(p.x, p.y) };
      }
    }, { passive: true });
    cvs.addEventListener("touchmove", function (ev) {
      if (touchStart && ev.touches.length === 1) {
        var r = cvs.getBoundingClientRect();
        var dy = (ev.touches[0].clientY - r.top) * (H / r.height) - touchStart.y;
        if (Math.abs(dy) > 8) touchStart.moved = true;
        if (touchStart.moved && touchStart.key && self.scroll[touchStart.key] != null) {
          self.scroll[touchStart.key] = clamp((self.scroll[touchStart.key] || 0) - dy, 0, 1e9);
          touchStart.y += dy;
        }
      }
    }, { passive: true });
    cvs.addEventListener("touchend", function (ev) {
      if (touchStart && !touchStart.moved) {
        var wgt = self.ui.hit(touchStart.x, touchStart.y);
        if (wgt && wgt.cb) { wgt.cb(); self.sound.click(); }
        else self._clickBg(touchStart.x, touchStart.y);
      }
      touchStart = null;
    });
  };

  // 记录各列表的滚动区域，供滚轮/触摸定位
  EmpireGame.prototype._scrollKeyAt = function (mx, my) {
    for (var i = this._scrollAreas.length - 1; i >= 0; i--) {
      var a = this._scrollAreas[i];
      if (mx >= a.x && mx <= a.x + a.w && my >= a.y && my <= a.y + a.h) return a.key;
    }
    return null;
  };
  EmpireGame.prototype._hover = function () {};
  EmpireGame.prototype._clickBg = function () {};

  EmpireGame.prototype._resize = function () {
    var cvs = this.canvas, dpr = global.devicePixelRatio || 1;
    var parent = cvs.parentElement;
    var availW = parent.clientWidth, availH = parent.clientHeight;
    var scale = Math.min(availW / W, availH / H);
    var cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
    cvs.style.width = cssW + "px";
    cvs.style.height = cssH + "px";
    cvs.width = Math.floor(W * scale * dpr);
    cvs.height = Math.floor(H * scale * dpr);
    this._scale = scale * dpr;
  };

  EmpireGame.prototype._loop = function (now) {
    try {
      this._loopInner(now);
    } catch (err) {
      try { document.title = "ERR " + (err && err.message ? err.message : err) + " | " + String(err && err.stack ? err.stack.split("\n")[1] : "").trim(); } catch (e) {}
    }
  };

  EmpireGame.prototype._loopInner = function (now) {
    var dt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.engine.tick(dt);

    this.saveTimer += dt;
    if (this.saveTimer >= F.saveInterval) {
      this.saveTimer = 0;
      this._saveNow();
    }
    for (var i = this.floats.length - 1; i >= 0; i--) {
      var f = this.floats[i];
      f.life -= dt; f.y -= 28 * dt;
      if (f.life <= 0) this.floats.splice(i, 1);
    }
    this._draw();
    if (this._debug && this.page.debugInfo) {
      this.page.debugInfo({
        tab: this.view.tab, ind: this.view.industryId, sub: this.view.indSub, stock: this.view.stockId,
        cash: Math.round(this.engine.cash), worth: Math.round(this.engine.netWorth()),
        click: this._lastClick, workers: this.view.industryId && this.engine.industries[this.view.industryId] ? this.engine.industries[this.view.industryId].workers.length : -1
      });
    }
    this._raf = requestAnimationFrame(this._loop.bind(this));
  };

  /* ---------- 绘制总入口 ---------- */

  EmpireGame.prototype._draw = function () {
    var g = this.g;
    this.ui.begin();
    this._scrollAreas = [];
    g.setTransform(this._scale, 0, 0, this._scale, 0, 0);
    g.fillStyle = COL.bg;
    g.fillRect(0, 0, W, H);
    this._drawHUD(g);
    this._drawTicker(g);
    var self = this;
    var tabDraw = {
      industry: function () { self.view.industryId ? self._drawIndustryDetail(g) : self._drawIndustryList(g); },
      stock: function () { self.view.stockId ? self._drawStockDetail(g) : self._drawStockList(g); },
      property: function () { self._drawProperty(g); },
      antique: function () { self._drawAntique(g); },
      shop: function () { self._drawShop(g); }
    };
    (tabDraw[this.view.tab] || tabDraw.industry)();
    this._drawTabs(g);
    this._drawEventChip(g);
    this._drawFloats(g);
  };

  /* ---------- HUD ---------- */

  EmpireGame.prototype._drawHUD = function (g) {
    var e = this.engine;
    g.fillStyle = COL.panel;
    g.fillRect(0, 0, W, 86);
    g.strokeStyle = COL.line; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 85.5); g.lineTo(W, 85.5); g.stroke();

    // 现金（大字）
    g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
    g.fillText("现 金", 20, 26);
    g.fillStyle = COL.gold; g.font = "700 34px " + FONT;
    g.fillText(fmt(e.cash), 20, 58);

    // 每秒净现金流
    var flow = e.cashFlowPerSec();
    g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
    g.fillText("每秒净现金流", 235, 26);
    g.fillStyle = flow.total >= 0 ? COL.good : COL.bad;
    g.font = "700 24px " + FONT;
    g.fillText((flow.total >= 0 ? "+" : "") + fmt(flow.total) + "/s", 235, 52);
    g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
    g.fillText("底薪 " + fmt(F.baseSalary) + " · 房租 " + fmt(flow.rent), 235, 70);

    // 总资产 + 称号
    g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
    g.fillText("总资产（身家）", 470, 26);
    g.fillStyle = COL.text; g.font = "700 24px " + FONT;
    g.fillText(fmt(e.netWorth()), 470, 52);
    g.fillStyle = COL.gold; g.font = "600 13px " + FONT;
    g.fillText("「" + e.title() + "」", 470, 70);

    // 万亿进度（log 刻度）
    var px = 660, pw = 280;
    g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
    g.textAlign = "right";
    g.fillText("首富之路 · 目标 1 万亿", px + pw, 26);
    var worth = Math.max(1, e.netWorth());
    var prog = clamp(Math.log10(worth) / 12, 0, 1);
    g.fillStyle = "#121826";
    rr(g, px, 36, pw, 12, 6); g.fill();
    var grad = g.createLinearGradient(px, 0, px + pw, 0);
    grad.addColorStop(0, "#8f6c1e"); grad.addColorStop(1, COL.gold);
    g.fillStyle = prog > 0.01 ? grad : "#2a3548";
    rr(g, px, 36, Math.max(6, pw * prog), 12, 6); g.fill();
    g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
    g.fillText(fmt(worth) + " / 1万亿", px + pw, 66);

    // Buff 指示
    var buff = null;
    for (var i = 0; i < e.shop.buffs.length; i++) buff = Math.max(buff || 0, e.shop.buffs[i].mult);
    if (buff) {
      g.textAlign = "left";
      g.fillStyle = COL.goldBg;
      rr(g, 20, 66, 150, 18, 9); g.fill();
      g.fillStyle = COL.gold; g.font = "600 12px " + FONT;
      var b = e.shop.buffs[0];
      g.fillText("⚡ 收益 ×" + buff + "（" + Math.ceil(b.until - e.t) + "s）", 28, 79);
    }
  };

  /* ---------- 新闻跑马灯 ---------- */

  EmpireGame.prototype._drawTicker = function (g) {
    var e = this.engine;
    g.fillStyle = "#141926";
    g.fillRect(0, 86, W, 26);
    var text = e.newsList.length
      ? e.newsList.map(function (n) { return "📰 " + n.text; }).join("    ●    ")
      : "静待市场消息……    ●    小贴士：原料低价时记得囤货    ●    蓝筹股每游戏日派息";
    g.font = "400 13px " + FONT;
    var tw = g.measureText(text + "    ●    ").width;
    var offset = (e.t * 46) % tw;
    g.save();
    g.beginPath(); g.rect(0, 86, W, 26); g.clip();
    g.fillStyle = COL.dim;
    g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(text + "    ●    ", -offset, 99);
    g.fillText(text + "    ●    ", -offset + tw, 99);
    g.restore();
  };

  /* ---------- 底部 Tab ---------- */

  EmpireGame.prototype._drawTabs = function (g) {
    var self = this;
    var tabs = [
      { id: "industry", label: "🏛 产业" },
      { id: "stock", label: "📈 股市" },
      { id: "property", label: "🏠 地产" },
      { id: "antique", label: "🏺 古董" },
      { id: "shop", label: "🛍 商店" }
    ];
    var y = H - 62, tabW = 150, gap = 8;
    var totalW = tabs.length * tabW + (tabs.length - 1) * gap;
    var x0 = (W - totalW) / 2;
    tabs.forEach(function (t, i) {
      var active = self.view.tab === t.id;
      g.fillStyle = active ? COL.goldBg : "rgba(255,255,255,0.03)";
      rr(g, x0 + i * (tabW + gap), y, tabW, 46, 12); g.fill();
      g.strokeStyle = active ? COL.gold : COL.line;
      g.lineWidth = active ? 1.5 : 1; g.stroke();
      g.fillStyle = active ? COL.gold : COL.dim;
      g.font = (active ? "700 " : "600 ") + "17px " + FONT;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(t.label, x0 + i * (tabW + gap) + tabW / 2, y + 24);
      self.ui.widgets.push({ id: "tab" + t.id, x: x0 + i * (tabW + gap), y: y, w: tabW, h: 46, cursor: "pointer", cb: function () {
        self.view.tab = t.id;
        self.view.industryId = null;
        self.view.stockId = null;
      } });
    });
  };

  /* ---------- 古董机会浮动按钮 ---------- */

  EmpireGame.prototype._drawEventChip = function (g) {
    var e = this.engine, self = this;
    if (!e.antiEvent || e.antiEvent.until <= e.t) return;
    var anti = null;
    for (var i = 0; i < DATA.ANTIQUES.length; i++) if (DATA.ANTIQUES[i].id === e.antiEvent.id) anti = DATA.ANTIQUES[i];
    var left = Math.ceil(e.antiEvent.until - e.t);
    var isBargain = e.antiEvent.type === "bargain";
    var label = (isBargain ? "捡漏 " : "求购 ") + anti.name + " " + left + "s";
    var w = 190;
    var pulse = 0.5 + 0.5 * Math.sin(e.t * 6);
    g.fillStyle = isBargain ? "rgba(224,85,69," + (0.18 + pulse * 0.14) + ")" : "rgba(77,200,120," + (0.18 + pulse * 0.14) + ")";
    rr(g, W - w - 16, H - 90, w, 34, 17); g.fill();
    g.strokeStyle = isBargain ? COL.up : COL.good; g.lineWidth = 1.2; g.stroke();
    g.fillStyle = isBargain ? COL.up : COL.good;
    g.font = "700 13px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(label, W - 16 - w / 2, H - 73);
    this.ui.widgets.push({ id: "antiChip", x: W - w - 16, y: H - 90, w: w, h: 34, cursor: "pointer", cb: function () {
      self.view.tab = "antique";
    } });
  };

  EmpireGame.prototype._drawFloats = function (g) {
    for (var i = 0; i < this.floats.length; i++) {
      var f = this.floats[i];
      g.globalAlpha = clamp(f.life, 0, 1);
      g.fillStyle = f.color;
      g.font = "700 22px " + FONT;
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;
  };

  /* ---------- 通用：滚动列表面板 ---------- */

  // 注册滚动区域 + 裁剪 + 画滚动条，返回滚动偏移
  EmpireGame.prototype._scrollList = function (g, key, x, y, w, h, contentH) {
    var maxScroll = Math.max(0, contentH - h);
    if (this.scroll[key] == null) this.scroll[key] = 0;
    this.scroll[key] = clamp(this.scroll[key], 0, maxScroll);
    var off = this.scroll[key];
    this._scrollAreas.push({ key: key, x: x, y: y, w: w, h: h });
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.translate(0, -off);
    if (maxScroll > 0) {
      var barH = Math.max(30, h * h / contentH);
      var barY = y + (h - barH) * (off / maxScroll);
      g.restore();
      g.save();
      g.fillStyle = "rgba(255,255,255,0.08)";
      rr(g, x + w - 6, barY, 4, barH, 2); g.fill();
      g.restore();
      g.save();
      g.beginPath(); g.rect(x, y, w, h); g.clip();
      g.translate(0, -off);
    }
    return function () { g.restore(); };
  };

  EmpireGame.prototype._panel = function (g, x, y, w, h, title) {
    g.fillStyle = COL.panel;
    rr(g, x, y, w, h, 12); g.fill();
    g.strokeStyle = COL.line; g.lineWidth = 1; g.stroke();
    if (title) {
      g.fillStyle = COL.text; g.font = "700 16px " + FONT;
      g.textAlign = "left"; g.textBaseline = "alphabetic";
      g.fillText(title, x + 16, y + 28);
    }
  };

  EmpireGame.prototype._statLine = function (g, x, y, label, value, color) {
    g.font = "400 13px " + FONT; g.fillStyle = COL.dim; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText(label, x, y);
    g.font = "700 14px " + FONT; g.fillStyle = color || COL.text;
    g.textAlign = "right";
    g.fillText(value, x + 150, y);
    g.textAlign = "left";
  };

  /* ================= 产业列表 ================= */

  EmpireGame.prototype._drawIndustryList = function (g) {
    var e = this.engine, self = this;
    this._panel(g, 16, 122, W - 32, H - 200, "我的产业");
    g.fillStyle = COL.faint; g.font = "400 12px " + FONT; g.textAlign = "right";
    g.fillText("雇佣员工 · 配置设备 · 研发配方 · 管控原料成本", W - 32, 148);

    var x = 28, y0 = 158, w = W - 56, rowH = 34;
    var done = this._scrollList(g, "indList", x, y0, w, H - 200 - 46, DATA.INDUSTRIES.length * rowH);
    DATA.INDUSTRIES.forEach(function (def, i) {
      var ind = e.industries[def.id];
      var y = y0 + i * rowH;
      var snap = ind ? e.calcIndustry(def.id) : null;
      // 行底
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)";
      rr(g, x, y, w, rowH - 4, 6); g.fill();
      // 图标
      g.fillStyle = ind ? COL.goldBg : "#1c2230";
      rr(g, x + 6, y + 3, 24, 24, 5); g.fill();
      g.fillStyle = ind ? COL.gold : COL.faint;
      g.font = "700 14px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(def.icon, x + 18, y + 16);
      // 名称 + 状态
      g.textAlign = "left";
      g.fillStyle = ind ? COL.text : COL.dim;
      g.font = (ind ? "700 " : "600 ") + "14px " + FONT;
      g.fillText(truncText(g, def.name, 110), x + 40, y + 16);
      if (ind) {
        g.fillStyle = COL.faint; g.font = "400 12px " + FONT;
        var st = ind.closed ? "停业中" : ("Lv." + ind.level + " · 员工 " + ind.workers.length + " · 设备 " + ind.equip.length);
        g.fillText(st, x + 155, y + 16);
        // 净利
        g.textAlign = "right";
        g.fillStyle = snap.net >= 0 ? COL.good : COL.bad;
        g.font = "700 13px " + FONT;
        g.fillText((snap.net >= 0 ? "+" : "") + fmt(snap.net) + "/s", x + w - 20, y + 16);
        g.textAlign = "left";
      }
      // 行点击 → 详情 / 开设
      self.ui.widgets.push({
        id: "ind" + def.id, x: x, y: y, w: w, h: rowH - 4, cursor: "pointer",
        cb: function () {
          if (ind) { self.view.industryId = def.id; self.view.indSub = "overview"; }
          else {
            var r = e.buyIndustry(def.id);
            if (!r.ok) self.page.toast(r.msg || "无法开设", "bad");
            else { self.sound.buy(); self.page.toast("🎉 " + def.name + " 开业大吉！快去雇人买设备", "good"); }
          }
        }
      });
      if (!ind) {
        var afford = e.cash >= def.unlock;
        self.ui.button(g, x + w - 100, y + 1, 86, 26, {
          label: "开设 " + fmt(def.unlock), kind: afford ? "gold" : "default", size: 12, bold: true,
          disabled: !afford,
          cb: function () {
            var r = e.buyIndustry(def.id);
            if (!r.ok) self.page.toast(r.msg, "bad");
            else { self.sound.buy(); self.page.toast("🎉 " + def.name + " 开业大吉！", "good"); }
          }
        });
      }
    });
    done();
  };

  /* ================= 产业详情 ================= */

  EmpireGame.prototype._drawIndustryDetail = function (g) {
    var e = this.engine, self = this;
    var def = null, i;
    for (i = 0; i < DATA.INDUSTRIES.length; i++) if (DATA.INDUSTRIES[i].id === this.view.industryId) def = DATA.INDUSTRIES[i];
    if (!def || !e.industries[def.id]) { this.view.industryId = null; return; }
    var ind = e.industries[def.id];
    var snap = e.calcIndustry(def.id);

    // 头部
    this._panel(g, 16, 122, W - 32, 64);
    g.fillStyle = COL.goldBg; rr(g, 28, 134, 40, 40, 8); g.fill();
    g.fillStyle = COL.gold; g.font = "700 22px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(def.icon, 48, 155);
    g.textAlign = "left";
    g.fillStyle = COL.text; g.font = "700 19px " + FONT;
    g.fillText(def.name, 82, 147);
    g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
    g.fillText("Lv." + ind.level + (ind.closed ? " · 停业中" : "") + " · " + def.desc, 82, 168);
    g.textAlign = "right";
    g.fillStyle = snap.net >= 0 ? COL.good : COL.bad; g.font = "700 20px " + FONT;
    g.fillText((snap.net >= 0 ? "+" : "") + fmt(snap.net) + "/s", W - 190, 152);
    this.ui.button(g, W - 100, 136, 76, 28, { label: "← 列表", kind: "ghost", cb: function () { self.view.industryId = null; } });

    // 子页签
    var subs = [["overview", "概览"], ["staff", "员工"], ["equip", "设备"], ["recipe", "配方"], ["material", "原料"]];
    var sy = 196, sx = 16;
    subs.forEach(function (s) {
      var active = self.view.indSub === s[0];
      g.fillStyle = active ? "#2a3548" : "rgba(255,255,255,0.03)";
      rr(g, sx, sy, 84, 32, 8); g.fill();
      g.strokeStyle = active ? COL.gold : COL.line; g.lineWidth = active ? 1.4 : 1; g.stroke();
      g.fillStyle = active ? COL.gold : COL.dim;
      g.font = (active ? "700 " : "600 ") + "14px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(s[1], sx + 42, sy + 17);
      self.ui.widgets.push({ id: "sub" + s[0], x: sx, y: sy, w: 84, h: 32, cursor: "pointer", cb: function () { self.view.indSub = s[0]; } });
      sx += 92;
    });

    var drawSub = {
      overview: this._drawIndOverview, staff: this._drawIndStaff,
      equip: this._drawIndEquip, recipe: this._drawIndRecipe, material: this._drawIndMaterial
    }[this.view.indSub];
    if (drawSub) drawSub.call(this, g, def, ind, snap);
  };

  EmpireGame.prototype._drawIndOverview = function (g, def, ind, snap) {
    var e = this.engine, self = this;
    var x = 16, y = 240, w = W - 32, h = H - 316;
    this._panel(g, x, y, w, h);

    // 左：损益表
    var items = [
      ["营业收入", "+" + fmt(snap.revenue) + "/s", COL.good],
      ["原料成本", "-" + fmt(snap.ingCost) + "/s", COL.bad],
      ["员工工资", "-" + fmt(snap.wage) + "/s", COL.bad],
      ["设备维护", "-" + fmt(snap.maint) + "/s", COL.bad],
      ["净利", (snap.net >= 0 ? "+" : "") + fmt(snap.net) + "/s", snap.net >= 0 ? COL.good : COL.bad]
    ];
    var maxAbs = Math.max(snap.revenue, snap.ingCost, snap.wage, snap.maint, 1);
    items.forEach(function (it, i) {
      var yy = y + 40 + i * 44;
      self._statLine(g, x + 20, yy, it[0], it[1], it[2]);
      var bw = 170;
      g.fillStyle = "#121826";
      rr(g, x + 190, yy - 5, bw, 10, 5); g.fill();
      var v = Math.abs(parseFloat(String(it[1]).replace(/[^0-9.]/g, ""))) || 0;
      g.fillStyle = it[1][0] === "+" ? COL.good : COL.bad;
      rr(g, x + 190, yy - 5, Math.max(2, bw * v / maxAbs), 10, 5); g.fill();
    });

    // 中：产能 / 需求 / 口碑
    var mx = x + 420;
    var bars = [
      ["产能", snap.cap, Math.max(snap.cap, snap.demand), COL.info],
      ["市场需求", snap.demand, Math.max(snap.cap, snap.demand), COL.gold],
      ["口碑", ind.rep, 1.8, ind.rep >= 1 ? COL.good : COL.bad]
    ];
    bars.forEach(function (b, i) {
      var yy = y + 48 + i * 56;
      g.fillStyle = COL.dim; g.font = "400 13px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(b[0], mx, yy);
      g.fillStyle = "#121826";
      rr(g, mx, yy + 10, 200, 12, 6); g.fill();
      g.fillStyle = b[3];
      rr(g, mx, yy + 10, Math.max(3, 200 * clamp(b[1] / b[2], 0, 1)), 12, 6); g.fill();
      g.fillStyle = COL.text; g.font = "700 13px " + FONT;
      var val = b[0] === "口碑" ? b[1].toFixed(2) : fmt(b[1]);
      g.fillText(val + (b[0] === "口碑" ? "" : "/s"), mx + 210, yy + 16);
    });
    // 专属机制提示
    var sp = def.special, spText = "";
    if (sp) {
      if (sp.type === "season") spText = "🌶 季节系数：" + (1 + sp.amp * Math.sin(2 * Math.PI * e.t / sp.period)).toFixed(2) + "（240 秒一轮）";
      if (sp.type === "multisku") spText = "🧺 多 SKU 槽位：" + snap.slots + "（每 8 级 +1）";
      if (sp.type === "fleet") spText = "🚗 高峰系数：" + (1 + sp.rushAmp * Math.pow(Math.abs(Math.sin(Math.PI * e.t / 60)), 6)).toFixed(2) + " · 车辆按里程折损";
      if (sp.type === "coffee") spText = "☕ 咖啡豆价 " + (e.mkt.ings.coffee.price / 25).toFixed(2) + "×（>1.5× 需求 -15%）";
      if (sp.type === "prepaid") spText = "💳 会员预收：收入 +15%";
      if (sp.type === "promo") spText = ind._promoOn ? "🔥 大促进行中！需求 ×3 · 备货 ×1.2" : "⏰ 大促倒计时 " + Math.ceil(ind._promoNext - e.t) + "s";
      if (sp.type === "lifecycle") spText = "🎮 项目热度：" + (ind.hype * 100).toFixed(0) + "%（衰减中，换配方=再立项）";
      if (sp.type === "lithium") spText = "🔋 锂价 " + (e.mkt.ings.lithium.price / 60).toFixed(2) + "×（>1.4× 需求 -25%）";
      if (sp.type === "cycle") spText = "📈 景气指数：" + (sp.base + sp.amp * Math.sin(2 * Math.PI * e.t / sp.period)).toFixed(2);
      if (sp.type === "order") spText = "🚀 在途订单：" + fmt(ind._orderAcc) + "（每 30 秒 ×1.6 结算）";
      if (sp.type === "flywheel") spText = "🌀 用户飞轮：口碑上限 1.8";
    }
    if (spText) {
      g.fillStyle = COL.goldBg;
      rr(g, mx, y + 216, 440, 30, 8); g.fill();
      g.fillStyle = COL.gold; g.font = "600 13px " + FONT; g.textAlign = "left";
      g.fillText(truncText(g, spText, 420), mx + 10, y + 231);
    }
    if (snap.brokenCount > 0) {
      g.fillStyle = "rgba(224,85,69,0.15)";
      rr(g, x + 20, y + h - 40, 380, 26, 8); g.fill();
      g.fillStyle = COL.bad; g.font = "600 13px " + FONT;
      g.fillText("⚠ 有 " + snap.brokenCount + " 台设备故障停机，产能受限 → 设备页维修", x + 30, y + h - 27);
    }

    // 右：升级 / 停业
    var ux = x + w - 250;
    var uc = e.upgradeCost(def.id);
    g.fillStyle = COL.dim; g.font = "400 13px " + FONT; g.textAlign = "left";
    g.fillText("升级（扩需求 · 每级 +60%）", ux, y + 42);
    // ×1 / ×10 / Max
    var amts = [[1, "×1"], [10, "×10"], ["max", "Max"]];
    amts.forEach(function (a, i) {
      self.ui.button(g, ux + i * 60, y + 54, 54, 26, {
        label: a[1], kind: self.view.upAmt === a[0] ? "gold" : "ghost", size: 12,
        cb: function () { self.view.upAmt = a[0]; }
      });
    });
    var upCost = 0, n = 0, lv = ind.level;
    while (n < (self.view.upAmt === "max" ? 1000 : self.view.upAmt)) {
      var c = def.levelCost * Math.pow(F.levelCostGrowth, lv - 1 + n);
      if (upCost + c > e.cash) break;
      upCost += c; n++;
    }
    self.ui.button(g, ux, y + 88, 178, 44, {
      label: n > 0 ? "升级 ×" + n + "（" + fmt(upCost) + "）" : "现金不足",
      kind: "primary", bold: true, disabled: n === 0,
      cb: function () {
        var r = e.upgradeIndustry(def.id, self.view.upAmt);
        if (r.ok) self.sound.buy();
        else self.page.toast(r.msg, "bad");
      }
    });
    self.ui.button(g, ux, y + 142, 178, 34, {
      label: ind.closed ? "▶ 复工营业" : "⏸ 停业（止损）",
      kind: ind.closed ? "gold" : "danger",
      cb: function () {
        e.toggleClosed(def.id);
        self.sound.click();
      }
    });
    g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
    g.fillText("停业免工资、维护 ×0.3", ux, y + 190);
  };

  EmpireGame.prototype._drawIndStaff = function (g, def, ind, snap) {
    var e = this.engine, self = this;
    var x = 16, y = 240, w = W - 32, h = H - 316;
    this._panel(g, x, y, w, h, "在职员工（" + ind.workers.length + "）");

    var done = this._scrollList(g, "indStaff", x + 12, y + 42, w - 24, h - 54, Math.max(ind.workers.length * 36, 36) + 230);
    var yy = y + 48;
    if (!ind.workers.length) {
      g.fillStyle = COL.faint; g.font = "400 13px " + FONT; g.textAlign = "left";
      g.fillText("还没有员工——没有员工就没有产能，去下面招聘！", x + 20, yy + 10);
    }
    ind.workers.slice().forEach(function (wk, i) {
      g.fillStyle = "rgba(255,255,255,0.04)";
      rr(g, x + 12, yy, w - 24, 32, 6); g.fill();
      g.strokeStyle = wk.color; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x + 14, yy + 2); g.lineTo(x + 14, yy + 30); g.stroke();
      g.fillStyle = COL.text; g.font = "600 13px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(truncText(g, wk.posName + " · " + wk.qName, 160), x + 24, yy + 16);
      g.fillStyle = COL.info; g.font = "400 12px " + FONT;
      g.fillText("产能 " + fmt(wk.eff, 1) + "/s", x + 200, yy + 16);
      g.fillStyle = COL.bad;
      g.fillText("薪水 " + fmt(wk.salary, 1) + "/s", x + 330, yy + 16);
      self.ui.button(g, x + w - 100, yy + 4, 80, 24, {
        label: "解雇", kind: "ghost", size: 12,
        cb: function () { e.fire(def.id, i); self.sound.click(); }
      });
      yy += 36;
    });
    yy += 14;
    g.fillStyle = COL.text; g.font = "700 15px " + FONT; g.textAlign = "left"; g.textBaseline = "alphabetic";
    g.fillText("招聘市场（品质随机：普通 / 熟练 / 金牌）", x + 16, yy + 12);
    var cands = e.candidates[def.id] || [];
    cands.forEach(function (c, i) {
      var cy = yy + 22 + i * 62;
      g.fillStyle = "rgba(255,255,255,0.03)";
      rr(g, x + 12, cy, w - 24, 56, 8); g.fill();
      g.strokeStyle = c.color; g.lineWidth = 1.4;
      rr(g, x + 12, cy, w - 24, 56, 8); g.stroke();
      g.fillStyle = c.color; g.font = "700 15px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(c.posName + " · " + c.qName, x + 26, cy + 18);
      g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
      g.fillText("产能 " + fmt(c.eff, 1) + "/s · 薪水 " + fmt(c.salary, 1) + "/s", x + 26, cy + 40);
      var afford = e.cash >= c.fee;
      self.ui.button(g, x + w - 130, cy + 13, 110, 30, {
        label: "雇佣 " + fmt(c.fee), kind: afford ? "gold" : "default", size: 13, bold: true, disabled: !afford,
        cb: function () {
          var r = e.hire(def.id, i);
          if (r.ok) self.sound.buy();
          else self.page.toast(r.msg, "bad");
        }
      });
    });
    var rc = e.refreshCost(def.id);
    this.ui.button(g, x + 12, yy + 22 + cands.length * 62 + 6, 130, 30, {
      label: "↻ 换一批（" + fmt(rc) + "）", kind: "ghost", size: 12, disabled: e.cash < rc,
      cb: function () { e.refreshCandidates(def.id); self.sound.click(); }
    });
    done();
  };

  EmpireGame.prototype._drawIndEquip = function (g, def, ind, snap) {
    var e = this.engine, self = this;
    var x = 16, y = 240, w = W - 32, h = H - 316;
    var isFleet = def.special && def.special.type === "fleet";
    this._panel(g, x, y, w / 2 - 6, h, isFleet ? "车库（" + ind.equip.length + "）" : "在用设备（" + ind.equip.length + "）");
    this._panel(g, x + w / 2 + 6, y, w / 2 - 6, h, "采购新" + (isFleet ? "车辆" : "设备"));

    var done = this._scrollList(g, "indEquip", x + 10, y + 40, w / 2 - 20, h - 52, Math.max(ind.equip.length * 54, 40));
    var yy = y + 46;
    if (!ind.equip.length) {
      g.fillStyle = COL.faint; g.font = "400 13px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText("空空如也——没有设备产能上限只有 1/s", x + 16, yy + 8);
    }
    ind.equip.forEach(function (inst, i) {
      var eq = null, k;
      for (k = 0; k < def.equipment.length; k++) if (def.equipment[k].id === inst.defId) eq = def.equipment[k];
      g.fillStyle = "rgba(255,255,255,0.04)";
      rr(g, x + 10, yy, w / 2 - 20, 50, 8); g.fill();
      g.fillStyle = COL.text; g.font = "600 13px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(eq.name + "（产能 " + eq.cap + "）", x + 20, yy + 13);
      // 耐久/里程条
      var bw = 150, ratio;
      if (eq.mileage) {
        ratio = clamp(inst.left / eq.mileage, 0, 1);
        g.fillStyle = COL.dim; g.font = "400 11px " + FONT;
        g.fillText("剩余里程 " + fmtInt(inst.left) + " km", x + 20 + bw + 10, yy + 38);
      } else {
        ratio = clamp(inst.dur / inst.maxDur, 0, 1);
        g.fillStyle = ratio < 0.3 ? COL.bad : COL.dim; g.font = "400 11px " + FONT;
        g.fillText(ratio <= 0 ? "已故障！" : "耐久 " + Math.round(ratio * 100) + "%", x + 20 + bw + 10, yy + 38);
      }
      g.fillStyle = "#121826";
      rr(g, x + 20, yy + 30, bw, 9, 4); g.fill();
      g.fillStyle = ratio < 0.3 ? COL.bad : ratio < 0.6 ? COL.gold : COL.good;
      rr(g, x + 20, yy + 30, Math.max(2, bw * ratio), 9, 4); g.fill();
      if (eq.mileage) {
        g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
        g.fillText("跑满自动报废 +残值", x + 20, yy + 13 + 0);
        g.fillText("", x + 20, yy);
      } else {
        var rCost = e.repairCost(def.id, i);
        self.ui.button(g, x + w / 2 - 170, yy + 8, 74, 22, {
          label: rCost > 0.5 ? "维修 " + fmt(rCost) : "完好", size: 11,
          kind: "primary", disabled: inst.dur >= inst.maxDur || e.cash < rCost,
          cb: function () { e.repairEquip(def.id, i); self.sound.click(); }
        });
      }
      self.ui.button(g, x + w / 2 - 90, yy + 8, 74, 22, {
        label: "报废", size: 11, kind: "danger",
        cb: function () {
          var r = e.scrapEquip(def.id, i);
          if (r.ok) { self.sound.sell(); self.page.toast("报废残值 +" + fmt(r.residual), "info"); }
        }
      });
      yy += 54;
    });
    done();

    // 采购列表
    def.equipment.forEach(function (eq, i) {
      var ey = y + 50 + i * ((h - 60) / def.equipment.length);
      g.fillStyle = "rgba(255,255,255,0.03)";
      rr(g, x + w / 2 + 14, ey, w / 2 - 36, (h - 76) / def.equipment.length, 8); g.fill();
      g.fillStyle = COL.text; g.font = "700 14px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(eq.name, x + w / 2 + 24, ey + 16);
      g.fillStyle = COL.dim; g.font = "400 11px " + FONT;
      var info = "产能 " + eq.cap + "/s · 维护 " + fmt(eq.upkeep, 1) + "/s";
      if (eq.mileage) info += " · 寿命 " + fmtInt(eq.mileage) + "km" + (eq.fuelType === "elec" ? " · 纯电" : " · 燃油");
      g.fillText(info, x + w / 2 + 24, ey + 36);
      var afford = e.cash >= eq.price;
      self.ui.button(g, x + w - 150, ey + 12, 110, 28, {
        label: fmt(eq.price), kind: afford ? "gold" : "default", size: 13, bold: true, disabled: !afford,
        cb: function () {
          var r = e.buyEquip(def.id, eq.id);
          if (r.ok) self.sound.buy();
          else self.page.toast(r.msg, "bad");
        }
      });
    });
  };

  EmpireGame.prototype._drawIndRecipe = function (g, def, ind, snap) {
    var e = this.engine, self = this;
    var x = 16, y = 240, w = W - 32, h = H - 316;
    var isLife = def.special && def.special.type === "lifecycle";
    this._panel(g, x, y, w, h, isLife ? "项目立项（切换 = 再立项，重置热度）" : "配方研发（主推决定产品与成本）");

    var done = this._scrollList(g, "indRec", x + 12, y + 42, w - 24, h - 54, def.recipes.length * 66);
    def.recipes.forEach(function (r, i) {
      var ry = y + 48 + i * 66;
      var known = ind.recipes.indexOf(r.id) >= 0;
      var active = ind.active === r.id;
      g.fillStyle = active ? COL.goldBg : "rgba(255,255,255,0.03)";
      rr(g, x + 12, ry, w - 24, 60, 8); g.fill();
      if (active) { g.strokeStyle = COL.gold; g.lineWidth = 1.4; g.stroke(); }
      g.fillStyle = known ? COL.text : COL.dim;
      g.font = "700 14px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText((active ? "★ " : "") + r.name, x + 24, ry + 16);
      // 原料构成
      var ingText = [];
      for (var gid in r.ings) {
        var idef = null, k;
        for (k = 0; k < DATA.INGREDIENTS.length; k++) if (DATA.INGREDIENTS[k].id === gid) idef = DATA.INGREDIENTS[k];
        ingText.push(idef.name + "×" + r.ings[gid]);
      }
      var ingCost = 0;
      for (gid in r.ings) ingCost += r.ings[gid] * e.mkt.ings[gid].price;
      g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
      g.fillText("原料：" + (ingText.join("、") || "无") + "（成本 " + fmt(ingCost, 1) + "/件）", x + 24, ry + 38);
      g.fillStyle = COL.dim; g.font = "400 11px " + FONT;
      g.fillText("售价 " + fmt(r.price) + " · 效率 ×" + r.eff, x + 380, ry + 16);
      var margin = (r.price - ingCost) * r.eff;
      g.fillStyle = margin >= 0 ? COL.good : COL.bad; g.font = "600 12px " + FONT;
      g.fillText("毛利 " + fmt(margin, 1) + "/件", x + 380, ry + 38);
      // 动作
      if (!known) {
        var preOk = !r.pre || ind.recipes.indexOf(r.pre) >= 0;
        var afford = e.cash >= r.learn;
        self.ui.button(g, x + w - 150, ry + 15, 124, 30, {
          label: preOk ? (r.learn ? "学习 " + fmt(r.learn) : "免费学习") : "需前置配方",
          kind: afford && preOk ? "primary" : "default", size: 12, disabled: !preOk || !afford,
          cb: function () {
            var res = e.learnRecipe(def.id, r.id);
            if (res.ok) { self.sound.buy(); self.page.toast("📖 学会 " + r.name, "good"); }
            else self.page.toast(res.msg, "bad");
          }
        });
      } else if (!active) {
        var rlCost = isLife ? r.learn * def.special.relaunchCost : 0;
        self.ui.button(g, x + w - 150, ry + 15, 124, 30, {
          label: isLife ? ("再立项 " + fmt(rlCost)) : "设为主推",
          kind: e.cash >= rlCost ? "gold" : "default", size: 12,
          cb: function () {
            var res = e.setRecipe(def.id, r.id);
            if (res.ok) self.sound.buy();
            else self.page.toast(res.msg, "bad");
          }
        });
      } else {
        g.fillStyle = COL.gold; g.font = "700 13px " + FONT; g.textAlign = "right";
        g.fillText("主推中", x + w - 40, ry + 30);
        g.textAlign = "left";
      }
    });
    done();
  };

  EmpireGame.prototype._drawIndMaterial = function (g, def, ind, snap) {
    var e = this.engine, self = this;
    var x = 16, y = 240, w = W - 32, h = H - 316;
    this._panel(g, x, y, w, h, "原料行情与囤货（库存优先消耗，按 0 成本）");

    // 本产业涉及的原料
    var used = {};
    def.recipes.forEach(function (r) { for (var gid in r.ings) used[gid] = true; });
    var ids = Object.keys(used);
    var done = this._scrollList(g, "indMat", x + 12, y + 42, w - 24, h - 54, Math.max(ids.length * 64, 40));
    ids.forEach(function (gid, i) {
      var idef = null, k;
      for (k = 0; k < DATA.INGREDIENTS.length; k++) if (DATA.INGREDIENTS[k].id === gid) idef = DATA.INGREDIENTS[k];
      var m = e.mkt.ings[gid];
      var ratio = m.price / idef.base;
      var my = y + 48 + i * 64;
      g.fillStyle = "rgba(255,255,255,0.03)";
      rr(g, x + 12, my, w - 24, 58, 8); g.fill();
      g.fillStyle = COL.text; g.font = "700 14px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(idef.name, x + 24, my + 16);
      // 价格 vs 基准
      g.fillStyle = ratio > 1.15 ? COL.up : ratio < 0.85 ? COL.down : COL.dim;
      g.font = "700 14px " + FONT;
      g.fillText(fmt(m.price, 1) + "/单位", x + 120, my + 16);
      g.font = "400 11px " + FONT;
      g.fillText("基准 " + fmt(idef.base, 1) + " · 现价 " + ratio.toFixed(2) + "× " + (ratio > 1.15 ? "↑贵" : ratio < 0.85 ? "↓便宜" : "→持平"), x + 120, my + 40);
      // 库存
      var have = ind.stock[gid] || 0;
      var useRate = snap.ingBreak[gid] || 0;
      g.fillStyle = COL.info; g.font = "600 13px " + FONT;
      g.fillText("库存 " + fmt(have, 0) + "（耗 " + fmt(useRate, 1) + "/s）", x + 360, my + 16);
      g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
      g.fillText(useRate > 0 ? "可撑 " + fmt(have / useRate, 0) + " 秒" : "当前未消耗", x + 360, my + 40);
      // 囤货按钮
      [100, 1000].forEach(function (qty, bi) {
        var cost = m.price * qty;
        self.ui.button(g, x + w - 250 + bi * 118, my + 14, 108, 30, {
          label: "囤 " + qty + "（" + fmt(cost, 1) + "）", size: 12,
          kind: e.cash >= cost ? "primary" : "default", disabled: e.cash < cost,
          cb: function () {
            var r = e.stockIng(def.id, gid, qty);
            if (r.ok) { self.sound.buy(); self.page.toast("📦 囤入 " + idef.name + " ×" + qty, "good"); }
            else self.page.toast(r.msg, "bad");
          }
        });
      });
    });
    done();
  };

  /* ================= 股市 ================= */

  EmpireGame.prototype._drawStockList = function (g) {
    var e = this.engine, self = this;
    this._panel(g, 16, 122, W - 32, H - 200, "证券交易所（45 支 · 每游戏日分红）");

    // 筛选 chips
    var chips = [{ id: "all", name: "全部" }, { id: "star", name: "★ 自选" }];
    var seen = {};
    DATA.STOCKS.forEach(function (s) { if (!seen[s.sector]) { seen[s.sector] = 1; chips.push({ id: "sec:" + s.sector, name: DATA.STOCK_SECTORS[s.sector].name }); } });
    var cx = 28, cy = 156;
    chips.forEach(function (c) {
      var active = self.view.stockFilter === c.id;
      g.fillStyle = active ? "#2a3548" : "rgba(255,255,255,0.04)";
      rr(g, cx, cy, c.name.length * 13 + 22, 24, 12); g.fill();
      g.fillStyle = active ? COL.gold : COL.dim;
      g.font = "600 12px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(c.name, cx + (c.name.length * 13 + 22) / 2, cy + 12);
      self.ui.widgets.push({ id: "chip" + c.id, x: cx, y: cy, w: c.name.length * 13 + 22, h: 24, cursor: "pointer", cb: function () { self.view.stockFilter = c.id; } });
      cx += c.name.length * 13 + 30;
    });
    // 排序
    var sorts = [["default", "默认"], ["change", "涨跌"], ["price", "价格"], ["hold", "持仓"], ["div", "股息"]];
    cx = W - 320;
    sorts.forEach(function (s) {
      var active = self.view.stockSort === s[0];
      g.fillStyle = active ? "#2a3548" : "rgba(255,255,255,0.04)";
      rr(g, cx, cy, 56, 24, 12); g.fill();
      g.fillStyle = active ? COL.gold : COL.dim;
      g.font = "600 12px " + FONT; g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(s[1], cx + 28, cy + 12);
      self.ui.widgets.push({ id: "sort" + s[0], x: cx, y: cy, w: 56, h: 24, cursor: "pointer", cb: function () { self.view.stockSort = s[0]; } });
      cx += 62;
    });

    // 列表
    var list = DATA.STOCKS.filter(function (s) {
      if (self.view.stockFilter === "all") return true;
      if (self.view.stockFilter === "star") return !!e.star[s.id];
      return "sec:" + s.sector === self.view.stockFilter;
    });
    var sortsFn = {
      change: function (a, b) { return e.stockChange(b.id) - e.stockChange(a.id); },
      price: function (a, b) { return e.mkt.stocks[b.id].price - e.mkt.stocks[a.id].price; },
      hold: function (a, b) { return ((e.portfolio[b.id] || {}).qty || 0) - ((e.portfolio[a.id] || {}).qty || 0); },
      div: function (a, b) { return DATA.STOCK_SECTORS[b.sector].div * b.divMul - DATA.STOCK_SECTORS[a.sector].div * a.divMul; },
      default: function () { return 0; }
    };
    list.sort(sortsFn[this.view.stockSort] || sortsFn.default);

    var x = 28, y0 = 190, w = W - 56, rowH = 32;
    var done = this._scrollList(g, "stockList", x, y0, w, H - 200 - 78, list.length * rowH);
    if (!list.length) {
      g.fillStyle = COL.faint; g.font = "400 13px " + FONT; g.textAlign = "left";
      g.fillText("该分类暂无股票", x, y0 + 20);
    }
    list.forEach(function (s, i) {
      var m = e.mkt.stocks[s.id];
      var ch = e.stockChange(s.id);
      var p = e.portfolio[s.id];
      var y = y0 + i * rowH;
      g.fillStyle = i % 2 ? "rgba(255,255,255,0.02)" : "rgba(255,255,255,0.04)";
      rr(g, x, y, w, rowH - 4, 6); g.fill();
      // 星标
      g.fillStyle = e.star[s.id] ? COL.gold : COL.faint;
      g.font = "700 15px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText("★", x + 8, y + 14);
      self.ui.widgets.push({ id: "star" + s.id, x: x, y: y, w: 26, h: rowH - 4, cursor: "pointer", cb: function () { e.toggleStar(s.id); } });
      g.fillStyle = COL.text; g.font = "600 14px " + FONT;
      g.fillText(truncText(g, s.name, 130), x + 32, y + 14);
      g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
      g.fillText(DATA.STOCK_SECTORS[s.sector].name + (s.style === "blue" ? " · 蓝筹" : s.style === "growth" ? " · 成长" : " · 周期"), x + 170, y + 14);
      g.textAlign = "right";
      g.fillStyle = COL.text; g.font = "700 14px " + FONT;
      g.fillText(m.price.toFixed(2), x + w - 300, y + 14);
      g.fillStyle = ch >= 0 ? COL.up : COL.down;
      g.fillText((ch >= 0 ? "+" : "") + (ch * 100).toFixed(2) + "%", x + w - 200, y + 14);
      g.fillStyle = p && p.qty ? COL.info : COL.faint;
      g.font = "600 12px " + FONT;
      g.fillText(p && p.qty ? "持 " + p.qty + " 股" : "—", x + w - 100, y + 14);
      g.fillStyle = COL.dim; g.font = "400 11px " + FONT;
      g.fillText("息 " + (DATA.STOCK_SECTORS[s.sector].div * s.divMul * 100).toFixed(2) + "%/日", x + w - 12, y + 14);
      g.textAlign = "left";
      self.ui.widgets.push({ id: "st" + s.id, x: x + 26, y: y, w: w - 26, h: rowH - 4, cursor: "pointer", cb: function () { self.view.stockId = s.id; } });
    });
    done();
  };

  EmpireGame.prototype._drawStockDetail = function (g) {
    var e = this.engine, self = this;
    var s = e._stockDef(this.view.stockId);
    if (!s) { this.view.stockId = null; return; }
    var m = e.mkt.stocks[s.id];
    var p = e.portfolio[s.id];
    var sec = DATA.STOCK_SECTORS[s.sector];
    var ch = e.stockChange(s.id);

    this._panel(g, 16, 122, W - 32, 250);
    // 头
    this.ui.button(g, 30, 134, 76, 28, { label: "← 列表", kind: "ghost", cb: function () { self.view.stockId = null; } });
    g.fillStyle = e.star[s.id] ? COL.gold : COL.dim;
    g.font = "700 22px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
    g.fillText("★", 120, 148);
    this.ui.widgets.push({ id: "starD", x: 112, y: 134, w: 34, h: 30, cursor: "pointer", cb: function () { e.toggleStar(s.id); } });
    g.fillStyle = COL.text; g.font = "700 22px " + FONT;
    g.fillText(s.name, 156, 148);
    g.fillStyle = COL.dim; g.font = "400 13px " + FONT;
    g.fillText(sec.name + " · " + s.blurb, 156, 172);
    // 价格
    g.textAlign = "right";
    g.fillStyle = ch >= 0 ? COL.up : COL.down;
    g.font = "700 34px " + FONT;
    g.fillText(m.price.toFixed(2), W - 60, 152);
    g.font = "700 15px " + FONT;
    g.fillText((ch >= 0 ? "▲ +" : "▼ ") + (ch * 100).toFixed(2) + "%（日）", W - 60, 178);
    g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
    g.fillText("股息率 " + (sec.div * s.divMul * 100).toFixed(2) + "%/游戏日", W - 60, 198);

    // 走势图
    var hist = m.hist;
    if (hist.length > 2) {
      var cx0 = 320, cy0 = 210, cw = 600, chh = 140;
      var lo = Math.min.apply(null, hist), hi = Math.max.apply(null, hist);
      if (hi - lo < 1e-6) { hi = lo + 1; }
      g.strokeStyle = COL.line; g.strokeRect(cx0, cy0, cw, chh);
      // 网格
      g.strokeStyle = "rgba(255,255,255,0.05)";
      for (var gi2 = 1; gi2 < 4; gi2++) {
        g.beginPath(); g.moveTo(cx0, cy0 + chh * gi2 / 4); g.lineTo(cx0 + cw, cy0 + chh * gi2 / 4); g.stroke();
      }
      var up = hist[hist.length - 1] >= hist[0];
      var colr = up ? COL.up : COL.down;
      g.beginPath();
      hist.forEach(function (v, i) {
        var px2 = cx0 + cw * i / (hist.length - 1);
        var py2 = cy0 + chh - chh * (v - lo) / (hi - lo);
        i ? g.lineTo(px2, py2) : g.moveTo(px2, py2);
      });
      g.strokeStyle = colr; g.lineWidth = 2; g.stroke();
      // 渐变填充
      g.lineTo(cx0 + cw, cy0 + chh); g.lineTo(cx0, cy0 + chh); g.closePath();
      var grad2 = g.createLinearGradient(0, cy0, 0, cy0 + chh);
      grad2.addColorStop(0, up ? "rgba(224,85,69,0.25)" : "rgba(63,164,106,0.25)");
      grad2.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad2; g.fill();
      g.fillStyle = COL.faint; g.font = "400 10px " + FONT; g.textAlign = "left";
      g.fillText(hi.toFixed(2), cx0 + 4, cy0 + 12);
      g.fillText(lo.toFixed(2), cx0 + 4, cy0 + chh - 4);
    }

    // 持仓与买卖
    this._panel(g, 16, 382, W - 32, H - 458, "持仓与交易");
    var px3 = 32;
    if (p && p.qty > 0) {
      var pnl = (m.price - p.cost / p.qty) * p.qty;
      this._statLine(g, px3, 424, "持有", p.qty + " 股", COL.text);
      this._statLine(g, px3, 448, "成本均价", (p.cost / p.qty).toFixed(2), COL.dim);
      this._statLine(g, px3, 472, "浮动盈亏", (pnl >= 0 ? "+" : "") + fmt(pnl), pnl >= 0 ? COL.up : COL.down);
      this._statLine(g, px3, 496, "累计分红", "+" + fmt(p.div || 0), COL.gold);
      this._statLine(g, px3, 520, "市值", fmt(p.qty * m.price), COL.text);
    } else {
      g.fillStyle = COL.faint; g.font = "400 14px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText("暂无持仓", px3, 460);
    }
    // 数量选择 + 买卖
    var bx = 400;
    g.fillStyle = COL.dim; g.font = "400 13px " + FONT; g.textAlign = "left";
    g.fillText("数量", bx, 424);
    var amts = [[1, "1"], [10, "10"], [100, "100"], ["max", "最大"]];
    amts.forEach(function (a, i) {
      self.ui.button(g, bx + 46 + i * 64, 410, 58, 28, {
        label: a[1], kind: self.view.buyAmt === a[0] ? "gold" : "ghost", size: 13,
        cb: function () { self.view.buyAmt = a[0]; }
      });
    });
    var qty = self.view.buyAmt === "max" ? Math.floor(e.cash / m.price) : self.view.buyAmt;
    var cost = qty * m.price;
    this.ui.button(g, bx, 450, 150, 46, {
      label: qty > 0 ? "买入 " + qty + " 股 · " + fmt(cost) : "现金不足",
      kind: "primary", bold: true, disabled: qty <= 0 || e.cash < cost,
      cb: function () {
        var r = e.buyStock(s.id, self.view.buyAmt);
        if (r.ok) { self.sound.buy(); self.floats.push({ text: "买入 " + r.qty + " 股", x: bx, y: 440, life: 1, color: COL.info }); }
        else self.page.toast(r.msg, "bad");
      }
    });
    this.ui.button(g, bx + 166, 450, 150, 46, {
      label: p && p.qty ? "卖出全部 · " + fmt(p.qty * m.price) : "无持仓",
      kind: "danger", bold: true, disabled: !p || p.qty <= 0,
      cb: function () {
        var r = e.sellStock(s.id, "all");
        if (r.ok) { self.sound.sell(); self.floats.push({ text: "+" + fmt(r.gain), x: bx + 156, y: 440, life: 1.2, color: COL.gold }); }
        else self.page.toast(r.msg, "bad");
      }
    });
    g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
    g.fillText("每个游戏日（60 秒）按持仓×股价×股息率派发现金，派息日股价微降", bx, 512);
  };

  /* ================= 地产 ================= */

  EmpireGame.prototype._drawProperty = function (g) {
    var e = this.engine, self = this;
    this._panel(g, 16, 122, W - 32, H - 200, "房地产市场（租金计入每秒现金流 · 房价慢波动）");
    var totalRent = 0;
    DATA.PROPERTIES.forEach(function (p) {
      var owned = e.propsOwned[p.id] || 0;
      totalRent += e.mkt.props[p.id].price * p.yield * owned;
    });
    g.fillStyle = COL.gold; g.font = "700 14px " + FONT; g.textAlign = "right";
    g.fillText("当前房租合计 +" + fmt(totalRent) + "/s", W - 32, 148);

    var x = 28, y0 = 160, cardW = (W - 56 - 20) / 2, cardH = 84;
    var done = this._scrollList(g, "propList", x, y0, W - 56, H - 200 - 48, Math.ceil(DATA.PROPERTIES.length / 2) * (cardH + 10));
    DATA.PROPERTIES.forEach(function (p, i) {
      var col = i % 2, row = Math.floor(i / 2);
      var cx = x + col * (cardW + 20), cy = y0 + row * (cardH + 10);
      var m = e.mkt.props[p.id];
      var owned = e.propsOwned[p.id] || 0;
      var ratio = m.price / p.price;
      var afford = e.cash >= m.price;
      g.fillStyle = owned ? COL.goldBg : COL.panel2;
      rr(g, cx, cy, cardW, cardH, 10); g.fill();
      g.strokeStyle = owned ? COL.gold : COL.line; g.lineWidth = 1; g.stroke();
      g.fillStyle = COL.gold; g.font = "700 18px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(p.icon, cx + 14, cy + 22);
      g.fillStyle = COL.text; g.font = "700 15px " + FONT;
      g.fillText(p.name + (owned ? " ×" + owned : ""), cx + 42, cy + 22);
      g.fillStyle = ratio >= 1 ? COL.up : COL.down; g.font = "700 14px " + FONT;
      g.fillText(fmt(m.price), cx + 42, cy + 44);
      g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
      g.fillText((ratio >= 1 ? "↑" : "↓") + ratio.toFixed(2) + "× · 租金 " + fmt(m.price * p.yield) + "/s", cx + 42, cy + 64);
      self.ui.button(g, cx + cardW - 156, cy + 14, 68, 26, {
        label: "买入", kind: afford ? "gold" : "default", size: 13, bold: true, disabled: !afford,
        cb: function () {
          var r = e.buyProperty(p.id);
          if (r.ok) { self.sound.buy(); self.page.toast("🏠 购入 " + p.name, "good"); }
          else self.page.toast(r.msg, "bad");
        }
      });
      self.ui.button(g, cx + cardW - 82, cy + 14, 68, 26, {
        label: "卖出", kind: "danger", size: 13, disabled: !owned,
        cb: function () {
          var r = e.sellProperty(p.id);
          if (r.ok) { self.sound.sell(); self.page.toast("卖出 " + p.name + " +" + fmt(r.gain), "info"); }
        }
      });
      g.fillStyle = COL.faint; g.font = "400 10px " + FONT; g.textAlign = "right";
      g.fillText(p.desc, cx + cardW - 10, cy + 64);
      g.textAlign = "left";
    });
    done();
  };

  /* ================= 古董 ================= */

  EmpireGame.prototype._drawAntique = function (g) {
    var e = this.engine, self = this;
    this._panel(g, 16, 122, W - 32, H - 200, "古董收藏市场（低频大波动 · 限时捡漏与求购）");
    var x = 28, y0 = 160, rowH = 58;
    var done = this._scrollList(g, "antiList", x, y0, W - 56, H - 200 - 48, DATA.ANTIQUES.length * (rowH + 8));
    DATA.ANTIQUES.forEach(function (a, i) {
      var m = e.mkt.antis[a.id];
      var own = e.antisOwned[a.id] || { qty: 0, cost: 0 };
      var ratio = m.price / a.price;
      var y = y0 + i * (rowH + 8);
      var isEvt = e.antiEvent && e.antiEvent.id === a.id && e.antiEvent.until > e.t;
      var price = e.antiPrice(a.id);
      g.fillStyle = isEvt ? (e.antiEvent.type === "bargain" ? "rgba(224,85,69,0.12)" : "rgba(77,200,120,0.12)") : COL.panel2;
      rr(g, x, y, W - 56, rowH, 10); g.fill();
      if (isEvt) { g.strokeStyle = e.antiEvent.type === "bargain" ? COL.up : COL.good; g.lineWidth = 1.5; g.stroke(); }
      g.fillStyle = COL.gold; g.font = "700 20px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
      g.fillText(a.icon, x + 14, y + 28);
      g.fillStyle = COL.text; g.font = "700 15px " + FONT;
      g.fillText(a.name + (own.qty ? " ×" + own.qty : ""), x + 44, y + 18);
      g.fillStyle = COL.faint; g.font = "400 11px " + FONT;
      g.fillText((ratio >= 1 ? "↑" : "↓") + ratio.toFixed(2) + "× · " + a.desc, x + 44, y + 40);
      g.textAlign = "right";
      g.fillStyle = isEvt ? (e.antiEvent.type === "bargain" ? COL.up : COL.good) : COL.text;
      g.font = "700 15px " + FONT;
      g.fillText(fmt(price) + (isEvt ? "（" + Math.ceil(e.antiEvent.until - e.t) + "s）" : ""), x + W - 56 - 240, y + 28);
      g.textAlign = "left";
      self.ui.button(g, x + W - 56 - 230, y + 14, 100, 30, {
        label: "入手", kind: e.cash >= price ? "gold" : "default", size: 13, bold: true, disabled: e.cash < price,
        cb: function () {
          var r = e.buyAntique(a.id);
          if (r.ok) { self.sound.buy(); self.page.toast("🏺 收入 " + a.name, "good"); }
          else self.page.toast(r.msg, "bad");
        }
      });
      self.ui.button(g, x + W - 56 - 122, y + 14, 100, 30, {
        label: "出手", kind: "danger", size: 13, disabled: !own.qty,
        cb: function () {
          var r = e.sellAntique(a.id);
          if (r.ok) { self.sound.sell(); self.page.toast("出手 " + a.name + " +" + fmt(r.gain), "info"); }
        }
      });
    });
    done();
  };

  /* ================= 商店 ================= */

  EmpireGame.prototype._drawShop = function (g) {
    var e = this.engine, self = this;
    var x = 16, y = 122, w = W - 32, h = H - 200;
    var groups = [
      { key: "books", title: "商业典籍（永久全局净利加成，可叠加）", list: DATA.SHOP.books, owned: e.shop.books },
      { key: "luxuries", title: "奢侈品（计入总资产 · 各自带加成）", list: DATA.SHOP.luxuries, owned: e.shop.lux },
      { key: "consumables", title: "消耗品（限时双倍收益）", list: DATA.SHOP.consumables, owned: [] }
    ];
    var contentH = 30;
    groups.forEach(function (grp) { contentH += 34 + grp.list.length * 52 + 16; });
    var done = this._scrollList(g, "shopList", x + 12, y + 8, w - 24, h - 16, contentH);
    var yy = y + 14;
    groups.forEach(function (grp) {
      g.fillStyle = COL.text; g.font = "700 16px " + FONT; g.textAlign = "left"; g.textBaseline = "alphabetic";
      g.fillText(grp.title, x + 14, yy + 18);
      yy += 30;
      grp.list.forEach(function (item) {
        var has = grp.owned.indexOf(item.id) >= 0;
        g.fillStyle = has ? COL.goldBg : "rgba(255,255,255,0.03)";
        rr(g, x + 12, yy, w - 24, 46, 8); g.fill();
        g.fillStyle = has ? COL.gold : COL.text;
        g.font = "700 14px " + FONT; g.textAlign = "left"; g.textBaseline = "middle";
        g.fillText(item.name + (has ? " ✓" : ""), x + 24, yy + 16);
        g.fillStyle = COL.dim; g.font = "400 12px " + FONT;
        g.fillText(item.desc, x + 24, yy + 34);
        if (grp.key === "consumables") {
          var active = false, remain = 0;
          e.shop.buffs.forEach(function (b) { if (b.mult >= item.mult && b.until > e.t) { active = true; remain = Math.max(remain, b.until - e.t); } });
          if (active) {
            g.fillStyle = COL.good; g.font = "600 12px " + FONT; g.textAlign = "right";
            g.fillText("生效中 " + Math.ceil(remain) + "s", x + w - 160, yy + 23);
            g.textAlign = "left";
          }
        }
        if (has) {
          g.fillStyle = COL.gold; g.font = "700 13px " + FONT; g.textAlign = "right";
          g.fillText("已拥有", x + w - 60, yy + 23);
          g.textAlign = "left";
        } else {
          var afford = e.cash >= item.price;
          self.ui.button(g, x + w - 170, yy + 8, 110, 30, {
            label: fmt(item.price), kind: afford ? "gold" : "default", size: 13, bold: true, disabled: !afford,
            cb: function () {
              var r = e.buyShop(grp.key, item.id);
              if (r.ok) { self.sound.buy(); self.page.toast("✨ 购入 " + item.name, "good"); }
              else self.page.toast(r.msg, "bad");
            }
          });
        }
        yy += 52;
      });
      yy += 16;
    });
    done();
  };

  global.EmpireGame = EmpireGame;

})(typeof window !== "undefined" ? window : globalThis);
