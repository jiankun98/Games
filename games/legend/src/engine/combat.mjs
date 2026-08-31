// 战斗会话（运行时态，不入档）：挂机自动战斗核心
//  玩家↔当前地图怪物群：普攻按攻速、技能按 CD 自动释放，击杀经 onKill 回调结算掉落
//  纯逻辑、可 seed，node 回归测试直接驱动 tick
import { MAPS, MONSTERS } from "../data/monsters.mjs";
import { SKILLS } from "../data/skills.mjs";

const REVIVE_SEC = 5;      // 玩家死亡复活等待
const RESPAWN_SEC = 3;     // 怪物复活间隔
const MAX_ALIVE = 3;       // 同屏怪物上限

function monInstance(monId, uid, rng) {
  const m = MONSTERS[monId];
  const rnd = rng || Math.random;
  return {
    uid, monId, name: m.name, icon: m.icon, lvl: m.lvl,
    hp: m.hpMax, maxHp: m.hpMax, atk: m.atk, def: m.def, dodge: m.dodge, aspd: m.aspd, boss: m.boss,
    atkAcc: rnd() * 0.5, respawnAt: 0, dot: null, slowUntil: 0
  };
}

export class BattleSession {
  constructor(mapId, stats, skills) {
    this.mapId = mapId;
    this.mons = [];
    this.uidSeq = 1;
    this.player = {
      hpMax: stats.hpMax, hp: stats.hpMax,
      mpMax: stats.mpMax, mp: stats.mpMax,
      atkAcc: 0,
      skills: (skills || []).map((s) => ({ id: s.id, cdLeft: 1 + Math.random() * 2 })),
      buffs: [],          // { defMult, until } 秒
      summon: null,       // { hpMax, hp, atk, until }
      deadUntil: 0
    };
    this.time = 0;
    this.killCount = 0;
  }

  aliveMons() {
    return this.mons.filter((m) => m.hp > 0);
  }

  // —— 伤害公式 ——
  //  命中：基础 80% + 命中修正，上限 97%；伤害：atk*mult - 防御削减（保底 15%）
  //  切割：附加目标最大生命 cutPct%（Boss 减半）
  dealToMon(stats, mon, mult, opts = {}) {
    const ev = [];
    const hitChance = Math.min(0.97, Math.max(0.65, 0.8 + (stats.hit - mon.dodge * 4) / 300));
    if (Math.random() > hitChance) {
      ev.push({ t: "miss", target: mon.uid });
      return ev;
    }
    let dmg = Math.max(stats.atk * mult * 0.15, stats.atk * mult - mon.def * 1.2 * (1 - (opts.ignoreDef || 0)));
    let crit = false;
    if (Math.random() * 100 < (stats.crit || 0)) {
      dmg *= stats.critDmg || 1.5;
      crit = true;
    }
    let cut = 0;
    if (stats.cutPct > 0) {
      cut = mon.maxHp * (stats.cutPct / 100) * (mon.boss ? 0.5 : 1);
    }
    const total = Math.max(1, Math.round(dmg + cut));
    mon.hp = Math.max(0, mon.hp - total);
    ev.push({ t: "hit", target: mon.uid, dmg: total, crit, cut: Math.round(cut), skill: opts.skill || null });
    return ev;
  }

  dealToPlayer(mon, stats, mult = 1) {
    const buff = this.player.buffs.reduce((a, b) => a * b.defMult, 1);
    let dmg = Math.max(mon.atk * mult * 0.1, mon.atk * mult - stats.def * 0.9 * buff - stats.mdef * 0.4 * buff);
    if (Math.random() > Math.min(0.95, Math.max(0.6, 0.85 - stats.dodge * 0.008))) return [{ t: "pmiss" }];
    const total = Math.max(1, Math.round(dmg));
    this.player.hp = Math.max(0, this.player.hp - total);
    return [{ t: "php", dmg: total }];
  }

