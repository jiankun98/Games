// 三职业基础属性与成长（战/法/道）
//  模型统一：atk 攻魔道合一（挂机引擎简化），职业差异靠成长系数与技能组

export const CLASS_BASE = {
  warrior: {
    name: "战士", icon: "⚔️",
    hp: 120, mp: 30, atk: 9, def: 7, mdef: 3,
    hit: 90, dodge: 5, crit: 5, critDmg: 1.5, aspd: 1.0,
    hpGrow: 20, mpGrow: 2, atkGrow: 2.4, defGrow: 1.6, mdefGrow: 0.7,
    skills: ["shajian", "cirenm", "liehuo", "zhuri"],
    desc: "近战 · 高防血厚 · 烈火剑法单体爆发"
  },
  mage: {
    name: "法师", icon: "🔮",
    hp: 80, mp: 90, atk: 11, def: 3, mdef: 6,
    hit: 92, dodge: 6, crit: 6, critDmg: 1.6, aspd: 0.9,
    hpGrow: 13, mpGrow: 8, atkGrow: 3.0, defGrow: 0.8, mdefGrow: 1.3,
    skills: ["huoqiu", "diyuhuo", "bingpaoxiao", "mofadun"],
    desc: "远程 · 群攻爆发 · 冰咆哮清扫成片"
  },
  taoist: {
    name: "道士", icon: "☯️",
    hp: 100, mp: 60, atk: 8, def: 5, mdef: 5,
    hit: 91, dodge: 8, crit: 5, critDmg: 1.5, aspd: 0.95,
    hpGrow: 16, mpGrow: 5, atkGrow: 2.0, defGrow: 1.2, mdefGrow: 1.0,
    skills: ["shidu", "hunhuo", "zhaohuan", "zhiliao"],
    desc: "召唤 · 毒咒续航 · 骷髅扛线消耗"
  }
};

// 等级 → 职业基础属性（不含装备与养成线）
export function baseStats(cls, level) {
  const b = CLASS_BASE[cls] || CLASS_BASE.warrior;
  const l = level - 1;
  return {
    hpMax: Math.round(b.hp + b.hpGrow * l),
    mpMax: Math.round(b.mp + b.mpGrow * l),
    atk: Math.round(b.atk + b.atkGrow * l),
    def: Math.round(b.def + b.defGrow * l),
    mdef: Math.round(b.mdef + b.mdefGrow * l),
    hit: b.hit, dodge: b.dodge, crit: b.crit, critDmg: b.critDmg, aspd: b.aspd
  };
}
