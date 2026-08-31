// LegendCore：引擎聚合（纯逻辑，客户端 store 与 node 测试共用）
//  职责：存档读写 / 背包与货币 / 战斗会话驱动 / 掉落与成长结算 / 养成线升级 / 大陆推进 / 离线收益
import { createInitialState } from "./state.mjs";
import { calcStats, battlePower, gainExp } from "./character.mjs";
import { BattleSession } from "./combat.mjs";
import { rollDrops } from "./loot.mjs";
import { allTracks, trackById, trackSnapshots } from "./growth/registry.mjs";
import { ITEMS, QUALITIES, SLOTS, ENHANCE_STEP } from "../data/items.mjs";
import { SKILLS, classSkills } from "../data/skills.mjs";
import { MAPS, mapsOfContinent, MONSTERS } from "../data/monsters.mjs";
import { CONTINENTS, continentById, meetsUnlock } from "../data/continents.mjs";
import { expToNext, enhanceRate, ENHANCE_MAX, GEM_SLOTS_MAX, BAG_SIZE_MAX, OFFLINE_EFF, OFFLINE_CAP_H, SAVE_VERSION } from "../data/constants.mjs";

// 可 seed 的随机源（测试用）
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const POTION_AUTO_PCT = 0.35;   // 生命低于 35% 自动喝红
const POTION_AUTO_CD = 8;       // 自动喝药冷却

export class LegendCore {
  constructor(opts = {}) {
    this.state = null;
    this.session = null;
    this.listeners = [];
    this.rngFn = opts.rng || Math.random;
    this._potionCd = 0;
    this._events = [];          // 快照间累积的事件（UI 拉取）
  }

  static create(cls, name, opts) {
    const core = new LegendCore(opts);
    core.state = createInitialState(cls, name);
    core.rebuildSession();
    return core;
  }

  rng() { return this.rngFn(); }

  emit(type, payload) {
    this._events.push({ type, payload, ts: Date.now() });
    if (this._events.length > 200) this._events.splice(0, 100);
    for (const fn of this.listeners) {
      try { fn(type, payload); } catch (e) { /* 监听器异常不影响引擎 */ }
    }
  }
  on(fn) { this.listeners.push(fn); }
  drainEvents() {
    const out = this._events;
    this._events = [];
    return out;
  }

  // —— 存档 ——
  load(json) {
    const st = typeof json === "string" ? JSON.parse(json) : json;
    if (!st || st.v !== SAVE_VERSION) throw new Error("存档版本不符");
    this.state = st;
    // 补齐缺省字段（向前兼容）
    st.bag = st.bag || [];
    st.equips = st.equips || {};
    st.growth = st.growth || {};
    st.progress = st.progress || { kills: {}, firstKills: [], unlocked: [1] };
    st.progress.kills = st.progress.kills || {};
    st.progress.firstKills = st.progress.firstKills || [];
    st.progress.unlocked = st.progress.unlocked || [1];
    st.stats = st.stats || {};
    this.migrate(st);
    this.rebuildSession();
  }

  // 旧档迁移：修正失效引用、淘汰未知物品（保证引擎/服务端白名单两侧一致）
  migrate(st) {
    const LEGACY_TPL = { w_sword_wood: "weapon_t0", c_cloth_common: "armor_t0" };
    // 1) 物品模板：改名或清除（清除的折算 100 金币/件）
    const keep = [];
    for (const it of st.bag) {
      if (LEGACY_TPL[it.tpl]) it.tpl = LEGACY_TPL[it.tpl];
      if (!ITEMS[it.tpl]) {
        st.gold = (st.gold || 0) + 100;
        if (Object.values(st.equips).includes(it.uid)) {
          for (const k of Object.keys(st.equips)) if (st.equips[k] === it.uid) delete st.equips[k];
        }
        continue;
      }
      keep.push(it);
    }
    st.bag = keep;
    // 2) 穿戴引用失效清理
    for (const k of Object.keys(st.equips)) {
      if (!st.bag.some((it) => it.uid === st.equips[k])) delete st.equips[k];
    }
    // 3) 旧版随身药水字段 → 背包物品
    if (st.potions) {
      if (st.potions.hp > 0) this.addItem("potion_hp", Math.round(st.potions.hp));
      if (st.potions.mp > 0) this.addItem("potion_mp", Math.round(st.potions.mp));
      delete st.potions;
    }
    // 4) 地图/大陆失效回退
    if (!MAPS[st.map]) {
      const cont = Math.max(...st.progress.unlocked);
      st.map = mapsOfContinent(cont)[0].id;
      st.continent = cont;
    }
    if (!st.progress.unlocked.includes(st.continent)) st.continent = Math.max(...st.progress.unlocked);
  }
  save() {
    this.state.savedAt = Date.now();
    return JSON.stringify(this.state);
  }
  get savedAt() { return this.state ? this.state.savedAt || 0 : 0; }

