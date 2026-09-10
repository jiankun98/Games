/*
 * 游戏王 3D 对局界面 · 装配入口
 *  直接 import 引擎（不经 window 全局），创建 Duel、接回调、绑定按钮、注入点击路由。
 */
import { Duel } from "../engine/duel.mjs";
import { AiPlayer } from "../ai-player.mjs";
import { LlmPlayer, YGO_LLM } from "../llm-player.mjs";
import { buildMainDeck, buildExtraDeck } from "../decks.mjs";
import { S, PACE_PRESETS, saveOppMode } from "./store.mjs";
import { IC } from "./labels.mjs";
import { sfx, toggleSfx } from "./sfx.mjs";
import { sync3D, resetScene3D, setClickHandler, projectCard3D, debugPick, chipEls as sceneChipEls, cardMeshes as sceneCardMeshes } from "./scene.mjs";
import { render, closeMenu, exitMode, openDeckSelect, openListModal, openMenu, toggleTribute, pushLog, toast, showHelp, resetHud, startTribute } from "./hud.mjs";
import { fxEvent } from "./fxevent.mjs";
const $ = (id) => document.getElementById(id);

/* 大模型对手：单例 LlmPlayer（5 方法契约，失败自动回退内置 AI） */
function ensureLlmPlayer() {
  if (!S.llmPlayer) {
    S.llmPlayer = new LlmPlayer();
    S.llmPlayer.onThinking = (on) => $("llm-think").classList.toggle("show", !!on);
    S.llmPlayer.onWhy = (w) => pushLog("大模型：" + w, true);
    S.llmPlayer.onFallback = (m) => toast(m);
  }
  return S.llmPlayer;
}

/* 3D 拾取路由（原 click 监听体内的分发逻辑，改由 scene 回调） */
setClickHandler((g) => {
  if (!g) {
    if (S.menuOpen) closeMenu();
    else if (S.mode) exitMode(); // 点空地退出攻击/祭品/放置模式（与 Esc 等效）
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
  if (g.userData.zone) return; // 场地区域光格：仅作为拖拽落点判定，点击无操作
  const slot = g.userData.slot;
  const card = g.userData.card;
  if (!slot) return;
  if (S.mode === "attack") {
    if (slot.who === "ai" && slot.kind === "monster") {
      S.duel.declareAttack(S.attackZone, slot.idx);
      exitMode();
    } else toast("请点击对方的怪兽选择攻击目标");
    return;
  }
  if (S.mode === "tribute") {
    if (slot.who === "me" && slot.kind === "monster") toggleTribute(slot.idx);
    else toast("请点击自己场上的怪兽作为祭品");
    return;
  }
  // 对方手牌只提示不可查看，不弹操作菜单（防信息泄露与越权操作）
  if (slot.who === "ai" && slot.kind === "hand") {
    toast("对方的手牌不可查看");
    return;
  }
  openMenu(card, slot, g);
});

function newGame() {
  // 卡组来自 decks.mjs 的 30 套预设，直接以 id 数组交给引擎（不再依赖 cards.mjs 的 preset 名）
  const cfg = {
    playerDeck: buildMainDeck(S.deckChoice),
    playerExtra: buildExtraDeck(S.deckChoice),
    aiDeck: buildMainDeck(S.aiDeckChoice),
    aiExtra: buildExtraDeck(S.aiDeckChoice),
    pace: PACE_PRESETS[S.paceMode].pace,
    promptDelay: PACE_PRESETS[S.paceMode].promptDelay,
    aiDelay: S.opponentMode === "llm" ? 150 : 650, // 大模型模式下思考耗时本身构成节奏
  };
  S.startLP = cfg.lp || 8000; // 血条百分比分母（resetHud 需在设置后调用）
  resetHud();
  resetScene3D();
  S.duel = new Duel(
    cfg,
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
    pushLog("本局对手：大模型（" + (YGO_LLM.loadCfg().model || "未配置") + "）", true);
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
// 拖拽召唤的桥接：高星怪兽拖入场上时转入祭品模式（scene 不反向依赖 hud）
S.dragBridge = { startTribute };

// 调试句柄（控制台/自动化测试用）
window.__ygo3d = { S, projectCard3D, debugPick, sceneChipEls, sceneCardMeshes };
// 开局先选卡组：面板内"开始对局"经 S.onAgain 进入 newGame
openDeckSelect();
