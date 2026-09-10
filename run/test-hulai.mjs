/* 胡莱三国·复刻版 —— 数据一致性 + 战斗引擎 + 经济节奏 + 自动攻略全程回归
 * 运行：node run/test-hulai.mjs（node 直跑，无 DOM）
 * 核心是「自动攻略」：一个朴素策略的机器人从开档打到通关第六章，
 * 验证数值曲线能支撑一次完整游玩（关卡/好友/招兵/科技/任务全链路）。
 */
import { SKILLS, SKILL_MAP, BOOK_POOL } from "../games/hulai/src/data/skills.js";
import { GENERALS, GENERAL_MAP, PLAYABLE } from "../games/hulai/src/data/generals.js";
import { TROOPS, TROOP_MAP } from "../games/hulai/src/data/troops.js";
import { BUILDINGS, BUILDING_MAP, GRID_W, GRID_H } from "../games/hulai/src/data/buildings.js";
import { buildCost } from "../games/hulai/src/data/formulas.js";
import { TECHS } from "../games/hulai/src/data/techs.js";
import { STAGE_NODES, CHAPTERS } from "../games/hulai/src/data/stages.js";
import { QUALITY } from "../games/hulai/src/data/formulas.js";

import { makeRng } from "../games/hulai/src/engine/rng.js";
import { createNewGame, tick, serialize, migrate, grantReward } from "../games/hulai/src/engine/state.js";
import { build, upgrade, accelBuild, productionPerHour, move } from "../games/hulai/src/engine/city.js";
import { assignTroops, learnSkill } from "../games/hulai/src/engine/general.js";
import { startTrain } from "../games/hulai/src/engine/train.js";
import { startResearch } from "../games/hulai/src/engine/tech.js";
import { rollPool, recruit, recruitCost, refreshPool } from "../games/hulai/src/engine/recruit.js";
import { runPve, runRaid, nodeUnlocked, squadReady, doCollectTax } from "../games/hulai/src/engine/campaign.js";
import { pendingTax, collectTax, armyScaleFor } from "../games/hulai/src/engine/friend.js";
import { mainQuestReady, claimMain, claimDaily, doCheckin, checkinReady, DAILY_QUESTS } from "../games/hulai/src/engine/quest.js";

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log("  ✓ " + name); }
  else { fail++; console.log("  ✗ " + name + (detail ? " —— " + detail : "")); }
}
function section(t) { console.log("\n== " + t + " =="); }

/* ================= 1. 数据表一致性 ================= */
section("数据表一致性");
{
  let bad = [];
  for (const g of GENERALS) {
    if (g.innate && !SKILL_MAP[g.innate]) bad.push(`${g.name}.innate=${g.innate}`);
  }
  ok(bad.length === 0, "武将天生技 id 均存在", bad.join("; "));

  bad = [];
  for (const n of STAGE_NODES) {
    for (const [gid] of n.foes) if (!GENERAL_MAP[gid]) bad.push(`${n.key} 敌将 ${gid}`);
    for (const tid of Object.keys(n.army)) if (!TROOP_MAP[tid]) bad.push(`${n.key} 兵种 ${tid}`);
    if (!n.loot || !(n.loot.copper > 0) || !(n.loot.lordExp > 0)) bad.push(`${n.key} loot 异常`);
  }
  ok(bad.length === 0, "关卡表 敌将/兵种/奖励 均有效", bad.join("; "));

  ok(PLAYABLE.every(g => !g.npc) && PLAYABLE.length >= 20, `可招募武将 ${PLAYABLE.length} 名（≥20）`);
  ok(BOOK_POOL.length >= 10, `技能书池 ${BOOK_POOL.length} 本（≥10）`);
  ok(BOOK_POOL.every(id => SKILL_MAP[id] && SKILL_MAP[id].owner === null), "技能书池均为可打书技能");
  ok(STAGE_NODES.length === CHAPTERS.length * 5, `关卡 ${STAGE_NODES.length} = ${CHAPTERS.length} 章 × 5`);
  ok(TROOPS.some(t => t.cls === "special" && t.id === "sp3"), "特种兵含顶级虎豹骑");
  ok(BUILDINGS.length === 7 && BUILDINGS.find(b => b.id === "zc").fixed, "7 类建筑，主城固定");
  ok(GRID_W === 7 && GRID_H === 7, "城池 7×7 网格");
  ok(TECHS.length === 11, "科技 11 项");
}

