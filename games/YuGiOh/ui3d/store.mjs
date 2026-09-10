/*
 * 游戏王 3D UI · 共享可变状态（单一事实源）
 *  原单文件内联脚本的顶层 let 变量收拢为 S 对象，各模块 import { S } 读写同一份状态。
 */
export const PACE_PRESETS = {
  fast: { label: "快速", pace: 120, promptDelay: 100 },
  normal: { label: "标准", pace: 350, promptDelay: 220 },
  slow: { label: "悠闲", pace: 650, promptDelay: 400 },
};
export const PACE_SCALE = { fast: 0.55, normal: 1, slow: 1.3 }; // 事件通知停留时长随节奏档缩放

/* 对玩家视角应隐藏的卡：AI 的手牌始终未知；AI 的里侧卡（场上覆盖）未知 */
export function hiddenForMe(card, slot) {
  if (!card || !slot || slot.who !== "ai") return false;
  return slot.kind === "hand" || !!card.faceDown;
}

const S = {
  duel: null, // 当前 Duel 实例
  mode: null, // 'attack' | 'tribute' | null（多步操作模式）
  attackZone: null,
  tributeHandIdx: null,
  tributePool: [],
  startLP: 8000, // 本局初始 LP（血条百分比分母，来自 duel.startingLP）
  menuOpen: false,
  deckChoice: "dragon", // decks.mjs 预设 key
  aiDeckChoice: "dragon",
  opponentMode: (() => {
    try {
      return localStorage.getItem("ygo.opp") === "llm" ? "llm" : "ai";
    } catch (e) {
      return "ai";
    }
  })(),
  paceMode: (() => {
    try {
      return localStorage.getItem("ygoPace2") || "slow";
    } catch (e) {
      return "slow";
    }
  })(),
  llmPlayer: null, // LlmPlayer 单例
  onAgain: null, // 结算弹窗"再来一局"回调（main 注入 newGame）
};
if (!PACE_PRESETS[S.paceMode]) S.paceMode = "slow";

export function saveOppMode(m) {
  S.opponentMode = m;
  try {
    localStorage.setItem("ygo.opp", m);
  } catch (e) {}
}

export { S };
