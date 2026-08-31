// 全局常量与数值曲线（客户端引擎与服务端校验共享，勿放仅 UI 用的东西）
//  服务端通过 Node 22 的 require(esm) 直接 require 本文件

export const SAVE_VERSION = 1;

// —— 职业与基础上限 ——
export const CLASSES = ["warrior", "mage", "taoist"]; // 战士/法师/道士
export const CLASS_NAMES = { warrior: "战士", mage: "法师", taoist: "道士" };

export const LEVEL_CAP = 1000;        // 等级上限（转生后可突破显示为 转 N）
export const ENHANCE_MAX = 15;       // 装备强化上限
export const GEM_SLOTS_MAX = 4;      // 单件装备宝石孔上限
export const BAG_SIZE_MAX = 200;     // 背包格子上限
export const ITEM_QTY_MAX = 9999;    // 可堆叠物品单格数量上限
export const GOLD_MAX = 1e15;        // 金币/元宝数量上限（防篡改天花板）
export const CONTINENT_COUNT = 12;   // 大陆总数
export const NAME_RE = /^[\u4e00-\u9fa5a-zA-Z0-9]{2,8}$/; // 角色名：2-8 位中文/字母/数字

// —— 经验曲线：升到 level+1 所需经验（指数+线性混合，转生修为另算） ——
export function expToNext(level) {
  return Math.floor(60 * Math.pow(level, 1.85) + 100 * level + 200);
}

// 累计经验上限（服务端校验用）：当前等级内存经验不得超过升下一级所需
export function expWithinLevel(level, exp) {
  return exp >= 0 && exp < expToNext(level);
}

// —— 强化成功率（1→15 级），失败掉 1 级但不碎（碎装体验太差，砍掉） ——
export function enhanceRate(lv) {
  if (lv <= 3) return 1.0;
  if (lv <= 6) return 0.8;
  if (lv <= 9) return 0.55;
  if (lv <= 12) return 0.35;
  return 0.2;
}

// —— 养成线通用：离线挂机效率与上限 ——
export const OFFLINE_EFF = 0.6;      // 离线收益效率 60%
export const OFFLINE_CAP_H = 12;     // 离线收益最长按 12 小时计算
export const TICK_SEC = 1;           // 引擎 tick 粒度（秒）
