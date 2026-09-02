/*
 * 游戏王·AI 玩家（独立模块，与规则引擎解耦）
 *  - 只通过 Duel 的公开接口读取局面、执行动作，不触碰引擎内部实现。
 *  - 引擎在 AI 回合与决策点（连锁/选目标/弃牌）回调本模块，由 config.ai 注入（默认实例化本类）。
 *  - 本文件自包含，不依赖其他模块的顶层常量。
 */
/** 怪兽区数量（与引擎一致，独立声明以兼容模块加载环境） */
const AI_MONSTER_ZONES = 5;
/** 无事件上下文的占位事件（与引擎独立，避免运行时 null 解引用） */
const AI_NO_EVENT = {};
class AiPlayer {
    constructor(duel) {
        this.duel = duel;
    }
    get s() { return this.duel.state; }
    get p() { return this.duel.cur(); }
    get opp() { return this.duel.curOpp(); }
    delay() { return this.duel.delay(); }
    /* ===================== 估值 ===================== */
    /** 手卡价值（弃牌时保留价值高的） */
    handValue(c) {
        if (c.type === "monster")
            return (c.atk || 0) + (c.def || 0) * 0.3;
        if (c.type === "spell")
            return 1200;
        return 1400;
    }
    /** 怪兽价值（选目标/祭品时参考） */
    monsterValue(m) {
        const st = this.duel.stats(m);
        return st.atk + st.def * 0.2 + (m.effect ? 300 : 0);
    }
    /* ===================== 目标与弃牌（引擎回调） ===================== */
    /** AI 自动选目标：按怪兽价值从高到低取前 count 个 */
    pickTargets(msg, options, count) {
        const c = count || 1;
        const vals = options.map((o) => ({ o, v: o.card && o.card.type === "monster" ? this.monsterValue(o.card) : 0 }));
        vals.sort((a, b) => b.v - a.v);
        return vals.slice(0, c).map((x) => x.o.value);
    }
    /** AI 选弃牌：弃价值最低的 */
    pickDiscard(hand) {
        let idx = 0;
        for (let i = 1; i < hand.length; i++)
            if (this.handValue(hand[i]) < this.handValue(hand[idx]))
                idx = i;
        return idx;
    }
    /* ===================== 主要阶段 ===================== */
    async mainPhase() {
        const s = this.s;
        const p = this.p;
        const opp = this.opp;
        let guard = 0;
        while (guard++ < 30 && !s.winner) {
            const spell = this.pickSpell(p, opp);
            if (spell) {
                await this.activateSpell(spell);
                await this.delay();
                continue;
            }
            const ss = this.pickSpecialSummon(p, opp);
            if (ss) {
                await this.doSpecialSummon(ss);
                await this.delay();
                continue;
            }
            const summon = this.pickSummon(p);
            if (summon) {
                await this.doSummon(summon);
                await this.delay();
                continue;
            }
            const ign = this.pickIgnition(p, opp);
            if (ign) {
                await this.doIgnition(ign);
                await this.delay();
                continue;
            }
            const setTrap = this.pickSetTrap(p);
            if (setTrap) {
                await this.doSetTrap(setTrap);
                await this.delay();
                continue;
            }
            break;
        }
        this.duel.emitView();
    }
    pickSpell(p, opp) {
        const hand = p.hand.map((c, i) => ({ c, i })).filter((x) => x.c.type === "spell");
        const oppMon = this.duel.monsters(opp);
        const myMon = this.duel.monsters(p);
        const myGrave = p.graveyard.filter((c) => c.type === "monster");
        const oppST = this.duel.spells(opp);
        let f;
        f = hand.find((x) => x.c.cid === "potofgreed");
        if (f)
            return f;
        f = hand.find((x) => x.c.cid === "gracefulcharity");
        if (f && p.hand.length <= 5)
            return f;
        if (oppMon.length >= 2) {
            f = hand.find((x) => x.c.cid === "raigeki");
            if (f)
                return f;
        }
        if (myGrave.length) {
            const best = myGrave.slice().sort((a, b) => (b.atk || 0) - (a.atk || 0))[0];
            if (best && (best.atk || 0) >= 1500) {
                f = hand.find((x) => x.c.cid === "monsterreborn");
                if (f)
                    return f;
            }
        }
        if (oppST.length >= 2) {
            f = hand.find((x) => x.c.cid === "heavystorm");
            if (f)
                return f;
        }
        if (oppST.length >= 1) {
            f = hand.find((x) => x.c.cid === "mst");
            if (f)
                return f;
        }
        if (oppMon.length) {
            const best = oppMon.slice().sort((a, b) => this.duel.stats(b).atk - this.duel.stats(a).atk)[0];
            if (this.duel.stats(best).atk >= 1500) {
                f = hand.find((x) => x.c.cid === "changeofheart");
                if (f)
                    return f;
            }
        }
        if (oppMon.length >= 2 && myMon.length === 0) {
            f = hand.find((x) => x.c.cid === "darkhole");
            if (f)
                return f;
        }
        if (oppMon.length) {
            f = hand.find((x) => x.c.cid === "fissure") || hand.find((x) => x.c.cid === "smashing");
            if (f)
                return f;
        }
        if (myMon.length) {
            f = hand.find((x) => ["axeofdespair", "blackpendant", "magepower", "united", "metalmorph"].includes(x.c.cid));
            if (f)
                return f;
        }
        if (!p.fieldZone) {
            f = hand.find((x) => x.c.subtype === "场地");
            if (f)
                return f;
        }
        if (myMon.length && oppMon.length) {
            f = hand.find((x) => x.c.cid === "shieldsword");
            if (f)
                return f;
        }
        // 主题卡（有对应王牌在场时发动）
        const myCard = (cid) => myMon.some((m) => m.cid === cid && !m.faceDown);
        if (myCard("harpylady")) {
            f = hand.find((x) => x.c.cid === "elegantegotist");
            if (f)
                return f;
        }
        if (myCard("redeyes")) {
            f = hand.find((x) => x.c.cid === "infernofire");
            if (f)
                return f;
        }
        if (myCard("blueyes")) {
            f = hand.find((x) => x.c.cid === "burststream") || hand.find((x) => x.c.cid === "stamping");
            if (f)
                return f;
        }
        if (myCard("darkmagician")) {
            f = hand.find((x) => x.c.cid === "thousandknives") || hand.find((x) => x.c.cid === "darkmagicattack");
            if (f)
                return f;
        }
        if (myCard("lordofdragons")) {
            f = hand.find((x) => x.c.cid === "flute");
            if (f)
                return f;
        }
        if (p.lp >= 4000) {
            f = hand.find((x) => x.c.cid === "curtain");
            if (f)
                return f;
        }
        // 融合：额外卡组有可融合怪兽（素材在场上/手牌即可，activateSpell 会复核 condition）
        if (p.extra.length) {
            f = hand.find((x) => x.c.cid === "polymerization");
            if (f)
                return f;
        }
        if (oppMon.length >= 2) {
            f = hand.find((x) => x.c.cid === "swords");
            if (f)
                return f;
        }
        return null;
    }
    async activateSpell(x) {
        const p = this.p;
        const card = p.hand[x.i];
        if (!card)
            return;
        const trigger = this.duel.manualTrigger(card);
        if (!trigger)
            return;
        if (trigger.condition && !trigger.condition(card, AI_NO_EVENT, this.duel.g))
            return;
        // 与玩家一致：先选目标（AI 自动选），无目标则留在手牌
        this.duel._activator = "ai";
        let targets = null;
        if (trigger.acquireTargets) {
            targets = await trigger.acquireTargets(card, AI_NO_EVENT, this.duel.g);
            if (targets === null)
                return;
        }
        const zi = this.duel.freeSTZones(p)[0];
        if (zi == null)
            return;
        p.hand.splice(x.i, 1);
        p.spellZone[zi] = card;
        card.faceDown = false;
        card.location = "spell";
        card.controller = "ai";
        await this.duel.activateAndResolve("ai", card, trigger, null, "spell-hand", targets);
    }
    /** 手牌特殊召唤（电子龙：空场且对方有怪兽；电磁武神：场上集齐三磁石） */
    pickSpecialSummon(p, opp) {
        const hand = p.hand.map((c, i) => ({ c, i }));
        const cyber = hand.find((x) => x.c.cid === "cyberdragon");
        if (cyber && this.duel.monsters(p).length === 0 && this.duel.monsters(opp).length > 0)
            return cyber;
        const vk = hand.find((x) => x.c.cid === "valkyrion");
        if (vk && ["magnet_alpha", "magnet_beta", "magnet_gamma"].every((cid) => this.duel.monsters(p).some((m) => m.cid === cid)))
            return vk;
        return null;
    }
    async doSpecialSummon(x) {
        const p = this.p;
        const card = p.hand[x.i];
        if (!card)
            return;
        const trigger = this.duel.manualTrigger(card);
        if (!trigger)
            return;
        if (trigger.condition && !trigger.condition(card, AI_NO_EVENT, this.duel.g))
            return;
        await this.duel.activateAndResolve("ai", card, trigger, null, "monster-effect");
    }
    pickSummon(p) {
        const hand = p.hand.map((c, i) => ({ c, i })).filter((x) => x.c.type === "monster");
        if (!hand.length || !this.duel.freeMonsterZones(p).length || p.normalSummonUsed)
            return null;
        const myMon = this.duel.monsters(p);
        const high = hand.filter((x) => (x.c.level || 0) >= 5).sort((a, b) => (b.c.atk || 0) - (a.c.atk || 0));
        for (const h of high) {
            const need = (h.c.level || 0) >= 7 ? 2 : 1;
            if (myMon.length >= need) {
                const sorted = myMon.slice().sort((a, b) => this.monsterValue(a) - this.monsterValue(b));
                return { kind: "tribute", card: h.c, i: h.i, tributes: sorted.slice(0, need).map((m) => p.monsterZone.indexOf(m)) };
            }
        }
        const lv4 = hand.filter((x) => (x.c.level || 0) < 5).sort((a, b) => (b.c.atk || 0) - (a.c.atk || 0));
        if (lv4.length) {
            const best = lv4[0];
            const pos = (best.c.effect && best.c.effect.triggers && best.c.effect.triggers.some((t) => t.event === "flip")) ? "set" : "atk";
            return { kind: pos === "set" ? "set" : "normal", card: best.c, i: best.i, pos };
        }
        return null;
    }
    async doSummon(sm) {
        const s = this.s;
        const p = this.p;
        if (sm.kind === "tribute") {
            const need = (sm.card.level || 0) >= 7 ? 2 : 1;
            for (const ti of sm.tributes || [])
                if (p.monsterZone[ti])
                    await this.duel.tribute(p.monsterZone[ti]);
            p.hand.splice(sm.i, 1);
            const zi = this.duel.freeMonsterZones(p)[0];
            this.duel.placeMonster(p, sm.card, zi, "atk", false);
            p.normalSummonUsed = true;
            this.duel.log(`AI 祭品召唤 ${sm.card.name}！`);
            await this.duel.doSummon("ai", sm.card, "tribute");
        }
        else if (sm.kind === "set") {
            p.hand.splice(sm.i, 1);
            const zi = this.duel.freeMonsterZones(p)[0];
            this.duel.placeMonster(p, sm.card, zi, "def", true);
            p.normalSummonUsed = true;
            p.setThisTurn[zi] = true;
            this.duel.log("AI 覆盖了1只怪兽。");
            await this.duel.doSummon("ai", sm.card, "set");
        }
        else {
            p.hand.splice(sm.i, 1);
            const zi = this.duel.freeMonsterZones(p)[0];
            this.duel.placeMonster(p, sm.card, zi, "atk", false);
            p.normalSummonUsed = true;
            this.duel.log(`AI 通常召唤 ${sm.card.name}。`);
            await this.duel.doSummon("ai", sm.card, "normal");
        }
    }
    pickIgnition(p, opp) {
        const myMon = this.duel.monsters(p).filter((m) => !m.faceDown && this.duel.manualTrigger(m));
        const oppMon = this.duel.monsters(opp);
        const cs = myMon.find((m) => m.cid === "cannonsoldier");
        if (cs && this.duel.monsters(p).length >= 2) {
            const trib = this.duel.monsters(p).filter((m) => m !== cs).sort((a, b) => this.monsterValue(a) - this.monsterValue(b))[0];
            if (trib)
                return { card: cs, trigger: this.duel.manualTrigger(cs) };
        }
        const ex = myMon.find((m) => m.cid === "exiled");
        if (ex && oppMon.length) {
            const tgt = oppMon.slice().sort((a, b) => this.duel.stats(b).atk - this.duel.stats(a).atk)[0];
            if (this.duel.stats(tgt).atk >= 1500)
                return { card: ex, trigger: this.duel.manualTrigger(ex) };
        }
        return null;
    }
    async doIgnition(ign) {
        await this.duel.activateAndResolve("ai", ign.card, ign.trigger, null, "monster-effect");
    }
    pickSetTrap(p) {
        if (!this.duel.freeSTZones(p).length)
            return null;
        const traps = p.hand.map((c, i) => ({ c, i })).filter((x) => x.c.type === "trap");
        const setCount = this.duel.spells(p).filter((c) => c.faceDown).length;
        if (traps.length && setCount < 3)
            return traps[0];
        return null;
    }
    async doSetTrap(x) {
        const s = this.s;
        const p = this.p;
        const card = p.hand[x.i];
        if (!card)
            return;
        const zi = this.duel.freeSTZones(p)[0];
        p.hand.splice(x.i, 1);
        p.spellZone[zi] = card;
        card.faceDown = true;
        card.turnSet = s.turn;
        card.location = "spell";
        card.controller = "ai";
        this.duel.log("AI 覆盖了1张魔陷卡。");
        this.duel.emitView();
    }
    /* ===================== 战斗阶段 ===================== */
    async battlePhase() {
        const s = this.s;
        // 光之护封剑：攻击封锁期间 AI 跳过战斗阶段（封锁计数存在控制者侧）
        if (s.me.attackLockTurns > 0) {
            this.duel.log("AI 受光之护封剑影响，跳过战斗阶段。");
            this.duel.emitView();
            if (!s.winner)
                await this.duel.enterMain2();
            return;
        }
        const p = this.p;
        const opp = this.opp;
        let guard = 0;
        while (guard++ < 20 && !s.winner && s.phase === "battle") {
            const choice = this.pickAttack(p, opp);
            if (!choice)
                break;
            await this.delay();
            const { attacker, zoneIdx, targetIdx } = choice;
            p.attacked[zoneIdx] = true;
            s.attackNegated = false;
            s.endBattlePhase = false;
            s.currentAttack = { attacker, atkOwner: "ai" };
            let target = targetIdx != null ? opp.monsterZone[targetIdx] : null;
            if (this.duel.monsters(opp).length === 0)
                target = null;
            this.duel.log(`AI 的 ${attacker.name} 发动攻击！${target ? "目标：" + target.name : "直接攻击"}`);
            await this.duel.emit({ kind: "attack_declare", actor: "ai", attacker, attackerOwner: "ai", target, targetOwner: "me" });
            if (s.endBattlePhase)
                break;
            if (s.attackNegated) {
                this.duel.emitView();
                continue;
            }
            if (!this.duel.isValid(attacker)) {
                this.duel.log(`${attacker.name} 已不在场上，攻击中止。`);
                this.duel.emitView();
                continue;
            }
            if (target && !this.duel.isValid(target)) {
                if (this.duel.monsters(opp).length === 0)
                    target = null;
                else
                    target = opp.monsterZone.find((m) => m) || null;
            }
            await this.duel.damageStep(attacker, "ai", target, "me");
            if (s.winner)
                break;
        }
        if (!s.winner)
            await this.duel.enterMain2();
    }
    pickAttack(p, opp) {
        const oppMon = this.duel.monsters(opp);
        const attackers = p.monsterZone
            .map((m, i) => ({ m, i }))
            .filter((x) => !!x.m && !x.m.faceDown && x.m.position === "atk" && !p.attacked[x.i]);
        if (!attackers.length)
            return null;
        if (oppMon.length === 0) {
            const a = attackers[0];
            return { attacker: a.m, zoneIdx: a.i, targetIdx: null };
        }
        let best = null;
        for (const a of attackers) {
            const aAtk = this.duel.stats(a.m).atk;
            for (let ti = 0; ti < AI_MONSTER_ZONES; ti++) {
                const t = opp.monsterZone[ti];
                if (!t)
                    continue;
                const tFaceDown = t.faceDown;
                const effAtk = tFaceDown ? 0 : this.duel.stats(t).atk;
                const tDef = tFaceDown ? 0 : this.duel.stats(t).def;
                let score = 0;
                if (t.position === "atk" || tFaceDown) {
                    if (aAtk > effAtk)
                        score = (tFaceDown ? 600 : this.monsterValue(t));
                    else if (aAtk === effAtk && !tFaceDown)
                        score = this.monsterValue(t) * 0.5 - this.monsterValue(a.m) * 0.5;
                    else
                        score = -this.monsterValue(a.m);
                }
                else {
                    if (aAtk > tDef)
                        score = (tFaceDown ? 400 : this.monsterValue(t) * 0.6);
                    else
                        score = -(tDef - aAtk) * 0.5;
                }
                if (!best || score > best.score)
                    best = { score, attacker: a.m, zoneIdx: a.i, targetIdx: ti };
            }
        }
        if (best && best.score > -300)
            return best;
        if (best && oppMon.some((m) => m.faceDown)) {
            const fd = opp.monsterZone.findIndex((m) => m && m.faceDown);
            if (fd >= 0)
                return { attacker: best.attacker, zoneIdx: best.zoneIdx, targetIdx: fd };
        }
        return null;
    }
    /* ===================== 连锁决策 ===================== */
    decideChain(playerKey, event, chainable) {
        const atk = event.attacker ? this.duel.stats(event.attacker).atk : 0;
        if (event.kind === "summon_attempt" && event.actor === this.duel.opp(playerKey)) {
            // 神之宣告：无效高价值怪兽的召唤（消耗半 LP，谨慎使用）
            const sj = chainable.find((x) => x.card.cid === "solemnjudgment");
            if (sj && event.monster && this.duel.stats(event.monster).atk >= 2500 && this.s[playerKey].lp >= 4000)
                return this.chainAction(sj);
        }
        if (event.kind === "attack_declare" && event.attackerOwner === this.duel.opp(playerKey)) {
            const mirror = chainable.find((x) => x.card.cid === "mirrorforce");
            if (mirror && this.duel.monsters(this.s[this.duel.opp(playerKey)]).filter((m) => m.position === "atk").length >= 2)
                return this.chainAction(mirror);
            const sak = chainable.find((x) => x.card.cid === "sakuretsu");
            if (sak && atk >= 1500)
                return this.chainAction(sak);
            const dp = chainable.find((x) => x.card.cid === "dimensionalprison");
            if (dp && atk >= 1800)
                return this.chainAction(dp);
            const mc = chainable.find((x) => x.card.cid === "magiccylinder");
            if (mc && atk >= 1500)
                return this.chainAction(mc);
            const na = chainable.find((x) => x.card.cid === "negateattack");
            if (na && atk >= 2500 && this.duel.monsters(this.s[playerKey]).length === 0)
                return this.chainAction(na);
            const wab = chainable.find((x) => x.card.cid === "waboku");
            if (wab && atk >= this.s[playerKey].lp)
                return this.chainAction(wab);
        }
        if (event.kind === "summon" && event.actor === this.duel.opp(playerKey) && !event.hidden && event.monster) {
            const sa = this.duel.stats(event.monster).atk;
            const bh = chainable.find((x) => x.card.cid === "bottomless");
            if (bh && sa >= 1500)
                return this.chainAction(bh);
            const th = chainable.find((x) => x.card.cid === "traphole");
            if (th && sa >= 1000)
                return this.chainAction(th);
            const tt = chainable.find((x) => x.card.cid === "torrential");
            if (tt && sa >= 2000 && this.duel.monsters(this.s[playerKey]).length <= this.duel.monsters(this.s[this.duel.opp(playerKey)]).length)
                return this.chainAction(tt);
        }
        if (event.kind === "activate" && event.actor === this.duel.opp(playerKey) && event.card) {
            const st = chainable.find((x) => x.card.cid === "seventools" && event.card.type === "trap");
            if (st && (event.card.cid === "mirrorforce" || event.card.cid === "torrential" || event.card.cid === "ringofdestruction"))
                return this.chainAction(st);
            const mj = chainable.find((x) => x.card.cid === "magicjammer" && event.card.type === "spell");
            if (mj && (event.card.cid === "raigeki" || event.card.cid === "darkhole" || event.card.cid === "monsterreborn" || event.card.cid === "changeofheart"))
                return this.chainAction(mj);
        }
        if (event.kind === "damage_calc" && event.damageTo === playerKey && (event.damage || 0) >= this.s[playerKey].lp) {
            // 栗子球：受到致命伤害时丢弃保命
            const kb = chainable.find((x) => x.card.cid === "kuriboh");
            if (kb)
                return this.chainAction(kb);
        }
        return { pass: true };
    }
    chainAction(x) {
        return { pass: false, card: x.card, trigger: x.trigger };
    }
}
export { AiPlayer };
