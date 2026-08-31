// 怪物与地图表：12 大陆 × (3 小怪 + 1 Boss)，2 张地图/大陆（野外 + Boss 巢穴）
//  属性按等级公式生成，boss 有 hpMult/atkMult 加成与专属掉落 + 首杀奖励

import { CONTINENTS } from "./continents.mjs";

// —— 怪物属性公式 ——
export function monsterStats(lvl, o = {}) {
  const hpMult = o.hpMult || 1, atkMult = o.atkMult || 1;
  return {
    lvl,
    hpMax: Math.round((18 + lvl * 14 + lvl * lvl * 0.35) * hpMult),
    atk: Math.round((4 + lvl * 1.7) * atkMult),
    def: Math.round(2 + lvl * 0.8),
    mdef: Math.round(1 + lvl * 0.5),
    hit: 88 + Math.min(8, lvl * 0.05),
    dodge: 3,
    aspd: o.boss ? 0.7 : 0.9,
    exp: Math.round((8 + Math.pow(lvl, 1.62)) * (o.boss ? 8 : 1)),
    gold: Math.round((3 + lvl * 1.6) * (o.boss ? 10 : 1))
  };
}

// 每大陆：小怪名×3、Boss 名、等级带、掉落装备档（tier）、图标（占位渲染用）
const FAMILIES = [
  { mons: ["鸡", "鹿", "钉耙猫"], icons: ["🐔", "🦌", "🐈"], boss: "半兽勇士", bossIcon: "🐗", lvls: [2, 6, 10], bossLvl: 14, tiers: [0, 0, 1], bossTier: 1 },
  { mons: ["沃玛战士", "沃玛卫士", "火焰沃玛"], icons: ["🐗", "🪓", "🔥"], boss: "沃玛教主", bossIcon: "👹", lvls: [26, 31, 36], bossLvl: 42, tiers: [1, 1, 2], bossTier: 2 },
  { mons: ["祖玛雕像", "祖玛卫士", "祖玛勇士"], icons: ["🗿", "🛡️", "⚔️"], boss: "祖玛教主", bossIcon: "👺", lvls: [46, 52, 58], bossLvl: 64, tiers: [2, 2, 3], bossTier: 3 },
  { mons: ["红野猪", "黑野猪", "月魔蜘蛛"], icons: ["🐖", "🐗", "🕷️"], boss: "赤月恶魔", bossIcon: "😈", lvls: [66, 73, 80], bossLvl: 88, tiers: [3, 3, 3], bossTier: 4 },
  { mons: ["魔龙射手", "魔龙力士", "魔龙血蛙"], icons: ["🏹", "💪", "🐸"], boss: "魔龙教主", bossIcon: "🐲", lvls: [86, 94, 102], bossLvl: 112, tiers: [3, 4, 4], bossTier: 4 },
  { mons: ["封魔谷卫", "封魔石人", "封魔僵尸"], icons: ["🥷", "🗿", "🧟"], boss: "虹魔教主", bossIcon: "🧛", lvls: [106, 115, 124], bossLvl: 136, tiers: [4, 4, 4], bossTier: 5 },
  { mons: ["白日守卫", "白日刀客", "白日鹰卫"], icons: ["🤺", "🗡️", "🦅"], boss: "白日门主", bossIcon: "👑", lvls: [126, 136, 146], bossLvl: 160, tiers: [4, 4, 5], bossTier: 5 },
  { mons: ["苍月妖卫", "苍月蛇妖", "苍月妖力士"], icons: ["🧜", "🐍", "👊"], boss: "妖月魔王", bossIcon: "🌙", lvls: [151, 162, 173], bossLvl: 190, tiers: [4, 5, 5], bossTier: 5 },
  { mons: ["火龙护卫", "火龙勇士", "熔岩巨人"], icons: ["🦎", "🔥", "🌋"], boss: "暗火龙王", bossIcon: "🐉", lvls: [176, 188, 200], bossLvl: 218, tiers: [5, 5, 5], bossTier: 5 },
  { mons: ["雷霆守卫", "雷霆勇士", "雷光麒麟"], icons: ["⚡", "🌩️", "🦄"], boss: "雷霆之主", bossIcon: "🌩️", lvls: [201, 214, 227], bossLvl: 246, tiers: [5, 5, 5], bossTier: 5 },
  { mons: ["冰原雪狼", "冰封战士", "寒冰法师"], icons: ["🐺", "❄️", "🧙"], boss: "冰霜巨龙", bossIcon: "🐉", lvls: [231, 245, 259], bossLvl: 280, tiers: [5, 5, 5], bossTier: 5 },
  { mons: ["圣地守卫", "觉醒勇士", "烈焰行者"], icons: ["🕊️", "🌟", "🚶"], boss: "觉醒·炎帝", bossIcon: "🔥", lvls: [261, 276, 291], bossLvl: 320, tiers: [5, 5, 5], bossTier: 5 }
];

