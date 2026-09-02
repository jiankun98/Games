/*
 * 游戏王引擎 · action.mjs（由 index.js 机械拆分，方法体未改动）
 */

import { NO_EVENT } from "./state.mjs";

export class ActionOps {
    /* ===================== 魔法/陷阱/效果手动发动 ===================== */
    async activateHandSpell(handIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        const card = p.hand[handIdx];
        if (!card || card.type !== "spell")
            return;
        const trigger = this.manualTrigger(card);
        if (!trigger) {
            this._toast("此卡不能发动。");
            return;
        }
        // 发动条件前置校验：不满足则留在手牌（如 黑魔术的幕帘 需手牌有黑魔术师）
        this._activator = "me";
        if (!this._manualCondOk(trigger, card)) {
            this._toast("发动条件不满足。");
            return;
        }
        // 先选目标再上场：无合法目标则留在手牌，避免无效发卡滞留魔陷区
        let targets = null;
        if (trigger.acquireTargets) {
            targets = await trigger.acquireTargets(card, NO_EVENT, this.g);
            if (targets === null) {
                this._toast("没有可指定的对象。");
                return;
            }
        }
        const zi = this.freeSTZones(p)[0];
        if (zi == null) {
            this._toast("魔陷区已满。");
            return;
        }
        p.hand.splice(handIdx, 1);
        p.spellZone[zi] = card;
        card.faceDown = false;
        card.location = "spell";
        card.controller = "me";
        await this.activateAndResolve("me", card, trigger, null, "spell-hand", targets);
    }
    async setSpellTrap(handIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        const card = p.hand[handIdx];
        if (!card || (card.type !== "spell" && card.type !== "trap"))
            return;
        const zi = this.freeSTZones(p)[0];
        if (zi == null) {
            this._toast("魔陷区已满。");
            return;
        }
        p.hand.splice(handIdx, 1);
        p.spellZone[zi] = card;
        card.faceDown = true;
        card.turnSet = s.turn;
        card.location = "spell";
        card.controller = "me";
        this.log(`${this._name("me")} 覆盖了1张魔陷卡。`);
        this.emitView();
    }
    async activateSetTrap(zoneIdx) {
        const s = this.state;
        if (s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.state.me;
        const card = p.spellZone[zoneIdx];
        if (!card || !card.faceDown)
            return;
        if (card.turnSet === s.turn) {
            this._toast("覆盖当回合不能发动陷阱。");
            return;
        }
        const trigger = this.manualTrigger(card);
        if (!trigger) {
            this._toast("此卡不能在此时发动。");
            return;
        }
        this._activator = "me";
        if (!this._manualCondOk(trigger, card)) {
            this._toast("发动条件不满足。");
            return;
        }
        await this.activateAndResolve("me", card, trigger, null, "trap-set");
    }
    async activateMonsterEffect(zoneIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        const m = p.monsterZone[zoneIdx];
        if (!m || !m.effect)
            return;
        if (m.faceDown) {
            this._toast("里侧怪兽不能发动效果。");
            return;
        }
        const trigger = this.manualTrigger(m);
        if (!trigger) {
            this._toast("此怪兽没有可手动发动的效果。");
            return;
        }
        this._activator = "me";
        if (!this._manualCondOk(trigger, m)) {
            this._toast("发动条件不满足。");
            return;
        }
        await this.activateAndResolve("me", m, trigger, null, "monster-effect");
    }
    // 手牌怪兽效果发动（电磁武神/电子龙等手牌特殊召唤）
    async activateHandMonsterEffect(handIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        const card = p.hand[handIdx];
        if (!card || card.type !== "monster" || !card.effect)
            return;
        const trigger = this.manualTrigger(card);
        if (!trigger) {
            this._toast("此怪兽没有可发动的效果。");
            return;
        }
        this._activator = "me";
        if (!this._manualCondOk(trigger, card)) {
            this._toast("发动条件不满足。");
            return;
        }
        await this.activateAndResolve("me", card, trigger, null, "monster-hand-effect");
    }
    manualTrigger(card) {
        if (!card.effect || !card.effect.triggers)
            return null;
        return card.effect.triggers.find((t) => t.event === "manual" && !t.auto) || null;
    }
    // 手动发动的 condition 前置校验（异常视为不满足）
    _manualCondOk(trigger, card) {
        if (!trigger.condition)
            return true;
        try {
            return !!trigger.condition(card, NO_EVENT, this.g);
        }
        catch (e) {
            return false;
        }
    }
    // UI 预检：是否存在可手动发动且当前条件满足的触发（激活时引擎仍会再次校验）
    manualCondOk(card) {
        const trigger = this.manualTrigger(card);
        if (!trigger)
            return false;
        const prev = this._activator;
        this._activator = "me";
        const ok = this._manualCondOk(trigger, card);
        this._activator = prev;
        return ok;
    }
}
