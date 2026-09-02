/*
 * 游戏王引擎 · turn.mjs（由 index.js 机械拆分，方法体未改动）
 */

import { MONSTER_ZONES } from "./state.mjs";

export class TurnOps {
    /* ===================== 回合/阶段 ===================== */
    async _beginTurn() {
        const s = this.state;
        if (s.winner)
            return;
        s.phase = "draw";
        const tp = s.turnPlayer;
        const p = this.cur();
        p.normalSummonUsed = false;
        p.attacked = {};
        p.positionChanged = {};
        p.setThisTurn = {};
        p.noBattleDamageTurn = false;
        // 光之护封剑计数（在控制者的回合开始时递减）
        for (const key of ["me", "ai"]) {
            const pp = this.state[key];
            if (pp.attackLockTurns > 0) {
                if (key === tp) {
                    pp.attackLockTurns--;
                    if (pp.attackLockTurns === 0) {
                        const sw = pp.spellZone.find((c) => c && c.cid === "swords");
                        if (sw) {
                            this._destroy(sw, "effect");
                            this.log(`${this._name(key)} 的光之护封剑失效。`);
                        }
                    }
                }
            }
        }
        this.emitView();
        await this.emit({ kind: "turn_start", player: tp, turn: s.turn });
        if (s.winner)
            return;
        // 抽卡阶段
        if (!(s.turn === 1 && tp === "me")) {
            await this.emit({ kind: "phase_start", player: tp, phase: "draw" });
            if (!s.winner)
                await this._drawPhase();
        }
        else {
            this.log(`${this._name(tp)} 先手，第一回合跳过抽卡。`);
        }
        if (s.winner)
            return;
        await this.emit({ kind: "phase_start", player: tp, phase: "standby" });
        if (s.winner)
            return;
        s.phase = "main1";
        await this.emit({ kind: "phase_start", player: tp, phase: "main1" });
        this.emitView();
        if (tp === "me") {
            this.log("你的主要阶段 1。");
        }
        else {
            await this.ai.mainPhase();
            if (s.winner)
                return;
            await this._enterBattlePhase();
            if (s.winner)
                return;
            await this._endTurn();
        }
    }
    async _drawPhase() {
        const s = this.state;
        s.phase = "draw";
        const p = this.cur();
        if (!p.deck.length) {
            this._win(this.opp(s.turnPlayer), "卡组耗尽");
            return;
        }
        const c = p.deck.pop();
        c.location = "hand";
        c.controller = s.turnPlayer;
        p.hand.push(c);
        this.log(`${this._name(s.turnPlayer)} 抽卡：${p.hand.length} 张手卡。`);
        this.emitView();
        await this.emit({ kind: "draw_card", player: s.turnPlayer, card: c });
        await this.delay(this.isHumanTurn() ? 0 : this.aiDelay);
    }
    async nextPhase() {
        const s = this.state;
        if (s.turnPlayer !== "me" || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        if (s.phase === "main1")
            await this._enterBattlePhase();
        else if (s.phase === "battle")
            await this.enterMain2();
        else if (s.phase === "main2")
            await this._endTurn();
    }
    // 任意阶段一键结束回合（跳过战斗/主阶段2，由玩家决定）
    async endTurn() {
        const s = this.state;
        if (s.turnPlayer !== "me" || s.pending || s.resolving)
            return;
        await this._pacePlayer();
        await this._endTurn();
    }
    async _enterBattlePhase() {
        const s = this.state;
        if (s.turn === 1 && s.turnPlayer === "me") {
            this.log("先手第一回合不能进入战斗阶段。");
            s.phase = "main2";
            this.emitView();
            return;
        }
        s.phase = "battle";
        await this.emit({ kind: "phase_start", player: s.turnPlayer, phase: "battle" });
        this.log(`${this._name(s.turnPlayer)} 进入战斗阶段。`);
        this.emitView();
        if (s.turnPlayer === "ai")
            await this.ai.battlePhase();
    }
    async enterMain2() {
        const s = this.state;
        s.phase = "main2";
        await this.emit({ kind: "phase_start", player: s.turnPlayer, phase: "main2" });
        this.log(`${this._name(s.turnPlayer)} 进入主要阶段 2。`);
        this.emitView();
        if (s.turnPlayer === "ai")
            await this.ai.mainPhase();
    }
    async _endTurn() {
        const s = this.state;
        await this.emit({ kind: "phase_start", player: s.turnPlayer, phase: "end" });
        // 心变归还：tempControlUntil === 'turn_end'
        for (const key of ["me", "ai"]) {
            const pp = this.state[key];
            for (let i = 0; i < MONSTER_ZONES; i++) {
                const m = pp.monsterZone[i];
                if (m && m.tempControlUntil === "turn_end" && m.controlOriginalController && m.controlOriginalController !== key) {
                    const orig = m.controlOriginalController;
                    m.controlOriginalController = null;
                    m.tempControlUntil = null;
                    const origP = this.state[orig];
                    const free = this.freeMonsterZones(origP);
                    if (free.length) {
                        pp.monsterZone[i] = null;
                        origP.monsterZone[free[0]] = m;
                        m.controller = orig;
                        this.log(`${m.name} 控制权归还 ${this._name(orig)}。`);
                    }
                }
            }
        }
        // 临时攻守互换在回合切换时自动失效（swappedAtkDefTurn 判定）
        await this.emit({ kind: "turn_end", player: s.turnPlayer });
        // 手卡上限6
        await this._enforceHandLimit(this.cur());
        this.log(`${this._name(s.turnPlayer)} 结束回合。`);
        s.turnPlayer = this.opp(s.turnPlayer);
        s.turn++;
        s.phase = "draw";
        this.emitView();
        this._beginTurn();
    }
    async _enforceHandLimit(p) {
        while (p.hand.length > 6) {
            let idx;
            if (this.state.turnPlayer === "me" && p === this.state.me) {
                const opts = p.hand.map((c, i) => ({ value: i, label: c.name, card: c }));
                idx = await this._ask("select", { msg: "手卡超过6张，请丢弃1张。", options: opts, selectOne: true });
            }
            else {
                idx = await this.ai.pickDiscard(p.hand); // await 兼容异步 AI
            }
            const c = p.hand.splice(idx, 1)[0];
            await this._sendToGrave(c, "hand", "discard");
        }
    }
    /* ===================== 胜负 ===================== */
    _checkWin() {
        const s = this.state;
        if (s.me.lp <= 0 && s.ai.lp <= 0) {
            s.me.lp = 0;
            s.ai.lp = 0;
            this._win("draw", "双方LP归零");
            return;
        }
        if (s.me.lp <= 0) {
            s.me.lp = 0;
            this._win("ai", "LP归零");
            return;
        }
        if (s.ai.lp <= 0) {
            s.ai.lp = 0;
            this._win("me", "LP归零");
            return;
        }
    }
    _win(who, reason) {
        const s = this.state;
        if (s.winner)
            return;
        s.winner = who;
        this.log(`${who === "draw" ? "平局" : this._name(who) + " 获胜"}！（${reason}）`);
        this.emitView();
        this.cb.onGameOver && this.cb.onGameOver(who);
    }
}
