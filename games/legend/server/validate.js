"use strict";
// 云存档防篡改校验：结构检查 + 数值天花板 + 装备模板白名单 + 养成线上限
//  白名单来自客户端共享数据（src/data/*.mjs、engine/growth/registry.mjs，Node 22 require(esm) 直接加载）
//  注意：单机网页游戏做的是"合理性校验"而非密码学防篡改——挡住手改 JSON 的低级作弊即可

const C = require("../src/data/constants.mjs");
const { ITEMS } = require("../src/data/items.mjs");
const { allTracks } = require("../src/engine/growth/registry.mjs");

// 物品/宝石模板白名单（直接由数据表生成）
const itemWhitelist = new Set();
const gemWhitelist = new Set();
for (const [id, t] of Object.entries(ITEMS)) {
  (t.type === "gem" ? gemWhitelist : itemWhitelist).add(id);
}
// 养成线等级上限
const trackMax = new Map(allTracks().map((t) => [t.id, t.maxLevel()]));

function isInt(v, min, max) {
  return Number.isInteger(v) && v >= min && v <= max;
}

function isNum(v, min, max) {
  return typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
}

// 返回 null 表示合法；返回 string 为拒绝原因
function validateState(state) {
  if (!state || typeof state !== "object" || Array.isArray(state)) return "存档必须是对象";
  if (state.v !== C.SAVE_VERSION) return `存档版本不符（期望 ${C.SAVE_VERSION}）`;
  if (!C.CLASSES.includes(state.class)) return "非法职业";
  if (typeof state.name !== "string" || !C.NAME_RE.test(state.name)) return "非法角色名";

  if (!isInt(state.level, 1, C.LEVEL_CAP)) return "非法等级";
  if (!isInt(state.exp, 0, Math.pow(2, 53) - 1) || !C.expWithinLevel(state.level, state.exp)) return "经验超出当前等级上限";
  if (!isNum(state.gold, 0, C.GOLD_MAX)) return "非法金币数";
  if (!isNum(state.ingot, 0, C.GOLD_MAX)) return "非法元宝数";
  if (!isInt(state.continent, 1, C.CONTINENT_COUNT)) return "非法大陆编号";

  // 背包
  if (!Array.isArray(state.bag) || state.bag.length > C.BAG_SIZE_MAX) return "背包超限";
  const uids = new Set();
  for (const it of state.bag) {
    if (!it || typeof it !== "object") return "背包存在非法物品";
    if (typeof it.uid !== "number" || uids.has(it.uid)) return "物品 uid 非法";
    uids.add(it.uid);
    const isEquip = itemWhitelist.has(it.tpl) && ITEMS[it.tpl] && ITEMS[it.tpl].type === "equip";
    const isStack = itemWhitelist.has(it.tpl) && ITEMS[it.tpl].type !== "equip" || gemWhitelist.has(it.tpl);
    if (!itemWhitelist.has(it.tpl) && !gemWhitelist.has(it.tpl)) return `未登记的物品模板：${it.tpl}`;
    if (!isInt(it.qty, 1, C.ITEM_QTY_MAX)) return "物品数量非法";
    if (!isInt(it.enhance || 0, 0, C.ENHANCE_MAX)) return "强化等级非法";
    if (!isInt(it.q || 0, 0, 4)) return "品质非法";
    if (Array.isArray(it.gems)) {
      if (it.gems.length > C.GEM_SLOTS_MAX) return "宝石孔超限";
      for (const g of it.gems) {
        if (g !== null && !gemWhitelist.has(g)) return `未登记的宝石：${g}`;
      }
    }
  }

  // 装备穿戴引用
  if (state.equips !== undefined) {
    if (!state.equips || typeof state.equips !== "object" || Array.isArray(state.equips)) return "穿戴数据非法";
    const validSlots = new Set(["weapon", "armor", "helmet", "belt", "boots", "necklace", "bracelet", "ring"]);
    for (const [slot, uid] of Object.entries(state.equips)) {
      if (!validSlots.has(slot)) return `非法装备部位：${slot}`;
      if (!uids.has(uid)) return `穿戴引用了不存在的物品：${slot}#${uid}`;
    }
  }

  // 养成线等级
  if (state.growth !== undefined) {
    if (!state.growth || typeof state.growth !== "object" || Array.isArray(state.growth)) return "养成数据非法";
    for (const [tid, v] of Object.entries(state.growth)) {
      if (v !== null && typeof v === "object") {
        const max = trackMax.has(tid) ? trackMax.get(tid) : 10000;
        if (!isInt(v.level || 0, 0, max)) return `养成等级非法：${tid}`;
      }
    }
  }
  return null;
}

const SIZE_MAX = 512 * 1024; // 512KB

function validateSavePayload(body) {
  if (!body || typeof body !== "object") return "请求体非法";
  if (typeof body.state !== "object" || body.state === null) return "缺少 state";
  const err = validateState(body.state);
  if (err) return err;
  if (body.state.savedAt && !isNum(body.state.savedAt, 0, Date.now() + 6 * 3600 * 1000)) return "存档时间非法";
  if (!isInt(body.level ?? body.state.level, 1, C.LEVEL_CAP)) return "等级字段非法";
  if (!isInt(body.battlePower ?? 0, 0, Number.MAX_SAFE_INTEGER)) return "战力字段非法";
  return null;
}

module.exports = { validateState, validateSavePayload, SIZE_MAX };