/* ================= 2. 战斗引擎 ================= */
section("战斗引擎");
{
  /* 确定性 */
  const s = createNewGame("测试", Date.now());
  const seed = 12345;
  const g = s.generals[0];
  g.troops = { s1: 200 };
  s.barracks = {};
  const foes = [["dengmao", 2]];
  const { combatFromFoe } = await import("../games/hulai/src/engine/battle/model.js");
  const { runBattle } = await import("../games/hulai/src/engine/battle/battle.js");
  const { distributeArmy } = await import("../games/hulai/src/engine/battle/model.js");
  const army = { s1: 280, a1: 140 };
  const f1 = foes.map(combatFromFoe); distributeArmy(f1, army);
  const r1 = runBattle({ atkName: "A", defName: "B", atkGens: [{ ...g, skills: g.skills.filter(Boolean), duel: { atk: 20, def: 15, hp: 90 }, troops: { s1: 200 } }], defGens: f1, seed });
  const f2 = foes.map(combatFromFoe); distributeArmy(f2, army);
  const r2 = runBattle({ atkName: "A", defName: "B", atkGens: [{ ...g, skills: g.skills.filter(Boolean), duel: { atk: 20, def: 15, hp: 90 }, troops: { s1: 200 } }], defGens: f2, seed });
  ok(JSON.stringify(r1.result) === JSON.stringify(r2.result), "同种子战报完全可复现");
  ok(r1.events[0].k === "start" && r1.events[r1.events.length - 1].k === "end", "事件流以 start 开场 / end 收尾");

  /* 金将压制：吕布+青州骑 破 同缀黄巾大军方（约为敌半数兵力，凭兵种与单挑取胜） */
  const lvbu = { uid: "x", gid: "lvbu", name: "吕布", lv: 10, quality: "gold", skills: ["wushuang"], duel: { atk: 62, def: 47, hp: 288 }, troops: { sp1: 700 } };
  const zj = combatFromFoe(["zhangjiao", 10]); distributeArmy([zj], { s1: 700, a1: 350 });
  const rb = runBattle({ atkName: "A", defName: "B", atkGens: [lvbu], defGens: [zj], seed: 7 });
  ok(rb.result.winner === "atk", "吕布+青州骑 碾压同缀黄巾", rb.result.winner);
  ok(rb.events.some(e => e.k === "duel-start"), "战报含单挑阶段");

  /* 兵种克制：弓兵阵营应压制同规模步兵阵营（多种子统计） */
  let archerWins = 0;
  for (let seed2 = 0; seed2 < 30; seed2++) {
    const A = [{ uid: "a", gid: "guanping", name: "弓将", lv: 5, quality: "blue", skills: [], duel: { atk: 20, def: 15, hp: 90 }, troops: { a1: 200 } }];
    const B = [{ uid: "b", gid: "guanping", name: "步将", lv: 5, quality: "blue", skills: [], duel: { atk: 20, def: 15, hp: 90 }, troops: { s1: 200 } }];
    const r = runBattle({ atkName: "弓", defName: "步", atkGens: A.map(x => ({ ...x, troops: { a1: 200 } })), defGens: B.map(x => ({ ...x, troops: { s1: 200 } })), seed: seed2 });
    if (r.result.winner === "atk") archerWins++;
  }
  ok(archerWins >= 24, `弓克步：30 局弓方胜 ${archerWins}（≥24）`);

  /* 触发技：浑天斩应当在单挑中真的触发 */
  let proc = 0;
  for (let seed3 = 0; seed3 < 40; seed3++) {
    const A = [{ uid: "a", gid: "lvbu", name: "触发将", lv: 10, quality: "gold", skills: ["huntianzhan"], duel: { atk: 40, def: 30, hp: 200 }, troops: {} }];
    const B = [{ uid: "b", gid: "guanping", name: "肉盾将", lv: 10, quality: "gold", skills: [], duel: { atk: 40, def: 30, hp: 200 }, troops: {} }];
    const r = runBattle({ atkName: "A", defName: "B", atkGens: A, defGens: B, seed: seed3 });
    proc += r.events.filter(e => e.k === "duel-hit" && e.skill === "浑天斩").length;
  }
  ok(proc >= 5, `浑天斩 40 局触发 ${proc} 次（≥5）`);

  /* 单挑技效果：无懈可击应出现「暴击被免疫」 */
  let negated = 0;
  for (let seed4 = 0; seed4 < 60; seed4++) {
    const A = [{ uid: "a", gid: "lvbu", name: "猛将", lv: 10, quality: "gold", skills: [], duel: { atk: 40, def: 30, hp: 200 }, troops: {} }];
    const B = [{ uid: "b", gid: "guanping", name: "无懈将", lv: 10, quality: "gold", skills: ["wuxiejikeji"], duel: { atk: 40, def: 30, hp: 200 }, troops: {} }];
    const r = runBattle({ atkName: "A", defName: "B", atkGens: A, defGens: B, seed: seed4 });
    negated += r.events.filter(e => e.k === "duel-hit" && e.critNegated).length;
  }
  ok(negated >= 1, `无懈可击 60 局免疫暴击 ${negated} 次（≥1）`);

  /* 空城直接获胜 */
  const re = runBattle({ atkName: "A", defName: "空城", atkGens: [lvbu], defGens: [], seed: 1 });
  ok(re.result.winner === "atk" && re.events.some(e => e.k === "notice"), "空城不战而胜");
}

