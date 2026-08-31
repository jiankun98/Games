// 物品总表：装备模板 / 宝石 / 材料 / 药水
//  装备：8 部位 × 6 档；掉落时随机品质（普通/精良/稀有/史诗/传说）乘算属性，强化+宝石在实例上叠加

export const SLOTS = [
  { id: "weapon", name: "武器", icon: "🗡️" },
  { id: "helmet", name: "头盔", icon: "⛑️" },
  { id: "armor", name: "衣服", icon: "🥋" },
  { id: "belt", name: "腰带", icon: "🎗️" },
  { id: "boots", name: "靴子", icon: "🥾" },
  { id: "necklace", name: "项链", icon: "📿" },
  { id: "bracelet", name: "手镯", icon: "⌚" },
  { id: "ring", name: "戒指", icon: "💍" }
];

// 品质：掉落掷骰用（概率合计 1）；属性乘数影响面板
export const QUALITIES = [
  { id: 0, name: "普通", color: "#c8c8c8", mult: 1.0, rate: 0.60 },
  { id: 1, name: "精良", color: "#6fbf5f", mult: 1.15, rate: 0.25 },
  { id: 2, name: "稀有", color: "#4f8ad9", mult: 1.32, rate: 0.10 },
  { id: 3, name: "史诗", color: "#a86fd9", mult: 1.55, rate: 0.04 },
  { id: 4, name: "传说", color: "#e8a33d", mult: 1.85, rate: 0.01 }
];

// 每件 +N 强化提升基础属性的百分比（叠乘上限 ENHANCE_MAX=15 → 约 3.3 倍）
export const ENHANCE_STEP = 0.08;

// 档位模板：name 链、lvlReq、主属性量（按部位展开）
// 行 = 部位，列 = 档位（0..5）
const EQUIP_TIERS = {
  weapon: {
    names: ["木剑", "乌木剑", "修罗", "炼狱", "屠龙", "开天"],
    lvls: [1, 12, 26, 45, 70, 100],
    main: "atk", mains: [4, 12, 28, 60, 120, 220], sub: { hit: [1, 2, 4, 6, 9, 13] }
  },
  helmet: {
    names: ["草帽", "铁头盔", "骷髅头盔", "黑铁头盔", "圣战头盔", "天龙盔"],
    lvls: [1, 14, 30, 50, 75, 105],
    main: "def", mains: [2, 6, 14, 30, 58, 105], sub: { mdef: [1, 3, 6, 12, 22, 40] }
  },
  armor: {
    names: ["布衣", "轻型盔甲", "中型盔甲", "重盔甲", "幽灵战衣", "天魔神甲"],
    lvls: [1, 10, 25, 42, 65, 95],
    main: "hp", mains: [20, 60, 150, 340, 680, 1250], sub: { def: [1, 3, 7, 14, 26, 46] }
  },
  belt: {
    names: ["布腰带", "皮腰带", "青铜腰带", "白银腰带", "黄金腰带", "圣战腰带"],
    lvls: [1, 16, 32, 52, 78, 108],
    main: "hp", mains: [12, 40, 100, 230, 470, 860], sub: { def: [1, 2, 5, 10, 19, 34] }
  },
  boots: {
    names: ["草鞋", "皮靴", "青铜靴", "白银靴", "黄金靴", "圣战之靴"],
    lvls: [1, 15, 31, 48, 72, 102],
    main: "dodge", mains: [1, 2, 4, 7, 11, 16], sub: { aspd: [0.01, 0.02, 0.03, 0.05, 0.07, 0.10] }
  },
  necklace: {
    names: ["细链", "蓝翡翠项链", "竹笋项链", "绿色项链", "灵魂项链", "天珠项链"],
    lvls: [1, 13, 28, 46, 68, 98],
    main: "atk", mains: [2, 7, 16, 36, 70, 130], sub: { hp: [10, 30, 80, 180, 360, 660] }
  },
  bracelet: {
    names: ["铁手镯", "皮制手镯", "幽灵手套", "龙之手镯", "圣战手镯", "龙鳞手镯"],
    lvls: [1, 17, 33, 54, 80, 110],
    main: "atk", mains: [1, 5, 12, 27, 52, 96], sub: { crit: [1, 1, 2, 3, 5, 7] }
  },
  ring: {
    names: ["铜戒指", "蓝色水晶戒指", "珊瑚戒指", "天龙戒指", "圣战戒指", "麻痹戒指"],
    lvls: [1, 18, 34, 56, 82, 112],
    main: "atk", mains: [1, 4, 11, 24, 47, 88], sub: { critDmg: [0.03, 0.05, 0.08, 0.12, 0.17, 0.24] }
  }
};