  // —— 背包与货币 ——
  nextUid() {
    let max = 0;
    for (const it of this.state.bag) if (it.uid > max) max = it.uid;
    return max + 1;
  }
  // 加物品：可堆叠（材料/药水/宝石按 tpl 合并），装备每件独立实例
  addItem(tplId, qty = 1, q = 0) {
    const tpl = ITEMS[tplId];
    if (!tpl) return { ok: false, msg: "未知物品" };
    if (tpl.type === "equip") {
      for (let i = 0; i < qty; i++) {
        if (this.state.bag.length >= BAG_SIZE_MAX) return { ok: false, msg: "背包已满" };
        this.state.bag.push({ uid: this.nextUid(), tpl: tplId, qty: 1, q, enhance: 0, gems: [] });
      }
      if (q >= 2) this.emit("drop", { tpl: tplId, q });
      return { ok: true };
    }
    const stack = this.state.bag.find((it) => it.tpl === tplId && it.qty !== undefined);
    if (stack) stack.qty += qty;
    else {
      if (this.state.bag.length >= BAG_SIZE_MAX) return { ok: false, msg: "背包已满" };
      this.state.bag.push({ uid: this.nextUid(), tpl: tplId, qty });
    }
    return { ok: true };
  }
  countItem(tplId) {
    return this.state.bag.filter((it) => it.tpl === tplId).reduce((a, it) => a + (it.qty || 1), 0);
  }
  consumeItem(tplId, qty) {
    if (this.countItem(tplId) < qty) return false;
    let left = qty;
    for (const it of this.state.bag) {
      if (it.tpl !== tplId) continue;
      const take = Math.min(left, it.qty || 1);
      it.qty = (it.qty || 1) - take;
      left -= take;
      if (it.qty <= 0) this.state.bag.splice(this.state.bag.indexOf(it), 1);
      if (left <= 0) break;
    }
    return true;
  }
  canAfford(cost) {
    if (!cost) return { ok: true };
    if (cost.gold && this.state.gold < cost.gold) return { ok: false, msg: "金币不足" };
    if (cost.ingot && this.state.ingot < cost.ingot) return { ok: false, msg: "元宝不足" };
    if (cost.mats) {
      for (const [m, n] of Object.entries(cost.mats)) {
        if (this.countItem(m) < n) {
          return { ok: false, msg: `材料不足：${(ITEMS[m] || {}).name || m} ×${n - this.countItem(m)}` };
        }
      }
    }
    return { ok: true };
  }
  pay(cost) {
    if (!cost) return;
    if (cost.gold) this.state.gold -= cost.gold;
    if (cost.ingot) this.state.ingot -= cost.ingot;
    if (cost.mats) for (const [m, n] of Object.entries(cost.mats)) this.consumeItem(m, n);
  }

  // —— 面板 ——
  stats() { return calcStats(this.state); }
  power() { return battlePower(this.stats()); }
  skills() { return classSkills(this.state.class); }

  // —— 战斗 ——
  rebuildSession() {
    this.session = new BattleSession(this.state.map, this.stats(), this.skills());
  }
  // 击杀结算（战斗会话回调）
  applyKill(monId, boss) {
    const mon = MONSTERS[monId];
    const loot = rollDrops(monId, this.rngFn);
    this.state.gold += loot.gold;
    gainExp(this.state, mon.exp, (t, p) => this.emit(t, p));
    this.state.progress.kills[monId] = (this.state.progress.kills[monId] || 0) + 1;
    this.state.stats.totalKills = (this.state.stats.totalKills || 0) + 1;
    if (boss) this.state.stats.bossKills = (this.state.stats.bossKills || 0) + 1;
    const got = [];
    for (const it of loot.items) {
      const r = this.addItem(it.tpl, it.qty, it.q);
      if (r.ok) got.push(it);
    }
    let fk = null;
    if (loot.firstkill && !this.state.progress.firstKills.includes(monId)) {
      this.state.progress.firstKills.push(monId);
      this.state.ingot += loot.firstkill.ingot;
      fk = loot.firstkill;
      this.emit("firstkill", { mon: mon.name, ingot: fk.ingot });
    }
    return { exp: mon.exp, gold: loot.gold, items: got.map((g) => ({ name: (ITEMS[g.tpl] || {}).name || g.tpl, q: g.q })), firstkill: fk };
  }

