/*
 * 游戏王引擎 · summon.mjs（由 index.js 机械拆分，方法体未改动）
 */

// 召唤规则：通常/覆盖/祭品/翻转召唤、表示形式切换、召唤事件流

export class SummonOps {
    /* ===================== 召唤（玩家动作，引擎执行通用规则） ===================== */
    async normalSummon(handIdx, zoneIdx, pos = "atk") {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        if (p.normalSummonUsed) {
            this._toast("本回合已通常召唤过。");
            return;
        }
        const card = p.hand[handIdx];
        if (!card || card.type !== "monster")
            return;
        if ((card.level || 0) >= 5) {
            this._toast("高星怪兽请使用祭品召唤。");
            return;
        }
        if (zoneIdx == null)
            zoneIdx = this.freeMonsterZones(p)[0];
        if (zoneIdx == null || p.monsterZone[zoneIdx])
            return;
        p.hand.splice(handIdx, 1);
        this.placeMonster(p, card, zoneIdx, pos, false);
        p.normalSummonUsed = true;
        this.log(`${this._name("me")} 通常召唤 ${card.name}（${pos === "atk" ? "攻击表示" : "守备表示"}）。`);
        await this.doSummon("me", card, "normal");
    }
    async setMonster(handIdx, zoneIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        if (p.normalSummonUsed) {
            this._toast("本回合已通常召唤过。");
            return;
        }
        const card = p.hand[handIdx];
        if (!card || card.type !== "monster")
            return;
        if ((card.level || 0) >= 5) {
            this._toast("高星怪兽请使用祭品召唤。");
            return;
        }
        if (zoneIdx == null)
            zoneIdx = this.freeMonsterZones(p)[0];
        if (zoneIdx == null || p.monsterZone[zoneIdx])
            return;
        p.hand.splice(handIdx, 1);
        this.placeMonster(p, card, zoneIdx, "def", true);
        p.normalSummonUsed = true;
        p.setThisTurn[zoneIdx] = true;
        this.log(`${this._name("me")} 覆盖了1只怪兽。`);
        await this.doSummon("me", card, "set");
    }
    async tributeSummon(handIdx, tributes, zoneIdx, pos = "atk") {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        if (p.normalSummonUsed) {
            this._toast("本回合已通常召唤过。");
            return;
        }
        const card = p.hand[handIdx];
        if (!card || card.type !== "monster")
            return;
        const need = (card.level || 0) >= 7 ? 2 : 1;
        if (!tributes || tributes.length !== need) {
            this._toast(`需要 ${need} 只祭品。`);
            return;
        }
        for (const ti of tributes)
            if (!p.monsterZone[ti])
                return;
        for (const ti of tributes) {
            await this.tribute(p.monsterZone[ti]);
        }
        p.hand.splice(handIdx, 1);
        if (zoneIdx == null)
            zoneIdx = this.freeMonsterZones(p)[0];
        if (zoneIdx == null)
            return;
        this.placeMonster(p, card, zoneIdx, pos, false);
        p.normalSummonUsed = true;
        this.log(`${this._name("me")} 祭品召唤 ${card.name}！`);
        await this.doSummon("me", card, "tribute");
    }
    async flipSummon(zoneIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        const m = p.monsterZone[zoneIdx];
        if (!m || !m.faceDown)
            return;
        if (m.turnSet === s.turn) {
            this._toast("覆盖当回合不能翻转召唤。");
            return;
        }
        if (p.positionChanged[zoneIdx]) {
            this._toast("本回合已改变过表示形式。");
            return;
        }
        m.faceDown = false;
        m.position = "atk";
        p.positionChanged[zoneIdx] = true;
        this.log(`${this._name("me")} 翻转召唤 ${m.name}。`);
        await this.doSummon("me", m, "flip");
        if (!s.winner && m.effect && this._hasFlip(m))
            await this.emit({ kind: "flip", monster: m, owner: "me", by: "flipSummon" });
    }
    async changePosition(zoneIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        const m = p.monsterZone[zoneIdx];
        if (!m || m.faceDown)
            return;
        if (m.turnSummoned === s.turn) {
            this._toast("召唤当回合不能切换表示。");
            return;
        }
        if (p.positionChanged[zoneIdx]) {
            this._toast("本回合已改变过表示形式。");
            return;
        }
        m.position = m.position === "atk" ? "def" : "atk";
        p.positionChanged[zoneIdx] = true;
        this.log(`${m.name} 切换为 ${m.position === "atk" ? "攻击" : "守备"}表示。`);
        await this.emit({ kind: "position_change", monster: m, owner: "me", from: m.position === "atk" ? "def" : "atk", to: m.position });
        this.emitView();
    }
    placeMonster(p, card, zoneIdx, pos, faceDown) {
        card.position = pos;
        card.faceDown = faceDown;
        card.turnSummoned = this.state.turn;
        card.turnSet = faceDown ? this.state.turn : -1;
        card.controller = this._ownerKey(p);
        card.location = "monster";
        card.equipped = [];
        p.monsterZone[zoneIdx] = card;
    }
    async doSummon(player, mon, kind) {
        this.emitView();
        // summon_attempt（神之宣告可在此无效召唤）-> summon（召唤成功后的响应）
        // 注意：召唤类型放 summonKind，避免覆盖事件 kind（历史 bug：{kind:"summon", kind} 会让事件 kind 变成召唤类型）
        await this.emit({ kind: "summon_attempt", actor: player, monster: mon, summonKind: kind });
        if (this.state.winner)
            return;
        if (!this.isValid(mon))
            return; // 召唤被无效
        await this.emit({ kind: "summon", actor: player, monster: mon, summonKind: kind, hidden: mon.faceDown });
    }
}
