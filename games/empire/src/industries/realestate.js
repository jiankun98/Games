/* 房地产开发：建筑队 + 项目开发，忙队付工资，周期到售楼回款（大额一次性入池） */
import { treasuryState, pay } from "./base.js";

export default {
  id: "realestate",
  defaults(ind, type) {
    return { ...treasuryState(), teams: type.teamBase, projects: [] };
  },

  tickHour(ind, E) {
    const type = E.IND_BY_ID.realestate;
    const st = ind.st;
    // 在建项目推进 + 忙队工资
    const wages = st.projects.length * type.teamWage;
    st.treasury -= wages;   // 忙队工资（池空由引擎统一停摆处理）
    for (const p of st.projects) {
      p.progress = (p.progress || 0) + 1;
      if (p.progress >= p.cycle) {
        st.treasury += p.totalIncome;
        E._record(`🏗️ ${ind.name}：「${p.name}」竣工售楼，回款 ${E._fmt(p.totalIncome)}`, p.totalIncome, "income");
      }
    }
    st.projects = st.projects.filter((p) => p.progress < p.cycle);
  },

  incomePerHour(ind, E) {
    const st = ind.st;
    // 预期：完工项目的等效收益 - 工资
    let projIncome = 0;
    for (const p of st.projects) projIncome += p.totalIncome / p.cycle;
    return projIncome - st.projects.length * E.IND_BY_ID.realestate.teamWage;
  },

  value(ind, E) {
    const type = E.IND_BY_ID.realestate;
    const st = ind.st;
    let v = st.treasury;
    for (const p of st.projects) v += p.cost * (0.3 + 0.7 * (p.progress / p.cycle));  // 在建按进度
    v += (st.teams - type.teamBase) * 200e4;  // 额外建筑队账面
    return v;
  },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.realestate;
    const st = ind.st;
    const rating = E.ratingOf(ind.profit || 0);
    return {
      teams: st.teams, teamMax: type.teamMax,
      nextTeamCost: st.teams < type.teamMax ? Math.round(type.teamCost(st.teams)) : 0,
      teamWage: type.teamWage,
      projects: st.projects.map((p) => ({
        projId: p.projId, name: p.name, progress: p.progress, cycle: p.cycle,
        progressPct: p.progress / p.cycle, totalIncome: p.totalIncome, cost: p.cost
      })),
      market: type.projects.map((c) => ({
        id: c.id, name: c.name, rating: c.rating,
        cost: c.cost, cycle: c.cycle, totalIncome: c.totalIncome, teams: c.teams,
        locked: rating < c.unlockRating || st.teams < c.teams,
        building: st.projects.some((p) => p.projId === c.id)
      })),
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  offline(ind, hours, E) {
    const type = E.IND_BY_ID.realestate;
    const st = ind.st;
    let income = 0, cost = 0;
    for (const p of st.projects) {
      const left = p.cycle - (p.progress || 0);
      const done = Math.min(left, hours);
      p.progress = (p.progress || 0) + done;
      if (p.progress >= p.cycle) income += p.totalIncome;
      cost += done * type.teamWage;
    }
    st.projects = st.projects.filter((p) => p.progress < p.cycle);
    return { income, cost };
  },

  /* 清算遣散赔偿：建筑队 5 万时薪 × 5 */
  liquidateCompensation(ind, E) {
    return Math.round(ind.st.teams * E.IND_BY_ID.realestate.teamWage * 5);
  },

  actions: {
    build(ind, E, payload) {
      const type = E.IND_BY_ID.realestate;
      const proj = type.projects.find((p) => p.id === payload.projId);
      if (!proj) return { ok: false, msg: "无此项目" };
      const rating = E.ratingOf(ind.profit || 0);
      if (rating < proj.unlockRating) return { ok: false, msg: "评级不足" };
      if (ind.st.teams < proj.teams) return { ok: false, msg: `建筑队不足（需 ${proj.teams} 队）` };
      if (ind.st.projects.length >= ind.st.teams) return { ok: false, msg: "建筑队全忙" };
      if (ind.st.projects.some((p) => p.projId === proj.id)) return { ok: false, msg: "该项目已在建" };
      if (!pay(ind, proj.cost)) return { ok: false, msg: "公司池余额不足（先注资）" };
      ind.st.projects.push({ projId: proj.id, name: proj.name, cycle: proj.cycle, cost: proj.cost, totalIncome: proj.totalIncome, progress: 0 });
      ind.invested += proj.cost;
      E._record(`🏗️ ${ind.name}：开工「${proj.name}」（${proj.cycle} 小时）`, -proj.cost, "invest");
      return { ok: true, cost: proj.cost };
    },
    hireTeam(ind, E) {
      const type = E.IND_BY_ID.realestate;
      if (ind.st.teams >= type.teamMax) return { ok: false, msg: "已达最大建筑队" };
      const cost = Math.round(type.teamCost(ind.st.teams));
      if (!pay(ind, cost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.teams += 1;
      ind.invested += cost;
      E._record(`🏗️ ${ind.name}：新增 1 支建筑队（共 ${ind.st.teams} 队）`, -cost, "expand");
      return { ok: true, cost };
    }
  }
};