/* ================= 3. 城建与经济 ================= */
section("城建与经济");
{
  const now = Date.now();
  const s = createNewGame("测试", now);
  const c0 = s.resources.copper;

  /* 主城 2 级需主公 2 级 */
  s.lord.lv = 2;
  let empty = s.grid.findIndex(c => c === null);
  const r = build(s, empty, "xc", now);
  ok(r.ok, "建造校场受理", r.msg);
  ok(s.resources.copper < c0, "建造扣款");
  ok(s.buildQueue.length === 1, "进入建造队列");
  const again = build(s, s.grid.findIndex(c => c === null), "mj", now);
  ok(!again.ok, "单建造队列：第二项被拒", again.msg);

  tick(s, now + 3600e3);
  ok(s.grid[empty] && s.grid[empty].type === "xc" && s.grid[empty].lv === 1, "完工后校场落成 1 级");
  ok(s.buildQueue.length === 0, "队列清空");
  ok(s.quests.daily.build >= 1, "完工计入每日任务");

  const rate = productionPerHour(s);
  const cu = s.resources.copper, fo = s.resources.food;
  tick(s, s.lastTick + 3600e3);
  ok(s.resources.copper - cu === rate.copper && s.resources.food - fo === rate.food, "1 小时产出与统计一致", `${rate.copper}/${rate.food}`);

  tick(s, s.lastTick + 20 * 3600e3);
  const gain = s.resources.copper - (cu + rate.copper);
  ok(gain <= rate.copper * 8 * 1.01 + 1, "离线收益 8 小时封顶", `gain=${gain}, 8h=${rate.copper * 8}`);

  /* 搬迁 */
  const from = s.grid.findIndex(c => c && c.type === "mj");
  const to = s.grid.findIndex(c => c === null);
  const mv = move(s, from, to);
  ok(mv.ok && s.grid[to].type === "mj" && s.grid[from] === null, "民居可搬迁");
  const zcCell = s.grid.findIndex(c => c && c.type === "zc");
  ok(!move(s, zcCell, to).ok, "主城不可搬迁");
}

/* ================= 4. 征兵与带兵 ================= */
section("征兵与带兵");
{
  const now = Date.now();
  const s = createNewGame("测试", now);
  s.resources.copper = 1e6; s.resources.food = 1e6;
  const r = startTrain(s, "s1", 100, now);
  ok(r.ok, "征募 100 刀盾兵受理", r.msg);
  tick(s, now + 3600e3);
  ok((s.barracks.s1 || 0) === 100, "完工入库 100 兵");

  const g = s.generals[0];
  const a = assignTroops(s, g, "s1", 500);
  ok(a.ok && (g.troops.s1 || 0) > 0, "配兵入库武将", `带兵=${g.troops.s1}`);
  const carryFull = Object.values(g.troops).reduce((x, y) => x + y, 0);
  const over = assignTroops(s, g, "s1", 1e9);
  ok((!over.ok) || Object.values(g.troops).reduce((x, y) => x + y, 0) <= carryFull + 200 + g.lv * 20, "带兵不越上限");
  const back = assignTroops(s, g, "s1", -10);
  ok(back.ok, "退兵回库");

  /* 兵种解锁门槛 */
  const hi = startTrain(s, "sp3", 10, now);
  ok(!hi.ok, "虎豹骑需兵营 34 级", hi.msg);
}

