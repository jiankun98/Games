/* 租车公司：机队时租 + 车库槽位扩展（复用机队基类，维修更频繁） */
import { fleetDefaults, fleetTick, fleetBuy, fleetRepair, fleetValue, fleetSnapshot, fleetOffline, pay } from "./base.js";

export default {
  id: "rental",
  defaults(ind, type) {
    return { ...fleetDefaults(), garage: type.garageBase };
  },

  tickHour(ind, E) { fleetTick(ind, E, E.IND_BY_ID.rental, "fleet"); },

  incomePerHour(ind, E) {
    let v = 0;
    for (const f of ind.st.fleet || []) {
      if (f.status !== "running") continue;
      const spec = E.IND_BY_ID.rental.fleetSpec[f.fleetId];
      if (spec) v += spec.incomePerHour;
    }
    return v;
  },

  value(ind, E) { return fleetValue(ind, E.IND_BY_ID.rental, "fleet"); },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.rental;
    const st = ind.st;
    const base = fleetSnapshot(ind, E, type, "fleet");
    return {
      ...base,
      garage: st.garage, garageUsed: (st.fleet || []).length, garageCost: type.garageCost,
      market: type.fleet.map((v) => ({
        id: v.id, name: v.name, rating: v.rating,
        cost: v.cost, incomePerHour: v.incomePerHour,
        maxHours: v.maxHours, repairCost: v.repairCost,
        locked: E.ratingOf(ind.profit || 0) < v.rating,
        ownedCount: st.fleet.filter((f) => f.fleetId === v.id).length
      })),
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  offline(ind, hours, E) { return fleetOffline(ind, hours, E, E.IND_BY_ID.rental, "fleet"); },

  /* 清算遣散赔偿：每车 2 千时薪 × 5 */
  liquidateCompensation(ind, E) {
    return Math.round((ind.st.fleet || []).length * 2e3 * 5);
  },

  actions: {
    buy(ind, E, payload) {
      const type = E.IND_BY_ID.rental;
      const spec = type.fleetSpec[payload.fleetId];
      if (!spec) return { ok: false, msg: "无此车型" };
      if (E.ratingOf(ind.profit || 0) < spec.rating) return { ok: false, msg: "评级不足" };
      return fleetBuy(ind, E, type, spec, "fleet");
    },
    repair(ind, E, payload) { return fleetRepair(ind, E, E.IND_BY_ID.rental, payload.fid || payload.fleetId, "fleet"); },
    expandGarage(ind, E) {
      const type = E.IND_BY_ID.rental;
      if (!pay(ind, type.garageCost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.garage += 1;
      ind.invested += type.garageCost;
      E._record(`🚗 ${ind.name}：车库扩容 +1 槽`, -type.garageCost, "expand");
      return { ok: true, cost: type.garageCost };
    }
  }
};