// 掉落：小怪出对应档武器/防具碎片级装备（率低）+ 金币 + 药水；Boss 高率 + 专属 + 首杀
function normalDrops(tier, contId) {
  const drops = [];
  const slotPool = ["weapon", "armor", "helmet", "belt", "boots", "necklace", "bracelet", "ring"];
  drops.push({ kind: "gold", rate: 0.9, qty: 1 });
  drops.push({ kind: "item", tpl: "potion_hp", rate: 0.12, qty: 1 });
  drops.push({ kind: "item", tpl: "mat_heiiron", rate: 0.08, qty: 1 });
  if (contId >= 2) drops.push({ kind: "item", tpl: "mat_xiuwei", rate: 0.05, qty: 1 });
  if (contId >= 3) drops.push({ kind: "item", tpl: "mat_qiege", rate: 0.04, qty: 1 });
  for (const slot of slotPool) {
    drops.push({ kind: "item", tpl: `${slot}_t${tier}`, rate: 0.03, qty: 1 });
    if (tier > 0) drops.push({ kind: "item", tpl: `${slot}_t${tier - 1}`, rate: 0.06, qty: 1 });
  }
  return drops;
}

function bossDrops(tier, contId) {
  const drops = [];
  const slotPool = ["weapon", "armor", "helmet", "belt", "boots", "necklace", "bracelet", "ring"];
  drops.push({ kind: "gold", rate: 1, qty: 5 });
  drops.push({ kind: "item", tpl: "mat_heiiron", rate: 1, qty: 3 });
  drops.push({ kind: "item", tpl: "mat_xiuwei", rate: 0.8, qty: 2 });
  drops.push({ kind: "item", tpl: "mat_qiege", rate: 0.7, qty: 2 });
  drops.push({ kind: "item", tpl: "mat_yumao", rate: 0.6, qty: 2 });
  drops.push({ kind: "item", tpl: "mat_gongxun", rate: 0.5, qty: 2 });
  drops.push({ kind: "item", tpl: "mat_jingmai", rate: 0.5, qty: 2 });
  drops.push({ kind: "gem", kind2: "random", rate: 0.5, qty: 1 });
  for (const slot of slotPool) {
    drops.push({ kind: "item", tpl: `${slot}_t${tier}`, rate: 0.35, qty: 1 });
  }
  // 首杀奖励（一次性）
  drops.push({ kind: "firstkill", ingot: 20 + contId * 15 });
  return drops;
}

export const MONSTERS = {};
export const MAPS = {};

CONTINENTS.forEach((cont, ci) => {
  const fam = FAMILIES[ci];
  const monIds = [];
  fam.mons.forEach((name, i) => {
    const id = `c${cont.id}_m${i}`;
    const lvl = fam.lvls[i];
    MONSTERS[id] = {
      id, name, icon: fam.icons[i], boss: false,
      ...monsterStats(lvl),
      drops: normalDrops(fam.tiers[i], cont.id)
    };
    monIds.push(id);
  });
  const bossId = `c${cont.id}_boss`;
  MONSTERS[bossId] = {
    id: bossId, name: fam.boss, icon: fam.bossIcon, boss: true,
    ...monsterStats(fam.bossLvl, { hpMult: 9, atkMult: 1.6 }),
    drops: bossDrops(fam.bossTier, cont.id)
  };

  const fieldId = `c${cont.id}_field`;
  const bossMapId = `c${cont.id}_lair`;
  MAPS[fieldId] = {
    id: fieldId, name: `${cont.name}·野外`, continent: cont.id,
    lvlReq: cont.unlock.level, mons: monIds, boss: null
  };
  MAPS[bossMapId] = {
    id: bossMapId, name: `${cont.name}·巢穴`, continent: cont.id,
    lvlReq: cont.unlock.level + 8, mons: [bossId, monIds[2]], boss: bossId
  };
});

export function monsterById(id) {
  return MONSTERS[id] || null;
}
export function mapById(id) {
  return MAPS[id] || null;
}
export function mapsOfContinent(contId) {
  return Object.values(MAPS).filter((m) => m.continent === contId);
}
