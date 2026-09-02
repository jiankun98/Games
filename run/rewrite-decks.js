"use strict";
// 将 run/new-presets.js 中的卡组预设注入 cards.js，并设置 60 张上限
const fs = require("fs");
const path = require("path");
const cardsPath = path.resolve(__dirname, "../games/YuGiOh/cards.mjs");
const presetSrc = fs.readFileSync(path.resolve(__dirname, "new-presets.js"), "utf8");
const m = presetSrc.match(/const DECK_PRESETS = \{[\s\S]*?\n\};/);
if (!m) throw new Error("new-presets.js 格式错误");
let cards = fs.readFileSync(cardsPath, "utf8");
if (!/const DECK_PRESETS = \{[\s\S]*?\n\};\nfunction buildDeck/.test(cards)) throw new Error("cards.js 结构未匹配");
cards = cards.replace(/const DECK_PRESETS = \{[\s\S]*?\n\};\nfunction buildDeck/, m[0] + "\nfunction buildDeck");
cards = cards.replace(/return deck\.slice\(0, 40\);/, "return deck.slice(0, 60); // 卡组上限 60 张");
fs.writeFileSync(cardsPath, cards);
console.log("已注入新卡组预设 + 60 张上限");
