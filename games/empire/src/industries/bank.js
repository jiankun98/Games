/* 银行：双利率滑杆，存贷随利率动态变化，息差按游戏日结算（每 2 分钟一次）。
 * 经济逻辑：
 *   - 存款利率高 → 存款流入多；存款利率低 → 到期提取流失
 *   - 贷款利率低 → 借款人需求旺、贷款流入；贷款利率高 → 新贷少 + 提前还款多（贷款流出）
 *   - 净息差 = 贷款×贷利率 − 存款×存利率，可为负 → 池亏穿停摆
 * 结算口径为"每游戏日"；UI 展示"每小时"口径的流量与利息。
 */
import { treasuryState, pay } from "./base.js";

export default {
  id: "bank",
  defaults(ind, type) {
    return {
      ...treasuryState(),
      depositRate: 0.03,        // 存款利率 3%
      loanRate: 0.10,           // 贷款利率 10%
      vault: type.vaultBase,    // 金库上限（升级驱动存款规模）
      deposits: 20e4,           // 当前存款
      loans: 10e4               // 当前贷款
    };
  },

  /* 每游戏日单步演化（比例增长模型：存款受金库容量约束，贷款受存款约束）
   * 存款流入 = 基础吸引(金库 x 0.2%/时) + 利率加成；利率越低到期提取越多
   * 贷款：利率越低需求越旺；利率越高提前还款越多（稳态贷款 ≈ 存款的一半） */
  _stepDay(st, rnd) {
    const dr = st.depositRate, lr = st.loanRate;
    let deposits = st.deposits;
    let loans = st.loans;
    const depInDay = deposits * (0.03 + dr * 0.5) / 30 + st.vault * 0.002;
    const depOutDay = deposits * (0.02 + (0.10 - dr) * 0.4) / 30;
    deposits = Math.max(0, Math.min(st.vault, deposits + depInDay - depOutDay));
    const loanNewDay = deposits * Math.max(0, 0.25 - lr * 2) / 30;
    const loanPayDay = loans * (0.20 + lr * 1.5) / 30;
    loans = Math.max(0, Math.min(deposits, loans + loanNewDay - loanPayDay));
    return { depIn: depInDay, depOut: depOutDay, loanNew: loanNewDay, loanPay: loanPayDay, deposits, loans };
  },

  /* 每游戏日结算（引擎 _daySettle 调用） */
  dayTick(ind, E) {
    const st = ind.st;
    if (st.stalled) return;
    const f = this._stepDay(st, E.rng());
    st.deposits = f.deposits;
    st.loans = f.loans;
    const net = (f.loans * st.loanRate - f.deposits * st.depositRate) / 30;
    st.treasury += net;
    if (net < 0) E._record(`🏦 ${ind.name}：息差为负，亏损 ${E._fmt(-net * 30)}/时`, net, "cost");
  },

  /* 每小时口径（展示用） */
  incomePerHour(ind, E) {
    const st = ind.st;
    return st.loans * st.loanRate - st.deposits * st.depositRate;
  },

  value(ind, E) {
    return ind.st.treasury + ind.st.deposits * 0.3;
  },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.bank;
    const st = ind.st;
    const f = this._stepDay(st, 0.5);   // 展示用（均值）
    return {
      depositRate: st.depositRate, loanRate: st.loanRate,
      depositRange: type.depositRate, loanRange: type.loanRate,
      vault: st.vault, vaultUpgradeCost: Math.round(st.vault * type.vaultUpgradeRate),
      deposits: st.deposits, loans: st.loans,
      // 每小时利息明细
      interestIncome: st.loans * st.loanRate,
      interestCost: st.deposits * st.depositRate,
      netInterest: st.loans * st.loanRate - st.deposits * st.depositRate,
      // 每小时存贷流量（每游戏日 ×30）
      depIn: Math.round(f.depIn * 30), depOut: Math.round(f.depOut * 30),
      loanNew: Math.round(f.loanNew * 30), loanPay: Math.round(f.loanPay * 30),
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  offline(ind, hours, E) {
    const st = ind.st;
    let income = 0;
    for (let i = 0; i < hours * 30; i++) {   // 按游戏日推进
      const f = this._stepDay(st, 0.5);
      st.deposits = f.deposits; st.loans = f.loans;
      income += (f.loans * st.loanRate - f.deposits * st.depositRate) / 30;
    }
    return { income: Math.max(0, income), cost: Math.max(0, -income) };
  },

  actions: {
    setRates(ind, E, payload) {
      const type = E.IND_BY_ID.bank;
      const dr = Math.max(type.depositRate[0], Math.min(type.depositRate[1], payload.depositRate));
      const lr = Math.max(type.loanRate[0], Math.min(type.loanRate[1], payload.loanRate));
      ind.st.depositRate = dr;
      ind.st.loanRate = lr;
      E._record(`🏦 ${ind.name}：利率调整 存${(dr * 100).toFixed(1)}% / 贷${(lr * 100).toFixed(1)}%`, 0, "event");
      return { ok: true };
    },
    upgradeVault(ind, E) {
      const type = E.IND_BY_ID.bank;
      const cost = Math.round(ind.st.vault * type.vaultUpgradeRate);
      if (!pay(ind, cost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.vault = Math.round(ind.st.vault * 1.5);
      ind.invested += cost;
      E._record(`🏦 ${ind.name}：金库扩容至 ${E._fmt(ind.st.vault)}`, -cost, "expand");
      return { ok: true, cost };
    }
  }
};
