/* 信息技术公司：雇团队研发项目，运营期收租，过时收益衰减，研发四节点随机事件 */
import { treasuryState, pay } from "./base.js";

export default {
  id: "itcorp",
  defaults(ind, type) {
    return {
      ...treasuryState(),
      staff: { pm: 20, dev: 1, design: 0, test: 0 },   // PM 能力 + 程/设/测人数
      projects: []     // {projId, name, progress, cycle, incomePerHour, opHours, opLeft, stage, invested, stalledUntil}
    };
  },

  _wage(ind, E) {
    const type = E.IND_BY_ID.itcorp;
    const s = ind.st.staff;
    return s.pm * type.pmWageMul + (s.dev + s.design + s.test) * type.staffWage;
  },

  tickHour(ind, E) {
    const type = E.IND_BY_ID.itcorp;
    const st = ind.st;
    // 工资
    st.treasury -= this._wage(ind, E);
    // 运营项目产金
    for (const p of st.projects) {
      if (p.operating) {
        if (p.opLeft > 0) {
          st.treasury += p.incomePerHour;
          p.opLeft -= 1;
          if (p.opLeft <= 0) p.decayed = true;  // 运营期满 → 衰减
        } else {
          st.treasury += p.decayIncome;
        }
        continue;
      }
      // 研发推进
      if (p.stalledLeft > 0) { p.stalledLeft -= 1; continue; }  // 瓶颈停滞
      p.progress += 1;
      const pct = p.progress / p.cycle;
      // 四节点随机事件
      if (!p.ev20 && pct >= 0.2) { p.ev20 = true; if (E.rng() < 0.10) { p.dead = true; E._record(`💥 ${ind.name}：「${p.name}」早期失败，投入沉没`, 0, "event"); } }
      if (!p.ev50 && pct >= 0.5 && !p.dead) {
        p.ev50 = true;
        if (E.rng() < 0.15) { p.stalledLeft = 2; E._record(`🧱 ${ind.name}：「${p.name}」技术瓶颈，进度停滞 2 小时`, 0, "event"); }
      }
      if (!p.ev80 && pct >= 0.8 && !p.dead) {
        p.ev80 = true;
        if (E.rng() < 0.20) {
          const extra = Math.round(p.cost * 0.20);
          st.treasury -= extra;
          E._record(`🐛 ${ind.name}：「${p.name}」重大 Bug，追加投入 ${E._fmt(extra)}`, -extra, "invest");
        }
      }
      if (!p.ev100 && p.progress >= p.cycle && !p.dead) {
        p.ev100 = true;
        if (E.rng() < 0.25) { p.delayed = true; E._record(`⏳ ${ind.name}：「${p.name}」延期上线 3 小时，收益 +10%`, 0, "event"); }
        else E._record(`🚀 ${ind.name}：「${p.name}」研发完成，开始运营`, 0, "good");
        p.operating = true;
        p.opLeft = p.delayed ? p.opHours + 3 : p.opHours;
        p.incomePerHour = p.delayed ? Math.round(p.incomePerHour * 1.1) : p.incomePerHour;
        p.decayIncome = Math.round(p.incomePerHour * 0.10);
      }
      if (p.dead) p.deadDone = true;
    }
    st.projects = st.projects.filter((p) => !p.deadDone);
  },

  incomePerHour(ind, E) {
    let v = 0;
    for (const p of ind.st.projects || []) {
      if (p.operating) v += p.opLeft > 0 ? p.incomePerHour : (p.decayIncome || 0);
    }
    return v - this._wage(ind, E);
  },

  value(ind, E) {
    let v = ind.st.treasury;
    for (const p of ind.st.projects || []) {
      if (!p.operating) v += p.cost * (0.2 + 0.8 * (p.progress / p.cycle));
      else v += p.cost * 0.4;
    }
    return v;
  },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.itcorp;
    const st = ind.st;
    const rating = E.ratingOf(ind.profit || 0);
    return {
      staff: { ...st.staff },
      wagePerHour: this._wage(ind, E),
      layoffCost: Math.round(this._wage(ind, E) * type.layoffMul),
      projects: st.projects.map((p) => ({
        projId: p.projId, name: p.name,
        operating: p.operating,
        progress: p.progress, cycle: p.cycle,
        progressPct: Math.min(1, p.progress / p.cycle),
        incomePerHour: p.incomePerHour, decayIncome: p.decayIncome,
        opLeft: p.opLeft, opHours: p.opHours,
        stalledLeft: p.stalledLeft || 0
      })),
      market: type.projects.map((c) => ({
        id: c.id, name: c.name, rating: c.rating,
        cost: c.cost, cycle: c.cycle, opHours: c.opHours, incomePerHour: c.incomePerHour,
        pmAbility: c.pmAbility, team: c.team,
        locked: rating < c.rating || st.staff.pm < c.pmAbility,
        dev: st.projects.some((p) => p.projId === c.id)
      })),
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  offline(ind, hours, E) {
    // 离线：研发/运营照跑（按 offlineEff 由引擎折算），此处估算收益
    let income = 0, cost = this._wage(ind, E) * hours;
    for (const p of ind.st.projects || []) {
      if (p.operating) {
        const run = Math.min(p.opLeft, hours);
        income += p.incomePerHour * run;
        p.opLeft -= run;
      } else {
        const done = Math.min(p.cycle - p.progress, hours);
        p.progress += done;
        if (p.progress >= p.cycle) {
          p.operating = true;
          p.opLeft = p.opHours;
          p.decayIncome = Math.round(p.incomePerHour * 0.10);   // 与在线完成路径一致，防 NaN
        }
      }
    }
    return { income, cost };
  },

  /* 清算遣散赔偿：全员时薪 × 5 */
  liquidateCompensation(ind, E) {
    return Math.round(this._wage(ind, E) * E.IND_BY_ID.itcorp.layoffMul);
  },

  actions: {
    hire(ind, E, payload) {
      const type = E.IND_BY_ID.itcorp;
      const kind = payload.kind;   // "pm" | "dev" | "design" | "test"
      const st = ind.st;
      if (kind === "pm") {
        const cost = 10e4 * 10;
        if (!pay(ind, cost)) return { ok: false, msg: "公司池余额不足" };
        st.staff.pm += 10;
        E._record(`💼 ${ind.name}：招聘 PM（能力 +10）`, -cost, "expand");
        return { ok: true, cost };
      }
      const cost = 10e4;
      if (!pay(ind, cost)) return { ok: false, msg: "公司池余额不足" };
      st.staff[kind] += 1;
      E._record(`🧑‍💻 ${ind.name}：招聘${kind === "dev" ? "程序员" : kind === "design" ? "设计师" : "测试员"} +1`, -cost, "expand");
      return { ok: true, cost };
    },
    layoff(ind, E, payload) {
      const type = E.IND_BY_ID.itcorp;
      const kind = payload.kind;
      const st = ind.st;
      if (kind === "pm") {
        if (st.staff.pm <= 10) return { ok: false, msg: "至少保留 1 名 PM（能力 10）" };
        const wage = 10 * type.pmWageMul;
        const comp = wage * type.layoffMul;
        if (!pay(ind, comp)) return { ok: false, msg: "公司池不足付赔偿金" };
        st.staff.pm -= 10;
        E._record(`🚪 ${ind.name}：解雇 PM（赔偿 ${E._fmt(comp)}）`, -comp, "cost");
        return { ok: true, cost: comp };
      }
      if (st.staff[kind] <= 0) return { ok: false, msg: "无此岗位员工" };
      const comp = type.staffWage * type.layoffMul;
      if (!pay(ind, comp)) return { ok: false, msg: "公司池不足付赔偿金" };
      st.staff[kind] -= 1;
      E._record(`🚪 ${ind.name}：解雇${kind === "dev" ? "程序员" : kind === "design" ? "设计师" : "测试员"}`, -comp, "cost");
      return { ok: true, cost: comp };
    },
    startProject(ind, E, payload) {
      const type = E.IND_BY_ID.itcorp;
      const proj = type.projects.find((p) => p.id === payload.projId);
      if (!proj) return { ok: false, msg: "无此项目" };
      const rating = E.ratingOf(ind.profit || 0);
      if (rating < proj.rating) return { ok: false, msg: "评级不足" };
      if (ind.st.staff.pm < proj.pmAbility) return { ok: false, msg: `PM 能力不足（需 ${proj.pmAbility}）` };
      if (ind.st.staff.dev < proj.team[0] || ind.st.staff.design < proj.team[1] || ind.st.staff.test < proj.team[2])
        return { ok: false, msg: "团队配置不足（程/设/测）" };
      if (ind.st.projects.some((p) => p.projId === proj.id)) return { ok: false, msg: "该项目已在进行" };
      if (!pay(ind, proj.cost)) return { ok: false, msg: "公司池余额不足（先注资）" };
      ind.st.projects.push({
        projId: proj.id, name: proj.name, cost: proj.cost, cycle: proj.cycle,
        progress: 0, operating: false, incomePerHour: proj.incomePerHour,
        opHours: proj.opHours, opLeft: 0, invested: proj.cost
      });
      ind.invested += proj.cost;
      E._record(`💻 ${ind.name}：启动「${proj.name}」研发（${proj.cycle} 小时）`, -proj.cost, "invest");
      return { ok: true, cost: proj.cost };
    }
  }
};
