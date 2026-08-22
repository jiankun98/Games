/* 便利店：零风险入门产业，利润直进主账户（不参与公司池体系） */
import { ratingOf } from "./base.js";
import { TAX } from "../data.js";

export default {
  id: "cstore",
  defaults(ind, type) {
    return { stores: 1 };
  },

  /* 日结算（引擎在 _daySettle 调用）：返回税前毛收益（元/游戏日） */
  grossPerDay(ind, E) {
    const type = E.IND_BY_ID.cstore;
    const stores = ind.st.stores || 1;
    let bonus = 0;
    for (const m of type.milestones) if (stores >= m.stores) bonus = Math.max(bonus, m.bonus);
    return stores * type.storeIncome * (1 + bonus);
  },

  incomePerHour(ind, E) {
    return this.grossPerDay(ind, E) * (1 - TAX.income) * 30;
  },

  value(ind, E) {
    const type = E.IND_BY_ID.cstore;
    const stores = ind.st.stores || 1;
    return type.openCost * stores * (1 + type.costSlope * (stores - 1) / 2);
  },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.cstore;
    const stores = ind.st.stores || 1;
    const m = stores < 10 ? 1 : Math.min(10, type.maxStores - stores);
    let cost = 0;
    for (let k = stores + 1; k <= stores + m; k++) cost += type.openCost * (1 + type.costSlope * (k - 1));
    return {
      stores,
      maxStores: type.maxStores,
      nextMilestone: type.milestones.find((x) => x.stores > stores) || null,
      bonus: type.milestones.filter((x) => stores >= x.stores).reduce((a, b) => Math.max(a, b.bonus), 0),
      nextExpand: m > 0 ? { count: m, cost } : null,
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  actions: {
    expand(ind, E) {
      const type = E.IND_BY_ID.cstore;
      const stores = ind.st.stores || 1;
      const m = stores < 10 ? 1 : Math.min(10, type.maxStores - stores);
      if (m <= 0) return { ok: false, msg: "已达门店上限" };
      let cost = 0;
      for (let k = stores + 1; k <= stores + m; k++) cost += type.openCost * (1 + type.costSlope * (k - 1));
      if (E.cash < cost) return { ok: false, msg: "现金不足" };
      E.cash -= cost;
      ind.st.stores += m;
      ind.invested += cost;
      E._record(`「${ind.name}」扩充门店 +${m} 家`, -cost, "expand");
      return { ok: true, count: m, cost };
    }
  }
};