  // 主循环：dt 秒
  tick(dt) {
    if (!this.state || !this.session) return [];
    this.state.stats.playSec = (this.state.stats.playSec || 0) + dt;
    const stats = this.stats();
    const ev = this.session.tick(dt, stats, this.rngFn, (monId, boss) => this.applyKill(monId, boss));

    // 死亡惩罚：掉 2% 当前等级经验（不破 0）
    if (ev.some((e) => e.t === "pdead")) {
      const loss = Math.min(this.state.exp, Math.round(expToNext(this.state.level) * 0.02));
      this.state.exp -= loss;
      this.state.stats.deaths = (this.state.stats.deaths || 0) + 1;
      this.emit("death", { loss });
    }

    // 自动喝药
    this._potionCd -= dt;
    const pv = this.session.player;
    if (this._potionCd <= 0 && pv.hp > 0 && pv.hp / pv.hpMax < POTION_AUTO_PCT && this.countItem("potion_hp") > 0) {
      this.consumeItem("potion_hp", 1);
      this.session.usePotion("hp", 0.35);
      this._potionCd = POTION_AUTO_CD;
      ev.push({ t: "potion", kind: "hp" });
    }
    return ev;
  }

  // —— 装备/强化/宝石 ——
  equip(uid) {
    const inst = this.state.bag.find((it) => it.uid === uid);
    if (!inst) return { ok: false, msg: "物品不存在" };
    const tpl = ITEMS[inst.tpl];
    if (!tpl || tpl.type !== "equip") return { ok: false, msg: "该物品无法装备" };
    if (this.state.level < tpl.lvlReq) return { ok: false, msg: `需要等级 ${tpl.lvlReq}` };
    this.state.equips[tpl.slot] = uid;
    return { ok: true, msg: `已装备 ${tpl.name}` };
  }
  unequip(slot) {
    if (!this.state.equips[slot]) return { ok: false, msg: "该部位未穿戴" };
    delete this.state.equips[slot];
    return { ok: true };
  }
  // 强化：黑铁矿+金币，成功率随级衰减，失败降 1 级（保 0）
  enhanceCost(inst) {
    const tpl = ITEMS[inst.tpl];
    return {
      gold: Math.round(tpl.price * (inst.enhance + 1) * 0.6),
      mats: { mat_heiiron: 1 + Math.floor(inst.enhance / 3) }
    };
  }
  enhance(uid) {
    const inst = this.state.bag.find((it) => it.uid === uid);
    if (!inst) return { ok: false, msg: "物品不存在" };
    const tpl = ITEMS[inst.tpl];
    if (!tpl || tpl.type !== "equip") return { ok: false, msg: "仅装备可强化" };
    if (inst.enhance >= ENHANCE_MAX) return { ok: false, msg: "已达强化上限" };
    const cost = this.enhanceCost(inst);
    const aff = this.canAfford(cost);
    if (!aff.ok) return aff;
    this.pay(cost);
    this.state.stats.enhanceTries = (this.state.stats.enhanceTries || 0) + 1;
    if (this.rng() < enhanceRate(inst.enhance)) {
      inst.enhance++;
      this.emit("enhance", { uid, enhance: inst.enhance, success: true });
      return { ok: true, msg: `强化成功！${tpl.name} +${inst.enhance}`, success: true };
    }
    inst.enhance = Math.max(0, inst.enhance - 1);
    this.emit("enhance", { uid, enhance: inst.enhance, success: false });
    return { ok: true, msg: `强化失败，${tpl.name} 降至 +${inst.enhance}`, success: false };
  }
  gemHoles(inst) {
    const tpl = ITEMS[inst.tpl];
    return Math.min(GEM_SLOTS_MAX, Math.ceil((tpl.tier + 1) / 2));
  }
  embedGem(uid, gemTpl) {
    const inst = this.state.bag.find((it) => it.uid === uid);
    if (!inst) return { ok: false, msg: "物品不存在" };
    const gt = ITEMS[gemTpl];
    if (!gt || gt.type !== "gem") return { ok: false, msg: "请选择宝石" };
    inst.gems = Array.isArray(inst.gems) ? inst.gems : [];
    if (inst.gems.length >= this.gemHoles(inst)) return { ok: false, msg: "宝石孔已满" };
    if (this.countItem(gemTpl) < 1) return { ok: false, msg: "没有该宝石" };
    this.consumeItem(gemTpl, 1);
    inst.gems.push(gemTpl);
    return { ok: true, msg: `镶嵌成功：${gt.name}` };
  }
  combineGems(kind, lv) {
    if (lv >= 5) return { ok: false, msg: "已是最高级宝石" };
    const need = 3, cost = { gold: 500 * lv };
    if (this.countItem(`${kind}_${lv}`) < need) return { ok: false, msg: `需要 3 颗 ${(ITEMS[`${kind}_${lv}`] || {}).name}` };
    const aff = this.canAfford(cost);
    if (!aff.ok) return aff;
    this.pay(cost);
    this.consumeItem(`${kind}_${lv}`, need);
    this.addItem(`${kind}_${lv + 1}`, 1);
    return { ok: true, msg: `合成成功：${ITEMS[`${kind}_${lv + 1}`].name}` };
  }
  sellItem(uid) {
    const inst = this.state.bag.find((it) => it.uid === uid);
    if (!inst) return { ok: false, msg: "物品不存在" };
    if (Object.values(this.state.equips).includes(uid)) return { ok: false, msg: "请先卸下再出售" };
    const tpl = ITEMS[inst.tpl];
    const gold = Math.max(1, Math.round(tpl.price * QUALITIES[inst.q || 0].mult * (1 + inst.enhance * 0.1) * 0.5));
    this.state.gold += gold;
    this.state.bag.splice(this.state.bag.indexOf(inst), 1);
    return { ok: true, msg: `出售 ${tpl.name}，获得 ${gold} 金币`, gold };
  }
  sellStack(tplId, qty) {
    const have = this.countItem(tplId);
    const n = Math.min(qty, have);
    if (n <= 0) return { ok: false, msg: "数量不足" };
    const tpl = ITEMS[tplId];
    const gold = Math.round(tpl.price * 0.5 * n);
    this.consumeItem(tplId, n);
    this.state.gold += gold;
    return { ok: true, msg: `出售 ${tpl.name}×${n}，获得 ${gold} 金币`, gold };
  }

