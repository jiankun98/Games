/*
 * 游戏王引擎 · 浏览器兼容入口（供经典 <script> 全局页面使用）
 *  组装全部模块并挂到 window（YGO_* / AiPlayer / LlmPlayer / Duel），完成后派发 "ygo-engine-ready"。
 *  新代码（ui3d 等）请直接 import 各模块，不要依赖本文件。
 */
import { CARDS, CARD_BY_ID, DECK_PRESETS, buildDeck, buildExtra } from "../cards.mjs";
import { AiPlayer } from "../ai-player.mjs";
import { LlmPlayer, YGO_LLM } from "../llm-player.mjs";
import { Duel } from "./duel.mjs";

window.YGO_CARDS = CARDS;
window.YGO_CARD_BY_ID = CARD_BY_ID;
window.YGO_BUILD_DECK = buildDeck;
window.YGO_BUILD_EXTRA = buildExtra;
window.YGO_DECK_PRESETS = Object.keys(DECK_PRESETS);
window.AiPlayer = AiPlayer;
window.LlmPlayer = LlmPlayer;
window.YGO_LLM = YGO_LLM;
window.Duel = Duel;

document.dispatchEvent(new CustomEvent("ygo-engine-ready"));
