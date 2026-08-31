// 传奇觉醒引擎回归测试：node run/test-legend.mjs
//  覆盖：存档契约 / 数值曲线 / 属性聚合 / 战斗 / 掉落分布 / 强化 / 宝石 / 养成线 / 大陆 / 离线收益
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);

const { LegendCore, mulberry32 } = await import("../games/legend/src/engine/index.mjs");
const { validateState } = require("../games/legend/server/validate.js");
const { expToNext, enhanceRate } = await import("../games/legend/src/data/constants.mjs");
const { ITEMS, equipStats } = await import("../games/legend/src/data/items.mjs");
const { MONSTERS, MAPS } = await import("../games/legend/src/data/monsters.mjs");
const { CONTINENTS } = await import("../games/legend/src/data/continents.mjs");
const { rollDrops } = await import("../games/legend/src/engine/loot.mjs");

let pass = 0, fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log("  ✓ " + name);
  } catch (e) {
    fail++;
    console.error("  ✗ " + name + "\n    " + (e.stack || e.message).split("\n").slice(0, 3).join("\n    "));
  }
}
function eq(a, b, msg) {
  if (a !== b) throw new Error(`${msg || "eq"}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
}
function ok(v, msg) {
  if (!v) throw new Error(msg || "expected truthy");
}
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg || "near"}: ${a} vs ${b} (tol ${tol})`);
}

// ============ 1. 存档契约 ============
console.log("[存档契约]");
t("初始存档通过服务端校验", () => {
  const core = LegendCore.create("warrior", "测试勇士");
  eq(validateState(JSON.parse(core.save())), null, "validateState");
});
t("save/load 往返战力一致", () => {
  const core = LegendCore.create("mage", "法师甲");
  core.state.gold += 12345;
  core.addItem("mat_heiiron", 10);
  const json = core.save();
  const core2 = new LegendCore();
  core2.load(json);
  eq(core2.power(), core.power(), "power");
  eq(core2.state.gold, core.state.gold, "gold");
});

t("旧档迁移：失效地图/淘汰模板/旧药水字段", () => {
  const core = LegendCore.create("mage", "旧档号");
  const old = JSON.parse(core.save());
  old.map = "bichi_fields";                                   // M1 旧地图名
  old.bag = [
    { uid: 1, tpl: "w_sword_wood", qty: 1, q: 0, enhance: 0, gems: [] },  // 旧模板
    { uid: 2, tpl: "c_cloth_common", qty: 1, q: 0, enhance: 0, gems: [] },
    { uid: 3, tpl: "hack_item_x", qty: 99 }                    // 未知模板
  ];
  old.equips = { weapon: 1, armor: 2, helmet: 77 };            // 77 引用失效
  old.potions = { hp: 3, mp: 2 };                              // 旧药水字段
  const core2 = new LegendCore();
  core2.load(old);
  eq(core2.state.map, "c1_field", "map fallback");
  ok(core2.state.bag.some((it) => it.tpl === "weapon_t0"), "legacy tpl renamed");
  ok(!core2.state.bag.some((it) => it.tpl === "hack_item_x"), "unknown dropped");
  eq(core2.state.equips.helmet, undefined, "dangling equip removed");
  eq(core2.state.equips.weapon, 1);
  ok(core2.countItem("potion_hp") >= 3, "potions migrated to bag");
  eq(validateState(JSON.parse(core2.save())), null, "migrated save passes server validation");
});

// ============ 2. 数值曲线 ============
console.log("[数值曲线]");
t("经验曲线严格递增", () => {
  for (let l = 1; l < 200; l++) ok(expToNext(l + 1) > expToNext(l), `lv${l}`);
});
t("强化成功率单调不增且在 (0,1]", () => {
  let prev = 1.01;
  for (let l = 0; l < 15; l++) {
    const r = enhanceRate(l);
    ok(r <= prev && r > 0, `lv${l} rate=${r}`);
    prev = r;
  }
});

