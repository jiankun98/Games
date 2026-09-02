/*
 * 游戏王引擎 · prompt.mjs（由 index.js 机械拆分，方法体未改动）
 */

// 输出/输入：日志、视图推送、节奏节流、交互挂起与应答、目标选择

export class PromptOps {
    /* ===================== 输出/输入 ===================== */
    log(msg) { this._log.push(msg); this.cb.onLog && this.cb.onLog(msg); }
    emitView() { this.cb.onState && this.cb.onState(this.state); }
    /** 玩家动作节流：保证连续动作之间的最小间隔，避免操作过快导致提示堆叠 */
    async _pacePlayer() {
        const wait = this._lastPlayerActionAt + this.pace - Date.now();
        if (wait > 0)
            await new Promise((r) => setTimeout(r, wait));
        this._lastPlayerActionAt = Date.now();
    }
    _ask(kind, payload) {
        return new Promise((resolve) => {
            const show = () => {
                this.state.pending = { kind, ...payload };
                this.emitView();
                this._await = { resolve };
            };
            // 弹窗前置延迟：让上一个动作的特效/横幅播完，避免弹框接踵而至
            if (this.promptDelay > 0)
                setTimeout(show, this.promptDelay);
            else
                show();
        });
    }
    answer(value) {
        if (!this._await)
            return;
        const a = this._await;
        this._await = null;
        this.state.pending = null;
        a.resolve(value);
    }
    delay(ms) { return new Promise((r) => setTimeout(r, ms || this.aiDelay)); }
    _askTargets(msg, options, count) {
        const c = count || 1;
        if (this._activator === "me") {
            return this._ask("select", { msg, options, selectOne: c === 1, multi: c > 1 }).then((r) => (Array.isArray(r) ? r : [r]));
        }
        // AI：选最有利
        return Promise.resolve(this.ai.pickTargets(msg, options, c));
    }
    _toast(msg) { this.cb.onToast && this.cb.onToast(msg); }
}
