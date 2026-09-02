/*
 * 游戏王·决斗规则引擎 —— 门面（由 index.js 拆分而来，行为不变）
 *  引擎只负责：回合/阶段流、LP、场地、卡牌状态记录、通用规则（召唤/祭品/战斗公式/连锁/咒文速度/胜负/手卡上限）、
 *  事件总线 emit、通用触发器查询、激活生命周期 activateAndResolve、响应窗口 openResponse、连锁结算、原语 API g。
 *  引擎不认识任何具体卡：所有卡牌特殊处理都在 cards.mjs 的 triggers 与 continuous 中。
 *  AI 决策全部在 ai-player.mjs（AiPlayer），引擎仅在 AI 回合与决策点回调，双方通过公开接口协作。
 *
 *  对外：export Duel（boot.mjs 另挂 window.Duel 供经典页面使用）。界面 new Duel(config, callbacks)。
 */
import { buildDeck, buildExtra } from "../cards.mjs";
import { AiPlayer } from "../ai-player.mjs";
import { apiProto, ApiOps } from "./api.mjs";
import { StateOps } from "./state.mjs";
import { PromptOps } from "./prompt.mjs";
import { EventsOps } from "./events.mjs";
import { ChainOps } from "./chain.mjs";
import { TurnOps } from "./turn.mjs";
import { SummonOps } from "./summon.mjs";
import { ActionOps } from "./action.mjs";
import { BattleOps } from "./battle.mjs";

class Duel {
    /**
     * 构造函数
     * @param config 游戏配置（含 AI 驱动，默认 AiPlayer）
     * @param callbacks 界面回调
     */
    constructor(config = {}, callbacks = {}) {
        this._lastPlayerActionAt = 0;
        this._await = null;
        this._log = [];
        this._activator = null;
        this._dmgEvent = null;
        this._currentEffectType = null;
        this._depth = 0;
        // 原语方法（通过原型共享）；方法内 this 指向挂载了 _duel 的 g 对象
        this._apiProto = apiProto;
        this.cb = callbacks;
        this.rng = config.rng || Math.random;
        this.playerPreset = config.playerPreset || "classic";
        this.aiPreset = config.aiPreset || "classic";
        this.playerDeckIds = config.playerDeck || buildDeck(this.playerPreset);
        this.aiDeckIds = config.aiDeck || buildDeck(this.aiPreset);
        this.playerExtraIds = config.playerExtra || buildExtra(this.playerPreset);
        this.aiExtraIds = config.aiExtra || buildExtra(this.aiPreset);
        this.startingLP = config.lp || 8000;
        this.aiDelay = config.aiDelay || 650;
        this.pace = config.pace ?? 350;
        this.promptDelay = config.promptDelay ?? 220;
        this.g = this._buildApi();
        this.ai = config.ai || new AiPlayer(this);
    }
    /* ===================== 生命周期 ===================== */
    start() {
        this.state = this._initState();
        this.log("决斗开始！双方各 8000 LP，先手第一回合不抽卡、不能攻击。");
        this.emit({ kind: "game_start" });
        this._beginTurn();
    }
}

// 各子系统以"方法集类"拆分（原型方法逐个拷贝到 Duel.prototype，this 语义与单体版一致）
const OPS = [StateOps, PromptOps, ApiOps, EventsOps, ChainOps, TurnOps, SummonOps, ActionOps, BattleOps];
for (const ops of OPS) {
    for (const name of Object.getOwnPropertyNames(ops.prototype)) {
        if (name !== "constructor")
            Object.defineProperty(Duel.prototype, name, Object.getOwnPropertyDescriptor(ops.prototype, name));
    }
}

export { Duel };
