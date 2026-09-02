/*
 * 游戏王引擎 · battle.mjs（由 index.js 机械拆分，方法体未改动）
 */

// 战斗：攻击宣言、伤害步骤、战斗破坏

export class BattleOps {
    /* ===================== 战斗 ===================== */
    // 攻击可用性查询（UI 战斗引导用）：返回 { ok, reason }，与 declareAttack 的守卫保持一致
    attackBlock(zoneIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || s.phase !== "battle" || s.pending || s.resolving)
            return { ok: false, reason: "不可攻击" };
        const p = this.cur();
        const m = p.monsterZone[zoneIdx];
        if (!m)
            return { ok: false, reason: "无怪兽" };
        if (m.faceDown || m.position !== "atk")
            return { ok: false, reason: "非攻击表示" };
        if (p.attacked[zoneIdx])
            return { ok: false, reason: "本回合已攻击" };
        if (s.turn === 1 && s.turnPlayer === "me")
            return { ok: false, reason: "先手首回合不能攻击" };
        if (this.curOpp().attackLockTurns > 0)
            return { ok: false, reason: "受光之护封剑影响" };
        return { ok: true, reason: "" };
    }
    async declareAttack(zoneIdx, targetIdx) {
        const s = this.state;
        if (s.turnPlayer !== "me" || s.phase !== "battle" || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        const p = this.cur();
        const attacker = p.monsterZone[zoneIdx];
        if (!attacker || attacker.faceDown || attacker.position !== "atk") {
            this._toast("只能用攻击表示怪兽攻击。");
            return;
        }
        if (p.attacked[zoneIdx]) {
            this._toast("此怪兽本回合已攻击。");
            return;
        }
        if (s.turn === 1 && s.turnPlayer === "me") {
            this._toast("先手第一回合不能攻击。");
            return;
        }
        const oppP = this.curOpp();
        if (oppP.attackLockTurns > 0) {
            this._toast("受光之护封剑影响，不能攻击。");
            return;
        }
        p.attacked[zoneIdx] = true;
        let target = targetIdx != null ? oppP.monsterZone[targetIdx] : null;
        if (this.monsters(oppP).length === 0)
            target = null;
        s.attackNegated = false;
        s.endBattlePhase = false;
        s.currentAttack = { attacker, atkOwner: "me" };
        this.log(`${attacker.name} 发动攻击！${target ? `目标：${target.name}` : "直接攻击"}`);
        await this.emit({ kind: "attack_declare", actor: "me", attacker, attackerOwner: "me", target, targetOwner: "ai" });
        if (s.endBattlePhase) {
            await this.enterMain2();
            return;
        }
        if (s.attackNegated) {
            this.emitView();
            return;
        }
        if (!this.isValid(attacker)) {
            this.log(`${attacker.name} 已不在场上，攻击中止。`);
            this.emitView();
            return;
        }
        if (target && !this.isValid(target)) {
            this.log("攻击对象已消失，进入回放。");
            if (this.monsters(oppP).length === 0)
                target = null;
            else
                target = oppP.monsterZone.find((m) => m) || null;
        }
        await this.damageStep(attacker, "me", target, "ai");
    }
    async damageStep(attacker, atkOwner, target, defOwner) {
        const s = this.state;
        const atkStats = this.stats(attacker);
        const attackerP = this.state[atkOwner];
        const defenderP = this.state[defOwner];
        if (!target) {
            let dmg = atkStats.atk;
            if (defenderP.noBattleDamageTurn)
                dmg = 0;
            const ev = { kind: "damage_calc", attacker, target: null, damageTo: defOwner, damage: dmg, direct: true };
            this._dmgEvent = ev;
            await this.emit(ev);
            dmg = ev.damage || 0;
            if (dmg > 0) {
                defenderP.lp -= dmg;
                this.log(`${attacker.name} 直接攻击，${this._name(defOwner)} 受 ${dmg} 伤害。`);
                this.emitView();
                this._checkWin();
            }
            await this._afterAttack(attacker, atkOwner, target);
            return;
        }
        const wasFacedown = target.faceDown;
        if (target.faceDown)
            await this._flipUp(target, false);
        const defStats = this.stats(target);
        let destroyedTarget = false, destroyedAttacker = false, battleDmgToDef = 0, battleDmgToAtk = 0;
        if (target.position === "atk") {
            if (atkStats.atk > defStats.atk) {
                destroyedTarget = true;
                battleDmgToDef = atkStats.atk - defStats.atk;
            }
            else if (atkStats.atk < defStats.atk) {
                destroyedAttacker = true;
                battleDmgToAtk = defStats.atk - atkStats.atk;
            }
            else {
                destroyedTarget = true;
                destroyedAttacker = true;
            }
        }
        else {
            if (atkStats.atk > defStats.def)
                destroyedTarget = true;
            else if (atkStats.atk < defStats.def)
                battleDmgToAtk = defStats.def - atkStats.atk;
        }
        if (battleDmgToDef > 0 && defenderP.noBattleDamageTurn)
            battleDmgToDef = 0;
        if (battleDmgToAtk > 0 && attackerP.noBattleDamageTurn)
            battleDmgToAtk = 0;
        // damage_calc 事件（贯穿自动修饰 + 栗子球响应）
        if (battleDmgToDef > 0 || (target.position === "def" && atkStats.atk > defStats.def)) {
            const ev = { kind: "damage_calc", attacker, target, damageTo: defOwner, damage: battleDmgToDef };
            this._dmgEvent = ev;
            await this.emit(ev);
            battleDmgToDef = Math.max(0, ev.damage || 0);
        }
        if (battleDmgToAtk > 0) {
            const ev = { kind: "damage_calc", attacker, target, damageTo: atkOwner, damage: battleDmgToAtk };
            this._dmgEvent = ev;
            await this.emit(ev);
            battleDmgToAtk = Math.max(0, ev.damage || 0);
        }
        this._dmgEvent = null;
        if (destroyedTarget) {
            await this._destroyInBattle(target, defOwner, attacker, atkOwner);
            this.log(`${target.name} 被破坏。`);
        }
        if (destroyedAttacker) {
            await this._destroyInBattle(attacker, atkOwner, target, defOwner);
            this.log(`${attacker.name} 被破坏。`);
        }
        if (battleDmgToDef > 0) {
            defenderP.lp -= battleDmgToDef;
            this.log(`${this._name(defOwner)} 受 ${battleDmgToDef} 战斗伤害。`);
            this.emitView();
            this._checkWin();
        }
        if (battleDmgToAtk > 0) {
            attackerP.lp -= battleDmgToAtk;
            this.log(`${this._name(atkOwner)} 受 ${battleDmgToAtk} 战斗伤害。`);
            this.emitView();
            this._checkWin();
        }
        // 翻转效果（被攻击翻开，即使被破坏也生效）
        if (!s.winner && wasFacedown && target.effect && this._hasFlip(target)) {
            await this.emit({ kind: "flip", monster: target, owner: defOwner, by: "attack" });
        }
        await this._afterAttack(attacker, atkOwner, target);
    }
    async _afterAttack(attacker, atkOwner, target) {
        const s = this.state;
        if (s.winner)
            return;
        // damage_step_end 事件（哥布林/长枪龙 转守备）
        if (this.isValid(attacker))
            await this.emit({ kind: "damage_step_end", attacker, target, atkOwner });
        s.currentAttack = null;
        this.emitView();
    }
    async _destroyInBattle(mon, ownerKey, attacker, atkOwner) {
        const z = this._findZone(mon);
        if (!z)
            return;
        const p = this.state[z.key];
        for (const eq of [...mon.equipped])
            await this._sendToGrave(eq, "field", "battle");
        mon.equipped = [];
        p.monsterZone[z.idx] = null;
        mon.controlOriginalController = null;
        if (mon.linkPartner) {
            const partner = mon.linkPartner;
            mon.linkPartner = null;
            if (this._findZone(partner))
                await this._destroy(partner, "battle");
        }
        // 先送墓（触发送墓检索），再发 destroyed_by_battle
        const owner = this._ownerOf(mon);
        p.graveyard.push(mon);
        mon.location = "grave";
        mon.controller = owner;
        await this.emit({ kind: "sent_to_grave", card: mon, owner, from: "field", reason: "battle" });
        await this.emit({ kind: "destroyed_by_battle", card: mon, owner, attacker, attackerOwner: atkOwner });
    }
}
