// 大陆推进表：解锁矩阵 + 首通奖励（等级/转生双门槛，走经典慢节奏但可肝）
//  unlock: { level, rebirth }（rebirth 为转生等级，0 = 无需转生）

export const CONTINENTS = [
  { id: 1,  name: "比奇省",   unlock: { level: 1,   rebirth: 0 },  reward: { gold: 0,     ingot: 0  }, desc: "一切传奇开始的地方" },
  { id: 2,  name: "沃玛大陆", unlock: { level: 25,  rebirth: 0 },  reward: { gold: 2000,  ingot: 10 }, desc: "沃玛寺庙深处传来兽吼" },
  { id: 3,  name: "祖玛大陆", unlock: { level: 45,  rebirth: 1 },  reward: { gold: 8000,  ingot: 25 }, desc: "祖玛七层的守护者苏醒" },
  { id: 4,  name: "赤月峡谷", unlock: { level: 65,  rebirth: 2 },  reward: { gold: 20000, ingot: 50 }, desc: "峡谷中弥漫着恶魔血雾" },
  { id: 5,  name: "魔龙岭",   unlock: { level: 85,  rebirth: 3 },  reward: { gold: 50000, ingot: 90 }, desc: "魔龙军团的前哨" },
  { id: 6,  name: "封魔谷",   unlock: { level: 105, rebirth: 4 },  reward: { gold: 12e4,  ingot: 150 }, desc: "被封印的古老魔物蠢动" },
  { id: 7,  name: "白日门",   unlock: { level: 125, rebirth: 5 },  reward: { gold: 25e4,  ingot: 240 }, desc: "白日门主的试炼之地" },
  { id: 8,  name: "苍月岛",   unlock: { level: 150, rebirth: 6 },  reward: { gold: 50e4,  ingot: 380 }, desc: "海岛上的妖月祭坛" },
  { id: 9,  name: "火龙洞",   unlock: { level: 175, rebirth: 7 },  reward: { gold: 100e4, ingot: 600 }, desc: "沉睡火龙的巢穴" },
  { id: 10, name: "雷霆之路", unlock: { level: 200, rebirth: 8 },  reward: { gold: 200e4, ingot: 900 }, desc: "雷霆中淬炼的强者之路" },
  { id: 11, name: "冰雪之境", unlock: { level: 230, rebirth: 9 },  reward: { gold: 400e4, ingot: 1400 }, desc: "万年冰封的极北之地" },
  { id: 12, name: "觉醒圣地", unlock: { level: 260, rebirth: 10 }, reward: { gold: 800e4, ingot: 2200 }, desc: "烈焰觉醒的终极试炼" }
];

export function continentById(id) {
  return CONTINENTS.find((c) => c.id === id) || null;
}

// 当前是否满足某大陆解锁条件（不含"前置大陆已解锁"，那由解锁顺序保证）
export function meetsUnlock(cont, level, rebirthLv) {
  return level >= cont.unlock.level && rebirthLv >= cont.unlock.rebirth;
}
