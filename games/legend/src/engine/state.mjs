// 存档结构与初始角色工厂（客户端引擎与服务端校验的共同契约，字段增删需同步 server/validate.js）
import { SAVE_VERSION } from "../data/constants.mjs";
import { STARTER_WEAPON, STARTER_ARMOR } from "../data/items.mjs";

export function createInitialState(cls, name) {
  return {
    v: SAVE_VERSION,
    name,
    class: cls,                 // warrior | mage | taoist
    level: 1,
    exp: 0,
    gold: 500,                  // 起始金币（买药水用）
    ingot: 0,                   // 元宝（首杀/大陆奖励产出，本作无充值）
    continent: 1,               // 当前所在大陆
    map: "c1_field",            // 当前挂机地图
    // 背包：uid 全档唯一；equips: 部位 -> bag uid；红/蓝药为可堆叠物品
    bag: [
      { uid: 1, tpl: STARTER_WEAPON, qty: 1, q: 0, enhance: 0, gems: [] },
      { uid: 2, tpl: STARTER_ARMOR, qty: 1, q: 0, enhance: 0, gems: [] },
      { uid: 3, tpl: "potion_hp", qty: 5 },
      { uid: 4, tpl: "potion_mp", qty: 3 }
    ],
    equips: { weapon: 1, armor: 2 },
    growth: {},                 // 各养成线等级（registry 默认值补齐，缺省容错）
    progress: {
      kills: {},                // monsterId -> 击杀数
      firstKills: [],           // 已拿首杀奖励的 boss id
      unlocked: [1]             // 已解锁大陆
    },
    stats: { totalKills: 0, playSec: 0, deaths: 0, bossKills: 0, enhanceTries: 0 },
    savedAt: Date.now()
  };
}
