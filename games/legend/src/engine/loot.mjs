// 掉落掷骰：金币/装备（含品质）/宝石/材料，首杀奖励单独返回
import { MONSTERS } from "../data/monsters.mjs";
import { QUALITIES, ITEMS } from "../data/items.mjs";

const GEM_KINDS = ["gem_atk", "gem_hp", "gem_def", "gem_crit"];

// 单次击杀掉落；bonus 为爆率加成（0.1 = 高品质率+10%）
export function rollDrops(monId, rng, bonus = 0) {
  const m = MONSTERS[monId];
  if (!m) return { gold: 0, items: [], firstkill: null };
  const out = { gold: 0, items: [], firstkill: null };

  for (const d of m.drops) {
    const rate = Math.min(1, d.rate * (d.kind === "gold" ? 1 : 1 + bonus));
    if (rng() > rate) continue;
    if (d.kind === "gold") {
      out.gold += Math.round(m.gold * (0.7 + rng() * 0.6) * d.qty);
    } else if (d.kind === "item") {
      out.items.push({ tpl: d.tpl, q: rollQuality(rng, bonus), qty: d.qty });
    } else if (d.kind === "gem") {
      const kind = GEM_KINDS[Math.floor(rng() * GEM_KINDS.length)];
      const lv = rollGemLevel(rng);
      out.items.push({ tpl: `${kind}_${lv}`, q: 0, qty: 1 });
    } else if (d.kind === "firstkill") {
      out.firstkill = { ingot: d.ingot };
    }
  }
  return out;
}

export function rollQuality(rng, bonus = 0) {
  const r = rng();
  let acc = 0;
  // bonus 提升高品质权重：高阶品质率 ×(1+bonus)
  const rates = QUALITIES.map((q, i) => (i >= 2 ? q.rate * (1 + bonus) : q.rate));
  for (let i = 0; i < rates.length; i++) {
    acc += rates[i];
    if (r < acc) return i;
  }
  return 0;
}

export function rollGemLevel(rng) {
  const r = rng();
  if (r < 0.60) return 1;
  if (r < 0.85) return 2;
  if (r < 0.95) return 3;
  if (r < 0.99) return 4;
  return 5;
}

// 商店购买价（材料/药水有价；装备不可直接买，只能打）
export function shopPrice(tplId) {
  const t = ITEMS[tplId];
  return t ? t.price || 0 : 0;
}
