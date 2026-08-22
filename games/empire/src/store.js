/* 引擎 ↔ Vue 桥接：单例 reactive 快照 + 1s tick + 自动存档 + 离线结算 + 全局弹层状态 */
import { reactive } from "vue";
import { EmpireCore } from "./engine.js";
import { FORMULA as F } from "./data.js";

const state = reactive({
  snap: null,
  tab: "wallet",            // 默认进余额页（银行首页）
  toast: null,              // {text, kind}
  offline: null,            // {seconds, cash, details}
  winShown: false,
  confirmReset: false
});

function setToast(text, kind = "info", ms = 2200) {
  state.toast = { text, kind };
  clearTimeout(setToast._t);
  setToast._t = setTimeout(() => { state.toast = null; }, ms);
}

let engine = new EmpireCore({
  onEvent: (type, payload) => {
    if (type === "win") {
      if (!state.winShown) {
        state.winShown = true;
        setToast("🏆 总资产突破万亿，登顶世界首富！", "good", 4000);
      }
    }
    // 新闻由快照携带（snap.news），不在此处理
  }
});

let lastActiveAt = Date.now();

function saveNow() {
  try {
    localStorage.setItem(F.saveKey, engine.save());
    lastActiveAt = Date.now();
  } catch (e) { /* 存储满等异常忽略 */ }
}

function refresh() {
  state.snap = engine.snapshot();
}

function boot() {
  let saved = null;
  try { saved = localStorage.getItem(F.saveKey); } catch (e) { /* ignore */ }
  // v2 旧档兼容：新 key 无则读旧 key，加载后下次自动存为 v3
  if (!saved) {
    try { saved = localStorage.getItem("empire_save_v2"); } catch (e) { /* ignore */ }
  }
  if (saved) engine.load(saved);

  // 启动离线结算
  const gap = engine.savedAt ? (Date.now() - engine.savedAt) / 1000 : 0;
  if (gap >= F.offlineMinGap) {
    const off = engine.offlineApply(gap);
    if (off && off.cash > 0) state.offline = off;
  }
  lastActiveAt = Date.now();
  refresh();

  // 页面隐藏/恢复
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      saveNow();
    } else {
      const away = (Date.now() - lastActiveAt) / 1000;
      if (away >= 30) {
        const off = engine.offlineApply(away);
        if (off && off.cash > 0) state.offline = off;
      }
      lastActiveAt = Date.now();
    }
  });
  window.addEventListener("beforeunload", saveNow);
}

let saveAcc = 0;
function startLoop() {
  setInterval(() => {
    if (document.hidden) return;
    engine.tick(1);
    refresh();
    saveAcc += 1;
    if (saveAcc >= F.saveInterval) { saveAcc = 0; saveNow(); }
    lastActiveAt = Date.now();
  }, 1000);
}

function wrap(fn) {
  return (...args) => {
    const r = fn(...args);
    if (r && typeof r.ok !== "undefined") {
      if (r.ok) setToast(r.msg || "操作成功", "good");
      else setToast(r.msg || "操作失败", "bad");
    }
    refresh();
    saveNow();
    return r;
  };
}

const actions = {
  buyStock: wrap((id, qty) => engine.buyStock(id, qty)),
  sellStock: wrap((id, qty) => engine.sellStock(id, qty)),
  buyProperty: wrap((id) => engine.buyProperty(id)),
  sellProperty: wrap((id) => engine.sellProperty(id)),
  buyItem: wrap((id, qty) => engine.buyItem(id, qty)),
  sellItem: wrap((id, qty) => engine.sellItem(id, qty)),
  openIndustry: wrap((typeId, name) => engine.openIndustry(typeId, name)),
  industryAction: wrap((uid, action, payload) => engine.industryAction(uid, action, payload)),
  resetGame() {
    try { localStorage.removeItem(F.saveKey); } catch (e) { /* ignore */ }
    engine.reset();
    state.winShown = false;
    state.confirmReset = false;
    refresh();
    setToast("已重置，重新开始", "good");
  },
  exportSave() { return engine.exportSave(); },
  importSave(str) {
    const r = engine.importSave(str);
    if (r.ok) { refresh(); saveNow(); }
    setToast(r.msg, r.ok ? "good" : "bad");
    return r;
  },
  setTab(tab) { state.tab = tab; },
  closeOffline() { state.offline = null; }
};

boot();
startLoop();

export function useGame() {
  return { state, actions, engine };
}