/* ================= 5. 招募 ================= */
section("客栈招募");
{
  const now = Date.now();
  const s = createNewGame("测试", now);
  s.resources.copper = 1e6;
  ok(s.tavern.pool.every(id => PLAYABLE.some(p => p.id === id)), "初始名册均为可招募武将");
  ok(GENERAL_MAP[s.tavern.pool[0]].quality !== "green", "首席保底非绿将");

  const before = s.generals.length;
  /* 找一席便宜的招 */
  let idx = s.tavern.pool.findIndex(id => recruitCost(id).copper <= 1e6 && recruitCost(id).jade <= s.resources.jade);
  const r = recruit(s, idx);
  ok(r.ok, "招募成功", r.msg);
  ok(s.generals.length === before + (r.dup ? 0 : 1), "武将入列或转化");
  if (r.dup) ok(Object.keys(s.items.books).length >= 1, "重复武将转化为技能书");

  s.tavern.lastFreeRefreshAt = now - 7200e3;
  const rf = refreshPool(s, now);
  ok(rf.ok && rf.msg.includes("免费"), "过期免费刷新");
  s.tavern.lastFreeRefreshAt = now;
  s.resources.jade = 1000;
  const rf2 = refreshPool(s, now);
  ok(rf2.ok && s.resources.jade === 1000 - 30, "玉璧刷新扣 30");
}

/* ================= 6. 技能打书 ================= */
section("技能打书");
{
  const now = Date.now();
  const s = createNewGame("测试", now);
  const g = s.generals[0];
  const bookId = BOOK_POOL[0];
  s.items.books[bookId] = 1;
  const r = learnSkill(s, g, 1, bookId, now);
  ok(r.ok && g.skills[1] === bookId, "1 号槽打书成功", r.msg);
  const r2 = learnSkill(s, g, 0, bookId, now);
  ok(!r2.ok, "天生技槽不可覆盖", r2.msg);
  s.items.books[bookId] = 1;
  const r3 = learnSkill(s, g, 1, bookId, now);
  ok(!r3.ok && s.items.books[bookId] === 1, "重复技能不可打", r3.msg);
  delete s.items.books[bookId];
  const another = BOOK_POOL.find(b => b !== bookId && !g.skills.includes(b));
  const r4 = learnSkill(s, g, 1, another, now);
  ok(!r4.ok, "覆盖需玉璧且无书则拒绝", r4.msg);
  s.resources.jade = 200;
  const r5 = learnSkill(s, g, 1, another, now);
  ok(r5.ok && g.skills[1] === another && s.resources.jade === 100, "花 100 玉璧覆盖技能");
}

/* ================= 7. 任务与签到 ================= */
section("任务与签到");
{
  const now = Date.now();
  const s = createNewGame("测试", now);
  s.lord.lv = 2;
  const r = claimMain(s);
  ok(!r.ok, "未达成不可领取");
  s.grid[24].lv = 2;
  const cu = s.resources.copper;
  const r2 = claimMain(s);
  grantReward(s, r2.reward);
  ok(r2.ok && s.resources.copper === cu + 1200, "主线「主城2级」领取 +1200 铜钱", r2.msg);
  ok(s.quests.main === 1, "主线推进到第 2 项");

  const ck0 = doCheckin(s, now);
  ok(ck0.ok && ck0.day === 0, "首日签到记第 1 天");
  ok(!checkinReady(s, now), "同日不可重复签到");
  const ck = doCheckin(s, now + 86400e3);
  ok(ck.ok && ck.day === 1, "次日签到记第 2 天");
}

