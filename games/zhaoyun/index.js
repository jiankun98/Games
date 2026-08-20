/* 赵云与阿斗 —— 引擎核心（纯逻辑，node 可跑） + 浏览器渲染/交互（ZhaoyunGame）
 * 玩法：水墨文字合成塔防（PvE 无尽）。召唤字 → 摆放/合并 → 守护阿斗。
 */
(function (global) {
  "use strict";

  var DATA = global.ZY_DATA;
  if (!DATA) throw new Error("ZY_DATA 未加载：请先引入 data.js");

  /* ==================== 通用工具 ==================== */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function dist(ax, ay, bx, by) { var dx = ax - bx, dy = ay - by; return Math.sqrt(dx * dx + dy * dy); }
  function weightedPick(list, wKey) {
    wKey = wKey || "w";
    var total = 0, i;
    for (i = 0; i < list.length; i++) total += list[i][wKey];
    var r = Math.random() * total;
    for (i = 0; i < list.length; i++) { r -= list[i][wKey]; if (r <= 0) return list[i]; }
    return list[list.length - 1];
  }

  /* ==================== 战场几何（网格制 12×8） ====================
   * 格子分三类：path 道路 / build 布置 / wild 未开发（可开垦扩展）
   */
  var MAP = DATA.MAP;
  var FIELD_W = MAP.fieldW, FIELD_H = MAP.fieldH;
  var CELL = MAP.cell;

  var WAYPOINTS = MAP.path.map(function (p) {
    return { x: p[0] * CELL + CELL / 2, y: p[1] * CELL + CELL / 2 };
  });
  var ADOU = { x: MAP.adou[0] * CELL + CELL / 2, y: MAP.adou[1] * CELL + CELL / 2 };

  var PATH = (function () {
    var segs = [], total = 0;
    for (var i = 1; i < WAYPOINTS.length; i++) {
      var a = WAYPOINTS[i - 1], b = WAYPOINTS[i];
      var len = dist(a.x, a.y, b.x, b.y);
      segs.push({ a: a, b: b, len: len, acc: total });
      total += len;
    }
    return {
      total: total, segs: segs,
      posAt: function (t) {
        t = clamp(t, 0, total - 0.001);
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          if (t <= s.acc + s.len) {
            var k = (t - s.acc) / s.len;
            return { x: s.a.x + (s.b.x - s.a.x) * k, y: s.a.y + (s.b.y - s.a.y) * k, seg: i, k: k };
          }
        }
        var last = segs[segs.length - 1];
        return { x: last.b.x, y: last.b.y, seg: segs.length - 1, k: 1 };
      },
      tNearest: function (px, py) {
        var best = 0, bestD = Infinity;
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
          var k = clamp(((px - s.a.x) * dx + (py - s.a.y) * dy) / (s.len * s.len), 0, 1);
          var qx = s.a.x + dx * k, qy = s.a.y + dy * k;
          var d = dist(px, py, qx, qy);
          if (d < bestD) { bestD = d; best = s.acc + s.len * k; }
        }
        return best;
      }
    };
  })();

  /* 全格网：type path / build / wild */
  var PATH_SET = {};
  MAP.path.forEach(function (p) { PATH_SET[p[0] + "," + p[1]] = true; });
  var BUILD_SET = {};
  MAP.buildInit.forEach(function (p) { BUILD_SET[p[0] + "," + p[1]] = true; });

  /* 碎片字池（按品质加权，共享字合并权重） */
  var CHAR_POOL = (function () {
    var map = {};
    DATA.GENERALS.forEach(function (g) {
      var w = DATA.QUALITY[g.quality].charWeight;
      g.chars.forEach(function (ch) { map[ch] = (map[ch] || 0) + w; });
    });
    return Object.keys(map).map(function (ch) { return { ch: ch, w: map[ch] }; });
  })();

  /* ==================== ZYEngine：纯逻辑核心 ==================== */
  function ZYEngine(opts) {
    opts = opts || {};
    this.onEvent = opts.onEvent || function () {};
    this.rand = opts.rand || Math.random;

    this.phase = "prepare";          // prepare | wave | inter | over
    this.timer = DATA.GAME.prepareTime;
    this.wave = 0;
    this.mantou = DATA.GAME.mantou0;
    this.hearts = DATA.GAME.hearts0;
    this.summonCount = 0;
    this.kills = 0;
    this.elapsed = 0;

    this.cells = [];
    for (var r = 0; r < MAP.rows; r++) {
      for (var c = 0; c < MAP.cols; c++) {
        var key = c + "," + r;
        var type = PATH_SET[key] ? "path" : (BUILD_SET[key] ? "build" : "wild");
        this.cells.push({
          col: c, row: r,
          x: c * CELL + CELL / 2, y: r * CELL + CELL / 2,
          type: type,
          item: null, cd: 0, anim: 0
        });
      }
    }
    this.bench = [];                 // 待命区（kind: troop/char/shovel）
    this.enemies = [];
    this.zones = [];                 // 火海/火墙
    this.effects = [];               // 视觉特效事件（渲染层消费后清空）
    this.floats = [];                // 飘字 {x,y,text,t,color}
    this.passives = {};              // {itemId: 层数}
    this.activeItems = [];           // [itemId, itemId]
    this.teamBuffSpd = { mul: 1, t: 0 };   // 战鼓/刘备
    this.teamBuffAtk = { mul: 1, t: 0 };
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.uid = 1;
    this.pairs = [];                 // 当前可拼合的武将字对（高亮提示）
    this.pendingShots = [];          // 连射延迟队列 {t, cellIdx, targetUid, atk}
  }

  ZYEngine.prototype.emit = function (type, data, payload) { this.onEvent(type, data, payload); };

  /* ---------- 派生数值 ---------- */
  ZYEngine.prototype.summonCost = function () {
    return DATA.SUMMON.cost0 + DATA.SUMMON.costStep * this.summonCount;
  };
  ZYEngine.prototype.passiveLayers = function (id) { return this.passives[id] || 0; };
  ZYEngine.prototype.teamAtkMul = function () {
    return (1 + 0.15 * this.passiveLayers("bingshu")) * this.teamBuffAtk.mul;
  };
  ZYEngine.prototype.teamSpdMul = function () {
    return (1 + 0.15 * this.passiveLayers("gongsu")) * this.teamBuffSpd.mul;
  };
  ZYEngine.prototype.rewardMul = function () {
    return 1 + 0.25 * this.passiveLayers("junliang");
  };
  ZYEngine.prototype.troopAtk = function (cell) {
    var it = cell.item, tr = DATA.TROOPS[it.kind === "general" ? it.troop : it.id];
    var base = tr.atk * (1 + DATA.TROOP_ATK_GROWTH * (it.level - 1));
    if (it.kind === "general") {
      var q = DATA.QUALITY[it.quality];
      base *= q.atkMul * (1 + DATA.TROOP_ATK_GROWTH * (it.level - 1) * 0.3);
      if (it.buffAtkT > 0) base *= 1 + it.buffAtkV;
    }
    return base * this.teamAtkMul();
  };
  ZYEngine.prototype.troopRange = function (cell) {
    var it = cell.item, tr = DATA.TROOPS[it.kind === "general" ? it.troop : it.id];
    var r = tr.range;
    if (it.kind === "general") r *= DATA.QUALITY[it.quality].rangeMul;
    return r;
  };
  ZYEngine.prototype.troopCd = function (cell) {
    var it = cell.item, tr = DATA.TROOPS[it.kind === "general" ? it.troop : it.id];
    var cd = tr.atkCd * Math.pow(DATA.TROOP_CD_GROWTH, it.level - 1);
    if (it.kind === "general") {
      cd /= DATA.QUALITY[it.quality].atkSpeedMul;
      var spd = 1;
      if (it.buffSpdT > 0) spd += it.buffSpdV;
      cd /= spd;
    }
    return cd / this.teamSpdMul();
  };

  /* ---------- 召唤：一次征满 5 个字（无论待命区原有内容，全部重新随机） ---------- */
  ZYEngine.prototype.summon = function () {
    if (this.phase === "over") return false;
    var cost = this.summonCost();
    if (this.mantou < cost) { this.emit("toast", "馒头不足"); return false; }
    this.mantou -= cost;
    this.summonCount++;
    this.bench = [];
    for (var i = 0; i < DATA.SUMMON.benchMax; i++) {
      var pool = DATA.SUMMON.pool.map(function (e) {
        var w = e.w;
        if (e.kind === "char") w *= Math.pow(DATA.SUMMON.recruitBonus, 1 + this.passiveLayers("zhaoxianling") * 0.35);
        return { kind: e.kind, id: e.id, w: w };
      }, this);
      var pick = weightedPick(pool);
      var item;
      if (pick.kind === "troop") {
        item = { kind: "troop", id: pick.id, ch: DATA.TROOPS[pick.id].ch, level: 1 };
      } else if (pick.kind === "char") {
        var cp = weightedPick(CHAR_POOL);
        item = { kind: "char", ch: cp.ch, level: 1 };
      } else {
        item = { kind: "shovel", ch: "铲", level: 1 };
      }
      this.bench.push(item);
    }
    this._scanPairs();
    this.emit("fx", "summon");
    this.emit("state");
    return true;
  };

  /* ---------- 放置 / 合并 / 移动 ----------
   * src: {from:'bench', idx} 或 {from:'cell', idx}
   */
  ZYEngine.prototype.place = function (src, cellIdx) {
    if (this.phase === "over") return false;
    var cell = this.cells[cellIdx];
    if (!cell) return false;
    if (cell.type === "path") { this.emit("toast", "道路上不能布阵"); return false; }
    if (cell.type === "wild") {
      /* 铲子开垦未开发格 */
      var s = this._takeSrc(src);
      if (s && s.kind === "shovel") {
        cell.type = "build";
        this.emit("fx", "unlock");
        this.emit("toast", "开垦了一格兵营地");
        this._scanPairs();
        this.emit("state");
        return true;
      }
      this.emit("toast", "未开发地块（拖铲子开垦）");
      return false;
    }
    var item = this._peekSrc(src);
    if (!item) return false;
    var dst = cell.item;

    if (!dst) { /* 空格：直接放入 */
      if (item.kind === "shovel") { this.emit("toast", "铲子只能开垦荒地或铲除场上的字"); return false; }
      this._takeSrc(src); cell.item = item;
      this.emit("fx", "place");
      this._afterBoardChange(cellIdx);
      return true;
    }
    /* 目标有字 */
    if (item.kind === "shovel") {
      /* 铲除场上字 */
      this._takeSrc(src);
      var back = this._sellValue(dst);
      this.mantou += Math.min(back, 10);   // 铲除少量返还
      cell.item = null;
      this.emit("fx", "shovel");
      this.emit("toast", "铲除并返还 " + Math.min(back, 10) + " 馒头");
      this._afterBoardChange(cellIdx);
      return true;
    }
    /* 同类同级 → 合并升级（优先于武将激活：张+张 合并、张+飞 激活） */
    if (this._mergeable(item, dst)) {
      if (dst.level >= DATA.LEVEL_MAX) { this.emit("toast", "已是满级"); return false; }
      this._takeSrc(src);
      dst.level++;
      this.emit("fx", "merge", { x: cell.x, y: cell.y });
      this._afterBoardChange(cellIdx);
      return true;
    }
    /* 同武将两块碎片（不同字）→ 激活 */
    var g = this._pairGeneral(item, dst);
    if (g) {
      this._takeSrc(src);
      var lv = Math.max(item.level, dst.level);
      cell.item = this._makeGeneral(g, lv);
      this.emit("fx", "general", { x: cell.x, y: cell.y, faction: g.faction, gid: g.id });
      this.emit("banner", { text: g.name + " · " + g.skill.name, color: DATA.FACTION[g.faction].color });
      this._afterBoardChange(cellIdx);
      return true;
    }
    /* 不同字：交换位置（cell→cell 时） */
    if (src.from === "cell") {
      var fromCell = this.cells[src.idx];
      fromCell.item = dst; cell.item = item;
      this._afterBoardChange(cellIdx);
      return true;
    }
    /* bench → 被占格：与待命区交换 */
    this.bench[src.idx] = dst; cell.item = item;
    this._afterBoardChange(cellIdx);
    return true;
  };

  ZYEngine.prototype._makeGeneral = function (g, level) {
    return {
      kind: "general", gid: g.id, ch: g.name, level: level, exp: 0,
      troop: g.troop, quality: g.quality,
      skillT: 3, skillCd: g.skill.cd,       // 开场 3 秒充能起步
      buffSpdT: 0, buffSpdV: 0, buffAtkT: 0, buffAtkV: 0,
      rapidT: 0, tiredT: 0
    };
  };
  ZYEngine.prototype._peekSrc = function (src) {
    return src.from === "bench" ? this.bench[src.idx] : (this.cells[src.idx] && this.cells[src.idx].item);
  };
  ZYEngine.prototype._takeSrc = function (src) {
    if (src.from === "bench") return this.bench.splice(src.idx, 1)[0];
    var c = this.cells[src.idx];
    var it = c.item; c.item = null; return it;
  };
  ZYEngine.prototype._mergeable = function (a, b) {
    if (a.kind !== b.kind) return false;
    if (a.kind === "troop") return a.id === b.id && a.level === b.level;
    if (a.kind === "char") return a.ch === b.ch && a.level === b.level;
    return false;
  };
  /* 两件物品是否为同一武将的两块碎片（必须为不同字，如 赵+云；张+张 走合并） */
  ZYEngine.prototype._pairGeneral = function (a, b) {
    if (a.kind !== "char" || b.kind !== "char") return null;
    if (a.ch === b.ch) return null;
    var idsA = DATA.CHAR_MAP[a.ch] || [], idsB = DATA.CHAR_MAP[b.ch] || [];
    for (var i = 0; i < idsA.length; i++)
      for (var j = 0; j < idsB.length; j++)
        if (idsA[i] === idsB[j]) return this._generalById(idsA[i]);
    return null;
  };
  ZYEngine.prototype._generalById = function (gid) {
    for (var i = 0; i < DATA.GENERALS.length; i++) if (DATA.GENERALS[i].id === gid) return DATA.GENERALS[i];
    return null;
  };
  ZYEngine.prototype._afterBoardChange = function (cellIdx) {
    this.cells.forEach(function (c) { c.anim = Math.max(c.anim, 0); });
    this._scanPairs();
    this.emit("state");
  };
  /* 扫描场上可拼合的武将字对（高亮提示） */
  ZYEngine.prototype._scanPairs = function () {
    var chars = [];
    this.cells.forEach(function (c, i) {
      if (c.type !== "path" && c.item && c.item.kind === "char") chars.push({ ch: c.item.ch, srcId: "c" + i, idx: i });
    });
    this.bench.forEach(function (it, i) {
      if (it.kind === "char") chars.push({ ch: it.ch, srcId: "b" + i, benchIdx: i });
    });
    var pairs = [], used = {};
    for (var i = 0; i < chars.length; i++)
      for (var j = i + 1; j < chars.length; j++) {
        if (chars[i].srcId === chars[j].srcId) continue;
        var g = this._pairGeneral({ kind: "char", ch: chars[i].ch }, { kind: "char", ch: chars[j].ch });
        if (g) {
          var key = [chars[i].ch, chars[j].ch].sort().join("") + ":" + g.id;
          if (!used[key]) { used[key] = true; pairs.push({ g: g, a: chars[i], b: chars[j] }); }
        }
      }
    this.pairs = pairs;
  };

  /* 待命区槽位落点：待命区↔待命区、场上↔待命区（合并 / 交换排序 / 移入空槽） */
  ZYEngine.prototype.placeBench = function (src, dstIdx) {
    if (this.phase === "over") return false;
    if (src.from === "bench" && src.idx === dstIdx) return false;
    var item = this._peekSrc(src);
    if (!item) return false;
    var dst = this.bench[dstIdx];
    if (!dst) {
      /* 空槽：移入 */
      this._takeSrc(src);
      this.bench[dstIdx] = item;
      this.emit("fx", "place");
      this._scanPairs();
      this.emit("state");
      return true;
    }
    /* 同类同级：合并升级 */
    if (this._mergeable(item, dst) && dst.level < DATA.LEVEL_MAX) {
      this._takeSrc(src);
      dst.level++;
      this.emit("fx", "merge");
      this._scanPairs();
      this.emit("state");
      return true;
    }
    /* 不同字：交换位置（排序）；铲子不能落上战场 */
    if (src.from === "cell" && dst.kind === "shovel") {
      this.emit("toast", "铲子不能放在战场上");
      return false;
    }
    this.bench[dstIdx] = item;
    if (src.from === "bench") {
      this.bench[src.idx] = dst;
    } else {
      this._takeSrc(src);
      this.cells[src.idx].item = dst;
    }
    this.emit("fx", "place");
    this._scanPairs();
    this.emit("state");
    return true;
  };

  /* ---------- 出售 ---------- */
  ZYEngine.prototype._sellValue = function (it) {
    if (it.kind === "troop") return DATA.SELL.troop(it.level);
    if (it.kind === "char") return DATA.SELL.char;
    if (it.kind === "shovel") return DATA.SELL.shovel;
    if (it.kind === "general") return DATA.SELL.general(it.level);
    return 0;
  };
  ZYEngine.prototype.sell = function (src) {
    if (this.phase === "over") return false;
    var it = this._peekSrc(src);
    if (!it) return false;
    var v = this._sellValue(it);
    this._takeSrc(src);
    this.mantou += v;
    this.emit("fx", "sell");
    this.emit("toast", "出售 +" + v + " 馒头");
    this._afterBoardChange();
    return true;
  };

  /* ---------- 道具 ---------- */
  ZYEngine.prototype.gainRandomItem = function () {
    var pool = [];
    DATA.ITEMS.forEach(function (it) {
      var w = it.type === "passive" ? 1.5 : 1;
      pool.push({ id: it.id, w: w });
    });
    var pick = weightedPick(pool);
    var item = null;
    for (var i = 0; i < DATA.ITEMS.length; i++) if (DATA.ITEMS[i].id === pick.id) item = DATA.ITEMS[i];
    if (item.type === "passive") {
      this.passives[item.id] = (this.passives[item.id] || 0) + 1;
    } else {
      if (this.activeItems.length >= DATA.ACTIVE_SLOTS) {
        this.mantou += DATA.ITEM_TO_MANTOU;
        this.emit("toast", "主动道具已满，" + item.name + " 折算 +" + DATA.ITEM_TO_MANTOU + " 馒头");
      } else {
        this.activeItems.push(item.id);
      }
    }
    this.emit("item", item);
    this.emit("state");
    return item;
  };
  /* 使用主动道具。maobi 需要 target: {from:'cell'|'bench', idx} */
  ZYEngine.prototype.useActive = function (slotIdx, target) {
    if (this.phase === "over") return false;
    var itemId = this.activeItems[slotIdx];
    if (!itemId) return false;
    var item = null;
    DATA.ITEMS.forEach(function (it) { if (it.id === itemId) item = it; });
    if (item.id === "maobi") {
      if (!target) return "targeting";
      var it = this._peekSrc(target);
      if (!it || (it.kind !== "troop" && it.kind !== "char")) { this.emit("toast", "请选择一个字"); return false; }
      /* 随机改写：troop → 其他兵种；char → 其他碎片字（保持等级） */
      if (it.kind === "troop") {
        var ids = Object.keys(DATA.TROOPS).filter(function (k) { return k !== it.id; });
        var nid = ids[Math.floor(this.rand() * ids.length)];
        it.id = nid; it.ch = DATA.TROOPS[nid].ch;
      } else {
        var chs = CHAR_POOL.filter(function (c) { return c.ch !== it.ch; });
        it.ch = weightedPick(chs).ch;
      }
      this.activeItems.splice(slotIdx, 1);
      this.emit("fx", "rewrite");
      this.emit("toast", "毛笔改写为「" + it.ch + "」");
      this._afterBoardChange();
      return true;
    }
    if (item.id === "zhangu") {
      this.teamBuffSpd = { mul: 2, t: item.value };
    } else if (item.id === "renxin") {
      this.hearts = Math.min(DATA.GAME.hearts0, this.hearts + item.value);
      this.emit("fx", "heal");
    } else if (item.id === "huoji") {
      var dmg = 30 + this.wave * 14;
      this.enemies.forEach(function (e) {
        this._damage(e, dmg, null, { silent: true });
        e.dots.push({ dps: dmg * 0.06, t: item.value });
      }, this);
      this.effects.push({ type: "fireAll", t: 0 });
    }
    this.activeItems.splice(slotIdx, 1);
    this.emit("fx", "itemUse");
    this.emit("state");
    return true;
  };

  /* ---------- 波次 ---------- */
  ZYEngine.prototype._waveHp = function (w) {
    return DATA.WAVES.hpBase * (1 + DATA.WAVES.hpLinear * (w - 1)) *
      Math.pow(DATA.WAVES.expGrowth, Math.max(0, w - DATA.WAVES.expFrom));
  };
  ZYEngine.prototype._beginWave = function () {
    this.wave++;
    this.phase = "wave";
    var w = this.wave;
    var count = DATA.WAVES.count(w);
    var mix = DATA.WAVES.mix(w);
    var mixList = Object.keys(mix).map(function (k) { return { id: k, w: mix[k] }; });
    this.spawnQueue = [];
    for (var i = 0; i < count; i++) this.spawnQueue.push({ type: weightedPick(mixList).id, boss: false });
    if (w % 5 === 0) {
      var bossIdx = Math.floor(w / 5) - 1;
      var cycle = Math.floor(bossIdx / DATA.BOSSES.length);
      var def = DATA.BOSSES[bossIdx % DATA.BOSSES.length];
      this.spawnQueue.push({ type: def.id, boss: true, cycle: cycle, def: def });
    }
    this.spawnTimer = 0.5;
    this.emit("wave", w);
    if (w % 5 === 0) this.emit("bossWave", this.spawnQueue[this.spawnQueue.length - 1].def);
    this.emit("state");
  };
  ZYEngine.prototype.startEarly = function () {
    if (this.phase === "inter" || this.phase === "prepare") this._beginWave();
  };

  ZYEngine.prototype._spawnEnemy = function (spec) {
    var w = this.wave, hp, e;
    if (spec.boss) {
      var bossNo = Math.floor(w / 5);
      hp = this._waveHp(w) * (DATA.BOSS_HP_BASE + DATA.BOSS_HP_STEP * bossNo) * Math.pow(DATA.BOSS_CYCLE_MUL, spec.cycle);
      e = {
        uid: this.uid++, boss: true, type: spec.def.id, ch: spec.def.ch,
        hp: hp, maxHp: hp,
        speed: DATA.WAVES.baseSpeed * 0.55,
        pathT: 0, x: WAYPOINTS[0].x, y: WAYPOINTS[0].y,
        slowT: 0, slowMul: 1, stunT: 0, invulT: 0, vulnT: 0,
        shield: 0, skillCd: 4, rage: false, dots: [], size: 34
      };
      this.emit("fx", "bossSpawn");
    } else {
      var def = DATA.ENEMIES[spec.type];
      hp = this._waveHp(w) * def.hpMul;
      e = {
        uid: this.uid++, boss: false, type: spec.type, ch: def.ch,
        hp: hp, maxHp: hp,
        speed: DATA.WAVES.baseSpeed * def.spMul * DATA.WAVES.speedMul(w),
        pathT: 0, x: WAYPOINTS[0].x, y: WAYPOINTS[0].y,
        slowT: 0, slowMul: 1, stunT: 0, invulT: 0, vulnT: 0,
        shield: 0, dots: [], size: 20
      };
    }
    this.enemies.push(e);
  };

  /* ---------- 主循环 ---------- */
  ZYEngine.prototype.update = function (dt) {
    if (this.phase === "over") return;
    this.elapsed += dt;

    /* 波次计时 */
    if (this.phase === "prepare" || this.phase === "inter") {
      this.timer -= dt;
      if (this.timer <= 0) this._beginWave();
    }

    /* 出怪 */
    if (this.phase === "wave" && this.spawnQueue.length) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this._spawnEnemy(this.spawnQueue.shift());
        this.spawnTimer = DATA.WAVES.spawnGap(this.wave);
      }
    }

    this._updateEnemies(dt);
    this._updateZones(dt);
    this._updateTowers(dt);
    this._updatePendingShots(dt);
    this._updateFloats(dt);

    /* 全队 buff 计时 */
    if (this.teamBuffSpd.t > 0) { this.teamBuffSpd.t -= dt; if (this.teamBuffSpd.t <= 0) this.teamBuffSpd = { mul: 1, t: 0 }; }
    if (this.teamBuffAtk.t > 0) { this.teamBuffAtk.t -= dt; if (this.teamBuffAtk.t <= 0) this.teamBuffAtk = { mul: 1, t: 0 }; }

    /* 波次结束 */
    if (this.phase === "wave" && !this.spawnQueue.length && !this.enemies.length) {
      var bonus = Math.round(DATA.WAVES.waveBonus(this.wave) * this.rewardMul());
      this.mantou += bonus;
      this.emit("toast", "第 " + this.wave + " 波告捷，犒赏 +" + bonus + " 馒头");
      if (this.wave % 5 === 0) this.gainRandomItem();       // Boss 波通关 → 抽道具
      this.phase = "inter";
      this.timer = DATA.GAME.intermissionTime;
      this.emit("state");
    }
  };

  ZYEngine.prototype._updateEnemies = function (dt) {
    var dead = [];
    for (var i = this.enemies.length - 1; i >= 0; i--) {
      var e = this.enemies[i];
      /* DoT */
      for (var d = e.dots.length - 1; d >= 0; d--) {
        e.dots[d].t -= dt;
        this._damage(e, e.dots[d].dps * dt, null, { silent: true });
        if (e.dots[d].t <= 0) e.dots.splice(d, 1);
      }
      if (e.hp <= 0) { dead.push(e); this.enemies.splice(i, 1); continue; }

      if (e.stunT > 0) { e.stunT -= dt; continue; }
      var spd = e.speed;
      if (e.slowT > 0) { e.slowT -= dt; spd *= 1 - e.slowMul; }

      /* Boss 技能 */
      if (e.boss) this._bossSkill(e, dt);

      e.pathT += spd * dt;
      var p = PATH.posAt(e.pathT);
      e.x = p.x; e.y = p.y;
      if (e.pathT >= PATH.total) {
        /* 抵达阿斗 */
        this.enemies.splice(i, 1);
        this.hearts--;
        this.emit("fx", "heartLost");
        this.emit("state");
        if (this.hearts <= 0) { this._gameOver(); return; }
      }
    }
    /* 阵亡结算（分裂/奖励） */
    dead.forEach(function (e) { this._onEnemyDeath(e); }, this);
  };

  ZYEngine.prototype._bossSkill = function (e, dt) {
    var def = null;
    DATA.BOSSES.forEach(function (b) { if (b.id === e.type) def = b; });
    if (!def) return;
    e.skillCd -= dt;
    switch (def.skill) {
      case "dash":
        if (e.skillCd <= 0) { e.dashT = 1.0; e.skillCd = 6; }
        if (e.dashT > 0) { e.dashT -= dt; }
        break;
      case "rage":
        if (!e.rage && e.hp < e.maxHp * 0.3) { e.rage = true; this.emit("banner", { text: "吕布 · 无双狂暴", color: "#9e3b2e" }); }
        break;
      case "dodge":
        if (e.skillCd <= 0) { e.invulT = 1.0; e.skillCd = 5; }
        break;
      case "guard":
        if (e.skillCd <= 0) { e.shield = e.maxHp * 0.15; e.skillCd = 7; }
        break;
      /* split 在死亡时处理 */
    }
  };
  ZYEngine.prototype._enemySpeedNow = function (e) {
    var spd = e.speed;
    if (e.slowT > 0) spd *= 1 - e.slowMul;
    if (e.boss) {
      var def = null;
      DATA.BOSSES.forEach(function (b) { if (b.id === e.type) def = b; });
      if (def && def.skill === "dash" && e.dashT > 0) spd *= 3;
      if (def && def.skill === "rage" && e.rage) spd *= 1.6;
    }
    return spd;
  };

  ZYEngine.prototype._onEnemyDeath = function (e) {
    this.kills++;
    var def = e.boss ? null : DATA.ENEMIES[e.type];
    var mul = e.boss ? DATA.BOSS_REWARD_MUL : def.rewardMul;
    var reward = Math.round(DATA.WAVES.killReward(this.wave) * mul * this.rewardMul());
    this.mantou += reward;
    this.floats.push({ x: e.x, y: e.y - 18, text: "+" + reward, t: 0.9, color: "#8a6d3b" });
    this.emit("fx", "enemyDie", e);

    /* Boss 分裂 */
    if (e.boss) {
      var bdef = null;
      DATA.BOSSES.forEach(function (b) { if (b.id === e.type) bdef = b; });
      if (bdef && bdef.skill === "split") {
        for (var k = 0; k < 3; k++) {
          this._spawnEnemy({ type: "zu", boss: false });
          var ne = this.enemies[this.enemies.length - 1];
          ne.pathT = Math.max(0, e.pathT - 20 - k * 24);
          ne.hp = ne.maxHp = this._waveHp(this.wave) * 0.5;
        }
        this.emit("toast", "双生！分裂出乱卒");
      }
      this.emit("banner", { text: e.ch + " 授首！", color: "#2f8f5b" });
    }
    this.emit("state");
  };

  ZYEngine.prototype._updateZones = function (dt) {
    for (var i = this.zones.length - 1; i >= 0; i--) {
      var z = this.zones[i];
      z.t -= dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.4;
        this.enemies.forEach(function (e) {
          if (dist(e.x, e.y, z.x, z.y) < z.r) this._damage(e, z.dps * 0.4, null, { silent: true });
        }, this);
      }
      if (z.t <= 0) this.zones.splice(i, 1);
    }
  };

  ZYEngine.prototype._updateTowers = function (dt) {
    var self = this;
    this.cells.forEach(function (cell, idx) {
      if (cell.anim > 0) cell.anim -= dt;
      var it = cell.item;
      if (!it || it.kind === "char" || it.kind === "shovel") return;   // 碎片字/铲子不攻击
      if (it.kind === "general") {
        if (it.buffSpdT > 0) it.buffSpdT -= dt;
        if (it.buffAtkT > 0) it.buffAtkT -= dt;
        if (it.rapidT > 0) it.rapidT -= dt;
        if (it.tiredT > 0) { it.tiredT -= dt; return; }
        /* 技能充能 */
        it.skillT -= dt;
        if (it.skillT <= 0 && self.enemies.length) {
          it.skillT = it.skillCd;
          self._executeSkill(cell);
          return;
        }
      }
      cell.cd -= dt;
      if (cell.cd > 0) return;
      var target = self._acquireTarget(cell);
      if (!target) return;
      cell.cd = self.troopCd(cell);
      cell.anim = 0.28;
      var shots = (it.rapidT > 0) ? 3 : 1;
      for (var s = 0; s < shots; s++) {
        self._fire(cell, target, s * 0.09);
      }
    });
  };

  ZYEngine.prototype._updatePendingShots = function (dt) {
    for (var i = this.pendingShots.length - 1; i >= 0; i--) {
      var s = this.pendingShots[i];
      s.t -= dt;
      if (s.t > 0) continue;
      this.pendingShots.splice(i, 1);
      var cell = this.cells[s.cellIdx];
      var target = null;
      this.enemies.forEach(function (e) { if (e.uid === s.targetUid) target = e; });
      if (!cell || !cell.item || !target || target.hp <= 0) continue;
      this._fireNow(cell, target, DATA.TROOPS[s.troop], s.atk);
    }
  };

  ZYEngine.prototype._acquireTarget = function (cell) {
    /* 射程内 pathT 最大（最靠近阿斗）者 */
    var range = this.troopRange(cell);
    var best = null;
    this.enemies.forEach(function (e) {
      if (e.hp <= 0 || e.invulT > 0) return;
      if (dist(cell.x, cell.y, e.x, e.y) > range) return;
      if (!best || e.pathT > best.pathT) best = e;
    });
    return best;
  };

  ZYEngine.prototype._fire = function (cell, target, delay) {
    var it = cell.item, tr = DATA.TROOPS[it.kind === "general" ? it.troop : it.id];
    var atk = this.troopAtk(cell);
    if (delay > 0) {
      /* 连射：入延迟队列，update 中结算（保持引擎可同步模拟） */
      this.pendingShots.push({ t: delay, cellIdx: this.cells.indexOf(cell), targetUid: target.uid, atk: atk, troop: it.kind === "general" ? it.troop : it.id });
    } else {
      this._fireNow(cell, target, tr, atk);
    }
  };
  ZYEngine.prototype._fireNow = function (cell, target, tr, atk) {
    var self = this, it = cell.item;
    if (tr.type === "melee") {
      this._damage(target, atk, cell);
      this.effects.push({ type: "slash", x: target.x, y: target.y, t: 0, dir: Math.random() * Math.PI });
    } else if (tr.type === "pierce") {
      /* 直线穿透：塔→目标射线上的所有敌人 */
      var dx = target.x - cell.x, dy = target.y - cell.y;
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      var ux = dx / len, uy = dy / len;
      var range = this.troopRange(cell);
      var hitAny = false;
      this.enemies.forEach(function (e) {
        var px = e.x - cell.x, py = e.y - cell.y;
        var proj = px * ux + py * uy;
        if (proj < 0 || proj > range + 30) return;
        var perp = Math.abs(px * uy - py * ux);
        if (perp <= 30) { self._damage(e, atk * 0.8, cell); hitAny = true; }
      });
      if (!hitAny) this._damage(target, atk * 0.8, cell);
      this.effects.push({ type: "thrust", x1: cell.x, y1: cell.y, x2: cell.x + ux * range, y2: cell.y + uy * range, t: 0 });
    } else if (tr.type === "splash") {
      var r = tr.splash;
      this.enemies.forEach(function (e) {
        if (dist(e.x, e.y, target.x, target.y) <= r) self._damage(e, atk, cell, e === target ? {} : { factor: 0.6 });
      });
      this.effects.push({ type: "arc", x: target.x, y: target.y, r: r, t: 0 });
    } else { /* snipe */
      this._damage(target, atk, cell);
      this.effects.push({ type: "arrow", x1: cell.x, y1: cell.y, x2: target.x, y2: target.y, t: 0 });
    }
  };

  ZYEngine.prototype._damage = function (e, amount, srcCell, opts) {
    if (e.hp <= 0 || e.invulT > 0) return;
    opts = opts || {};
    if (opts.factor) amount *= opts.factor;
    if (e.vulnT > 0) amount *= 1.25;                   // 曹操减益
    if (e.boss && e.rage) amount *= 0.7;               // 吕布狂暴减伤
    if (e.shield > 0) {
      var absorbed = Math.min(e.shield, amount);
      e.shield -= absorbed; amount -= absorbed;
      if (amount <= 0) { this.floats.push({ x: e.x, y: e.y - 24, text: "盾", t: 0.6, color: "#3d6aa8" }); return; }
    }
    e.hp -= amount;
    if (!opts.silent) {
      this.floats.push({ x: e.x + (Math.random() - 0.5) * 14, y: e.y - 16, text: String(Math.round(amount)), t: 0.55, color: "#5a4a3a" });
      this.effects.push({ type: "ink", x: e.x, y: e.y, t: 0 });
    }
    if (e.hp <= 0) {
      /* 击杀归属：武将积累经验 */
      if (srcCell && srcCell.item && srcCell.item.kind === "general") {
        var g = srcCell.item;
        g.exp++;
        if (g.exp >= DATA.GENERAL_EXP_KILLS * g.level && g.level < DATA.LEVEL_MAX) {
          g.exp = 0; g.level++;
          this.emit("toast", g.ch + " 升至 " + g.level + " 级");
        }
      }
    }
  };

  /* ---------- 武将技能 ---------- */
  ZYEngine.prototype._executeSkill = function (cell) {
    var g = this._generalById(cell.item.gid);
    var s = g.skill, atk = this.troopAtk(cell);
    var self = this;
    this.emit("fx", "skill", g);
    this.emit("banner", { text: g.name + " · " + s.name, color: DATA.FACTION[g.faction].color });

    var forEachEnemy = function (fn) { self.enemies.forEach(fn); };

    switch (s.type) {
      case "stun":    /* 张飞：全屏眩晕 */
        forEachEnemy(function (e) { self._damage(e, atk * s.dmg, cell); e.stunT = Math.max(e.stunT, s.value); });
        this.effects.push({ type: "roar", t: 0 });
        break;
      case "arrowRain":  /* 黄忠：全屏箭雨 */
        for (var i = 0; i < s.count; i++) {
          var e = this.enemies[Math.floor(this.rand() * this.enemies.length)];
          var px = e ? e.x : 100 + this.rand() * 760, py = e ? e.y : 60 + this.rand() * 480;
          var hitR = 55;
          forEachEnemy(function (e2) { if (dist(e2.x, e2.y, px, py) <= hitR) self._damage(e2, atk * 0.6, cell); });
          this.effects.push({ type: "arrowRain", x: px, y: py, t: -i * 0.06 });
        }
        break;
      case "dashPath":   /* 赵云：全路径突进 */
        forEachEnemy(function (e) { self._damage(e, atk * s.value, cell); });
        this.effects.push({ type: "dash", t: 0 });
        break;
      case "leapSmash": { /* 关羽：跳劈最前敌 */
        var front = null;
        forEachEnemy(function (e) { if (!front || e.pathT > front.pathT) front = e; });
        if (front) {
          this._damage(front, atk * s.value, cell);
          front.pathT = Math.max(0, front.pathT - s.knock);
          forEachEnemy(function (e) { if (e !== front && dist(e.x, e.y, front.x, front.y) <= s.splash) self._damage(e, atk * 2, cell); });
          this.effects.push({ type: "smash", x: front.x, y: front.y, r: s.splash, t: 0 });
        }
        break;
      }
      case "holyBlade": {  /* 刘备：范围击倒 + 全队攻速 */
        var c = this._enemyCentroid();
        if (c) {
          forEachEnemy(function (e) { if (dist(e.x, e.y, c.x, c.y) <= 170) { self._damage(e, atk * s.value, cell); e.stunT = Math.max(e.stunT, 1); } });
          this.effects.push({ type: "holy", x: c.x, y: c.y, r: 170, t: 0 });
        }
        this.teamBuffSpd = { mul: 1 + s.buff, t: s.dur };
        break;
      }
      case "sprint": {  /* 马超：中程突袭 */
        var range2 = this.troopRange(cell) * 2.2;
        var targets = this.enemies.filter(function (e) { return dist(cell.x, cell.y, e.x, e.y) <= range2; }).slice(0, 3);
        targets.forEach(function (e) { self._damage(e, atk * 1.4, cell); });
        if (targets.length) this.effects.push({ type: "smash", x: targets[0].x, y: targets[0].y, r: 70, t: 0 });
        break;
      }
      case "tyrant":   /* 曹操：全屏伤害 + 脆弱 */
        forEachEnemy(function (e) { self._damage(e, atk * s.value, cell); e.vulnT = s.dur; });
        this.effects.push({ type: "roar", t: 0 });
        break;
      case "assault": {  /* 张辽：直线突袭 + 恐惧减速 */
        var front2 = null;
        forEachEnemy(function (e) { if (!front2 || e.pathT > front2.pathT) front2 = e; });
        if (front2) {
          var dx = front2.x - cell.x, dy = front2.y - cell.y, L = Math.sqrt(dx * dx + dy * dy) || 1;
          var ux = dx / L, uy = dy / L;
          this.enemies.forEach(function (e) {
            var px = e.x - cell.x, py = e.y - cell.y;
            var proj = px * ux + py * uy;
            if (proj > 0 && proj < 420 && Math.abs(px * uy - py * ux) < 34) self._damage(e, atk * s.value, cell);
          });
          this.effects.push({ type: "thrust", x1: cell.x, y1: cell.y, x2: cell.x + ux * 420, y2: cell.y + uy * 420, t: 0, gold: true });
        }
        forEachEnemy(function (e) { e.slowT = s.dur; e.slowMul = s.slow; });
        break;
      }
      case "berserk":  /* 许褚：自身狂暴 */
        cell.item.buffSpdT = s.dur; cell.item.buffSpdV = s.value;
        cell.item.buffAtkT = s.dur; cell.item.buffAtkV = s.atk;
        this.effects.push({ type: "aura", cell: cell, t: 0 });
        break;
      case "slam":     /* 典韦：范围猛击 */
        forEachEnemy(function (e) { if (dist(e.x, e.y, cell.x, cell.y) <= s.radius) { self._damage(e, atk * s.value, cell); e.stunT = Math.max(e.stunT, s.stun); } });
        this.effects.push({ type: "smash", x: cell.x, y: cell.y, r: s.radius, t: 0 });
        break;
      case "breakthrough": {  /* 徐晃：长直线贯穿 */
        var f3 = null;
        forEachEnemy(function (e) { if (!f3 || e.pathT > f3.pathT) f3 = e; });
        if (f3) {
          var dx3 = f3.x - cell.x, dy3 = f3.y - cell.y, L3 = Math.sqrt(dx3 * dx3 + dy3 * dy3) || 1;
          var ux3 = dx3 / L3, uy3 = dy3 / L3;
          this.enemies.forEach(function (e) {
            var px = e.x - cell.x, py = e.y - cell.y;
            var proj = px * ux3 + py * uy3;
            if (proj > 0 && proj < 460 && Math.abs(px * uy3 - py * ux3) < 30) self._damage(e, atk * s.value, cell);
          });
          this.effects.push({ type: "thrust", x1: cell.x, y1: cell.y, x2: cell.x + ux3 * 460, y2: cell.y + uy3 * 460, t: 0, gold: true });
        }
        break;
      }
      case "fireSea": {  /* 周瑜：火海 */
        var c4 = this._enemyCentroid();
        if (c4) this.zones.push({ x: c4.x, y: c4.y, r: s.radius, dps: atk * 0.45, t: s.dur, tick: 0, kind: "fire" });
        break;
      }
      case "rapidShot":  /* 太史慈：连射 */
        cell.item.rapidT = s.dur;
        this.effects.push({ type: "aura", cell: cell, t: 0 });
        break;
      case "walling": {  /* 陆逊：路径火墙 */
        var mid = PATH.total * 0.55;
        for (var k = 0; k < 3; k++) {
          var p = PATH.posAt(mid + k * s.seg);
          this.zones.push({ x: p.x, y: p.y, r: 62, dps: atk * 0.4, t: s.dur, tick: 0, kind: "fire" });
        }
        break;
      }
      case "raidDash": {  /* 甘宁：多段连斩 */
        var targets5 = this.enemies.slice().sort(function () { return self.rand() - 0.5; }).slice(0, s.count);
        targets5.forEach(function (e) {
          self._damage(e, atk * s.value, cell);
          self.effects.push({ type: "slash", x: e.x, y: e.y, t: 0, dir: Math.random() * Math.PI, gold: true });
        });
        break;
      }
      case "sacrifice":  /* 黄盖：苦肉计 */
        forEachEnemy(function (e) { if (dist(e.x, e.y, cell.x, cell.y) <= 240) self._damage(e, atk * s.value, cell); });
        cell.item.tiredT = s.tired;
        this.effects.push({ type: "smash", x: cell.x, y: cell.y, r: 240, t: 0 });
        break;
    }
    this.emit("state");
  };

  ZYEngine.prototype._enemyCentroid = function () {
    if (!this.enemies.length) return null;
    var x = 0, y = 0, n = 0;
    /* 取 pathT 最大（最前）三敌的均值作为技能中心 */
    var front = this.enemies.slice().sort(function (a, b) { return b.pathT - a.pathT; }).slice(0, 3);
    front.forEach(function (e) { x += e.x; y += e.y; n++; });
    return { x: x / n, y: y / n };
  };

  ZYEngine.prototype._updateFloats = function (dt) {
    for (var i = this.floats.length - 1; i >= 0; i--) {
      this.floats[i].t -= dt;
      if (this.floats[i].t <= 0) this.floats.splice(i, 1);
    }
  };

  ZYEngine.prototype._gameOver = function () {
    this.phase = "over";
    var generals = [];
    this.cells.forEach(function (c) {
      if (c.item && c.item.kind === "general") generals.push(c.item.ch + " Lv." + c.item.level);
    });
    this.emit("gameover", {
      wave: this.wave, kills: this.kills, generals: generals,
      time: Math.round(this.elapsed), best: false
    });
  };

  /* 暴露几何给渲染层 */
  ZYEngine.PATH = PATH;
  ZYEngine.WAYPOINTS = WAYPOINTS;
  ZYEngine.ADOU = ADOU;
  ZYEngine.FIELD_W = FIELD_W;
  ZYEngine.FIELD_H = FIELD_H;
  ZYEngine.CHAR_POOL = CHAR_POOL;

  global.ZYEngine = ZYEngine;

  /* ==================== 以下为浏览器渲染与交互（node 环境不加载） ==================== */
  if (typeof document === "undefined") return;

  /* ---------- WebAudio 程序化音效 ---------- */
  function Sfx() { this.ctx = null; this.enabled = true; }
  Sfx.prototype.init = function () {
    if (this.ctx || !this.enabled) return;
    try { this.ctx = new (global.AudioContext || global.webkitAudioContext)(); } catch (e) { this.enabled = false; }
  };
  Sfx.prototype.tone = function (freq, dur, type, vol, slide) {
    if (!this.ctx || !this.enabled) return;
    var t = this.ctx.currentTime;
    var o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || "sine"; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
    g.gain.setValueAtTime(vol || 0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t); o.stop(t + dur);
  };
  Sfx.prototype.play = function (name) {
    if (!this.ctx || !this.enabled) return;
    switch (name) {
      case "summon": this.tone(520, 0.1, "triangle", 0.06, 160); break;
      case "place": this.tone(300, 0.08, "sine", 0.07, 60); break;
      case "merge": this.tone(440, 0.12, "triangle", 0.08, 220); this.tone(660, 0.16, "sine", 0.05, 160); break;
      case "hit": this.tone(180, 0.05, "square", 0.025, -60); break;
      case "enemyDie": this.tone(140, 0.14, "sawtooth", 0.04, -80); break;
      case "skill": this.tone(220, 0.35, "sawtooth", 0.06, 400); this.tone(440, 0.3, "triangle", 0.05, 200); break;
      case "boss": this.tone(90, 0.5, "sawtooth", 0.1, -30); this.tone(120, 0.6, "square", 0.05, -40); break;
      case "heartLost": this.tone(200, 0.3, "square", 0.09, -150); break;
      case "general": this.tone(392, 0.2, "triangle", 0.09); setTimeout(function () {}, 0); this.tone(523, 0.3, "triangle", 0.08); break;
      case "item": this.tone(523, 0.12, "sine", 0.07); this.tone(784, 0.2, "sine", 0.06); break;
      case "over": this.tone(300, 0.6, "sawtooth", 0.08, -200); break;
    }
  };

  /* ---------- ZhaoyunGame：渲染 + 输入 ---------- */
  function ZhaoyunGame(page) {
    this.page = page;                       // 页面控制器（提供 DOM 引用与弹窗）
    this.engine = new ZYEngine({ onEvent: this._onEvent.bind(this) });
    this.canvas = page.canvas;
    this.ctx = this.canvas.getContext("2d");
    this.speed = 1;
    this.paused = false;
    this.particles = [];
    this.skillBanner = null;
    this.targeting = null;                  // 毛笔选字模式 {slotIdx}
    this.drag = null;                       // 拖拽状态
    this.hoverCell = -1;
    this.lastTs = 0;
    this._hudCache = {};
    this.sfx = new Sfx();
    this._bgCache = null;
    this._buildBackground();
    this._bindEvents();
    this._raf = requestAnimationFrame(this._tick.bind(this));
  }

  ZhaoyunGame.prototype.destroy = function () {
    cancelAnimationFrame(this._raf);
    this._unbindEvents();
  };

  /* ===== 事件 ===== */
  ZhaoyunGame.prototype._onEvent = function (type, data, payload) {
    var page = this.page, eng = this.engine;
    switch (type) {
      case "toast": page.toast(data); break;
      case "state": this._syncHUD(); break;
      case "wave": page.toast("第 " + data + " 波敌军来袭"); this.sfx.play("boss"); break;
      case "bossWave": page.toast("⚠ " + data.ch + " 亲临战场：" + data.skillDesc); this.sfx.play("boss"); break;
      case "banner": this.skillBanner = { text: data.text, color: data.color, t: 1.3 }; this.sfx.play("skill"); break;
      case "item": page.showItemScroll(data); this.sfx.play("item"); break;
      case "gameover": this.sfx.play("over"); page.showGameOver(data, eng); break;
      case "fx": this._onFx(data, payload); break;
    }
  };
  ZhaoyunGame.prototype._onFx = function (name, payload) {
    switch (name) {
      case "summon": this.sfx.play("summon"); break;
      case "place": this.sfx.play("place"); break;
      case "merge": this.sfx.play("merge"); this._burst(payload || { x: 0, y: 0 }, 8, "#7b4ea3"); break;
      case "sell": break;
      case "hit": this.sfx.play("hit"); break;
      case "enemyDie":
        this.sfx.play("enemyDie");
        if (payload) this._burst(payload, 8, "#3a3a3a");
        break;
      case "general":
        this.sfx.play("general");
        if (payload) this._burst(payload, 16, DATA.FACTION[payload.faction].color);
        if (payload && payload.gid && this.page.onGeneral) this.page.onGeneral(payload.gid);
        break;
      case "skill":
        /* 全屏泼洒 */
        if (payload) {
          var fc = DATA.FACTION[payload.faction].color;
          this.particles.push({ type: "splash", color: fc, t: 0, dur: 0.9 });
        }
        break;
      case "heartLost": this.sfx.play("heartLost"); this._shake = 0.4; break;
      case "bossSpawn": this._shake = 0.3; break;
    }
  };
  ZhaoyunGame.prototype._burst = function (p, n, color) {
    if (p.x === undefined) return;
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2, sp = 40 + Math.random() * 90;
      this.particles.push({ type: "dot", x: p.x, y: p.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, t: 0, dur: 0.5 + Math.random() * 0.4, color: color, r: 1.5 + Math.random() * 2.5 });
    }
  };

  /* ===== 主循环 ===== */
  ZhaoyunGame.prototype._tick = function (ts) {
    this._raf = requestAnimationFrame(this._tick.bind(this));
    this._rafFired = (this._rafFired || 0) + 1;   // 诊断：rAF 是否真的在跑
    var dt = Math.min(0.05, (ts - this.lastTs) / 1000 || 0.016);
    this.lastTs = ts;
    if (!this.paused) {
      var simDt = dt * this.speed;
      /* 分片模拟防高速跳帧穿透 */
      while (simDt > 0) { var step = Math.min(0.033, simDt); this.engine.update(step); simDt -= step; }
      this._consumeEffects(dt);
      this._updateParticles(dt);
      if (this._shake > 0) this._shake -= dt;
      if (this.skillBanner) { this.skillBanner.t -= dt; if (this.skillBanner.t <= 0) this.skillBanner = null; }
    }
    this._render();
    this._syncHUD();
  };

  /* 引擎 effects → 本地特效/粒子 */
  ZhaoyunGame.prototype._consumeEffects = function (dt) {
    var effs = this.engine.effects;
    for (var i = 0; i < effs.length; i++) {
      var e = effs[i];
      e.t += dt;
      switch (e.type) {
        case "ink": this._burst(e, 3, "#3a3a3a"); break;
        case "enemyDie": break;
      }
    }
    this.engine.effects = effs.filter(function (e) { return e.t < 0.4; });
  };

  ZhaoyunGame.prototype._updateParticles = function (dt) {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.t += dt;
      if (p.t >= p.dur) { this.particles.splice(i, 1); continue; }
      if (p.type === "dot") { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; }
    }
  };

  /* ===== 坐标换算 ===== */
  ZhaoyunGame.prototype._toField = function (clientX, clientY) {
    var r = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - r.left) / r.width * FIELD_W,
      y: (clientY - r.top) / r.height * FIELD_H,
      inside: clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom
    };
  };
  ZhaoyunGame.prototype._cellAt = function (fx, fy) {
    if (fx < 0 || fy < 0 || fx >= FIELD_W || fy >= FIELD_H) return -1;
    var col = Math.floor(fx / CELL), row = Math.floor(fy / CELL);
    return row * MAP.cols + col;
  };

  /* ===== 输入 ===== */
  ZhaoyunGame.prototype._bindEvents = function () {
    var self = this;
    this._handlers = {
      down: function (ev) { self._onDown(ev); },
      move: function (ev) { self._onMove(ev); },
      up: function (ev) { self._onUp(ev); }
    };
    document.addEventListener("pointerdown", this._handlers.down);
    document.addEventListener("pointermove", this._handlers.move);
    document.addEventListener("pointerup", this._handlers.up);
    this.sfx.init();
  };
  ZhaoyunGame.prototype._unbindEvents = function () {
    document.removeEventListener("pointerdown", this._handlers.down);
    document.removeEventListener("pointermove", this._handlers.move);
    document.removeEventListener("pointerup", this._handlers.up);
  };

  ZhaoyunGame.prototype._onDown = function (ev) {
    this.sfx.init();
    if (this.engine.phase === "over") return;
    var page = this.page;
    /* 毛笔选字模式：点击格子改写 */
    if (this.targeting !== null) { this.tryRewrite(ev.clientX, ev.clientY); return; }

    /* canvas 内：格子起拖 */
    var f = this._toField(ev.clientX, ev.clientY);
    if (f.inside) {
      var ci = this._cellAt(f.x, f.y);
      if (ci >= 0 && this.engine.cells[ci].item && this.engine.cells[ci].type !== "path") {
        this.drag = { from: { from: "cell", idx: ci }, x: ev.clientX, y: ev.clientY };
        return;
      }
    }
  };
  ZhaoyunGame.prototype._onMove = function (ev) {
    if (!this.drag) {
      var f = this._toField(ev.clientX, ev.clientY);
      this.hoverCell = f.inside ? this._cellAt(f.x, f.y) : -1;
      return;
    }
    this.drag.x = ev.clientX; this.drag.y = ev.clientY;
  };
  ZhaoyunGame.prototype._onUp = function (ev) {
    if (!this.drag) return;
    var drag = this.drag; this.drag = null;
    /* 落点判定：弃置区 → 待命区槽位 → 战场格子 */
    if (this.page.inSellArea(ev.clientX, ev.clientY)) { this.engine.sell(drag.from); return; }
    var bs = this.page.benchSlotAt(ev.clientX, ev.clientY);
    if (bs >= 0) { this.engine.placeBench(drag.from, bs); return; }
    var f = this._toField(ev.clientX, ev.clientY);
    if (!f.inside) return;
    var ci = this._cellAt(f.x, f.y);
    if (ci >= 0 && ci !== drag.from.idx) this.engine.place(drag.from, ci);
    else if (ci < 0) this.page.toast("请对准格子放置");
  };

  /* 页面调用：从待命区起拖 */
  ZhaoyunGame.prototype.startBenchDrag = function (benchIdx, x, y) {
    this.drag = { from: { from: "bench", idx: benchIdx }, x: x, y: y };
  };
  /* 页面调用：毛笔目标选择 */
  ZhaoyunGame.prototype.tryRewrite = function (clientX, clientY) {
    var f = this._toField(clientX, clientY);
    if (f.inside) {
      var ci = this._cellAt(f.x, f.y);
      if (ci >= 0 && this.engine.cells[ci].item) {
        var r = this.engine.useActive(this.targeting, { from: "cell", idx: ci });
        if (r === true) { this.targeting = null; this.page.setTargeting(false); }
        return true;
      }
    }
    return false;
  };

  /* ===== 渲染 ===== */
  ZhaoyunGame.prototype._buildBackground = function () {
    /* 宣纸底纹（离屏缓存） */
    var c = document.createElement("canvas");
    c.width = FIELD_W; c.height = FIELD_H;
    var g = c.getContext("2d");
    var grad = g.createLinearGradient(0, 0, FIELD_W, FIELD_H);
    grad.addColorStop(0, "#f4eddb");
    grad.addColorStop(0.5, "#efe6d0");
    grad.addColorStop(1, "#e9dfc6");
    g.fillStyle = grad; g.fillRect(0, 0, FIELD_W, FIELD_H);
    /* 飞白纤维 */
    for (var i = 0; i < 260; i++) {
      g.strokeStyle = "rgba(120,105,80," + (0.02 + Math.random() * 0.04) + ")";
      g.lineWidth = 0.6 + Math.random();
      var x0 = Math.random() * FIELD_W, y0 = Math.random() * FIELD_H;
      var len = 20 + Math.random() * 80, ang = Math.random() * Math.PI;
      g.beginPath(); g.moveTo(x0, y0);
      g.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); g.stroke();
    }
    /* 淡墨斑 */
    for (i = 0; i < 18; i++) {
      var rg = g.createRadialGradient(Math.random() * FIELD_W, Math.random() * FIELD_H, 0, 0, 0, 120);
      void rg;
    }
    for (i = 0; i < 16; i++) {
      var cx = Math.random() * FIELD_W, cy = Math.random() * FIELD_H, rr = 30 + Math.random() * 90;
      var rg2 = g.createRadialGradient(cx, cy, 0, cx, cy, rr);
      rg2.addColorStop(0, "rgba(90,80,60,0.028)");
      rg2.addColorStop(1, "rgba(90,80,60,0)");
      g.fillStyle = rg2;
      g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
    }
    /* 边框印章 */
    g.strokeStyle = "rgba(60,50,35,0.35)"; g.lineWidth = 3;
    g.strokeRect(8, 8, FIELD_W - 16, FIELD_H - 16);
    g.strokeStyle = "rgba(60,50,35,0.15)"; g.lineWidth = 1;
    g.strokeRect(14, 14, FIELD_W - 28, FIELD_H - 28);
    this._bgCache = c;
  };

  ZhaoyunGame.prototype._render = function () {
    var g = this.ctx, eng = this.engine;
    var dpr = window.devicePixelRatio || 1;
    /* 等比适配容器（保持 960:640，避免拉伸变形；容器过小时保底防止高度归零） */
    var wrap = this.canvas.parentElement;
    if (wrap) {
      var availW = Math.max(120, wrap.clientWidth - 16), availH = Math.max(90, wrap.clientHeight - 16);
      var scale = Math.min(availW / FIELD_W, availH / FIELD_H);
      var cssW = Math.floor(FIELD_W * scale), cssH = Math.floor(FIELD_H * scale);
      if (this.canvas.clientWidth !== cssW || this.canvas.clientHeight !== cssH) {
        this.canvas.style.width = cssW + "px";
        this.canvas.style.height = cssH + "px";
      }
    }
    var curW = this.canvas.clientWidth, curH = this.canvas.clientHeight;
    if (!curW) return;
    if (this.canvas.width !== Math.round(curW * dpr)) {
      this.canvas.width = Math.round(curW * dpr);
      this.canvas.height = Math.round(curH * dpr);
    }
    try {
      g.setTransform(this.canvas.width / FIELD_W, 0, 0, this.canvas.height / FIELD_H, 0, 0);
      if (this._shake > 0) {
        g.translate((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7);
      }

      g.drawImage(this._bgCache, 0, 0);

      this._drawZones(g, eng);
      this._drawCells(g, eng);
      this._drawAdou(g, eng);
      this._drawEnemies(g, eng);
      this._drawEffects(g, eng);
      this._drawParticles(g);
      this._drawFloats(g, eng);
      this._drawBanner(g);
      this._drawWaveHint(g, eng);
      this._drawDragGhost(g);
    } catch (e) {
      /* 渲染异常浮出一次，避免静默白屏 */
      if (!this._renderErrReported) {
        this._renderErrReported = true;
        if (this.page && this.page.toast) this.page.toast("⚠ 渲染异常：" + e.message);
      }
    }
  };

  ZhaoyunGame.prototype._drawZones = function (g, eng) {
    eng.zones.forEach(function (z) {
      var a = Math.min(1, z.t / 0.8) * (0.5 + 0.2 * Math.sin(z.t * 12));
      var rg = g.createRadialGradient(z.x, z.y, 0, z.x, z.y, z.r);
      rg.addColorStop(0, "rgba(200,80,30," + (0.30 * a) + ")");
      rg.addColorStop(0.6, "rgba(170,60,20," + (0.18 * a) + ")");
      rg.addColorStop(1, "rgba(170,60,20,0)");
      g.fillStyle = rg;
      g.beginPath(); g.arc(z.x, z.y, z.r, 0, Math.PI * 2); g.fill();
      /* 火星粒子 */
      if (Math.random() < 0.4) {
        g.fillStyle = "rgba(220,110,40,0.7)";
        g.beginPath();
        g.arc(z.x + (Math.random() - 0.5) * z.r * 1.6, z.y - Math.random() * z.r * 0.5, 1.6, 0, Math.PI * 2);
        g.fill();
      }
    });
  };

  ZhaoyunGame.prototype._drawCells = function (g, eng) {
    var self = this;
    var half = CELL / 2;
    /* 可拼合提示集合 */
    var pairSet = {};
    eng.pairs.forEach(function (p) {
      if (p.a.idx !== undefined) pairSet[p.a.idx] = true;
      if (p.b.idx !== undefined) pairSet[p.b.idx] = true;
    });

    /* 1. 道路带（深墨，无缝填充） */
    g.fillStyle = "rgba(56,50,40,0.85)";
    eng.cells.forEach(function (cell) {
      if (cell.type === "path") g.fillRect(cell.col * CELL - 0.5, cell.row * CELL - 0.5, CELL + 1, CELL + 1);
    });
    /* 道路中线虚线 */
    g.strokeStyle = "rgba(244,237,219,0.5)";
    g.lineWidth = 3;
    g.setLineDash([12, 10]);
    g.beginPath();
    g.moveTo(WAYPOINTS[0].x, WAYPOINTS[0].y);
    for (var w = 1; w < WAYPOINTS.length; w++) g.lineTo(WAYPOINTS[w].x, WAYPOINTS[w].y);
    g.stroke();
    g.setLineDash([]);
    /* 入口指示 */
    g.fillStyle = "rgba(158,59,46,0.9)";
    g.font = "15px 'Ma Shan Zheng','KaiTi',serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("敌军入口", WAYPOINTS[0].x + 42, WAYPOINTS[0].y - 26);

    /* 2. 未开发格（wild：暗地块+草点，铲子拖拽时高亮可开垦） */
    eng.cells.forEach(function (cell, i) {
      if (cell.type !== "wild") return;
      var hot = self.hoverCell === i;
      g.save();
      g.globalAlpha = 0.5;
      g.fillStyle = "rgba(105,95,70,0.16)";
      g.fillRect(cell.col * CELL + 2, cell.row * CELL + 2, CELL - 4, CELL - 4);
      g.globalAlpha = hot ? 0.8 : 0.35;
      g.strokeStyle = "rgba(90,82,62,0.55)";
      g.lineWidth = 1;
      g.setLineDash([5, 4]);
      g.strokeRect(cell.col * CELL + 2.5, cell.row * CELL + 2.5, CELL - 5, CELL - 5);
      g.setLineDash([]);
      /* 草点 */
      g.globalAlpha = 0.4;
      g.fillStyle = "#6b6350";
      var sx = cell.col * CELL, sy = cell.row * CELL;
      g.fillRect(sx + 18, sy + 24, 2, 7); g.fillRect(sx + 24, sy + 20, 2, 9);
      g.fillRect(sx + 52, sy + 46, 2, 7); g.fillRect(sx + 58, sy + 42, 2, 9);
      g.restore();
    });

    /* 3. 布置格（build：亮色可放置） */
    eng.cells.forEach(function (cell, i) {
      if (cell.type !== "build") return;
      var hot = self.hoverCell === i;
      g.save();
      g.translate(cell.x, cell.y);
      g.fillStyle = hot ? "rgba(255,250,235,0.95)" : "rgba(252,246,230,0.8)";
      roundRect(g, -half + 2, -half + 2, CELL - 4, CELL - 4, 7);
      g.fill();
      g.strokeStyle = hot ? "rgba(158,59,46,0.95)" : "rgba(96,86,66,0.55)";
      g.lineWidth = hot ? 3 : 1.5;
      g.stroke();
      g.globalAlpha = 1;
      var it = cell.item;
      if (it) self._drawUnit(g, it, cell, pairSet[i]);
      g.restore();
    });
  };

  /* 画一个单位（兵种/碎片/武将），带攻击字形动画 */
  ZhaoyunGame.prototype._drawUnit = function (g, it, cell, pairGlow) {
    var anim = Math.max(0, cell.anim || 0) / 0.28;   // 1→0
    var ax = 0, ay = 0, rot = 0, scale = 1;
    if (anim > 0) {
      var k = Math.sin(anim * Math.PI);
      if (it.kind === "general" || (it.id === "gong")) { rot = -0.35 * k; scale = 1 + 0.15 * k; }
      else if (it.id === "qiang") { ax = 10 * k; scale = 1 + 0.1 * k; }
      else if (it.id === "dao") { rot = 0.6 * k; }
      else if (it.id === "jian") { ay = -8 * k; rot = 0.3 * k; }
    }
    var ch = it.ch, color = "#3a3428", font = "bold 30px", stroke = null, bg = null;
    var tired = it.tiredT > 0;

    if (it.kind === "general") {
      var gg = null;
      DATA.GENERALS.forEach(function (x) { if (x.id === it.gid) gg = x; });
      var q = DATA.QUALITY[it.quality];
      var fc = DATA.FACTION[gg.faction].color;
      font = "bold 25px";
      /* 品质边框格 */
      g.save();
      g.strokeStyle = q.color; g.lineWidth = 2.5;
      g.globalAlpha = 0.9;
      roundRect(g, -CELL / 2 + 4, -CELL / 2 + 4, CELL - 8, CELL - 8, 8);
      g.stroke();
      /* 势力角标 */
      g.fillStyle = fc; g.globalAlpha = 0.85;
      g.beginPath(); g.arc(22, -22, 9, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.font = "11px 'Ma Shan Zheng','KaiTi',serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(DATA.FACTION[gg.faction].name, 22, -22);
      /* 技能充能条 */
      var pct = 1 - it.skillT / it.skillCd;
      g.globalAlpha = 0.9;
      g.fillStyle = "rgba(60,52,40,0.25)";
      g.fillRect(-25, 23, 50, 4);
      g.fillStyle = q.color;
      g.fillRect(-25, 23, 50 * clamp(pct, 0, 1), 4);
      /* 经验 */
      if (it.level < DATA.LEVEL_MAX) {
        g.fillStyle = "rgba(60,52,40,0.2)";
        g.fillRect(-25, 28, 50, 2.5);
        g.fillStyle = "#b08d3e";
        g.fillRect(-25, 28, 50 * (it.exp / (DATA.GENERAL_EXP_KILLS * it.level)), 2.5);
      }
      g.restore();
      color = tired ? "#9a9284" : "#2c2618";
      stroke = { color: q.color, width: 4 };
      /* buff 光环 */
      if (it.buffSpdT > 0 || it.rapidT > 0) {
        g.save();
        g.strokeStyle = "rgba(192,140,60," + (0.5 + 0.3 * Math.sin(Date.now() / 120)) + ")";
        g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 36, 0, Math.PI * 2); g.stroke();
        g.restore();
      }
    } else if (it.kind === "char") {
      /* 碎片字：休眠态（灰）+ 可拼合时朱砂高亮 */
      color = pairGlow ? "#9e3b2e" : "#7a7264";
      stroke = pairGlow ? { color: "rgba(158,59,46,0.6)", width: 5 } : null;
      if (pairGlow) {
        g.save();
        var pulse = 0.5 + 0.4 * Math.sin(Date.now() / 180);
        g.strokeStyle = "rgba(158,59,46," + (0.35 * pulse) + ")";
        g.lineWidth = 3;
        roundRect(g, -CELL / 2 + 3, -CELL / 2 + 3, CELL - 6, CELL - 6, 8); g.stroke();
        g.restore();
      }
    } else {
      color = "#3a3428";
    }

    g.save();
    g.translate(ax, ay);
    g.rotate(rot);
    g.scale(scale, scale);
    if (tired) g.globalAlpha = 0.55;
    g.font = font + " 'Ma Shan Zheng','KaiTi','STKaiti',serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    if (stroke) {
      g.strokeStyle = stroke.color; g.lineWidth = stroke.width;
      g.globalAlpha *= 0.35; g.strokeText(ch, 0, 0); g.globalAlpha /= 0.35;
    }
    g.fillStyle = color;
    g.fillText(ch, 0, 0);
    g.restore();

    /* 等级角标 */
    g.save();
    g.fillStyle = "rgba(58,52,40,0.85)";
    g.font = "bold 11px sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.beginPath(); g.arc(-23, 22, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f4eddb";
    g.fillText(String(it.level), -23, 22);
    g.restore();
  };

  ZhaoyunGame.prototype._drawAdou = function (g, eng) {
    var a = ADOU;
    g.save();
    g.translate(a.x, a.y);
    /* 心（阿斗上方格区域） */
    var hearts = eng.hearts;
    for (var i = 0; i < DATA.GAME.hearts0; i++) {
      var alive = i < hearts;
      drawHeart(g, -32 + (i % 3) * 26, -100 + Math.floor(i / 3) * 22, 8, alive ? "#c0392b" : "rgba(120,110,95,0.35)");
    }
    /* 斗字大印 */
    g.fillStyle = "rgba(158,59,46,0.12)";
    g.strokeStyle = "rgba(158,59,46,0.85)"; g.lineWidth = 2.5;
    roundRect(g, -35, -35, 70, 70, 10); g.fill(); g.stroke();
    g.fillStyle = "#9e3b2e";
    g.font = "bold 42px 'Ma Shan Zheng','KaiTi',serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("斗", 0, 4);
    g.font = "14px 'Ma Shan Zheng','KaiTi',serif";
    g.fillStyle = "rgba(158,59,46,0.9)";
    g.fillText("阿斗", 0, -52);
    g.restore();
  };

  ZhaoyunGame.prototype._drawEnemies = function (g, eng) {
    var now = Date.now();
    eng.enemies.forEach(function (e) {
      g.save();
      g.translate(e.x, e.y);
      var isBoss = e.boss;
      var r = isBoss ? 26 : 17;
      if (e.stunT > 0) g.rotate(Math.sin(now / 90) * 0.14);
      if (e.invulT > 0 && Math.floor(now / 120) % 2 === 0) g.globalAlpha = 0.45;
      /* 亮色纸牌底块 —— 与深墨道路强对比，出兵清晰可辨 */
      g.fillStyle = isBoss ? "#f3dfae" : "#f7f2e2";
      roundRect(g, -r, -r, r * 2, r * 2, 7);
      g.fill();
      g.strokeStyle = isBoss ? "#c0392b" : "#5a4a3a";
      g.lineWidth = isBoss ? 3 : 2;
      g.stroke();
      /* 兵种字：墨/赭/蓝 区分兵种 */
      var ink = { zu: "#3a3428", qi: "#9c6b1f", dun: "#3d5a7d" };
      g.fillStyle = isBoss ? "#9e2f1d" : (ink[e.type] || "#3a3428");
      g.font = "bold " + (isBoss ? 28 : 19) + "px 'Ma Shan Zheng','KaiTi',serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(e.ch, 0, 1);
      g.globalAlpha = 1;
      /* 护盾 / 狂暴 环 */
      if (e.shield > 0) {
        g.strokeStyle = "rgba(61,106,168,0.85)"; g.lineWidth = 2.5;
        g.beginPath(); g.arc(0, 0, r + 5, 0, Math.PI * 2); g.stroke();
      }
      if (e.rage) {
        g.strokeStyle = "rgba(158,59,46," + (0.5 + 0.3 * Math.sin(now / 80)) + ")";
        g.lineWidth = 3;
        g.beginPath(); g.arc(0, 0, r + 7, 0, Math.PI * 2); g.stroke();
      }
      /* 血条（红） */
      var w = isBoss ? 52 : 30;
      var pct = clamp(e.hp / e.maxHp, 0, 1);
      g.fillStyle = "rgba(30,22,16,0.55)";
      g.fillRect(-w / 2, -r - 11, w, 4.5);
      g.fillStyle = isBoss ? "#c0392b" : "#d24b2e";
      g.fillRect(-w / 2, -r - 11, w * pct, 4.5);
      g.restore();
    });
  };

  ZhaoyunGame.prototype._drawEffects = function (g, eng) {
    eng.effects.forEach(function (e) {
      var k = e.t / 0.4, a = 1 - k;
      if (a <= 0) return;
      g.save();
      g.globalAlpha = a * 0.85;
      switch (e.type) {
        case "slash":   /* 月牙墨痕 */
          g.translate(e.x, e.y); g.rotate(e.dir || 0);
          g.strokeStyle = e.gold ? "#c9a227" : "#2f2a20"; g.lineWidth = 3.5;
          g.beginPath(); g.arc(0, 0, 14 + 16 * k, -0.9, 0.9); g.stroke();
          break;
        case "thrust":  /* 突刺线 */
          g.strokeStyle = e.gold ? "rgba(201,162,39," + a + ")" : "rgba(47,42,32," + a + ")";
          g.lineWidth = 5 * a + 1;
          g.beginPath(); g.moveTo(e.x1, e.y1); g.lineTo(e.x2, e.y2); g.stroke();
          break;
        case "arc":     /* 剑气弧 */
          g.strokeStyle = "rgba(58,90,140," + a + ")"; g.lineWidth = 3;
          g.beginPath(); g.arc(e.x, e.y, e.r * (0.5 + 0.5 * k), 0, Math.PI * 2); g.stroke();
          break;
        case "arrow":   /* 墨箭 */
          var dx = e.x2 - e.x1, dy = e.y2 - e.y1, L = Math.sqrt(dx * dx + dy * dy) || 1;
          var hx = e.x1 + dx * Math.min(1, k * 2), hy = e.y1 + dy * Math.min(1, k * 2);
          g.strokeStyle = "rgba(40,36,28," + a + ")"; g.lineWidth = 2.5;
          g.beginPath(); g.moveTo(hx - dx / L * 14, hy - dy / L * 14); g.lineTo(hx, hy); g.stroke();
          break;
        case "arrowRain":
          var kk = clamp((e.t + 0.35) / 0.35, 0, 1);
          if (kk >= 1) {
            g.strokeStyle = "rgba(180,90,30," + (1 - k) + ")"; g.lineWidth = 2;
            g.beginPath(); g.arc(e.x, e.y, 55 * (0.4 + 0.6 * k), 0, Math.PI * 2); g.stroke();
            g.fillStyle = "rgba(200,100,30," + (0.25 * (1 - k)) + ")";
            g.beginPath(); g.arc(e.x, e.y, 55, 0, Math.PI * 2); g.fill();
          } else {
            g.strokeStyle = "rgba(150,80,30,0.8)"; g.lineWidth = 2;
            g.beginPath(); g.moveTo(e.x - 20 + kk * 40, e.y - 90); g.lineTo(e.x, e.y); g.stroke();
          }
          break;
        case "smash":
          g.strokeStyle = "rgba(158,59,46," + a + ")"; g.lineWidth = 4 * a + 1;
          g.beginPath(); g.arc(e.x, e.y, e.r * (0.3 + 0.7 * k), 0, Math.PI * 2); g.stroke();
          break;
        case "roar":    /* 咆哮波纹 */
          for (var r = 0; r < 3; r++) {
            var kk2 = clamp(k * 1.4 - r * 0.2, 0, 1);
            g.strokeStyle = "rgba(60,50,40," + (a * (1 - r * 0.3)) + ")"; g.lineWidth = 4;
            g.beginPath(); g.arc(FIELD_W / 2, FIELD_H / 2, 80 + kk2 * 480, 0, Math.PI * 2); g.stroke();
          }
          break;
        case "holy":
          g.strokeStyle = "rgba(201,162,39," + a + ")"; g.lineWidth = 3;
          g.beginPath(); g.arc(e.x, e.y, e.r * (0.5 + 0.5 * k), 0, Math.PI * 2); g.stroke();
          break;
        case "dash":    /* 赵云突进拖尾 */
          var pts = WAYPOINTS;
          g.strokeStyle = "rgba(201,162,39," + a + ")";
          g.lineWidth = 26 * a;
          g.lineCap = "round";
          g.setLineDash([200, 460]);
          g.lineDashOffset = -(k * 1600);
          g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
          for (var i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
          g.stroke();
          g.setLineDash([]);
          break;
        case "aura":
          if (e.cell) {
            g.strokeStyle = "rgba(192,140,60," + a + ")"; g.lineWidth = 3;
            g.beginPath(); g.arc(e.cell.x, e.cell.y, 34 + 26 * k, 0, Math.PI * 2); g.stroke();
          }
          break;
        case "fireAll":
          g.fillStyle = "rgba(200,90,30," + (0.35 * a) + ")";
          g.fillRect(0, 0, FIELD_W, FIELD_H);
          break;
        case "unlock":
        case "shovel":
        case "rewrite":
        case "heal":
          break;
      }
      g.restore();
    });
  };

  ZhaoyunGame.prototype._drawParticles = function (g) {
    this.particles.forEach(function (p) {
      var a = 1 - p.t / p.dur;
      if (p.type === "dot") {
        g.globalAlpha = a * 0.8;
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, Math.PI * 2); g.fill();
      } else if (p.type === "splash") {
        /* 全屏水墨泼洒 */
        var k = p.t / p.dur;
        g.globalAlpha = (1 - k) * 0.16;
        var rg = g.createRadialGradient(FIELD_W / 2, FIELD_H / 2, 0, FIELD_W / 2, FIELD_H / 2, 560 * (0.3 + 0.7 * k));
        rg.addColorStop(0, p.color);
        rg.addColorStop(1, "rgba(0,0,0,0)");
        g.fillStyle = rg;
        g.fillRect(0, 0, FIELD_W, FIELD_H);
        for (var i = 0; i < 8; i++) {
          var ang = i / 8 * Math.PI * 2 + k * 2;
          var rr = 200 + 260 * k;
          g.globalAlpha = (1 - k) * 0.12;
          g.fillStyle = p.color;
          g.beginPath();
          g.arc(FIELD_W / 2 + Math.cos(ang) * rr, FIELD_H / 2 + Math.sin(ang) * rr, 60 * (1 - k * 0.5), 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    });
  };

  ZhaoyunGame.prototype._drawFloats = function (g, eng) {
    eng.floats.forEach(function (f) {
      g.globalAlpha = clamp(f.t / 0.5, 0, 1);
      g.fillStyle = f.color || "#5a4a3a";
      g.font = "bold 14px sans-serif";
      g.textAlign = "center";
      g.fillText(f.text, f.x, f.y - (0.9 - f.t) * 26);
      g.globalAlpha = 1;
    });
  };

  ZhaoyunGame.prototype._drawBanner = function (g) {
    if (!this.skillBanner) return;
    var b = this.skillBanner;
    var k = b.t / 1.3;
    var a = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.5);
    g.save();
    g.globalAlpha = clamp(a, 0, 1) * 0.92;
    g.fillStyle = "rgba(244,237,219,0.82)";
    g.fillRect(0, FIELD_H / 2 - 44, FIELD_W, 88);
    g.fillStyle = b.color;
    g.fillRect(0, FIELD_H / 2 - 44, FIELD_W, 3);
    g.fillRect(0, FIELD_H / 2 + 41, FIELD_W, 3);
    g.font = "bold 44px 'Ma Shan Zheng','KaiTi',serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = b.color;
    g.fillText(b.text, FIELD_W / 2, FIELD_H / 2 + 2);
    g.restore();
  };

  ZhaoyunGame.prototype._drawWaveHint = function (g, eng) {
    if (eng.phase !== "prepare" && eng.phase !== "inter") return;
    var s = eng.phase === "prepare" ? "点下方「征兵」布防 · " : "下一波 ";
    g.save();
    g.font = "20px 'Ma Shan Zheng','KaiTi',serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(90,74,52,0.85)";
    g.fillText(s + Math.ceil(eng.timer) + " 秒后来袭", FIELD_W / 2, FIELD_H / 2);
    g.restore();
  };

  ZhaoyunGame.prototype._drawDragGhost = function (g) {
    if (!this.drag) return;
    var it = this.engine._peekSrc(this.drag.from);
    if (!it) return;
    var f = this._toField(this.drag.x, this.drag.y);
    /* 目标格高亮 */
    var ci = this._cellAt(f.x, f.y);
    if (ci >= 0) {
      var cell = this.engine.cells[ci];
      g.save();
      var isShovel = it.kind === "shovel";
      if (cell.type === "path") g.strokeStyle = "rgba(158,59,46,0.35)";           /* 道路：淡提示不可放 */
      else if (cell.type === "wild") g.strokeStyle = isShovel ? "rgba(47,143,91,0.95)" : "rgba(120,110,95,0.7)";
      else g.strokeStyle = "rgba(158,59,46,0.9)";
      g.lineWidth = 3;
      roundRect(g, cell.x - CELL / 2 + 2, cell.y - CELL / 2 + 2, CELL - 4, CELL - 4, 7); g.stroke();
      g.restore();
    }
    /* 跟随字影 */
    g.save();
    g.globalAlpha = 0.85;
    g.font = "bold 34px 'Ma Shan Zheng','KaiTi',serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = it.kind === "general" ? "#c9a227" : (it.kind === "char" ? "#9e3b2e" : "#3a3428");
    g.fillText(it.ch, f.x, f.y - 26);
    g.font = "bold 12px sans-serif";
    g.fillStyle = "#5a4a3a";
    g.fillText("Lv." + it.level, f.x, f.y + 6);
    g.restore();
  };

  /* ===== HUD 同步 ===== */
  ZhaoyunGame.prototype._syncHUD = function () {
    var eng = this.engine, page = this.page, c = this._hudCache;
    function set(key, el, val) {
      if (c[key] !== val) { c[key] = val; if (el) el.textContent = val; }
    }
    set("wave", page.elWave, String(eng.wave));
    set("mantou", page.elMantou, String(Math.floor(eng.mantou)));
    set("cost", page.elCost, String(eng.summonCost()));
    var h = "";
    for (var i = 0; i < DATA.GAME.hearts0; i++) h += i < eng.hearts ? "❤" : "♡";
    set("hearts", page.elHearts, h);
    set("kills", page.elKills, String(eng.kills));
    page.syncBench(eng.bench);
    page.syncItems(eng.passives, eng.activeItems);
    page.syncPhase(eng.phase, eng.timer);
  };

  /* ---------- 绘图小工具 ---------- */
  function roundRect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function drawHeart(g, x, y, s, color) {
    g.save();
    g.translate(x, y); g.scale(s / 10, s / 10);
    g.beginPath();
    g.moveTo(0, 3);
    g.bezierCurveTo(-10, -6, -4, -12, 0, -6);
    g.bezierCurveTo(4, -12, 10, -6, 0, 3);
    g.fillStyle = color;
    g.fill();
    g.restore();
  }

  global.ZhaoyunGame = ZhaoyunGame;
})(typeof window !== "undefined" ? window : globalThis);
