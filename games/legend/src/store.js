// 引擎 ↔ Vue 桥：单例 reactive 快照 + 1s tick + 云自动存档 + 离线结算 + 事件 toast/特效分发
import { reactive } from "vue";
import { api, getToken, setToken } from "./net/api.js";
import { LegendCore } from "./engine/index.mjs";
import { createInitialState } from "./engine/state.mjs";
import { ITEMS } from "./data/items.mjs";

const NAME_KEY = "legend_username";
const AUTOSAVE_SEC = 30;   // 云端自动存档间隔（服务端限频 8s，留足余量）

const state = reactive({
  view: "loading",          // loading | login | create | game
  username: "",
  save: null,               // 服务端角色档 meta { id, name, class, ... state }
  snap: null,               // 引擎快照（UI 数据源）
  toast: null,              // { text, kind }
  offline: null,            // 离线收益 { seconds, kills, exp, gold, items, stuck }
  panel: null,              // 当前打开的面板 bag|equip|growth|map|rank|shop
  busy: false,
  saving: false,
  lastSavedAt: 0
});

let core = null;
let toastTimer = 0;
const fxListeners = [];

function toast(text, kind = "info", ms = 2200) {
  state.toast = { text, kind };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { state.toast = null; }, ms);
}

function onFx(fn) {
  fxListeners.push(fn);
  return () => fxListeners.splice(fxListeners.indexOf(fn), 1);
}

function emitFx(events) {
  for (const fn of fxListeners) {
    try { fn(events); } catch (e) { /* 渲染异常不回传引擎 */ }
  }
}

function refresh() {
  state.snap = core ? core.snapshot() : null;
}

// —— 引擎事件 → toast / 特效 ——
function wireCore(c) {
  c.on((type, p) => {
    if (type === "levelup") toast(`🎉 升级！Lv.${p.level}`, "good");
    else if (type === "drop") {
      const name = (ITEMS[p.tpl] || {}).name || p.tpl;
      const qn = ["", "精良", "稀有", "史诗", "传说"][p.q] || "";
      if (p.q >= 3) toast(`✨ 掉落【${qn}】${name}！`, "good", 3000);
    } else if (type === "firstkill") toast(`🏆 首杀 ${p.mon}！奖励 ${p.ingot} 元宝`, "good", 3500);
    else if (type === "death") toast("💀 不敌怪物，损失少量经验", "bad");
    else if (type === "enhance" && p.success) toast(`🔨 强化成功 +${p.enhance}`, "good");
  });
}

// —— boot 流程 ——
function bootEngine(savedState) {
  core = new LegendCore();
  wireCore(core);
  core.load(savedState);
  const gap = core.savedAt ? (Date.now() - core.savedAt) / 1000 : 0;
  if (gap >= 300) {
    const off = core.offlineApply(gap);
    if (off && (off.kills > 0 || off.stuck)) state.offline = off;
  }
  refresh();
  startLoop();
}

function stopLoop() {
  clearInterval(bootEngine._timer);
  document.removeEventListener("visibilitychange", bootEngine._visHandler);
  window.removeEventListener("beforeunload", bootEngine._unloadHandler);
}

function startLoop() {
  stopLoop();
  let saveAcc = 0;
  bootEngine._timer = setInterval(() => {
    if (!core || document.hidden) return;
    const ev = core.tick(1);
    if (ev.length) emitFx(ev);
    refresh();
    saveAcc++;
    if (saveAcc >= AUTOSAVE_SEC) { saveAcc = 0; cloudSave(); }
  }, 1000);

  bootEngine._visHandler = () => {
    if (document.hidden) cloudSave(true);
    else if (core) {
      const away = (Date.now() - (core.savedAt || Date.now())) / 1000;
      if (away >= 60) {
        const off = core.offlineApply(away);
        if (off && (off.kills > 0 || off.stuck)) state.offline = off;
      }
      refresh();
    }
  };
  document.addEventListener("visibilitychange", bootEngine._visHandler);
  bootEngine._unloadHandler = () => cloudSave(true);
  window.addEventListener("beforeunload", bootEngine._unloadHandler);
}

