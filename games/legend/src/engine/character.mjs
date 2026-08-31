// 角色属性聚合：职业基础 + 装备（品质/强化/宝石）+ 养成线（平铺+百分比）→ 最终面板
import { baseStats } from "../data/classes.mjs";
import { ITEMS, equipStats } from "../data/items.mjs";
import { trackStats } from "./growth/registry.mjs";
import { expToNext, LEVEL_CAP } from "../data/constants.mjs";

export function calcStats(state) {
  const base = baseStats(state.class, state.level);
  const out = { ...base };

  // 装备
  for (const [slot, uid] of Object.entries(state.equips || {})) {
    const inst = (state.bag || []).find((it) => it.uid === uid);
    if (!inst) continue;
    const tpl = ITEMS[inst.tpl];
    if (!tpl || tpl.type !== "equip") continue;
    for (const [k, v] of Object.entries(equipStats(inst))) {
      out[k] = (out[k] || 0) + v;
    }
  }

  // 养成线平铺属性
  const { flat, pct } = trackStats(state);
  for (const [k, v] of Object.entries(flat)) {
    out[k] = (out[k] || 0) + v;
  }

  // 百分比属性：atkPct/hpPct/defPct/mdefPct 乘算，cutPct 累加后置
  for (const [k, v] of Object.entries(pct)) {
    if (k === "cutPct") { out.cutPct = (out.cutPct || 0) + v; continue; }
    const key = k.slice(0, -3); // atkPct -> atk
    if (["atk", "hp", "def", "mdef"].includes(key)) {
      const target = key === "hp" ? "hpMax" : key;
      out[target] = Math.round(out[target] * (1 + v / 100));
    }
  }
  out.cutPct = out.cutPct || 0;
  return out;
}

// 战力：攻>防>血的经典权重，切割/暴击/攻速折算
export function battlePower(stats) {
  const p = Math.round(
    stats.atk * 4 +
    stats.hpMax * 0.5 +
    (stats.def + stats.mdef) * 2.5 +
    (stats.crit || 0) * 25 +
    (stats.critDmg || 0) * 120 +
    (stats.dodge || 0) * 18 +
    (stats.hit || 0) * 6 +
    (stats.cutPct || 0) * 350 +
    (stats.aspd || 1) * 90
  );
  return Math.max(1, p);
}

// 加经验并处理升级（返回是否升级）
export function gainExp(state, n, emit) {
  state.exp += Math.max(0, Math.round(n));
  let up = false;
  while (state.level < LEVEL_CAP && state.exp >= expToNext(state.level)) {
    state.exp -= expToNext(state.level);
    state.level++;
    up = true;
    if (emit) emit("levelup", { level: state.level });
  }
  if (state.level >= LEVEL_CAP) state.exp = Math.min(state.exp, expToNext(LEVEL_CAP) - 1);
  return up;
}
