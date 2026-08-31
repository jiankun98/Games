// 技能表（挂机自动战斗：技能按 CD 自动释放，目标自动选择）
//  type: damage 伤害 / dot 持续 / summon 召唤 / buff 自身增益 / heal 治疗
//  mult: 伤害倍率（相对 atk）；aoe: 同时命中数；cut: 附加切割（按目标最大生命百分比）

export const SKILLS = {
  // —— 战士 ——
  shajian:   { id: "shajian", cls: "warrior", name: "攻杀剑术", icon: "🗡️", mp: 5, cd: 4, mult: 1.6, aoe: 1, type: "damage", desc: "基础剑法，稳定输出" },
  cirenm:    { id: "cirenm", cls: "warrior", name: "刺杀剑术", icon: "⚔️", mp: 10, cd: 8, mult: 2.6, aoe: 1, type: "damage", ignoreDef: 0.4, desc: "无视部分防御的刺杀" },
  liehuo:    { id: "liehuo", cls: "warrior", name: "烈火剑法", icon: "🔥", mp: 20, cd: 12, mult: 4.2, aoe: 1, type: "damage", desc: "战士招牌，单体爆发" },
  zhuri:     { id: "zhuri", cls: "warrior", name: "逐日剑法", icon: "☄️", mp: 30, cd: 16, mult: 2.4, aoe: 4, type: "damage", desc: "剑气横扫成片敌人" },

  // —— 法师 ——
  huoqiu:    { id: "huoqiu", cls: "mage", name: "火球术", icon: "🔥", mp: 6, cd: 3, mult: 1.7, aoe: 1, type: "damage", desc: "基础火球" },
  diyuhuo:   { id: "diyuhuo", cls: "mage", name: "地狱火", icon: "🌋", mp: 14, cd: 7, mult: 1.9, aoe: 3, type: "damage", desc: "面前一片火海" },
  bingpaoxiao: { id: "bingpaoxiao", cls: "mage", name: "冰咆哮", icon: "❄️", mp: 26, cd: 12, mult: 2.6, aoe: 5, type: "damage", slow: 0.3, desc: "大范围冰暴并减速" },
  mofadun:   { id: "mofadun", cls: "mage", name: "魔法盾", icon: "🛡️", mp: 25, cd: 25, type: "buff", buff: { def: 0.5, dur: 10 }, desc: "10 秒内防御提升 50%" },

  // —— 道士 ——
  shidu:     { id: "shidu", cls: "taoist", name: "施毒术", icon: "☠️", mp: 8, cd: 6, mult: 0.6, aoe: 2, type: "dot", dot: { mult: 0.35, dur: 6 }, desc: "绿毒持续掉血" },
  hunhuo:    { id: "hunhuo", cls: "taoist", name: "灵魂火符", icon: "📜", mp: 12, cd: 5, mult: 2.3, aoe: 1, type: "damage", desc: "远程符咒打击" },
  zhaohuan:  { id: "zhaohuan", cls: "taoist", name: "召唤骷髅", icon: "💀", mp: 30, cd: 30, type: "summon", summon: { hpMult: 2.0, atkMult: 0.7, dur: 60 }, desc: "召唤骷髅并肩作战" },
  zhiliao:   { id: "zhiliao", cls: "taoist", name: "治愈术", icon: "💚", mp: 20, cd: 15, type: "heal", heal: 0.18, desc: "恢复自身 18% 生命" }
};

export function classSkills(cls) {
  const b = { warrior: "warrior", mage: "mage", taoist: "taoist" }[cls];
  return Object.values(SKILLS).filter((s) => s.cls === b);
}
