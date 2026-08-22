/* 汽车经销商：每小时刷 3 辆二手车 → 收购 → 维修 → 高价出售 */
import { treasuryState, pay } from "./base.js";

export default {
  id: "dealer",
  defaults(ind, type) {
    return {
      ...treasuryState(),
      workshop: type.workshopBase,
      stalls: type.stallBase,
      seq: 0,              // 刷车序列器（旧档可能为 NaN，tickHour 会自愈）
      market: [],        // 在售二手车 {carId, brandId, wear}
      lots: [],          // 已收购 {carId, brandId, wear, status:"stored"|"repairing", repairLeft}
      sold: 0
    };
  },

  /* 按评级加权抽品牌：权重 = 1 / (|品牌评级 - 公司评级| + 1) */
  _pickBrand(ind, E, type) {
    const rating = E.ratingOf(ind.profit || 0);
    let total = 0;
    const weights = type.brands.map((b) => {
      const w = 1 / (Math.abs(b.rating - rating) + 1);
      total += w;
      return w;
    });
    let r = E.rng() * total;
    for (let i = 0; i < type.brands.length; i++) {
      r -= weights[i];
      if (r <= 0) return type.brands[i];
    }
    return type.brands[type.brands.length - 1];
  },

  tickHour(ind, E) {
    const type = E.IND_BY_ID.dealer;
    const st = ind.st;
    // 刷 3 辆二手车进市场（carId 全局唯一，兼容旧档 NaN 序列器）
    for (let i = 0; i < type.spawnPerHour; i++) {
      const brand = this._pickBrand(ind, E, type);
      st.seq = (Number.isFinite(st.seq) ? st.seq : 0) + 1;
      st.market.push({ carId: "c" + st.seq, brandId: brand.id, wear: 0.3 + E.rng() * 0.5 });
    }
    // 维修车间推进（维修中车辆每小时成本 = 品牌残值 × 1.5%，低档车不再修亏）
    for (const lot of st.lots) {
      if (lot.status !== "repairing") continue;
      const brand = type.brandSpec[lot.brandId];
      st.treasury -= brand.resale * type.repairWageRate;
      lot.repairLeft -= 1;
      if (lot.repairLeft <= 0) { lot.status = "stored"; lot.wear = 0; }
    }
    // 市场压满 12 辆不再刷（防无限膨胀）
    if (st.market.length > 12) st.market.splice(0, st.market.length - 12);
  },

  incomePerHour(ind, E) {
    return 0; // 经销商利润来自买卖差价（一次性），无稳定时收益
  },

  value(ind, E) {
    const type = E.IND_BY_ID.dealer;
    const st = ind.st;
    let v = st.treasury;
    for (const lot of st.lots) {
      const b = type.brandSpec[lot.brandId];
      if (b) v += lot.wear > 0 ? b.resale * (1 - lot.wear) * 0.6 : b.resale * 0.8;
    }
    v += (st.workshop - type.workshopBase) * 200e4 + (st.stalls - type.stallBase) * 100e4;
    return v;
  },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.dealer;
    const st = ind.st;
    const rating = E.ratingOf(ind.profit || 0);
    return {
      workshop: st.workshop, stalls: st.stalls,
      workshopCost: type.workshopCost, stallCost: type.stallCost,
      workshopCostPerHour: type.workshopCostPerHour,
      market: st.market.map((c) => {
        const b = type.brandSpec[c.brandId];
        return { carId: c.carId, brandId: c.brandId, name: b.name, wear: c.wear, price: Math.round(b.resale * (1 - c.wear)) };
      }),
      lots: st.lots.map((l) => {
        const b = type.brandSpec[l.brandId];
        return {
          carId: l.carId, brandId: l.brandId, name: b.name,
          wear: l.wear, status: l.status, repairLeft: l.repairLeft || 0,
          repairHours: Math.round(l.wear * type.brandSpec[l.brandId].repairMul),
          sellPrice: b.sellPrice
        };
      }),
      brands: type.brands.map((b) => ({
        id: b.id, name: b.name, rating: b.rating,
        resale: b.resale, sellPrice: b.sellPrice,
        locked: rating < b.unlockRating
      })),
      incomePerHour: 0, sold: st.sold
    };
  },

  offline(ind, hours, E) {
    // 离线不刷市场，仅推进维修并照收车间时薪（与在线口径一致）
    const type = E.IND_BY_ID.dealer;
    let cost = 0;
    for (const lot of ind.st.lots) {
      if (lot.status !== "repairing") continue;
      const run = Math.min(hours, lot.repairLeft || 0);
      const brand = type.brandSpec[lot.brandId];
      cost += brand.resale * type.repairWageRate * run;
      lot.repairLeft -= run;
      if (lot.repairLeft <= 0) { lot.status = "stored"; lot.wear = 0; }
    }
    return { income: 0, cost };
  },

  /* 清算遣散赔偿：每车间 1 名技师（时薪 = 品牌残值×1.5% 近似取 5 万）× 5 倍 */
  liquidateCompensation(ind, E) {
    return Math.round(ind.st.workshop * 5e4 * 5);
  },

  actions: {
    buy(ind, E, payload) {
      const type = E.IND_BY_ID.dealer;
      const st = ind.st;
      const idx = st.market.findIndex((c) => c.carId === payload.carId);
      if (idx < 0) return { ok: false, msg: "该车不在市场" };
      if (st.lots.length >= st.stalls) return { ok: false, msg: "车位已满（压库）" };
      const car = st.market[idx];
      const brand = type.brandSpec[car.brandId];
      const price = Math.round(brand.resale * (1 - car.wear));
      if (!pay(ind, price)) return { ok: false, msg: "公司池余额不足" };
      st.market.splice(idx, 1);
      st.lots.push({ carId: car.carId, brandId: car.brandId, wear: car.wear, status: "stored" });
      E._record(`🚘 ${ind.name}：收购「${brand.name}」（损耗 ${(car.wear * 100).toFixed(0)}%）`, -price, "invest");
      return { ok: true, cost: price };
    },
    repair(ind, E, payload) {
      const type = E.IND_BY_ID.dealer;
      const st = ind.st;
      const lot = st.lots.find((l) => l.carId === payload.carId);
      if (!lot) return { ok: false, msg: "无此车辆" };
      if (lot.status === "repairing") return { ok: false, msg: "已在维修中" };
      if (lot.wear <= 0) return { ok: false, msg: "无需维修" };
      const repairing = st.lots.filter((l) => l.status === "repairing").length;
      if (repairing >= st.workshop) return { ok: false, msg: "维修车间已满（可扩建）" };
      lot.status = "repairing";
      lot.repairLeft = Math.round(lot.wear * type.brandSpec[lot.brandId].repairMul);
      E._record(`🔧 ${ind.name}：「${type.brandSpec[lot.brandId].name}」开始维修`, 0, "event");
      return { ok: true };
    },
    sell(ind, E, payload) {
      const type = E.IND_BY_ID.dealer;
      const st = ind.st;
      const idx = st.lots.findIndex((l) => l.carId === payload.carId);
      if (idx < 0) return { ok: false, msg: "无此车辆" };
      const lot = st.lots[idx];
      if (lot.status !== "stored" || lot.wear > 0) return { ok: false, msg: "车辆未修好" };
      const brand = type.brandSpec[lot.brandId];
      st.lots.splice(idx, 1);
      st.treasury += brand.sellPrice;
      st.sold = (st.sold || 0) + 1;
      E._record(`💵 ${ind.name}：售出「${brand.name}」+${E._fmt(brand.sellPrice)}`, brand.sellPrice, "income");
      return { ok: true, gain: brand.sellPrice };
    },
    expand(ind, E, payload) {
      const type = E.IND_BY_ID.dealer;
      const kind = payload.kind;   // "workshop" | "stall"
      const cost = kind === "workshop" ? type.workshopCost : type.stallCost;
      if (!pay(ind, cost)) return { ok: false, msg: "公司池余额不足" };
      if (kind === "workshop") ind.st.workshop += 1;
      else ind.st.stalls += 1;
      ind.invested += cost;
      E._record(`🚘 ${ind.name}：扩展${kind === "workshop" ? "维修车间" : "销售台"} +1`, -cost, "expand");
      return { ok: true, cost };
    }
  }
};