async function cloudSave(force = false) {
  if (!core || state.saving) return;
  state.saving = true;
  const r = await api.saveGame(JSON.parse(core.save()), core.power(), force);
  state.saving = false;
  if (r.ok) {
    state.lastSavedAt = r.savedAt;
    state.save = { ...(state.save || {}), level: core.state.level, battlePower: core.power(), continent: core.state.continent };
  } else if (r.status !== 429) {
    toast(r.msg || "云端保存失败", "bad");
  }
}

async function afterAuth() {
  const r = await api.getSave();
  if (!r.ok) {
    if (r.status === 401) { setToken(""); state.view = "login"; return; }
    toast(r.msg, "bad");
    state.view = "login";
    return;
  }
  state.save = r.character;
  if (r.character) {
    state.view = "game";
    bootEngine(r.character.state);
  } else {
    state.view = "create";
  }
}

async function boot() {
  try { state.username = localStorage.getItem(NAME_KEY) || ""; } catch (e) { /* ignore */ }
  if (!getToken()) { state.view = "login"; return; }
  await afterAuth();
}

// —— 动作封装（引擎操作 → toast + 刷新 + 存档） ——
function wrap(fn) {
  return async (...args) => {
    if (!core) return { ok: false, msg: "引擎未就绪" };
    const r = fn(...args);
    if (r && typeof r.ok !== "undefined" && r.msg) toast(r.msg, r.ok ? (r.success === false ? "bad" : "good") : "bad");
    refresh();
    return r;
  };
}

const actions = {
  async login(username, password) {
    state.busy = true;
    const r = await api.login(username, password);
    state.busy = false;
    if (!r.ok) return r;
    setToken(r.token);
    try { localStorage.setItem(NAME_KEY, username); } catch (e) { /* ignore */ }
    state.username = username;
    await afterAuth();
    return r;
  },
  async register(username, password) {
    state.busy = true;
    const r = await api.register(username, password);
    state.busy = false;
    if (!r.ok) return r;
    setToken(r.token);
    try { localStorage.setItem(NAME_KEY, username); } catch (e) { /* ignore */ }
    state.username = username;
    state.view = "create";
    return r;
  },
  async createCharacter(cls, name) {
    state.busy = true;
    const init = createInitialState(cls, name);
    const r = await api.createCharacter(init);
    state.busy = false;
    if (!r.ok) { toast(r.msg, "bad"); return r; }
    state.save = { name: init.name, class: init.class, level: 1, battlePower: 0, continent: 1, state: init };
    state.view = "game";
    bootEngine(init);
    toast("创建成功，欢迎来到玛法大陆", "good");
    return r;
  },
  async logout() {
    await cloudSave(true);
    await api.logout();
    setToken("");
    core = null;
    state.snap = null;
    state.save = null;
    state.panel = null;
    stopLoop();
    state.view = "login";
  },
  async saveNow() {
    await cloudSave(true);
    if (state.lastSavedAt) toast("☁ 云存档成功", "good");
  },
  // —— 引擎操作 ——
  equip: wrap((uid) => core.equip(uid)),
  unequip: wrap((slot) => core.unequip(slot)),
  enhance: wrap((uid) => core.enhance(uid)),
  embedGem: wrap((uid, gem) => core.embedGem(uid, gem)),
  combineGems: wrap((kind, lv) => core.combineGems(kind, lv)),
  sellItem: wrap((uid) => core.sellItem(uid)),
  sellStack: wrap((tpl, qty) => core.sellStack(tpl, qty)),
  upgradeTrack: wrap((id) => core.upgradeTrack(id)),
  switchMap: wrap((mapId) => core.switchMap(mapId)),
  unlockContinent: wrap(() => core.unlockContinent()),
  buyItem: wrap((tpl, qty) => core.buyItem(tpl, qty)),
  usePotion(kind) {
    if (!core || !core.session) return;
    if (core.countItem(kind) <= 0) { toast("药水不足", "bad"); return; }
    core.consumeItem(kind, 1);
    core.session.usePotion(kind === "potion_hp" ? "hp" : "mp", kind === "potion_hp" ? 0.35 : 0.4);
    refresh();
  },
  openPanel(p) { state.panel = state.panel === p ? null : p; },
  closePanel() { state.panel = null; },
  closeOffline() { state.offline = null; },
  toast
};

boot();

export function useGame() {
  return { state, actions, onFx };
}