  // —— 养成线 ——
  upgradeTrack(id) {
    const t = trackById(id);
    if (!t) return { ok: false, msg: "未知养成线" };
    return t.tryUpgrade(this.state, this);
  }
  rebirthLevel() {
    const g = this.state.growth.rebirth;
    return g ? g.level : 0;
  }

  // —— 地图与大陆 ——
  switchMap(mapId) {
    const map = MAPS[mapId];
    if (!map) return { ok: false, msg: "地图不存在" };
    if (!this.state.progress.unlocked.includes(map.continent)) return { ok: false, msg: "大陆未解锁" };
    if (this.state.level < map.lvlReq) return { ok: false, msg: `需要等级 ${map.lvlReq}` };
    this.state.map = mapId;
    this.state.continent = map.continent;
    this.rebuildSession();
    return { ok: true, msg: `前往 ${map.name}` };
  }
  nextContinent() {
    const unlocked = this.state.progress.unlocked;
    return continentById(Math.max(...unlocked) + 1);
  }
  unlockContinent() {
    const next = this.nextContinent();
    if (!next) return { ok: false, msg: "已解锁全部大陆" };
    if (!meetsUnlock(next, this.state.level, this.rebirthLevel())) {
      return { ok: false, msg: `需等级 ${next.unlock.level} + 转生 ${next.unlock.rebirth}` };
    }
    this.state.progress.unlocked.push(next.id);
    this.state.gold += next.reward.gold;
    this.state.ingot += next.reward.ingot;
    this.emit("continent", { id: next.id, name: next.name });
    return { ok: true, msg: `解锁「${next.name}」！奖励 ${next.reward.gold} 金币 + ${next.reward.ingot} 元宝` };
  }