// ============ 3. 属性聚合 ============
console.log("[属性聚合]");
t("战士血厚于法师，法师攻击更高", () => {
  const w = LegendCore.create("warrior", "W"), m = LegendCore.create("mage", "M");
  ok(w.stats().hpMax > m.stats().hpMax, "hp");
  ok(m.stats().atk > w.stats().atk, "atk");
});
t("装备武器提升攻击", () => {
  const core = LegendCore.create("warrior", "W");
  const before = core.stats().atk;
  core.unequip("weapon");
  ok(core.stats().atk < before, "atk should drop");
});
t("强化提升属性（叠乘 8%/级）", () => {
  const inst = { tpl: "weapon_t0", qty: 1, q: 0, enhance: 0, gems: [] };
  const s0 = equipStats(inst).atk;
  inst.enhance = 5;
  const s5 = equipStats(inst).atk;
  near(s5 / s0, Math.pow(1.08, 5), 0.01, "enhance mult");
});
t("品质乘数生效", () => {
  const a = equipStats({ tpl: "armor_t0", q: 0, enhance: 0, gems: [] }).hpMax;
  const b = equipStats({ tpl: "armor_t0", q: 4, enhance: 0, gems: [] }).hpMax;
  near(b / a, 1.85, 0.01, "quality mult");
});
t("宝石镶嵌加属性", () => {
  const core = LegendCore.create("warrior", "W");
  core.addItem("gem_atk_3", 5);
  const before = core.stats().atk;
  const r = core.embedGem(core.state.bag[0].uid, "gem_atk_3");
  ok(r.ok, r.msg);
  ok(core.stats().atk > before, "atk up");
});
t("转生全属性 +8%/级", () => {
  const core = LegendCore.create("warrior", "W");
  const s0 = core.stats();
  core.state.growth.rebirth = { level: 1, blessing: 0 };
  const s1 = core.stats();
  near(s1.atk / s0.atk, 1.08, 0.005, "atk pct");
  near(s1.hpMax / s0.hpMax, 1.08, 0.005, "hp pct");
});
t("切割之刃提供 cutPct", () => {
  const core = LegendCore.create("warrior", "W");
  eq(core.stats().cutPct, 0);
  core.state.growth.treasure = { level: 10, blessing: 0 };
  near(core.stats().cutPct, 5, 0.001, "10 级 = 5%");
});

// ============ 4. 战斗 ============
console.log("[战斗]");
t("挂机 10 分钟能打怪升级", () => {
  const rng = mulberry32(42);
  const core = LegendCore.create("warrior", "W", { rng });
  for (let i = 0; i < 600; i++) core.tick(1);
  ok(core.state.stats.totalKills > 0, "kills>0, got " + core.state.stats.totalKills);
  ok(core.state.exp > 0 || core.state.level > 1, "exp gained");
});
t("打不过会死并掉经验", () => {
  const rng = mulberry32(7);
  const core = LegendCore.create("warrior", "弱鸡", { rng });
  core.state.map = "c1_lair";       // 直接扔进 Boss 巢穴（14 级 Boss）
  core.rebuildSession();
  let died = false, expLossSeen = false;
  core.on((t2) => { if (t2 === "death") expLossSeen = true; });
  for (let i = 0; i < 300; i++) {
    const ev = core.tick(1);
    if (ev.some((e) => e.t === "pdead")) died = true;
  }
  ok(died, "should die to boss");
  ok(expLossSeen, "death penalty fired");
});
t("切割伤害对 Boss 减半", () => {
  const core = LegendCore.create("warrior", "W");
  core.state.growth.treasure = { level: 20, blessing: 0 }; // cutPct = 10
  const s = core.stats();
  const mon = { uid: 1, hp: 100000, maxHp: 100000, dodge: 0, def: 0 };
  const sess = core.session;
  // 直接调用内部公式验证（boss=true 走减半分支）
  const mNormal = { ...mon, boss: false };
  const mBoss = { ...mon, boss: true };
  const rng = mulberry32(1);
  const hitN = sess.dealToMon({ ...s, atk: 0, crit: 0, critDmg: 1, hit: 200 }, mNormal, 0);
  const hitB = sess.dealToMon({ ...s, atk: 0, crit: 0, critDmg: 1, hit: 200 }, mBoss, 0);
  near(hitN[0].cut, 10000, 1, "normal cut 10%");
  near(hitB[0].cut, 5000, 1, "boss cut 5%");
});

