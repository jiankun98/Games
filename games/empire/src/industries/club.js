/* 俱乐部：青训 + 转会 + 训练赛 + 赞助 + 体育场门票，战绩差时工资持续失血 */
import { treasuryState, pay } from "./base.js";

const FIRST = ["阿伦", "小林", "大力", "俊杰", "志强", "小宇", "子墨", "浩然", "嘉豪", "一鸣"];
const SUR = ["锋", "昊", "凯", "鹏", "洋", "硕", "瑞", "哲", "辰", "曦"];

function randName(E) {
  return FIRST[Math.floor(E.rng() * FIRST.length)] + SUR[Math.floor(E.rng() * SUR.length)];
}

export default {
  id: "club",
  defaults(ind, type) {
    return {
      ...treasuryState(),
      pseq: 0,             // 球员唯一 id 序列器
      rep: 0,               // 声望
      wins: 0, matches: 0,  // 战绩
      academy: { progress: 0, level: 1 },
      market: [],           // 转会市场（每小时刷 3 名）
      players: []           // {id, name, ability, wage}
    };
  },

  _teamAbility(st) {
    return st.players.reduce((a, p) => a + p.ability, 0);
  },

  /* 赞助/时 = 基础 × (1+胜率) × (1+总能力/100)：球员实力直接提升赞助收入 */
  _sponsor(st, E) {
    const type = E.IND_BY_ID.club;
    const rate = st.matches ? st.wins / st.matches : 0;
    const ability = this._teamAbility(st);
    return Math.round(type.sponsorBase * (1 + rate) * (1 + ability / 100));
  },

  /* 门票/时：按声望档 */
  _ticket(st, E) {
    const type = E.IND_BY_ID.club;
    for (let i = type.stadiumRep.length - 1; i >= 0; i--) {
      if (st.rep >= type.stadiumRep[i]) return type.stadiumIncome[i];
    }
    return 0;
  },

  _genPlayer(ind, E, ability) {
    const st = ind.st;
    st.pseq = (Number.isFinite(st.pseq) ? st.pseq : 0) + 1;
    return { id: "pl" + st.pseq, name: randName(E), ability, wage: ability * 0.1e4 };
  },

  tickHour(ind, E) {
    const type = E.IND_BY_ID.club;
    const st = ind.st;
    // 转会市场每小时刷 3 名
    for (let i = 0; i < 3; i++) {
      const ability = 1 + Math.floor(E.rng() * 99);
      st.market.push(this._genPlayer(ind, E, ability));
    }
    if (st.market.length > 9) st.market.splice(0, st.market.length - 9);
    // 青训推进（12h 产 1 员；等级越高能力越强）
    st.academy.progress += 1;
    if (st.academy.progress >= type.academyCycle) {
      st.academy.progress = 0;
      const ability = Math.min(95, 10 + Math.floor(E.rng() * 30) + st.academy.level * 8);
      st.players.push(this._genPlayer(ind, E, ability));
      st.rep += 50;
      E._record(`🌱 ${ind.name}：青训结训，「${st.players[st.players.length - 1].name}」（能力 ${ability}）`, 0, "good");
    }
    // 训练赛：对手强度随评级提升，胜率由双方实力比决定（球员培养有效）
    const mine = this._teamAbility(st);
    if (mine > 0) {
      const oppLevel = 30 + (ind.rating || 0) * 40 + E.rng() * 60;
      const winProb = mine / (mine + oppLevel);
      const win = E.rng() < winProb;
      st.matches += 1;
      if (win) {
        st.wins += 1;
        st.rep += 30;
        const bonus = (ind.rating + 1) * type.matchBonusBase;
        st.treasury += bonus;
        E._record(`⚽ ${ind.name}：训练赛获胜，奖金 ${E._fmt(bonus)}`, bonus, "income");
      } else {
        st.rep = Math.max(0, st.rep - 20);
      }
    }
    // 赞助 + 门票 - 工资
    st.treasury += this._sponsor(st, E);
    st.treasury += this._ticket(st, E);
    const wages = st.players.reduce((a, p) => a + p.wage, 0);
    st.treasury -= wages;
  },

  incomePerHour(ind, E) {
    const type = E.IND_BY_ID.club;
    const st = ind.st;
    const wages = st.players.reduce((a, p) => a + p.wage, 0);
    return this._sponsor(st, E) + this._ticket(st, E) - wages
      + (st.matches % 2 ? (ind.rating + 1) * type.matchBonusBase / 2 : 0);
  },

  value(ind, E) {
    const st = ind.st;
    return st.treasury + st.players.reduce((a, p) => a + p.ability * 10e4 * 0.5, 0);  // 球员身价 50%
  },

  snapshot(ind, E) {
    const type = E.IND_BY_ID.club;
    const st = ind.st;
    const rate = st.matches ? st.wins / st.matches : 0;
    // 下一体育场目标（声望进度）
    let nextStadium = null;
    for (let i = 0; i < type.stadiumRep.length; i++) {
      if (st.rep < type.stadiumRep[i]) {
        const lo = i > 0 ? type.stadiumRep[i - 1] : 0;
        nextStadium = {
          rep: st.rep, need: type.stadiumRep[i], lo,
          income: type.stadiumIncome[i],
          progress: Math.min(1, Math.max(0, (st.rep - lo) / (type.stadiumRep[i] - lo)))
        };
        break;
      }
    }
    return {
      rep: st.rep,
      nextStadium,
      teamAbility: this._teamAbility(st),
      record: { wins: st.wins, matches: st.matches, rate },
      academy: { ...st.academy, cycle: type.academyCycle, upgradeCost: type.academyCost },
      market: st.market.map((p) => ({ ...p, price: p.ability * 10e4 })),
      players: st.players.map((p) => ({ ...p, price: p.ability * 10e4 })),
      wagePerHour: st.players.reduce((a, p) => a + p.wage, 0),
      sponsorPerHour: this._sponsor(st, E),
      ticketPerHour: this._ticket(st, E),
      incomePerHour: this.incomePerHour(ind, E)
    };
  },

  offline(ind, hours, E) {
    const type = E.IND_BY_ID.club;
    const st = ind.st;
    let income = 0, cost = 0;
    income += (this._sponsor(st, E) + this._ticket(st, E)) * hours;
    cost += st.players.reduce((a, p) => a + p.wage, 0) * hours;
    // 青训
    st.academy.progress += hours;
    while (st.academy.progress >= type.academyCycle) {
      st.academy.progress -= type.academyCycle;
      const ability = Math.min(95, 10 + Math.floor(E.rng() * 30) + st.academy.level * 8);
      st.players.push(this._genPlayer(ind, E, ability));
      st.rep += 50;
    }
    return { income, cost };
  },

  /* 清算遣散赔偿：全员时薪 × 5 */
  liquidateCompensation(ind, E) {
    return Math.round(ind.st.players.reduce((a, p) => a + p.wage, 0) * 5);
  },

  actions: {
    upgradeAcademy(ind, E) {
      const type = E.IND_BY_ID.club;
      if (!pay(ind, type.academyCost)) return { ok: false, msg: "公司池余额不足" };
      ind.st.academy.level += 1;
      ind.invested += type.academyCost;
      E._record(`🏫 ${ind.name}：青训营升级至 Lv${ind.st.academy.level}`, -type.academyCost, "expand");
      return { ok: true, cost: type.academyCost };
    },
    buyPlayer(ind, E, payload) {
      const st = ind.st;
      let idx = payload.id ? st.market.findIndex((p) => p.id === payload.id) : -1;
      if (idx < 0) idx = st.market.findIndex((p) => p.name === payload.name);   // 兼容旧档
      if (idx < 0) return { ok: false, msg: "该球员不在转会市场" };
      const p = st.market[idx];
      const price = p.ability * 10e4;
      if (!pay(ind, price)) return { ok: false, msg: "公司池余额不足" };
      st.market.splice(idx, 1);
      st.players.push(p);
      ind.invested += price;
      E._record(`⚡ ${ind.name}：签下「${p.name}」（能力 ${p.ability}，${E._fmt(price)}）`, -price, "invest");
      return { ok: true, cost: price };
    },
    sellPlayer(ind, E, payload) {
      const st = ind.st;
      let idx = payload.id ? st.players.findIndex((p) => p.id === payload.id) : -1;
      if (idx < 0) idx = st.players.findIndex((p) => p.name === payload.name);   // 兼容旧档
      if (idx < 0) return { ok: false, msg: "无此球员" };
      const p = st.players[idx];
      const price = Math.round(p.ability * 10e4 * 0.8);
      st.players.splice(idx, 1);
      st.treasury += price;
      E._record(`📤 ${ind.name}：出售「${p.name}」+${E._fmt(price)}`, price, "income");
      return { ok: true, gain: price };
    }
  }
};
