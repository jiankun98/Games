// 卡组构建校验：检查每套预设的 总张数 / 怪兽·魔·陷比例 / 星级分布
// 用法： node run/check-decks.mjs
import { DECK_PRESETS, buildDeck, buildExtra, CARD_BY_ID } from "../games/YuGiOh/cards.mjs";

let bad = 0;
for (const name of Object.keys(DECK_PRESETS)) {
  const deck = buildDeck(name);
  const extra = buildExtra(name);
  const cards = deck.map((id) => CARD_BY_ID[id]).filter(Boolean);
  const mons = cards.filter((c) => c.type === "monster");
  const low = mons.filter((c) => (c.level || 0) <= 4);
  const high = mons.filter((c) => (c.level || 0) > 4);
  const spells = cards.filter((c) => c.type === "spell");
  const traps = cards.filter((c) => c.type === "trap");
  const missing = deck.filter((id) => !CARD_BY_ID[id]);
  const flags = [];
  if (cards.length !== 60) flags.push("总数" + cards.length + "≠60");
  if (mons.length < 30 || mons.length > 36) flags.push("怪" + mons.length);
  if (low.length < 22 || low.length > 28) flags.push("低星" + low.length);
  if (high.length < 6 || high.length > 10) flags.push("高星" + high.length);
  if (spells.length < 15 || spells.length > 19) flags.push("魔" + spells.length);
  if (traps.length < 8 || traps.length > 12) flags.push("陷" + traps.length);
  if (missing.length) flags.push("缺卡:" + missing.join(","));
  if (flags.length) bad++;
  console.log(`${flags.length ? "!! " : "✓  "}${name}: 总${cards.length} 怪${mons.length}(低${low.length}/高${high.length}) 魔${spells.length} 陷${traps.length} 额外${extra.length} ${flags.join(" ")}`);
}
process.exit(bad ? 1 : 0);
