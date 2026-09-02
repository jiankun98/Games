/*
 * 游戏王引擎 · api.mjs（由 index.js 机械拆分，方法体未改动）
 */

// 原语 API：卡牌效果唯一 mutate 通道（apiProto 供 Duel 构造器挂到 this._apiProto）

export const apiProto = {
    opponent(player) { return this._duel.opp(player); },
    monsters(p) { return this._duel.monsters(this._duel.state[p]); },
    spells(p) { return this._duel.spells(this._duel.state[p]); },
    allMonsters() { return this._duel.allMonsters(); },
    field(p) { return this._duel.state[p].fieldZone; },
    graveyard(p) { return this._duel.state[p].graveyard; },
    deck(p) { return this._duel.state[p].deck; },
    hand(p) { return this._duel.state[p].hand; },
    stats(mon) { return this._duel.stats(mon); },
    countST(p) { return this._duel.countST(this._duel.state[p]); },
    findCard(uid) { return this._duel._findCard(uid); },
    isValid(card) { return this._duel.isValid(card); },
    controller(card) { return this._duel.controller(card); },
    playerOf(card) { return this._duel.playerOf(card); },
    extra(player) { return this._duel.state[player].extra; },
    hasMaterial(player, cid) { return this._duel._hasMaterial(player, cid); },
    lp(player) { return this._duel.state[player].lp; },
    // 查询 end
    async destroy(card) { return this._duel._destroy(card, "effect"); },
    async destroyST(card) { return this._duel._destroy(card, "effect"); },
    async banish(card) { return this._duel._banish(card); },
    async banishFromDeck(card, player) { return this._duel._banishFromDeck(card, player); },
    async bounce(card) { return this._duel._bounce(card); },
    async sendToGrave(card, from, reason) { return this._duel._sendToGrave(card, from, reason || "effect"); },
    async tribute(card) { return this._duel.tribute(card); },
    async negateSummon(mon) { return this._duel._negateSummon(mon); },
    async damage(player, n, reason) { return this._duel._damage(player, n, reason || "effect"); },
    async draw(player, n) { return this._duel._draw(player, n); },
    async discard(player, n) { return this._duel._discard(player, n); },
    async discardCard(card) { return this._duel._discardCard(card); },
    payLp(player, n) { const p = this._duel.state[player]; p.lp -= n; this._duel.log(`${this._duel._name(player)} 支付 ${n} LP。`); this._duel.emitView(); this._duel._checkWin(); },
    async specialSummon(card, player, pos, from) { return this._duel._specialSummon(card, player, pos, from); },
    async fusionSummon(fusionCard, player) { return this._duel._fusionSummon(fusionCard, player); },
    async addToHand(card, player) { return this._duel._addToHand(card, player); },
    async recoverToHand(card, player) { return this._duel._addToHand(card, player); },
    async changePosition(mon, pos) { return this._duel._changePosition(mon, pos); },
    async changeControl(mon, to, until) { return this._duel._changeControl(mon, to, until); },
    async flipUp(mon) { return this._duel._flipUp(mon, true); },
    async equip(equipCard, target) { return this._duel._equip(equipCard, target); },
    async setField(card) { return this._duel._setField(card); },
    linkCards(a, b) { a.linkPartner = b; b.linkPartner = a; },
    setAttackLock(player, turns) { this._duel.state[player].attackLockTurns = turns; this._duel.log(`光之护封剑：${this._duel._name(this._duel.opp(player))} ${turns} 回合内不能攻击。`); },
    swapAtkDefThisTurn() { this._duel.state.swappedAtkDefTurn = this._duel.state.turn; this._duel.log("盾与剑：场上怪兽原本攻守互换（本回合）。"); this._duel.emitView(); },
    setNoBattleDamage(player) { this._duel.state[player].noBattleDamageTurn = true; this._duel.log(`${this._duel._name(player)} 本回合不受战斗伤害。`); },
    setTrapStunThisTurn() { this._duel.state.trapStunTurn = this._duel.state.turn; this._duel.log("陷阱无力化：本回合陷阱效果无效。"); },
    negateAttack(endBattle) { this._duel.state.attackNegated = true; if (endBattle)
        this._duel.state.endBattlePhase = true; },
    negateBattleDamage() { if (this._duel._dmgEvent)
        this._duel._dmgEvent.damage = 0; },
    negate(link) { return this._duel._negate(link); },
    async askTargets(msg, options, count) { return this._duel._askTargets(msg, options, count); },
};