  // tick：dt 秒；stats 为玩家最新面板；onKill(monId) 由 LegendCore 结算掉落/经验
  tick(dt, stats, rng, onKill) {
    const ev = [];
    const map = MAPS[this.mapId];
    if (!map) return ev;
    this.time += dt;
    const P = this.player;
    P.hpMax = stats.hpMax;
    P.mpMax = stats.mpMax;

    // 死亡等待
    if (P.hp <= 0) {
      P.deadUntil -= dt;
      if (P.deadUntil <= 0) {
        P.hp = stats.hpMax;
        P.mp = stats.mpMax;
        ev.push({ t: "previve" });
      }
      return ev;
    }

    // 魔法回复 2%/s
    P.mp = Math.min(P.mpMax, P.mp + P.mpMax * 0.02 * dt);

    // 召唤物与增益倒计时
    if (P.summon) {
      P.summon.until -= dt;
      if (P.summon.until <= 0 || P.summon.hp <= 0) P.summon = null;
    }
    P.buffs = P.buffs.filter((b) => (b.until -= dt) > 0);

    // 刷怪：保持至多 MAX_ALIVE 只（Boss 图必带 Boss）
    const now = this.time;
    for (let i = this.aliveMons().length; i < Math.min(MAX_ALIVE, map.mons.length + (map.boss ? 1 : 0)); i++) {
      const pool = map.boss && !this.mons.some((m) => m.boss && m.hp > 0)
        ? map.mons.concat([map.boss])
        : map.mons;
      const monId = pool[Math.floor(rng() * pool.length)];
      this.mons.push(monInstance(monId, this.uidSeq++, rng));
      ev.push({ t: "spawn", mon: this.mons[this.mons.length - 1].name });
    }
    // 清掉已过复活时间的尸体空位（下一 tick 重刷）
    this.mons = this.mons.filter((m) => m.hp > 0 || now < m.respawnAt);

    const alive = this.aliveMons();
    if (alive.length === 0) return ev;
    const first = alive[0];

    // 玩家技能
    for (const s of P.skills) {
      s.cdLeft -= dt;
      const cfg = SKILLS[s.id];
      if (!cfg || s.cdLeft > 0) continue;
      if (P.mp < (cfg.mp || 0)) continue;
      P.mp -= cfg.mp || 0;
      s.cdLeft = cfg.cd;
      ev.push({ t: "skill", id: s.id, name: cfg.name });
      if (cfg.type === "damage") {
        const targets = cfg.aoe > 1 ? alive.slice(0, cfg.aoe) : [first];
        for (const mon of targets) {
          ev.push(...this.dealToMon(stats, mon, cfg.mult, { skill: cfg.name, ignoreDef: cfg.ignoreDef || 0 }));
          if (cfg.slow) mon.slowUntil = now + 4;
        }
      } else if (cfg.type === "dot") {
        for (const mon of alive.slice(0, cfg.aoe || 1)) {
          mon.dot = { dps: stats.atk * cfg.dot.mult, until: now + cfg.dot.dur };
          ev.push(...this.dealToMon(stats, mon, cfg.mult, { skill: cfg.name }));
        }
      } else if (cfg.type === "buff") {
        P.buffs.push({ defMult: 1 + (cfg.buff.def || 0), until: (cfg.buff.dur || 5) });
      } else if (cfg.type === "summon") {
        P.summon = {
          hpMax: Math.round(stats.hpMax * cfg.summon.hpMult), hp: Math.round(stats.hpMax * cfg.summon.hpMult),
          atk: Math.round(stats.atk * cfg.summon.atkMult), until: cfg.summon.dur
        };
        ev.push({ t: "summon" });
      } else if (cfg.type === "heal") {
        const heal = Math.round(stats.hpMax * cfg.heal);
        P.hp = Math.min(stats.hpMax, P.hp + heal);
        ev.push({ t: "pheal", heal });
      }
    }

    // 普攻（攻速累积）
    P.atkAcc += dt * stats.aspd;
    while (P.atkAcc >= 1) {
      P.atkAcc -= 1;
      ev.push(...this.dealToMon(stats, first, 1));
    }

    // 召唤物攻击
    if (P.summon && P.summon.hp > 0) {
      const sdmg = Math.max(1, Math.round(P.summon.atk - first.def));
      first.hp = Math.max(0, first.hp - sdmg);
      ev.push({ t: "shit", dmg: sdmg });
    }

    // 怪物行动
    for (const mon of alive) {
      if (mon.hp <= 0) continue;
      if (mon.dot && now < mon.dot.until) {
        const d = Math.max(1, Math.round(mon.dot.dps * dt));
        mon.hp = Math.max(0, mon.hp - d);
      }
      if (mon.hp <= 0) continue;
      const slowFactor = now < mon.slowUntil ? 0.7 : 1;
      mon.atkAcc += dt * mon.aspd * slowFactor;
      while (mon.atkAcc >= 1) {
        mon.atkAcc -= 1;
        if (P.summon && P.summon.hp > 0 && Math.random() < 0.7) {
          P.summon.hp -= Math.max(1, Math.round(mon.atk * 0.6));
        } else {
          ev.push(...this.dealToPlayer(mon, stats));
        }
      }
    }

    // 击杀结算
    for (const mon of this.mons) {
      if (mon.hp <= 0 && mon.respawnAt === 0) {
        mon.respawnAt = now + RESPAWN_SEC;
        this.killCount++;
        const rewards = onKill ? onKill(mon.monId, mon.boss) : null;
        ev.push({ t: "kill", mon: mon.name, monId: mon.monId, boss: !!mon.boss, rewards });
      }
    }

    // 玩家死亡：损失少量经验
    if (P.hp <= 0) {
      P.deadUntil = REVIVE_SEC;
      ev.push({ t: "pdead" });
    }
    return ev;
  }

  // 手动喝药（红/蓝），量由外部给
  usePotion(kind, pct) {
    if (this.player.hp <= 0) return false;
    if (kind === "hp") this.player.hp = Math.min(this.player.hpMax, this.player.hp + this.player.hpMax * pct);
    else this.player.mp = Math.min(this.player.mpMax, this.player.mp + this.player.mpMax * pct);
    return true;
  }

  view() {
    return {
      mapId: this.mapId,
      player: {
        hp: Math.round(this.player.hp), hpMax: this.player.hpMax,
        mp: Math.round(this.player.mp), mpMax: this.player.mpMax,
        dead: this.player.hp <= 0, reviveIn: Math.max(0, Math.ceil(this.player.deadUntil)),
        summon: this.player.summon ? { hp: this.player.summon.hp, hpMax: this.player.summon.hpMax } : null
      },
      skills: this.player.skills.map((s) => {
        const cfg = SKILLS[s.id] || {};
        return { id: s.id, icon: cfg.icon, name: cfg.name, cd: cfg.cd || 0, cdLeft: Math.max(0, s.cdLeft) };
      }),
      mons: this.aliveMons().map((m) => ({
        uid: m.uid, name: m.name, icon: m.icon, lvl: m.lvl, boss: m.boss,
        hp: Math.round(m.hp), maxHp: m.maxHp
      })),
      killCount: this.killCount
    };
  }
}
