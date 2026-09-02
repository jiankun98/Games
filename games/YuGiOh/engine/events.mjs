/*
 * 游戏王引擎 · events.mjs（由 index.js 机械拆分，方法体未改动）
 */

import { RESPONSE_EVENTS } from "./state.mjs";

export function spellSpeed(card) {
    const e = card.effect;
    if (e && e.speed)
        return e.speed;
    if (card.type === "trap")
        return card.subtype === "反击" ? 3 : 2;
    return 1;
}

export class EventsOps {
    /* ===================== 事件总线 ===================== */
    async emit(event) {
        if (this.state.winner)
            return;
        if (this._depth > 30) {
            this.log("（事件嵌套过深，截断）");
            return;
        }
        this._depth++;
        this.state.lastEvent = event;
        // 表现层钩子：UI 可消费事件做动画/提示，并可返回 Promise 控制节奏（不改变游戏逻辑）
        if (this.cb.onEvent) {
            try {
                const r = this.cb.onEvent(event);
                if (r && typeof r.then === "function")
                    await r;
            }
            catch (e) { /* 表现层异常不影响引擎 */ }
        }
        // 1. 触发型（auto）效果：自动入链、各自结算
        const autos = this._collectTriggers(event, true);
        for (const a of autos) {
            if (this.state.winner)
                break;
            await this.activateAndResolve(a.player, a.card, a.trigger, event, "auto");
        }
        // 2. 响应窗口：玩家可连锁响应型触发器
        if (RESPONSE_EVENTS.has(event.kind)) {
            await this._openResponse(event);
            if (this.state.chain.length)
                await this._resolveChain();
        }
        this._depth--;
    }
    // 通用触发器查询：遍历双方手牌/场上/墓地，匹配 event + auto + condition
    _collectTriggers(event, auto) {
        const out = [];
        for (const playerKey of ["me", "ai"]) {
            const p = this.state[playerKey];
            const cards = [...p.hand, ...p.monsterZone, ...p.spellZone, p.fieldZone, ...p.graveyard].filter((c) => !!c);
            for (const card of cards) {
                if (!card.effect || !card.effect.triggers)
                    continue;
                for (const trigger of card.effect.triggers) {
                    if (trigger.event !== event.kind)
                        continue;
                    if (!!trigger.auto !== !!auto)
                        continue;
                    if (trigger.condition) {
                        try {
                            if (!trigger.condition(card, event, this.g))
                                continue;
                        }
                        catch (e) {
                            continue;
                        }
                    }
                    out.push({ player: playerKey, card, trigger });
                    break;
                }
            }
        }
        out.sort((a, b) => (a.player === this.state.turnPlayer ? 0 : 1) - (b.player === this.state.turnPlayer ? 0 : 1));
        return out;
    }
}
