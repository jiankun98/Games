/*
 * 游戏王引擎 · chain.mjs（由 index.js 机械拆分，方法体未改动）
 */

import { spellSpeed } from "./events.mjs";

export class ChainOps {
    _chainTopSpeed() {
        if (!this.state.chain.length)
            return 1;
        return this.state.chain[this.state.chain.length - 1].speed;
    }
    // 响应窗口：双方交替决定是否连锁
    async _openResponse(event) {
        const s = this.state;
        if (s.winner)
            return;
        let responder = this.opp(event.actor);
        let consecPass = 0, guard = 0;
        while (consecPass < 2 && guard++ < 40) {
            const floor = this._chainTopSpeed();
            const chainable = this._chainableCards(responder, event, floor);
            if (!chainable.length) {
                consecPass++;
                responder = this.opp(responder);
                continue;
            }
            let action;
            if (responder === "me")
                action = await this._ask("chain", { event, options: chainable });
            else {
                action = await this.ai.decideChain(responder, event, chainable); // await 兼容异步 AI（如 LlmPlayer），内置 AI 返回纯值不受影响
                await this.delay(this.aiDelay);
            }
            if (!action || action.pass) {
                consecPass++;
                responder = this.opp(responder);
                continue;
            }
            consecPass = 0;
            // 激活被连锁的卡
            const { card, trigger } = action;
            this._activator = responder;
            let targets = [];
            if (trigger.acquireTargets) {
                const t = await trigger.acquireTargets(card, event, this.g);
                if (t === null) {
                    consecPass++;
                    responder = this.opp(responder);
                    continue;
                }
                targets = t;
            }
            if (trigger.cost)
                await trigger.cost(card, event, this.g);
            if (card.type === "trap" && card.faceDown)
                card.faceDown = false;
            const link = { player: responder, card, trigger, targets, event, source: "response", speed: spellSpeed(card), ctx: event };
            s.chain.push(link);
            // 响应发动的表现事件（UI 反馈：栗子球/陷阱等连锁发动有横幅与音效；无卡订阅，不改变游戏逻辑）
            await this.emit({ kind: "activate", actor: responder, card, source: "response" });
            this.log(`${this._name(responder)} 发动 ${card.name}，加入连锁。`);
            this.emitView();
            event = { kind: "activate", actor: responder, card, source: "response", link };
            responder = this.opp(responder);
        }
    }
    _chainableCards(playerKey, event, floor) {
        const out = [];
        const trapsNegated = this._trapsNegated();
        const add = (card) => {
            if (!card.effect || !card.effect.triggers)
                return;
            for (const trigger of card.effect.triggers) {
                if (trigger.auto)
                    continue;
                if (trigger.event !== event.kind)
                    continue;
                if (spellSpeed(card) < floor)
                    continue;
                // 人造人/陷阱无力化：陷阱不能发动（反击陷阱自身仍可？为简洁也禁）
                if (trapsNegated && card.type === "trap")
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
                out.push({ card, trigger });
                break;
            }
        };
        const p = this.state[playerKey];
        for (const c of p.spellZone)
            if (c && c.type === "trap" && c.faceDown && c.turnSet < this.state.turn)
                add(c);
        if (event.kind === "damage_calc")
            for (const c of p.hand)
                add(c);
        // 永续陷阱（已表侧）的 manual 触发不参与响应；手坑仅 damage_calc
        return out;
    }
    // 陷阱是否被无效（人造人表侧存在 或 本回合陷阱无力化）
    _trapsNegated() {
        if (this.state.trapStunTurn === this.state.turn)
            return true;
        for (const key of ["me", "ai"]) {
            for (const m of this.state[key].monsterZone)
                if (m && !m.faceDown && m.trapNegate)
                    return true;
        }
        return false;
    }
    // 手动/自动激活：acquireTargets -> cost -> 入链 -> 开响应窗口 -> 结算
    // preTargets：调用方已在入链前选好目标（用于手牌魔法的"先选目标再上场"），避免无效发卡滞留场上
    async activateAndResolve(player, card, trigger, event, source, preTargets) {
        const s = this.state;
        if (s.winner)
            return false;
        this._activator = player;
        let targets = preTargets || [];
        if (!preTargets && trigger.acquireTargets) {
            const t = await trigger.acquireTargets(card, event, this.g);
            if (t === null)
                return false;
            targets = t;
        }
        if (trigger.cost)
            await trigger.cost(card, event, this.g);
        if (card.type === "trap" && card.faceDown)
            card.faceDown = false;
        // 发动表现事件（UI 反馈用；无卡订阅该事件，不改变游戏逻辑）
        await this.emit({ kind: "activate", actor: player, card, source });
        if (s.winner)
            return false;
        const link = { player, card, trigger, targets, event, source, speed: spellSpeed(card), ctx: event || {} };
        s.chain.push(link);
        this.log(`${this._name(player)} 发动 ${card.name}。`);
        this.emitView();
        await this._openResponse({ kind: "activate", actor: player, card, source, link });
        if (s.chain.length)
            await this._resolveChain();
        return true;
    }
    async _resolveChain() {
        const s = this.state;
        s.resolving = true;
        this.emitView();
        while (s.chain.length) {
            const link = s.chain.pop();
            if (s.winner)
                break;
            this._currentEffectType = link.card ? link.card.type : null;
            try {
                if (link.trigger && link.trigger.resolve)
                    await link.trigger.resolve(link.card, link.ctx, this.g, link.targets);
            }
            catch (e) {
                this.log("效果执行出错：" + (e instanceof Error ? e.message : String(e)));
            }
            this._currentEffectType = null;
            this._afterResolve(link);
            if (s.winner)
                break;
        }
        s.resolving = false;
        s.lastEvent = null;
        this.emitView();
    }
    _afterResolve(link) {
        // 通常/反击 魔陷结算后送墓（永续/装备/场地留存）
        const c = link.card;
        if ((c.type === "spell" || c.type === "trap") && (c.subtype === "通常" || c.subtype === "反击")) {
            const z = this._findZone(c);
            if (z && z.kind === "spell") {
                this.state[z.key].spellZone[z.idx] = null;
                this.state[z.key].graveyard.push(c);
                c.location = "grave";
            }
        }
    }
}
