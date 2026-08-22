/* 石油能源：勘探赌博 + 平台开采（维护费不论产出）+ 油价波动 + 储油罐套利 + 炼油厂翻倍 */
import { treasuryState, pay } from "./base.js";

export default {
  id: "oil",
  defaults(ind, type) {
    return {
      ...treasuryState(),
      price: 100,             // 当前油价 $/桶
      priceAcc: 0,            // 油价波动累积器（小时）
      fields: [],             // {id, reserve} 油田
      platforms: [],          // {fieldId, status:"pumping"|"idle"}
      refinery: false,
      tank: { capacity: type.tankBase, stock: 0, hoarding: false }  // 储油罐
    };
  },

  tickHour(ind, E) {
    const type = E.IND_BY_ID.oil;
    const st = ind.st;
    // 油价每 6h 波动
    st.priceAcc += 1;
    if (st.priceAcc >= type.oilPricePeriod) {
      st.priceAcc = 0;
      st.price = type.oilPriceMin + E.rng() * (type.oilPriceMax - type.oilPriceMin);
      E._record(`🛢️ ${ind.name}：国际油价波动至 $${Math.round(st.price)}/桶`, 0, "event");
    }
    // 平台开采 + 维护费（不论产出）
    for (const pl of st.platforms) {
      st.treasury -= type.platformMaintain;
      if (pl.status !== "pumping") continue;
      const field = st.fields.find((f) => f.id === pl.fieldId);
      if (!field || field.reserve <= 0) { pl.status = "idle"; continue; }
      let barrels = Math.min(type.platformOutput, field.reserve);
      field.reserve -= barrels;
      const eff = st.refinery ? 2 : 1;
      if (st.tank.hoarding) {
        const put = Math.min(st.tank.capacity - st.tank.stock, barrels * eff);
        st.tank.stock += put;
      } else {
        st.treasury += barrels * eff * st.price;
      }
      if (field.reserve <= 0) {
        pl.status = "idle";
        E._record(`🪦 ${ind.name}：油田枯竭，平台 ${pl.id} 闲置（需搬运）`, 0, "event");
      }
    }
  },

  incomePerHour(ind, E) {
    const type = E.IND_BY_ID.oil;
    const st = ind.st;
    let v = 0;
    for (const pl of st.platforms) {
      v -= type.platformMaintain;
      if (pl.status !== "pumping") continue;
      const field = st.fields.find((f) => f.id === pl.fieldId);
      if (!field || field.reserve <= 0) continue;
      const eff = st.refinery ? 2 : 1;
      if (!st.tank.hoarding) v += Math.min(type.platformOutput, field.reserve) * eff * st.price;
    }
    return v;
  },

  value(ind, E) {
    const type = E.IND_BY_ID.oil;
    const st = ind.st;
    let v = st.treasury;
    v += st.fields.reduce((a, f) => a + Math.min(f.reserve, 1e6) * 0.1, 0);   // 储量账面
    v += st.platforms.length * type.platformCost * 0.6;
    v += st.tank.stock * st.price;
    v += st.refinery ? type.refineryCost * 0.6 : 0;
    return v;
  },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.oil;
    const st = ind.st;
    return {
      price: Math.round(st.price),
      priceRange: [type.oilPriceMin, type.oilPriceMax],
      fields: st.fields.map((f) => ({ id: f.id, reserve: Math.round(f.reserve), reserve0: Math.round(f.reserve0 || f.reserve) })),
      platforms: st.platforms.map((pl) => {
        const field = st.fields.find((f) => f.id === pl.fieldId);
        return { id: pl.id, fieldId: pl.fieldId, status: pl.status, reserve: field ? Math.round(field.reserve) : 0 };
      }),
      refinery: st.refinery,
      tank: { ...st.tank },
      platformCost: type.platformCost,
      platformOutput: type.platformOutput,
      platformMaintain: type.platformMaintain,
      exploreCost: type.exploreCost,
      exploreChance: type.exploreChance,
      moveCostPerHour: type.moveCostPerHour,
      refineryCost: type.refineryCost,
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  offline(ind, hours, E) {
    const type = E.IND_BY_ID.oil;
    const st = ind.st;
    let income = 0, cost = 0;
    for (const pl of st.platforms) {
      cost += type.platformMaintain * hours;
      if (pl.status !== "pumping") continue;
      const field = st.fields.find((f) => f.id === pl.fieldId);
      if (!field || field.reserve <= 0) continue;
      const barrels = Math.min(type.platformOutput * hours, field.reserve);
      field.reserve -= barrels;
      const eff = st.refinery ? 2 : 1;
      if (st.tank.hoarding) {
        // 离线囤油同样入罐（修复离线丢产量）
        const put = Math.min(st.tank.capacity - st.tank.stock, barrels * eff);
        st.tank.stock += put;
      } else {
        income += barrels * eff * st.price;
      }
      if (field.reserve <= 0) pl.status = "idle";
    }
    return { income, cost };
  },

  /* 清算遣散赔偿：每平台 10 万时薪 × 5 */
  liquidateCompensation(ind, E) {
    return Math.round((ind.st.platforms || []).length * 10e4 * 5);
  },

  actions: {
    explore(ind, E) {
      const type = E.IND_BY_ID.oil;
      if (!pay(ind, type.exploreCost)) return { ok: false, msg: "公司池余额不足" };
      if (E.rng() < type.exploreChance) {
        const reserve = Math.round(1e5 + E.rng() * 9.9e6);
        ind.st.fields.push({ id: "f" + (ind.st.fields.length + 1), reserve, reserve0: reserve });
        E._record(`⛽ ${ind.name}：勘探成功！发现油田（储量 ${E._fmt(reserve)} 桶）`, -type.exploreCost, "good");
        return { ok: true, reserve };
      }
      E._record(`💸 ${ind.name}：勘探失败，投入打水漂`, -type.exploreCost, "cost");
      return { ok: false, msg: "勘探失败（70%），投入沉没" };
    },
    buildPlatform(ind, E, payload) {
      const type = E.IND_BY_ID.oil;
      const field = ind.st.fields.find((f) => f.id === payload.fieldId);
      if (!field) return { ok: false, msg: "无此油田" };
      if (ind.st.platforms.some((p) => p.fieldId === field.id)) return { ok: false, msg: "该油田已有平台" };
      if (!pay(ind, type.platformCost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.platforms.push({ id: "p" + (ind.st.platforms.length + 1), fieldId: field.id, status: "pumping" });
      ind.invested += type.platformCost;
      E._record(`🏗️ ${ind.name}：部署钻井平台（产油 ${type.platformOutput} 桶/时）`, -type.platformCost, "expand");
      return { ok: true, cost: type.platformCost };
    },
    movePlatform(ind, E, payload) {
      const type = E.IND_BY_ID.oil;
      const pl = ind.st.platforms.find((p) => p.id === payload.platformId);
      if (!pl) return { ok: false, msg: "无此平台" };
      if (pl.status === "pumping") return { ok: false, msg: "平台在产油中" };
      const field = ind.st.fields.find((f) => f.id === payload.fieldId);
      if (!field || field.reserve <= 0) return { ok: false, msg: "目标油田无效或已枯竭" };
      if (!pay(ind, type.moveCostPerHour)) return { ok: false, msg: "公司池余额不足（搬运费 200 万）" };
      pl.fieldId = field.id;
      pl.status = "pumping";
      E._record(`🚛 ${ind.name}：平台搬运至新油田`, -type.moveCostPerHour, "cost");
      return { ok: true, cost: type.moveCostPerHour };
    },
    buildRefinery(ind, E) {
      const type = E.IND_BY_ID.oil;
      if (ind.st.refinery) return { ok: false, msg: "炼油厂已建成" };
      if (!pay(ind, type.refineryCost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.refinery = true;
      ind.invested += type.refineryCost;
      E._record(`🏭 ${ind.name}：建成炼油厂，产油利润翻倍`, -type.refineryCost, "expand");
      return { ok: true, cost: type.refineryCost };
    },
    toggleHoarding(ind, E) {
      const st = ind.st;
      st.tank.hoarding = !st.tank.hoarding;
      E._record(`🛢️ ${ind.name}：${st.tank.hoarding ? "开启囤油（等待高价抛售）" : "关闭囤油（产出直接出售）"}`, 0, "event");
      return { ok: true, hoarding: st.tank.hoarding };
    },
    dumpTank(ind, E) {
      const st = ind.st;
      if (st.tank.stock <= 0) return { ok: false, msg: "储油罐为空" };
      const sold = st.tank.stock;
      const amt = sold * st.price;
      st.tank.stock = 0;
      st.treasury += amt;
      E._record(`💰 ${ind.name}：抛售储油 ${E._fmt(sold)} 桶，入账 ${E._fmt(amt)}`, amt, "income");
      return { ok: true, gain: amt };
    },
    upgradeTank(ind, E) {
      const type = E.IND_BY_ID.oil;
      const cost = Math.round(ind.st.tank.capacity * 0.2);
      if (!pay(ind, cost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.tank.capacity = Math.round(ind.st.tank.capacity * 1.5);
      ind.invested += cost;
      E._record(`🛢️ ${ind.name}：储油罐扩容至 ${E._fmt(ind.st.tank.capacity)} 桶`, -cost, "expand");
      return { ok: true, cost };
    }
  }
};