// 展开成模板表：{ id: { id,name,slot,lvlReq,stats,price,sellable } }
export const ITEMS = {};
for (const [slot, t] of Object.entries(EQUIP_TIERS)) {
  t.names.forEach((name, i) => {
    const id = slot + "_t" + i;
    const stats = { [t.main]: t.mains[i] };
    for (const [k, arr] of Object.entries(t.sub)) stats[k] = arr[i];
    ITEMS[id] = {
      id, name, slot, tier: i, lvlReq: t.lvls[i], stats,
      price: Math.round((t.lvls[i] + 5) * (t.lvls[i] + 8) * (slot === "weapon" ? 3 : 2)),
      type: "equip"
    };
  });
}

// —— 宝石（4 系 × 5 级，3 合 1） ——
const GEM_TIERS = [
  { lv: 1, n: "一级", v: 1 },
  { lv: 2, n: "二级", v: 3 },
  { lv: 3, n: "三级", v: 8 },
  { lv: 4, n: "四级", v: 20 },
  { lv: 5, n: "五级", v: 50 }
];
const GEM_KINDS = [
  { id: "gem_atk", name: "攻击宝石", stat: "atk", icon: "🔴" },
  { id: "gem_hp", name: "生命宝石", stat: "hp", icon: "🟢" },
  { id: "gem_def", name: "防御宝石", stat: "def", icon: "🔵" },
  { id: "gem_crit", name: "暴击宝石", stat: "crit", icon: "🟡" }
];
for (const k of GEM_KINDS) {
  GEM_TIERS.forEach((t) => {
    const id = `${k.id}_${t.lv}`;
    ITEMS[id] = {
      id, name: `${k.n}${k.name}`, icon: k.icon, type: "gem", lv: t.lv, kind: k.id,
      stats: { [k.stat]: t.v }, price: t.lv * t.lv * 400, slot: null
    };
  });
}

// —— 材料与药水 ——
const MISC = [
  { id: "mat_heiiron", name: "黑铁矿", icon: "⛏️", type: "mat", desc: "装备强化材料", price: 150 },
  { id: "mat_xiuwei", name: "修为丹", icon: "🍶", type: "mat", desc: "转生修炼材料", price: 600 },
  { id: "mat_qiege", name: "切割结晶", icon: "💎", type: "mat", desc: "升级切割之刃", price: 500 },
  { id: "mat_yumao", name: "羽毛", icon: "🪶", type: "mat", desc: "羽翼升阶材料", price: 300 },
  { id: "mat_gongxun", name: "功勋令", icon: "🎖️", type: "mat", desc: "官爵晋升材料", price: 400 },
  { id: "mat_jingmai", name: "经脉丹", icon: "🧿", type: "mat", desc: "打通经脉材料", price: 350 },
  { id: "potion_hp", name: "太阳水", icon: "🧴", type: "potion", healHp: 0.35, stack: 999, price: 60 },
  { id: "potion_mp", name: "魔法药", icon: "🧪", type: "potion", healMp: 0.40, stack: 999, price: 50 }
];
for (const m of MISC) ITEMS[m.id] = { ...m, slot: null };

// 起始装备引用（state.mjs 使用）
export const STARTER_WEAPON = "weapon_t0";
export const STARTER_ARMOR = "armor_t0";

export function item(id) {
  return ITEMS[id] || null;
}

// 装备实例的实际属性 = 模板 × 品质 × 强化 + 宝石
export function equipStats(inst) {
  const tpl = ITEMS[inst.tpl];
  if (!tpl || tpl.type !== "equip") return {};
  const q = QUALITIES[inst.q || 0].mult;
  const e = Math.pow(1 + ENHANCE_STEP, inst.enhance || 0);
  const out = {};
  for (const [k, v] of Object.entries(tpl.stats)) {
    out[k] = (out[k] || 0) + Math.round(v * q * e * 100) / 100;
  }
  if (Array.isArray(inst.gems)) {
    for (const g of inst.gems) {
      if (!g) continue;
      const gt = ITEMS[g];
      if (gt && gt.stats) for (const [k, v] of Object.entries(gt.stats)) out[k] = (out[k] || 0) + v;
    }
  }
  return out;
}