export class ApiOps {
    /* ===================== 原语 API（卡牌唯一 mutate 通道） ===================== */
    _buildApi() {
        const g = {
            get activator() { return this._duel._activator; },
            get turn() { return this._duel.state.turn; },
            get phase() { return this._duel.state.phase; },
        };
        g._duel = this;
        Object.setPrototypeOf(g, this._apiProto);
        return g;
    }
    /* ===================== 原语内部实现 ===================== */
    _immuneNow(card) { return !!card.trapImmune && this._currentEffectType === "trap"; }
    async _destroy(card, reason) {
        const z = this._findZone(card);
        if (!z)
            return;
        if (this._immuneNow(card)) {
            this.log(`${card.name} 不受陷阱影响。`);
            return;
        }
        const p = this.state[z.key];
        // 光之护封剑离场：解除攻击封锁
        if (card.cid === "swords" && p.attackLockTurns > 0) {
            p.attackLockTurns = 0;
            this.log("光之护封剑离场，攻击封锁解除。");
        }
        if (z.kind === "monster") {
            for (const eq of [...card.equipped])
                await this._sendToGrave(eq, "field", reason);
            card.equipped = [];
        }
        if (z.kind === "field")
            p.fieldZone = null;
        else if (z.kind === "spell")
            p.spellZone[z.idx] = null;
        else
            p.monsterZone[z.idx] = null;
        // 场地链接（活死人）：任一离场则破坏另一个
        if (card.linkPartner) {
            const partner = card.linkPartner;
            card.linkPartner = null;
            if (this._findZone(partner))
                await this._destroy(partner, reason);
        }
        card.controlOriginalController = null;
        await this._sendToGrave(card, "field", reason);
    }
    async _banish(card) {
        const z = this._findZone(card);
        if (!z)
            return;
        if (this._immuneNow(card)) {
            this.log(`${card.name} 不受陷阱影响。`);
            return;
        }
        const p = this.state[z.key];
        // 光之护封剑离场：解除攻击封锁
        if (card.cid === "swords" && p.attackLockTurns > 0) {
            p.attackLockTurns = 0;
            this.log("光之护封剑离场，攻击封锁解除。");
        }
        if (z.kind === "monster") {
            for (const eq of [...card.equipped])
                await this._sendToGrave(eq, "field", "effect");
            card.equipped = [];
        }
        if (z.kind === "field")
            p.fieldZone = null;
        else if (z.kind === "spell")
            p.spellZone[z.idx] = null;
        else
            p.monsterZone[z.idx] = null;
        if (card.linkPartner) {
            const partner = card.linkPartner;
            card.linkPartner = null;
            if (this._findZone(partner))
                await this._destroy(partner, "effect");
        }
        card.controlOriginalController = null;
        const owner = this._ownerOf(card);
        this.state[owner].banished.push(card);
        card.location = "banished";
        card.controller = owner;
        await this.emit({ kind: "banish", card, owner, from: "field" });
    }
    async _bounce(card) {
        const z = this._findZone(card);
        if (!z)
            return;
        if (this._immuneNow(card)) {
            this.log(`${card.name} 不受陷阱影响。`);
            return;
        }
        const p = this.state[z.key];
        if (z.kind === "monster") {
            for (const eq of [...card.equipped])
                await this._sendToGrave(eq, "field", "effect");
            card.equipped = [];
        }
        if (z.kind === "monster")
            p.monsterZone[z.idx] = null;
        else
            p.spellZone[z.idx] = null;
        card.controlOriginalController = null;
        if (card.linkPartner) {
            const partner = card.linkPartner;
            card.linkPartner = null;
            if (this._findZone(partner))
                await this._destroy(partner, "effect");
        }
        const owner = this._ownerOf(card);
        card.faceDown = false;
        card.position = "atk";
        card.location = "hand";
        card.controller = owner;
        this.state[owner].hand.push(card);
        await this.emit({ kind: "return_to_hand", card, owner, from: "field" });
    }
    async _sendToGrave(card, from, reason) {
        const owner = this._ownerOf(card);
        const p = this.state[owner];
        this._removeFromArr(p.hand, card);
        this._removeFromArr(p.deck, card);
        this._removeFromArr(p.banished, card);
        p.graveyard.push(card);
        card.location = "grave";
        card.controller = owner;
        await this.emit({ kind: "sent_to_grave", card, owner, from, reason });
    }
    async tribute(card) {
        const z = this._findZone(card);
        if (!z)
            return;
        const p = this.state[z.key];
        if (z.kind === "monster") {
            for (const eq of [...card.equipped])
                await this._sendToGrave(eq, "field", "tribute");
            card.equipped = [];
        }
        p.monsterZone[z.idx] = null;
        if (card.linkPartner) {
            const partner = card.linkPartner;
            card.linkPartner = null;
            if (this._findZone(partner))
                await this._destroy(partner, "tribute");
        }
        card.controlOriginalController = null;
        await this._sendToGrave(card, "field", "tribute");
    }
    async _damage(player, n, reason) {
        if (n <= 0)
            return;
        const p = this.state[player];
        p.lp -= n;
        this.log(`${this._name(player)} 受 ${n} 伤害。`);
        this.emitView();
        this._checkWin();
        if (!this.state.winner)
            await this.emit({ kind: "lp_change", player, delta: -n, reason });
    }
    async _draw(player, n) {
        const p = this.state[player];
        for (let i = 0; i < n; i++) {
            if (!p.deck.length) {
                this._win(this.opp(player), "卡组耗尽");
                return;
            }
            const c = p.deck.pop();
            c.location = "hand";
            c.controller = player;
            p.hand.push(c);
            await this.emit({ kind: "draw_card", player, card: c });
            if (this.state.winner)
                return;
        }
        this.log(`${this._name(player)} 抽 ${n} 张。`);
        this.emitView();
    }
    async _discard(player, n) {
        const p = this.state[player];
        for (let k = 0; k < n; k++) {
            if (!p.hand.length)
                break;
            let idx;
            if (player === "me") {
                const opts = p.hand.map((c, i) => ({ value: i, label: c.name, card: c }));
                idx = await this._ask("select", { msg: `丢弃 ${n - k} 张手卡`, options: opts, selectOne: true });
            }
            else {
                idx = await this.ai.pickDiscard(p.hand); // await 兼容异步 AI
            }
            const c = p.hand.splice(idx, 1)[0];
            await this._sendToGrave(c, "hand", "discard");
        }
    }
    async _discardCard(card) {
        const owner = this._ownerOf(card);
        this._removeFromArr(this.state[owner].hand, card);
        await this._sendToGrave(card, "hand", "discard");
    }
    async _specialSummon(card, player, pos, from) {
        const p = this.state[player];
        const zi = this.freeMonsterZones(p)[0];
        if (zi == null)
            return;
        // 从来源移除
        const srcOwner = this._ownerOf(card);
        if (from === "grave")
            this._removeFromArr(this.state[srcOwner].graveyard, card);
        else if (from === "deck")
            this._removeFromArr(this.state[srcOwner].deck, card);
        else if (from === "extra")
            this._removeFromArr(this.state[srcOwner].extra, card);
        else
            this._removeFromArr(this.state[srcOwner].hand, card);
        p.monsterZone[zi] = card;
        card.position = pos || "atk";
        card.faceDown = false;
        card.turnSummoned = this.state.turn;
        card.turnSet = -1;
        card.controller = player;
        card.location = "monster";
        card.equipped = [];
        this.log(`${this._name(player)} 特殊召唤 ${card.name}。`);
        this.emitView();
        await this.emit({ kind: "summon", actor: player, monster: card, summonKind: "special", hidden: false });
    }
    // 融合召唤：验证素材 -> 送墓 -> 从额外卡组特召
    async _fusionSummon(fusionCard, player) {
        if (!fusionCard || !fusionCard.fusion)
            return false;
        const p = this.state[player];
        const mats = fusionCard.fusion.materials;
        const sources = [...p.monsterZone.filter((m) => !!m), ...p.hand];
        const used = new Set();
        const found = [];
        for (const cid of mats) {
            const inst = sources.find((c) => !used.has(c.uid) && c.cid === cid);
            if (!inst) {
                this.log("融合素材不足。");
                return false;
            }
            used.add(inst.uid);
            found.push(inst);
        }
        // 素材送墓
        for (const m of found) {
            if (p.hand.includes(m)) {
                this._removeFromArr(p.hand, m);
                await this._sendToGrave(m, "hand", "fusion");
            }
            else {
                await this.tribute(m);
                this.log(`融合素材 ${m.name} 送墓。`);
            }
        }
        // 从额外卡组特召
        const zi = this.freeMonsterZones(p)[0];
        if (zi == null)
            return false;
        this._removeFromArr(p.extra, fusionCard);
        p.monsterZone[zi] = fusionCard;
        fusionCard.position = "atk";
        fusionCard.faceDown = false;
        fusionCard.turnSummoned = this.state.turn;
        fusionCard.turnSet = -1;
        fusionCard.controller = player;
        fusionCard.location = "monster";
        fusionCard.equipped = [];
        this.log(`${this._name(player)} 融合召唤 ${fusionCard.name}！`);
        this.emitView();
        await this.emit({ kind: "summon", actor: player, monster: fusionCard, summonKind: "fusion", hidden: false });
        return true;
    }
    _hasMaterial(player, cid) {
        const p = this.state[player];
        return [...p.monsterZone.filter((m) => !!m), ...p.hand].some((c) => c.cid === cid);
    }
    async _banishFromDeck(card, player) {
        this._removeFromArr(this.state[player].deck, card);
        this.state[player].banished.push(card);
        card.location = "banished";
        card.controller = player;
    }
    async _negateSummon(mon) {
        const z = this._findZone(mon);
        if (!z)
            return;
        const p = this.state[z.key];
        if (z.kind === "monster") {
            for (const eq of [...mon.equipped])
                await this._sendToGrave(eq, "field", "negate");
            mon.equipped = [];
            p.monsterZone[z.idx] = null;
        }
        mon.controlOriginalController = null;
        this.log(`${mon.name} 的召唤被无效！`);
        await this._sendToGrave(mon, "field", "negate");
    }
    async _addToHand(card, player) {
        const owner = this._ownerOf(card);
        this._removeFromArr(this.state[owner].graveyard, card);
        this._removeFromArr(this.state[owner].deck, card);
        this.state[player].hand.push(card);
        card.location = "hand";
        card.controller = player;
        this.log(`${this._name(player)} 将 ${card.name} 加入手卡。`);
        this.emitView();
    }
    async _changePosition(mon, pos) {
        if (mon.position === pos)
            return;
        mon.position = pos;
        this.log(`${mon.name} 切换为 ${pos === "atk" ? "攻击" : "守备"}表示。`);
        this.emitView();
    }
    async _changeControl(mon, to, until) {
        const z = this._findZone(mon);
        if (!z)
            return;
        const fromP = this.state[z.key];
        const toP = this.state[to];
        const zi = this.freeMonsterZones(toP)[0];
        if (zi == null)
            return;
        fromP.monsterZone[z.idx] = null;
        mon.controlOriginalController = z.key;
        mon.tempControlUntil = until || null;
        toP.monsterZone[zi] = mon;
        mon.controller = to;
        this.log(`${mon.name} 控制权转移给 ${this._name(to)}。`);
        this.emitView();
        await this.emit({ kind: "control_change", monster: mon, from: z.key, to, until });
    }
    async _flipUp(mon, doEmit) {
        if (!mon.faceDown)
            return;
        mon.faceDown = false;
        this.log(`${mon.name} 翻开。`);
        this.emitView();
        if (doEmit)
            await this.emit({ kind: "flip", monster: mon, owner: this._ownerOf(mon), by: "effect" });
    }
    async _equip(equipCard, target) {
        const z = this._findZone(equipCard);
        if (!z)
            return;
        target.equipped.push(equipCard);
        equipCard.equipTarget = target.uid;
        this.log(`${equipCard.name} 装备给 ${target.name}。`);
        this.emitView();
    }
    async _setField(card) {
        const z = this._findZone(card);
        const owner = z ? z.key : this._ownerOf(card);
        const p = this.state[owner];
        // 场地魔法互相顶替：发动新场地时，双方场上现有的场地魔法一并送墓（_sendToGrave 不清场上位置，需先置空）
        if (p.fieldZone && p.fieldZone !== card) {
            const old = p.fieldZone;
            p.fieldZone = null;
            await this._sendToGrave(old, "field", "effect");
        }
        const oppP = this.state[this.opp(owner)];
        if (oppP.fieldZone && oppP.fieldZone !== card) {
            const old = oppP.fieldZone;
            oppP.fieldZone = null;
            await this._sendToGrave(old, "field", "effect");
        }
        if (z && z.kind === "spell")
            p.spellZone[z.idx] = null;
        p.fieldZone = card;
        this.log(`场地魔法 ${card.name} 生效。`);
        this.emitView();
    }
    _negate(link) {
        if (!link)
            return false;
        const idx = this.state.chain.findIndex((l) => l === link);
        if (idx >= 0) {
            this.state.chain.splice(idx, 1);
            const tz = this._findZone(link.card);
            if (tz) {
                const tp = this.state[tz.key];
                if (tz.kind === "field")
                    tp.fieldZone = null;
                else if (tz.kind === "spell")
                    tp.spellZone[tz.idx] = null;
            }
            this.state[link.player].graveyard.push(link.card);
            link.card.location = "grave";
            this.log(`${link.card.name} 的发动被无效！`);
            this.emitView();
        }
        return false;
    }
    _removeFromArr(arr, item) { const i = arr.indexOf(item); if (i >= 0)
        arr.splice(i, 1); }
}