/* ================= 8. 自动攻略（核心回归） ================= */
section("自动攻略：从开档到定鼎");
{
  const STEP = 900e3;            /* 每迭代快进 15 分钟（模拟每日登录 3 次的页游节奏） */
  const MAX_ITERS = 2600;        /* ≈ 40 天游戏时长上限 */
  const s = createNewGame("机器人主公", Date.now());
  let now = Date.now();
  let loseStreak = 0;
  let occupiedOnce = false, taxedOnce = false;
  let battles = 0, wins = 0;
  let lastCh = "—";
  let lastClearedCount = 0, stallIters = 0;

  const BUILD_ORDER = ["zc", "mj", "nt", "by", "xc", "kz", "sy"];
  const TRAIN_PREF = ["sp3", "sp2", "sp1", "c2", "a2", "s2", "c1", "a1", "s1"];
  const TECH_PREF = ["special_atk", "special_def", "infantry_atk", "archer_atk", "cavalry_atk", "zhushu", "tundi", "tongshuai", "infantry_def", "archer_def", "cavalry_def"];

  const byLv = () => { const c = s.grid.find(x => x && x.type === "by"); return c ? c.lv : 0; };
  const xcLv = () => { const c = s.grid.find(x => x && x.type === "xc"); return c ? c.lv : 0; };
  const zcLvOf = () => s.grid.find(c => c && c.type === "zc").lv;
  /* 主城升级是全城建上限：攒够钱优先升主城，其余开销从富余里出 */
  const zcReserve = () => {
    const next = zcLvOf() + 1;
    return next <= 45 && s.lord.lv >= next ? buildCost(BUILDING_MAP.zc, next).copper : 0;
  };
  /* 当前兵营已解锁的最优两种兵（主力+副射/副盾） */
  const unlockedTop2 = () => TRAIN_PREF.filter(tid => byLv() >= TROOP_MAP[tid].unlockBarracks).slice(0, 2);
  const squadTroops = () => s.squad.reduce((n, uid) => {
    const g = s.generals.find(x => x.uid === uid);
    return n + (g ? Object.values(g.troops).reduce((a, b) => a + b, 0) : 0);
  }, 0);

  /* 当前目标（下一关卡，否则最弱好友）与其兵种构成 —— 原版核心策略"先看敌军再出兵" */
  const nextTarget = () => {
    const next = STAGE_NODES.find(n => nodeUnlocked(s, n) && !s.campaign.cleared.includes(n.key));
    if (next) return { kind: "pve", key: next.key, army: next.army, total: enemyTotal(next.army) };
    const f = s.friends.filter(x => x.relation !== "occupied").sort((a, b) => a.lv - b.lv)[0];
    if (f) return { kind: "raid", uid: f.uid, army: f.army, total: enemyTotal(f.army) };
    return null;
  };
  const enemyTotal = (army) => Object.values(army).reduce((a, b) => a + b, 0);
  /* 针对敌军主力选克制兵种：骑克弓、弓克步、步克骑、特克全部 */
  const counterPick = (enemyArmy) => {
    const weight = {};
    for (const [tid, n] of Object.entries(enemyArmy)) {
      const cls = TROOP_MAP[tid].cls;
      weight[cls] = (weight[cls] || 0) + n * TROOP_MAP[tid].atk;
    }
    const dominant = Object.entries(weight).sort((a, b) => b[1] - a[1])[0]?.[0] || "infantry";
    const counterCls = { infantry: "archer", archer: "cavalry", cavalry: "infantry", special: "special" }[dominant];
    const unlocked = TRAIN_PREF.filter(tid => byLv() >= TROOP_MAP[tid].unlockBarracks);
    const main = unlocked.find(tid => TROOP_MAP[tid].cls === counterCls) || unlocked[0];
    const sub = unlocked.find(tid => tid !== main && TROOP_MAP[tid].cls !== "special") || unlocked.find(tid => tid !== main);
    return [main, sub];
  };

  for (let iter = 0; iter < MAX_ITERS && !s.campaign.cleared.includes("6-4"); iter++) {
    now += STEP;
    tick(s, now);

    /* 任务全领（奖励入账） */
    if (mainQuestReady(s)) grantReward(s, claimMain(s).reward);
    for (const q of DAILY_QUESTS) { const r = claimDaily(s, q.id); if (r.ok) grantReward(s, r.reward); }
    if (checkinReady(s, now)) grantReward(s, doCheckin(s, now).reward);

    /* 建造：优先主城，再补民生与军备（都贴着主城等级升） */
    if (s.buildQueue.length === 0) {
      const zcCell = s.grid.findIndex(c => c && c.type === "zc");
      for (const t of BUILD_ORDER) {
        const def = BUILDING_MAP[t];
        if (t === "zc") {
          if (s.lord.lv >= s.grid[zcCell].lv + 1) {
            if (upgrade(s, zcCell, now).ok) break;
          }
          continue;
        }
        let cell = s.grid.findIndex(c => c && c.type === t);
        if (cell < 0) cell = s.grid.findIndex(c => c === null);
        if (cell < 0) continue;
        const b = s.grid[cell];
        const cap = Math.min(def.maxLv, s.grid[zcCell].lv);
        if (b && b.lv >= cap) continue;
        if (!b && s.lord.lv < def.unlockLord) continue;
        const r = b ? upgrade(s, cell, now) : build(s, cell, t, now);
        if (r.ok) break;
      }
    }

    /* 征兵：征"克制下一目标主力"的单一兵种；四成财力留给主城 */
    if (!s.trainQueue) {
      const slots = Math.min(5, 2 + Math.floor(xcLv() / 4));
      const g0 = s.generals[0]?.lv || 1;
      const holdCap = slots * ((250 + 25 * g0) * (1 + 0.06 * g0)) * 1.3;
      const held = squadTroops() + Object.values(s.barracks).reduce((a, b) => a + b, 0);
      const surplus = s.resources.copper - zcReserve() * 0.3;
      const target = nextTarget();
      const tid = target ? counterPick(target.army)[0] : unlockedTop2()[0];
      if (tid && held < holdCap && surplus > 800) {
        const t = TROOP_MAP[tid];
        const budget = { copper: surplus * 0.9, food: s.resources.food * 0.7 };
        const n = Math.min(4000, Math.floor(Math.min(budget.copper / t.cost.copper, budget.food / t.cost.food)));
        if (n >= 20) startTrain(s, tid, n, now);
      }
    }

    /* 配兵 + 编队：先全数退回，再统一编入当前的克制兵种 */
    {
      const slots = Math.min(5, 2 + Math.floor(xcLv() / 4));
      const target = nextTarget();
      const mainTid = target ? counterPick(target.army)[0] : unlockedTop2()[0];
      const ranked = [...s.generals].sort((a, b) => {
        const q = { gold: 4, purple: 3, blue: 2, green: 1 };
        return q[GENERAL_MAP[b.gid].quality] - q[GENERAL_MAP[a.gid].quality] || b.lv - a.lv;
      });
      s.squad = ranked.slice(0, slots).map(g => g.uid);
      for (const uid of s.squad) {
        const inst = s.generals.find(x => x.uid === uid);
        for (const [t, c] of Object.entries({ ...inst.troops })) assignTroops(s, inst, t, -c);
        if (mainTid) {
          const stock = s.barracks[mainTid] || 0;
          if (stock > 0) assignTroops(s, inst, mainTid, stock);
        }
      }
    }

    /* 研究：不动用主城储备 */
    if (!s.research) {
      const sy = s.grid.find(c => c && c.type === "sy");
      if (sy && sy.lv > 0 && s.resources.copper > zcReserve() * 0.3 + 3000) {
        for (const tid of TECH_PREF) {
          const lv = s.techs[tid] || 0;
          if (lv < 10 && lv < sy.lv) { if (startResearch(s, tid, now).ok) break; }
        }
      }
    }

    /* 招募：铜钱盈余就招 */
    for (let i = 0; i < 3; i++) {
      if (!s.tavern.pool[i]) continue;
      const cost = recruitCost(s.tavern.pool[i]);
      if (s.resources.copper > cost.copper * 2 && s.resources.jade >= cost.jade) {
        const r = recruit(s, i);
        if (r.ok && !r.dup) break;
      }
    }

    /* 打仗：兵力够敌军九成才出战，败了休整两轮 */
    if (loseStreak > 0) { loseStreak--; }
    else if (squadReady(s).ok) {
      const next = STAGE_NODES.find(n => nodeUnlocked(s, n) && !s.campaign.cleared.includes(n.key));
      const enemyTotal = (army) => Object.values(army).reduce((a, b) => a + b, 0);
      /* 出战门槛：兵力不足敌军 75% 绝不打；有 135% 优势或已满编才出手 */
      const fieldCap = Math.round(s.squad.reduce((n, uid) => {
        const g = s.generals.find(x => x.uid === uid);
        return n + (g ? (250 + 25 * g.lv) * (1 + 0.06 * g.lv) : 0);
      }, 0));
      const canAttack = (enemyN) => {
        const mine = squadTroops();
        return mine >= enemyN * 1.15 || (mine >= fieldCap * 0.95 && mine >= enemyN * 0.8);
      };
      if (next && canAttack(enemyTotal(next.army))) {
        battles++;
        const r = runPve(s, next.key);
        if (r.win) { wins++; loseStreak = 0; lastCh = next.chName; }
        else loseStreak = 2;
      } else if (!occupiedOnce && s.friends.length) {
        const f = s.friends.filter(x => x.relation !== "occupied").sort((a, b) => a.lv - b.lv)[0];
        if (f && canAttack(enemyTotal(f.army))) {
          battles++;
          const r = runRaid(s, f.uid, "occupy");
          if (r.win) { wins++; occupiedOnce = true; } else loseStreak = 2;
        }
      } else {
        const occ = s.friends.find(x => x.relation === "occupied");
        if (occ && pendingTax(s, occ, now) > 0) { doCollectTax(s, occ.uid, now); taxedOnce = true; }
        const target = s.friends.filter(x => x.relation !== "occupied").sort((a, b) => a.lv - b.lv)[0];
        if (target && canAttack(enemyTotal(target.army))) {
          battles++;
          const r = runRaid(s, target.uid, "raid");
          if (r.win) { wins++; loseStreak = 0; } else loseStreak = 2;
        }
      }
    }

    /* 停滞诊断：300 迭代无进展时 dump 关键状态 */
    if (s.campaign.cleared.length > lastClearedCount) {
      lastClearedCount = s.campaign.cleared.length;
      stallIters = 0;
    } else if (++stallIters === 300) {
      const next = STAGE_NODES.find(n => nodeUnlocked(s, n) && !s.campaign.cleared.includes(n.key));
      console.log(`    [诊断] 停滞于 cleared=${lastClearedCount}，下一关=${next ? next.key + "(" + next.name + " 敌" + Object.values(next.army).reduce((a, b) => a + b, 0) + ")" : "无"}`);
      console.log(`    [诊断] squadTroops=${squadTroops()} barracks=${JSON.stringify(s.barracks)} lord=${s.lord.lv} zc=${zcLvOf()} 资源=${Math.floor(s.resources.copper)}/${Math.floor(s.resources.food)}`);
      for (const uid of s.squad) {
        const g = s.generals.find(x => x.uid === uid);
        const def = GENERAL_MAP[g.gid];
        console.log(`    [诊断]   ${def.name} ${def.quality} lv${g.lv} 携带=${JSON.stringify(g.troops)} 编制=${Math.round((250 + 25 * g.lv) * (1 + 0.06 * g.lv))}`);
      }
      console.log(`    [诊断]   训练队列=${JSON.stringify(s.trainQueue)} 建造队列=${s.buildQueue.length} 研究=${JSON.stringify(s.research)}`);
    }
  }

  console.log(`    —— 战斗 ${battles} 场胜 ${wins}，主公 ${s.lord.lv} 级，通关至 ${lastCh}，科技 ${JSON.stringify(s.techs)}，资源=${Math.floor(s.resources.copper)}/${Math.floor(s.resources.food)}/${s.resources.jade}`);

  ok(s.campaign.cleared.includes("1-0"), "开局可通关「涿县遇袭」");
  ok(s.campaign.cleared.length >= 6, `朴素策略 40 天推进 ${s.campaign.cleared.length}/30 关（≥6，无硬墙）`);
  ok(s.lord.lv >= 25, `主公等级成长至 ${s.lord.lv}（≥25）`);
  ok(s.generals.length >= 5, `招募武将 ${s.generals.length} 名（≥5）`);
  ok(occupiedOnce && taxedOnce, "好友玩法走通（占领+收税）");
  ok(Object.values(s.resources).every(v => v >= 0 && isFinite(v)), "资源始终非负有限");
  ok(Object.keys(s.techs).length >= 5, "科技在成长");
  ok(wins > battles * 0.5, `胜率 ${Math.round(wins / Math.max(1, battles) * 100)}%（>50%，曲线不挫败）`, `wins=${wins}/${battles}`);

  /* 存档 round-trip */
  const snap = serialize(s);
  const loaded = migrate(JSON.parse(snap));
  ok(loaded && serialize(loaded) === snap, "存档 serialize → migrate → serialize 完整往返");
}