  // —— 商店 ——
  buyItem(tplId, qty = 1) {
    const tpl = ITEMS[tplId];
    if (!tpl || !tpl.price || (tpl.type !== "mat" && tpl.type !== "potion")) {
      return { ok: false, msg: "该物品不可购买" };
    }
    const gold = tpl.price * qty;
    if (this.state.gold < gold) return { ok: false, msg: "金币不足" };
    this.state.gold -= gold;
    this.addItem(tplId, qty);
    return { ok: true, msg: `购买 ${tpl.name}×${qty}` };
  }

  // —— 快照（UI 用） ——
  snapshot() {
    const stats = this.stats();
    const map = MAPS[this.state.map];
    const next = this.nextContinent();
    return {
      name: this.state.name,
      class: this.state.class,
      level: this.state.level,
      exp: this.state.exp,
      expNeed: expToNext(this.state.level),
      expPct: Math.min(100, Math.floor((this.state.exp / expToNext(this.state.level)) * 100)),
      gold: Math.round(this.state.gold),
      ingot: this.state.ingot,
      continent: this.state.continent,
      continentName: (continentById(this.state.continent) || {}).name,
      map: this.state.map,
      mapName: map ? map.name : "",
      rebirth: this.rebirthLevel(),
      stats,
      power: battlePower(stats),
      bag: this.state.bag,
      equips: this.state.equips,
      unlocked: this.state.progress.unlocked.slice(),
      nextContinent: next ? {
        id: next.id, name: next.name, desc: next.desc,
        needLevel: next.unlock.level, needRebirth: next.unlock.rebirth,
        canUnlock: meetsUnlock(next, this.state.level, this.rebirthLevel())
      } : null,
      killStats: this.state.stats,
      tracks: trackSnapshots(this.state, this),
      battle: this.session ? this.session.view() : null,
      events: this.drainEvents()
    };
  }

  // —— 离线收益（解析式估算，不逐帧模拟） ——
  offlineApply(gapSec) {
    if (!this.state) return null;
    const capped = Math.min(gapSec, OFFLINE_CAP_H * 3600) * OFFLINE_EFF;
    const map = MAPS[this.state.map];
    if (!map || capped <= 30) return null;
    // 估算秒杀能力：平均怪血 / 玩家有效 DPS（含切割与攻速）
    const stats = this.stats();
    const mons = map.mons.map((id) => MONSTERS[id]);
    const avgHp = mons.reduce((a, m) => a + m.hpMax, 0) / mons.length;
    const avgDef = mons.reduce((a, m) => a + m.def, 0) / mons.length;
    const baseDps = Math.max(1, stats.atk - avgDef * 1.2) * stats.aspd * (1 + (stats.crit || 0) / 100 * ((stats.critDmg || 1.5) - 1));
    const cutDps = (stats.cutPct / 100) * avgHp;
    const ttk = avgHp / (baseDps + cutDps);
    // 打不动（单只要打 5 分钟以上）视为卡关，无离线收益
    if (ttk > 300) return { seconds: Math.round(gapSec), kills: 0, exp: 0, gold: 0, items: [], stuck: true };
    const kills = Math.floor(capped / (ttk + RESPAWN_EST));
    if (kills <= 0) return null;
    let exp = 0, gold = 0;
    const items = {};
    for (let i = 0; i < Math.min(kills, 500); i++) {
      const monId = map.mons[Math.floor(this.rng() * map.mons.length)];
      const mon = MONSTERS[monId];
      exp += mon.exp;
      gold += mon.gold;
      const loot = rollDrops(monId, this.rngFn);
      gold += loot.gold;
      for (const it of loot.items) {
        const key = it.tpl + ":" + it.q;
        items[key] = (items[key] || 0) + it.qty;
      }
    }
    // 超过 500 次的击杀按均值折算
    if (kills > 500) {
      const scale = kills / 500;
      exp = Math.round(exp * scale);
      gold = Math.round(gold * scale);
      for (const k of Object.keys(items)) items[k] = Math.round(items[k] * scale);
    }
    gainExp(this.state, exp, (t, p) => this.emit(t, p));
    this.state.gold += gold;
    this.state.stats.totalKills += kills;
    for (const [key, qty] of Object.entries(items)) {
      const [tpl, q] = key.split(":");
      this.addItem(tpl, qty, Number(q));
    }
    this.emit("offline", { kills, exp, gold });
    return { seconds: Math.round(gapSec), kills, exp, gold, items };
  }
}

const RESPAWN_EST = 3; // 离线估算用的平均复活间隔
