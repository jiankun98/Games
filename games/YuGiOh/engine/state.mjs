/*
 * 游戏王引擎 · state.mjs（由 index.js 机械拆分，方法体未改动）
 */

import { CARD_BY_ID } from "../cards.mjs";

export const MONSTER_ZONES = 5;
export const ST_ZONES = 5;
// 手动发动类触发器的 condition/acquireTargets 允许在无事件上下文中调用（引擎传 null），用空对象占位避免运行时 null 解引用
export const NO_EVENT = {};
// 响应窗口事件：召唤尝试（神之宣告无效召唤）-> 召唤成功（奈落/落穴等）-> 攻击宣言 -> 伤害计算
export const RESPONSE_EVENTS = new Set(["summon_attempt", "summon", "attack_declare", "damage_calc"]);
function shuffle(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export class StateOps {
    _initState() {
        const mkPlayer = (deckIds, extraIds) => {
            const deck = shuffle(deckIds.map((id) => this._mkCard(id)), this.rng);
            const extra = (extraIds || []).map((id) => this._mkCard(id));
            for (const c of extra) {
                c.location = "extra";
                c.controller = "me";
            }
            return {
                lp: this.startingLP, deck, hand: [], extra,
                monsterZone: new Array(MONSTER_ZONES).fill(null),
                spellZone: new Array(ST_ZONES).fill(null),
                fieldZone: null, graveyard: [], banished: [],
                normalSummonUsed: false, attacked: {}, positionChanged: {}, setThisTurn: {},
                noBattleDamageTurn: false, attackLockTurns: 0,
            };
        };
        const me = mkPlayer(this.playerDeckIds, this.playerExtraIds);
        const ai = mkPlayer(this.aiDeckIds, this.aiExtraIds);
        for (let i = 0; i < 5; i++) {
            me.hand.push(me.deck.pop());
            ai.hand.push(ai.deck.pop());
        }
        for (const c of me.hand) {
            c.location = "hand";
            c.controller = "me";
        }
        for (const c of ai.hand) {
            c.location = "hand";
            c.controller = "ai";
        }
        for (const c of me.deck) {
            c.location = "deck";
            c.controller = "me";
        }
        for (const c of ai.deck) {
            c.location = "deck";
            c.controller = "ai";
        }
        for (const c of me.extra) {
            c.controller = "me";
        }
        for (const c of ai.extra) {
            c.controller = "ai";
        }
        return {
            me, ai, turn: 1, turnPlayer: "me", phase: "draw", winner: null,
            chain: [], resolving: false, lastEvent: null, currentAttack: null,
            attackNegated: false, endBattlePhase: false, swappedAtkDefTurn: -1, trapStunTurn: -1, pending: null,
        };
    }
    _mkCard(id) {
        const def = CARD_BY_ID[id];
        return {
            ...def, uid: "c" + Math.random().toString(36).slice(2, 9), cid: id,
            position: null, faceDown: false, turnSet: -1, turnSummoned: -1,
            controller: "me", location: "deck",
            originalAtk: def.atk || 0, originalDef: def.def || 0,
            equipped: [], equipTarget: null, linkPartner: null, controlOriginalController: null,
            tempControlUntil: null,
        };
    }
    /* ===================== 查询 ===================== */
    P(k) { return this.state[k]; }
    opp(k) { return k === "me" ? "ai" : "me"; }
    cur() { return this.state[this.state.turnPlayer]; }
    curOpp() { return this.state[this.opp(this.state.turnPlayer)]; }
    isHumanTurn() { return this.state.turnPlayer === "me"; }
    _name(k) { return k === "me" ? "玩家" : "AI"; }
    monsters(p) { return p.monsterZone.filter((m) => !!m); }
    spells(p) { return p.spellZone.filter((c) => !!c); }
    allMonsters() { return [...this.monsters(this.state.me), ...this.monsters(this.state.ai)]; }
    freeMonsterZones(p) { const r = []; for (let i = 0; i < MONSTER_ZONES; i++)
        if (!p.monsterZone[i])
            r.push(i); return r; }
    freeSTZones(p) { const r = []; for (let i = 0; i < ST_ZONES; i++)
        if (!p.spellZone[i])
            r.push(i); return r; }
    fieldSpellCard() { return this.state.me.fieldZone || this.state.ai.fieldZone || null; }
    countST(p) { return this.spells(p).length + (p.fieldZone ? 1 : 0); }
    stats(mon) {
        let baseAtk = mon.originalAtk, baseDef = mon.originalDef;
        if (this.state.swappedAtkDefTurn === this.state.turn)
            [baseAtk, baseDef] = [baseDef, baseAtk];
        let atk = baseAtk, def = baseDef;
        const fs = this.fieldSpellCard();
        if (fs && fs.effect && fs.effect.continuous) {
            const d = fs.effect.continuous(fs, mon, this.g);
            atk += (d.atkDelta || 0);
            def += (d.defDelta || 0);
        }
        // 怪兽自身永续修正（如黑魔术少女/神鹰的宠物龙，双方场上怪兽均可参与）
        for (const key of ["me", "ai"]) {
            for (const m of this.state[key].monsterZone) {
                if (m && m.effect && m.effect.continuous) {
                    const d = m.effect.continuous(m, mon, this.g);
                    atk += (d.atkDelta || 0);
                    def += (d.defDelta || 0);
                }
            }
        }
        if (mon.equipped) {
            for (const eq of mon.equipped) {
                if (eq.effect && eq.effect.continuous) {
                    const d = eq.effect.continuous(eq, mon, this.g);
                    atk += (d.atkDelta || 0);
                    def += (d.defDelta || 0);
                }
            }
        }
        return { atk: Math.max(0, atk), def: Math.max(0, def) };
    }
    _findZone(card) {
        if (!card)
            return null;
        for (const key of ["me", "ai"]) {
            const p = this.state[key];
            for (let i = 0; i < MONSTER_ZONES; i++)
                if (p.monsterZone[i] === card)
                    return { key, kind: "monster", idx: i };
            for (let i = 0; i < ST_ZONES; i++)
                if (p.spellZone[i] === card)
                    return { key, kind: "spell", idx: i };
            if (p.fieldZone === card)
                return { key, kind: "field", idx: 0 };
        }
        return null;
    }
    _ownerOf(card) {
        const z = this._findZone(card);
        if (z)
            return z.key;
        for (const key of ["me", "ai"]) {
            const p = this.state[key];
            if (p.hand.includes(card) || p.deck.includes(card) || p.graveyard.includes(card) || p.banished.includes(card))
                return key;
        }
        return card.controller;
    }
    _findCard(uid) {
        if (!uid)
            return null;
        for (const key of ["me", "ai"]) {
            const p = this.state[key];
            const all = [...p.hand, ...p.deck, ...p.graveyard, ...p.banished, ...p.extra, ...p.monsterZone, ...p.spellZone, p.fieldZone].filter((c) => !!c);
            const f = all.find((c) => c.uid === uid);
            if (f)
                return f;
        }
        return null;
    }
    isValid(card) { return !!card && !!this._findZone(card); }
    controller(card) { return this._ownerOf(card); }
    playerOf(card) { return this._ownerOf(card); }
    _ownerKey(p) { return p === this.state.me ? "me" : "ai"; }
    _hasFlip(m) { return !!(m.effect && m.effect.triggers && m.effect.triggers.some((t) => t.event === "flip" && t.auto)); }
}