// ============ 5. 掉落分布 ============
console.log("[掉落分布]");
t("万次掷骰：金币率/装备率/品质率在容差内", () => {
  const rng = mulberry32(2024);
  let goldTimes = 0, equips = 0, q4 = 0, q0 = 0, total = 0;
  for (let i = 0; i < 10000; i++) {
    const loot = rollDrops("c1_m0", rng);
    if (loot.gold > 0) goldTimes++;
    for (const it of loot.items) {
      if ((ITEMS[it.tpl] || {}).type === "equip") { equips++; total++; if (it.q === 4) q4++; if (it.q === 0) q0++; }
    }
  }
  // c1_m0: gold rate 0.9；8 部位装备 t0 3% + 无 t-1，t1 6%
  near(goldTimes / 10000, 0.9, 0.02, "gold rate");
  ok(equips > 100, `equip drops ${equips} should be ~720`);
  ok(q4 <= Math.max(3, total * 0.03), `legend q4 too high: ${q4}/${total}`);
  ok(q0 / total > 0.4, `common ratio ${q0}/${total}`);
});
t("数据表完整性：掉落/地图引用全部有效", () => {
  for (const m of Object.values(MONSTERS)) {
    for (const d of m.drops) {
      if (d.kind === "item") ok(ITEMS[d.tpl], `drop ${d.tpl}`);
    }
  }
  for (const mp of Object.values(MAPS)) {
    for (const id of mp.mons) ok(MONSTERS[id], `map ${mp.id} mon ${id}`);
    if (mp.boss) ok(MONSTERS[mp.boss], `map ${mp.id} boss`);
  }
  eq(MAPS.c1_field.continent, 1);
  ok(MAPS.c12_lair.boss, "12 大陆 Boss 图存在");
});

// ============ 6. 强化 ============
console.log("[强化]");
t("强化消耗黑铁矿与金币，成功+1", () => {
  const rng = mulberry32(99); // 选一个前几发能出成功的种子
  const core = LegendCore.create("warrior", "W", { rng });
  core.state.gold = 1e6;
  core.addItem("mat_heiiron", 200);
  const uid = core.state.bag[0].uid;
  let tries = 0, success = false;
  while (tries < 50 && !success) {
    const r = core.enhance(uid);
    ok(r.ok, r.msg);
    success = !!r.success;
    tries++;
  }
  ok(success, "50 次内应有成功（1-4 级 100%/80%）");
  ok(core.state.bag[0].enhance >= 1, "enhance level up");
  ok(core.countItem("mat_heiiron") < 200, "iron consumed");
});
t("强化上限 15", () => {
  const core = LegendCore.create("warrior", "W");
  core.state.bag[0].enhance = 15;
  const r = core.enhance(core.state.bag[0].uid);
  eq(r.ok, false, "should reject");
});

// ============ 7. 养成线 ============
console.log("[养成线]");
t("转生：80 级前拒绝，满足后消耗修为丹升级", () => {
  const core = LegendCore.create("warrior", "W");
  eq(core.upgradeTrack("rebirth").ok, false, "locked at lvl1");
  core.state.level = 80;
  core.state.gold = 1e9;
  core.addItem("mat_xiuwei", 100);
  const r = core.upgradeTrack("rebirth");
  ok(r.ok && r.success, r.msg);
  eq(core.rebirthLevel(), 1);
  ok(core.countItem("mat_xiuwei") < 100, "consumed");
});
t("切割之刃：2 大陆前锁定", () => {
  const core = LegendCore.create("warrior", "W");
  core.state.gold = 1e9;
  core.addItem("mat_qiege", 100);
  eq(core.upgradeTrack("treasure").ok, false, "locked at continent 1");
  core.state.continent = 2;
  const r = core.upgradeTrack("treasure");
  ok(r.ok && r.success, r.msg);
});
t("战力随养成单调上升", () => {
  const core = LegendCore.create("warrior", "W");
  const p0 = core.power();
  core.state.growth.rebirth = { level: 2, blessing: 0 };
  const p1 = core.power();
  core.state.growth.treasure = { level: 5, blessing: 0 };
  const p2 = core.power();
  ok(p0 < p1 && p1 < p2, `${p0} < ${p1} < ${p2}`);
});

