/*
 * 游戏王 3D 对局界面 · 装配入口
 *  直接 import 引擎（不经 window 全局），创建 Duel、接回调、绑定按钮、注入点击路由。
 */
import { Duel } from "../engine/duel.mjs";
import { AiPlayer } from "../ai-player.mjs";
import { LlmPlayer, YGO_LLM } from "../llm-player.mjs";
import { S, PACE_PRESETS, saveOppMode } from "./store.mjs";
import { IC } from "./labels.mjs";
import { sfx, toggleSfx } from "./sfx.mjs";
import { sync3D, resetScene3D, setClickHandler, projectCard3D, debugPick, chipEls as sceneChipEls, cardMeshes as sceneCardMeshes } from "./scene.mjs";
import { render, closeMenu, exitMode, openDeckSelect, openListModal, openMenu, toggleTribute, pushLog, toast, showHelp, resetHud } from "./hud.mjs";
import { fxEvent } from "./fxevent.mjs";
const $ = (id) => document.getElementById(id);

/* 大模型对手：单例 LlmPlayer（5 方法契约，失败自动回退内置 AI） */
function ensureLlmPlayer() {
  if (!S.llmPlayer) {
    S.llmPlayer = new LlmPlayer();
    S.llmPlayer.onThinking = (on) => $("llm-think").classList.toggle("show", !!on);
    S.llmPlayer.onWhy = (w) => pushLog("🤖 " + w, true);
    S.llmPlayer.onFallback = (m) => toast(m);
  }
  return S.llmPlayer;
}

/* 3D 拾取路由（原 click 监听体内的分发逻辑，改由 scene 回调） */
setClickHandler((g) => {
  if (!g) {
    if (S.menuOpen) closeMenu();
    return;
  }
  if (g.userData.key) {
    // 卡组/墓地堆：查看列表
    const [kind, who] = g.userData.key.split(":");
    const p = S.duel.state[who];
    if (kind === "deck") toast("卡组不可查看");
    else if (kind === "extra") openListModal("额外卡组", p.extra);
    else if (kind === "banished") openListModal("除外", p.banished);
    else openListModal("墓地", p.graveyard);
    return;
  }
  const slot = g.userData.slot;
  const card = g.userData.card;
  if (S.mode === "attack" && slot.who === "ai" && slot.kind === "monster") {
    S.duel.declareAttack(S.attackZone, slot.idx);
    exitMode();
    return;
  }
  if (S.mode === "tribute" && slot.who === "me" && slot.kind === "monster") {
    toggleTribute(slot.idx);
    return;
  }
  openMenu(card, slot, g);
});

function newGame() {
  resetHud();
  resetScene3D();
  S.duel = new Duel(
    {
      playerPreset: S.deckChoice,
      aiPreset: S.aiDeckChoice,
      pace: PACE_PRESETS[S.paceMode].pace,
      promptDelay: PACE_PRESETS[S.paceMode].promptDelay,
      aiDelay: S.opponentMode === "llm" ? 150 : 650, // 大模型模式下思考耗时本身构成节奏
    },
    {
      onState: () => {
        render();
        sync3D();
      },
      onLog: (m) => pushLog(m),
      onToast: (m) => toast(m),
      onEvent: (ev) => fxEvent(ev),
      onGameOver: (who) => {
        sfx(who === "me" ? "win" : who === "draw" ? "chain" : "lose");
      },
    },
  );
  if (S.opponentMode === "llm") {
    // 引擎构造后再挂载自定义 AI（start() 前生效）；内置 AiPlayer 作为兜底
    const llm = ensureLlmPlayer();
    llm._fallbackToasted = false;
    llm.attach(S.duel, new AiPlayer(S.duel));
    S.duel.ai = llm;
    pushLog("本局对手：🤖 大模型（" + (YGO_LLM.loadCfg().model || "未配置") + "）", true);
  }
  S.duel.start();
}

// 事件绑定
$("btn-new").onclick = () => openDeckSelect();
const canAct = () =>
  S.duel &&
  S.duel.state &&
  S.duel.state.turnPlayer === "me" &&
  !S.duel.state.pending &&
  !S.duel.state.resolving &&
  !S.duel.state.winner;
$("tb-main").onclick = () => {
  if (canAct() && ["main1", "battle", "main2"].includes(S.duel.state.phase)) S.duel.nextPhase();
};
$("tb-alt").onclick = () => {
  if (canAct() && S.duel.state.phase === "battle") S.duel.nextPhase();
};
$("tb-end").onclick = () => {
  if (canAct() && ["main1", "battle"].includes(S.duel.state.phase)) S.duel.endTurn();
};
// 头部图标按钮：统一注入内联 SVG
$("btn-pace").innerHTML = IC.pace;
$("btn-sfx").innerHTML = IC.sfxOn;
$("btn-log").innerHTML = IC.log;
$("btn-help").innerHTML = IC.help;
$("btn-log-close").innerHTML = IC.close;
$("btn-sfx").onclick = () => {
  const on = toggleSfx();
  $("btn-sfx").innerHTML = on ? IC.sfxOn : IC.sfxOff;
  if (on) sfx("turn");
};
$("btn-pace").onclick = () => {
  const order = ["fast", "normal", "slow"];
  S.paceMode = order[(order.indexOf(S.paceMode) + 1) % order.length];
  try {
    localStorage.setItem("ygoPace2", S.paceMode);
  } catch (e) {
    /* 忽略存储失败 */
  }
  $("btn-pace").title = "游戏节奏：" + PACE_PRESETS[S.paceMode].label;
  toast("游戏节奏：" + PACE_PRESETS[S.paceMode].label);
};
$("btn-pace").title = "游戏节奏：" + PACE_PRESETS[S.paceMode].label;
$("btn-log").onclick = () => $("log-panel").classList.toggle("show");
$("btn-log-close").onclick = () => $("log-panel").classList.remove("show");
$("btn-help").onclick = () => showHelp();
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeMenu();
    if (S.mode) exitMode();
    $("log-panel").classList.remove("show");
    return;
  }
  // 快捷键：B 推进阶段（进入战斗/主阶段2）、P 结束回合（与按钮角标一致）
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey) return;
  const tag = (e.target && e.target.tagName) || "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
  const k = e.key.toLowerCase();
  const s = S.duel && S.duel.state;
  if (!s || !canAct()) return;
  if (k === "b" && ["main1", "battle", "main2"].includes(s.phase)) {
    closeMenu();
    S.duel.nextPhase();
  } else if (k === "p" && ["main1", "battle"].includes(s.phase)) {
    closeMenu();
    S.duel.endTurn();
  }
});

S.onAgain = newGame;

// 调试句柄（控制台/自动化测试用）
window.__ygo3d = { S, projectCard3D, debugPick, sceneChipEls, sceneCardMeshes };
newGame();