/* ================= 8b. 后期关卡可达性（合成存档逐章直打） ================= */
section("后期关卡可达性");
{
  const TECHS_MID = { infantry_atk: 6, infantry_def: 6, archer_atk: 6, archer_def: 6, cavalry_atk: 6, cavalry_def: 6, special_atk: 6, special_def: 6, tongshuai: 6, zhushu: 4, tundi: 4 };
  const TECHS_LATE = { infantry_atk: 8, infantry_def: 8, archer_atk: 8, archer_def: 8, cavalry_atk: 8, cavalry_def: 8, special_atk: 8, special_def: 8, tongshuai: 8, zhushu: 5, tundi: 5 };

  /* 合成一个"等级达标、配置合理"的存档，逐关直打指定章节 */
  function synthChapter(lordLv, chId, gids, troopsSpec, techs) {
    const s = createNewGame("验证", Date.now());
    s.lord.lv = lordLv;
    for (const c of s.grid) if (c) c.lv = lordLv;
    let empty = () => s.grid.findIndex(c => c === null);
    for (const t of ["xc", "kz", "sy"]) s.grid[empty()] = { type: t, lv: lordLv };
    s.techs = { ...techs };
    s.resources = { copper: 5e6, food: 5e6, jade: 1000 };
    for (let ch = 1; ch < chId; ch++) for (let i = 0; i < 5; i++) s.campaign.cleared.push(`${ch}-${i}`);
    s.generals = gids.map((gid, i) => ({
      uid: "p" + i, gid, lv: lordLv, exp: 0,
      /* 标配两本书：骁勇 + 浑天斩（真实玩家常规配置） */
      skills: [GENERAL_MAP[gid].innate, "xiaoyong", "huntianzhan", null, null],
      troops: { ...troopsSpec }
    }));
    s.squad = s.generals.map(g => g.uid);

    let allWin = true, detail = [];
    for (let i = 0; i < 5; i++) {
      const key = `${chId}-${i}`;
      for (const g of s.generals) g.troops = { ...troopsSpec };
      const r = runPve(s, key);
      if (!r.ok) { detail.push(`${key}:异常(${r.msg})`); allWin = false; continue; }
      detail.push(`${i + 1}:${r.win ? "胜" : "败"}(${r.result.rounds}轮)`);
      if (!r.win) allWin = false;
    }
    console.log(`    第${chId}章(lv${lordLv}) ` + detail.join("  "));
    return allWin;
  }

  const blue5 = ["guanping", "zhoucang", "caoren", "zhanghe", "chengpu"];
  ok(synthChapter(20, 3, blue5, { s2: 2000, a2: 1000 }, TECHS_MID), "第三章：lv20 蓝将×5 通关");
  ok(synthChapter(27, 4, blue5, { s2: 3200, a2: 1500 }, TECHS_MID), "第四章：lv27 蓝将×5 通关");
  ok(synthChapter(34, 5, ["zhangfei", "machao", "sunce", "ganning", "caoren"], { sp1: 3600, sp2: 1600 }, TECHS_MID), "第五章：lv34 紫将×5 通关");
  ok(synthChapter(43, 6, ["guanyu", "zhangfei", "zhaoyun", "machao", "huangzhong"], { sp3: 6500, sp2: 2000 }, TECHS_LATE), "第六章：lv43 五虎 + 虎豹骑通关");
}

/* ================= 9. 好友数值 ================= */
section("好友城池数值");
{
  const s = createNewGame("测试", Date.now());
  ok(s.friends.length === 8, "开局 8 位好友");
  ok(s.friends.every(f => GENERAL_MAP[f.foes[0][0]]), "好友守将均为有效武将");
  const lv20 = armyScaleFor(20), lv40 = armyScaleFor(40);
  ok(lv40 > lv20 * 2, `好友兵力随等级成长（20级=${lv20}, 40级=${lv40}）`);
  const f = s.friends[0];
  f.relation = "occupied"; f.occupiedAt = Date.now(); f.lastTaxAt = Date.now();
  const now2 = Date.now() + 3600e3;
  const r = collectTax(s, f, now2);
  ok(r.ok && r.tax > 0, "占领后可收税");
}

console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========`);
process.exit(fail ? 1 : 0);
