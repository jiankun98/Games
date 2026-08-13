"use strict";
// cards.js 卡密维护工具：
//  1) 为缺少 password 的经典卡从 YGOProDeck API 查官方卡密
//  2) 校验所有卡密的裁剪卡图是否可用（https://images.ygoprodeck.com/images/cards_cropped/<id>.jpg），
//     404 时在同名卡的其他版本记录中找可用的卡图并替换卡密
// 用法： node run/fetch-passwords.js [--apply]
//  不带 --apply：仅打印结果；带 --apply：写回 games/YuGiOh/cards.js
const fs = require("fs");
const path = require("path");

// cards.js 卡牌 id -> 官方英文名（用于 API 精确查询）
const CID_TO_NAME = {
  blueyes: "Blue-Eyes White Dragon",
  darkmagician: "Dark Magician",
  summonedskull: "Summoned Skull",
  gaia: "Gaia The Fierce Knight",
  celtic: "Celtic Guardian",
  gemini: "Gemini Elf",
  axe: "Axe Raider",
  battleox: "Battle Ox",
  lajinn: "La Jinn the Mystical Genie of the Lamp",
  stone: "Giant Soldier of Stone",
  silverfang: "Silver Fang",
  mysticalelf: "Mystical Elf",
  maneater: "Man-Eater Bug",
  oldvindictive: "Old Vindictive Magician",
  magicianoffaith: "Magician of Faith",
  penguin: "Penguin Soldier",
  yomiship: "Yomi Ship",
  giantgerm: "Giant Germ",
  witch: "Witch of the Black Forest",
  sangan: "Sangan",
  exiled: "Exiled Force",
  cannonsoldier: "Cannon Soldier",
  goblin: "Goblin Attack Force",
  speardragon: "Spear Dragon",
  kuriboh: "Kuriboh",
  sinisterserpent: "Sinister Serpent",
  raigeki: "Raigeki",
  darkhole: "Dark Hole",
  mst: "Mystical Space Typhoon",
  monsterreborn: "Monster Reborn",
  potofgreed: "Pot of Greed",
  gracefulcharity: "Graceful Charity",
  changeofheart: "Change of Heart",
  shieldsword: "Shield & Sword",
  fissure: "Fissure",
  smashing: "Smashing Ground",
  axeofdespair: "Axe of Despair",
  blackpendant: "Black Pendant",
  magepower: "Mage Power",
  united: "United We Stand",
  yami: "Yami",
  mountain: "Mountain",
  forest: "Forest",
  traphole: "Trap Hole",
  mirrorforce: "Mirror Force",
  sakuretsu: "Sakuretsu Armor",
  magiccylinder: "Magic Cylinder",
  negateattack: "Negate Attack",
  dimensionalprison: "Dimensional Prison",
  waboku: "Waboku",
  callofhaunted: "Call of the Haunted",
  torrential: "Torrential Tribute",
  ringofdestruction: "Ring of Destruction",
  dusttornado: "Dust Tornado",
  seventools: "Seven Tools of the Bandit",
  magicjammer: "Magic Jammer",
  bottomless: "Bottomless Trap Hole",
  swords: "Swords of Revealing Light",
  heavystorm: "Heavy Storm",
  // —— 扩充卡（机械/英雄/青眼/黑魔术师/真红眼/神鹰/磁石/战士/不死/天使）——
  proto: "Proto-Cyber Dragon",
  cybertwin: "Cyber Twin Dragon",
  powerbond: "Power Bond",
  cyberrepair: "Cyber Repair Plant",
  e_call: "E - Emergency Call",
  hero_signal: "Hero Signal",
  hero_barrier: "Hero Barrier",
  ancientrules: "Ancient Rules",
  silvercry: "Silver's Cry",
  championsvigilance: "Champion's Vigilance",
  magicaldimension: "Magical Dimension",
  redeyesfusion: "Red-Eyes Fusion",
  huntingground: "Harpies' Hunting Ground",
  hystericparty: "Hysteric Party",
  magnet_delta: "Delta The Magnet Warrior",
  maraudingcaptain: "Marauding Captain",
  warriordai: "Warrior Dai Grepher",
  amazoness: "Amazoness Swords Woman",
  swordstalker: "Sword Hunter",
  commandknight: "Command Knight",
  reinforcement: "Reinforcement of the Army",
  warriorreturning: "The Warrior Returning Alive",
  aforces: "The A. Forces",
  vampirelord: "Vampire Lord",
  zombiemaster: "Zombie Master",
  ryukokki: "Ryu Kokki",
  despair: "Despair from the Dark",
  spiritreaper: "Spirit Reaper",
  patrician: "Patrician of Darkness",
  bookoflife: "Book of Life",
  mummycall: "Call of the Mummy",
  dunames: "Dunames Dark Witch",
  shiningabyss: "Shining Abyss",
  mudora: "Mudora",
  hoshiningen: "Shining Angel",
  mars: "The Agent of Force - Mars",
  solemnwishes: "Solemn Wishes",
};