// ============ 8. 大陆推进 ============
console.log("[大陆推进]");
t("25 级解锁 2 大陆并发放奖励", () => {
  const core = LegendCore.create("warrior", "W");
  eq(core.unlockContinent().ok, false, "lvl1 blocked");
  core.state.level = 25;
  const g0 = core.state.gold, i0 = core.state.ingot;
  const r = core.unlockContinent();
  ok(r.ok, r.msg);
  ok(core.state.gold > g0 && core.state.ingot > i0, "reward granted");
  ok(core.state.progress.unlocked.includes(2));
});
t("3 大陆需要转生 1", () => {
  const core = LegendCore.create("warrior", "W");
  core.state.progress.unlocked = [1, 2];
  core.state.level = 45;
  eq(core.unlockContinent().ok, false, "no rebirth");
  core.state.growth.rebirth = { level: 1, blessing: 0 };
  ok(core.unlockContinent().ok, "with rebirth");
});
t("切换地图校验等级与大陆", () => {
  const core = LegendCore.create("warrior", "W");
  eq(core.switchMap("c2_field").ok, false, "continent locked");
  core.state.progress.unlocked = [1, 2];
  core.state.level = 20;
  eq(core.switchMap("c2_field").ok, false, "level low");
  core.state.level = 25;
  ok(core.switchMap("c2_field").ok);
});

// ============ 9. 离线收益 ============
console.log("[离线收益]");
t("4 小时离线有收益且受效率折减", () => {
  const rng = mulberry32(5);
  const core = LegendCore.create("warrior", "W", { rng });
  for (let i = 0; i < 60; i++) core.tick(1);
  const r = core.offlineApply(4 * 3600);
  ok(r && r.kills > 0, "kills > 0");
  ok(r.exp > 0 && r.gold > 0, "exp/gold > 0");
});
t("打不动时无离线收益（stuck）", () => {
  const core = LegendCore.create("warrior", "W");
  core.state.map = "c12_lair";
  const r = core.offlineApply(4 * 3600);
  ok(r && r.stuck, "should be stuck");
});
t("离线上限 12 小时", () => {
  const rng = mulberry32(6);
  const core = LegendCore.create("warrior", "W", { rng });
  const r1 = core.offlineApply(12 * 3600);
  const core2 = LegendCore.create("warrior", "W", { rng: mulberry32(6) });
  const r2 = core2.offlineApply(48 * 3600);
  near(r1.kills, r2.kills, Math.max(3, r1.kills * 0.05), "48h capped to 12h equivalent");
});

// ============ 10. 背包 ============
console.log("[背包]");
t("可堆叠物品合并、uid 唯一", () => {
  const core = LegendCore.create("taoist", "T");
  core.addItem("mat_heiiron", 3);
  core.addItem("mat_heiiron", 4);
  eq(core.countItem("mat_heiiron"), 7);
  const uids = new Set(core.state.bag.map((i2) => i2.uid));
  eq(uids.size, core.state.bag.length);
});
t("出售获得金币且不可卖穿戴中装备", () => {
  const core = LegendCore.create("warrior", "W");
  eq(core.sellItem(core.state.equips.weapon).ok, false, "equipped reject");
  core.addItem("weapon_t1", 1);
  const uid = core.state.bag[core.state.bag.length - 1].uid;
  const g0 = core.state.gold;
  const r = core.sellItem(uid);
  ok(r.ok && core.state.gold > g0);
});
t("宝石 3 合 1", () => {
  const core = LegendCore.create("mage", "M");
  core.state.gold = 1e6;
  core.addItem("gem_atk_1", 3);
  ok(core.combineGems("gem_atk", 1).ok);
  eq(core.countItem("gem_atk_1"), 0);
  eq(core.countItem("gem_atk_2"), 1);
});

// ============ 汇总 ============
console.log(`\n结果: ${pass} 通过, ${fail} 失败`);
process.exit(fail > 0 ? 1 : 0);
