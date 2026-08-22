/* 快递公司：机队产金 + 里程维修 + 车位/机位扩展 */
import { fleetDefaults, fleetTick, fleetBuy, fleetRepair, fleetValue, fleetSnapshot, fleetOffline, pay } from "./base.js";

export default {
  id: "express",
  defaults(ind, type) {
    return { ...fleetDefaults(), vehicles: type.slots.vehicle, planes: type.slots.plane, slotPending: [] };
  },

  tickHour(ind, E) {
    const st = ind.st;
    // 槽位建造计时（1h/24h 后启用）
    for (const p of st.slotPending || []) {
      p.left -= 1;
      if (p.left <= 0) {
        if (p.kind === "plane") st.planes += 1; else st.vehicles += 1;
        E._record(`🏗️ ${ind.name}：${p.kind === "plane" ? "机位" : "车位"}建造完成`, 0, "good");
      }
    }
    if (st.slotPending) st.slotPending = st.slotPending.filter((p) => p.left > 0);
    fleetTick(ind, E, E.IND_BY_ID.express, "fleet");
  },

  incomePerHour(ind, E) {
    let v = 0;
    for (const f of ind.st.fleet || []) {
      if (f.status !== "running") continue;
      const spec = E.IND_BY_ID.express.fleetSpec[f.fleetId];
      if (spec) v += spec.incomePerHour;
    }
    return v;
  },

  value(ind, E) { return fleetValue(ind, E.IND_BY_ID.express, "fleet"); },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.express;
    const st = ind.st;
    const base = fleetSnapshot(ind, E, type, "fleet");
    const vehiclesUsed = (st.fleet || []).filter((f) => {
      const s2 = type.fleetSpec[f.fleetId] || {};
      return s2.kind !== "plane";
    }).length;
    const planesUsed = (st.fleet || []).length - vehiclesUsed;
    return {
      ...base,
      vehicles: st.vehicles, planes: st.planes,
      vehiclesUsed, planesUsed,
      vehicleCost: type.slotCost.vehicle, planeCost: type.slotCost.plane,
      vehicleHours: type.slotHours.vehicle, planeHours: type.slotHours.plane,
      slotPending: (st.slotPending || []).map((p) => ({
        kind: p.kind, left: p.left, total: type.slotHours[p.kind]
      })),
      market: type.fleet.map((v) => ({
        id: v.id, name: v.name, rating: v.rating, kind: v.kind,
        cost: v.cost, incomePerHour: v.incomePerHour,
        maxHours: v.maxHours, repairCost: v.repairCost,
        locked: E.ratingOf(ind.profit || 0) < v.rating,
        ownedCount: st.fleet.filter((f) => f.fleetId === v.id).length
      })),
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  offline(ind, hours, E) {
    // 离线推进槽位建造
    const st = ind.st;
    for (const p of st.slotPending || []) {
      p.left -= hours;
      if (p.left <= 0) {
        if (p.kind === "plane") st.planes += 1; else st.vehicles += 1;
      }
    }
    if (st.slotPending) st.slotPending = st.slotPending.filter((p) => p.left > 0);
    return fleetOffline(ind, hours, E, E.IND_BY_ID.express, "fleet");
  },

  /* 清算遣散赔偿：每载具随车人员 1 万时薪 × 5 */
  liquidateCompensation(ind, E) {
    return Math.round((ind.st.fleet || []).length * 1e4 * 5);
  },

  actions: {
    buy(ind, E, payload) {
      const type = E.IND_BY_ID.express;
      const spec = type.fleetSpec[payload.fleetId];
      if (!spec) return { ok: false, msg: "无此载具" };
      if (E.ratingOf(ind.profit || 0) < spec.rating) return { ok: false, msg: "评级不足" };
      return fleetBuy(ind, E, type, spec, "fleet");
    },
    repair(ind, E, payload) { return fleetRepair(ind, E, E.IND_BY_ID.express, payload.fid || payload.fleetId, "fleet"); },
    expandSlot(ind, E, payload) {
      const type = E.IND_BY_ID.express;
      const kind = payload.kind;   // "vehicle" | "plane"
      const cost = type.slotCost[kind];
      if (!pay(ind, cost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.slotPending = ind.st.slotPending || [];
      ind.st.slotPending.push({ kind, left: type.slotHours[kind] });
      ind.invested += cost;
      E._record(`🚚 ${ind.name}：扩建${kind === "plane" ? "机位" : "车位"}（${type.slotHours[kind]} 小时后启用）`, -cost, "expand");
      return { ok: true, cost };
    }
  }
};