const API = "https://db.ygoprodeck.com/api/v7/cardinfo.php";
const IMG = "https://images.ygoprodeck.com/images/cards_cropped/";

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.json();
}

async function imgOk(id) {
  try {
    // 图片按数字 id 命名（无前导零）
    const res = await fetch(IMG + String(Number(id)) + ".jpg", { method: "GET", redirect: "follow" });
    return res.ok;
  } catch (e) {
    return false;
  }
}

async function fetchPassword(name) {
  const json = await getJson(`${API}?fname=${encodeURIComponent(name)}&num=30&offset=0`);
  const hits = (json && json.data || []).filter((c) => c.name === name);
  // 优先选有裁剪卡图版本的卡密
  const ids = new Set();
  for (const c of hits) {
    if (c.id) ids.add(String(c.id).padStart(8, "0"));
    for (const ci of (c.card_images || [])) {
      const m = (ci.image_url_cropped || "").match(/(\d{5,})\.jpg$/);
      if (m) ids.add(String(m[1]).padStart(8, "0"));
    }
  }
  for (const id of ids) if (await imgOk(id)) return id;
  return ids.size ? [...ids][0] : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const cardsPath = path.resolve(__dirname, "../games/YuGiOh/cards.js");
  let src = fs.readFileSync(cardsPath, "utf8");

  // 1) 补齐经典卡卡密
  const missing = Object.entries(CID_TO_NAME).filter(([cid]) => !new RegExp(`id: "${cid}"[^}]*password`).test(src));
  const added = {};
  for (const [cid, name] of missing) {
    added[cid] = await fetchPassword(name);
    console.log("补卡密 " + cid + " -> " + (added[cid] || "NOT_FOUND"));
  }
  console.log(`经典卡缺卡密 ${missing.length} 张，查到 ${Object.values(added).filter((v) => v && v !== "NOT_FOUND").length} 张`);

  // 2) 校验全部卡密的裁剪卡图，404 的找替代版本
  const cardRe = /\{ id: "([a-z_0-9]+)"[^}]*password: "(\d{8})"/g;
  const cards = [];
  let m;
  while ((m = cardRe.exec(src))) cards.push({ cid: m[1], pw: m[2] });
  const replace = {};
  let okCount = 0;
  for (const { cid, pw } of cards) {
    if (await imgOk(pw)) { okCount++; continue; }
    // 用 id 反查英文名，再找同名的可用版本
    const byId = await getJson(`${API}?id=${pw}`);
    const rec = byId && byId.data && byId.data[0];
    const name = rec ? rec.name : null;
    let alt = null;
    if (name) alt = await fetchPassword(name);
    if (alt && alt !== pw) { replace[cid] = alt; console.log(`卡图404 ${cid} (${pw}) -> ${alt}`); }
    else console.log(`卡图404 ${cid} (${pw}) -> 无可用替代`);
  }
  console.log(`卡图校验：${okCount}/${cards.length} 张直接可用，${Object.keys(replace).length} 张已替换`);

  if (apply) {
    for (const [cid, pw] of Object.entries(added)) {
      if (!pw || pw === "NOT_FOUND") continue;
      const re = new RegExp(`(id: "${cid}", )`);
      if (re.test(src)) { src = src.replace(re, `$1password: "${pw}", `); }
    }
    for (const [cid, pw] of Object.entries(replace)) {
      const re = new RegExp(`(id: "${cid}"[^}]*password: ")\\d{8}(")`);
      if (re.test(src)) { src = src.replace(re, `$1${pw}$2`); }
    }
    fs.writeFileSync(cardsPath, src);
    console.log("已写回 cards.js");
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
