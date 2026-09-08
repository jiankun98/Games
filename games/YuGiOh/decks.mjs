/*
 * 游戏王·扩展卡组预设（30 套，每套主卡组 60 张）
 *  格式与 cards.mjs 中 DECK_PRESETS 一致：{ main: [id...], extra: [id...] }
 *  规则：同名卡最多 3 张；怪兽 ≈ 32、魔法 ≈ 18、陷阱 ≈ 10；主卡组严格 60 张。
 *  依赖：从 cards.mjs 导入 CARD_BY_ID 用于校验。
 *  DECK_META 提供选卡组界面展示用元数据：{ key: { name, desc } }。
 */
import { CARD_BY_ID } from "./cards.mjs";

// ===== 30 套扩展卡组预设 =====
const EXTRA_DECK_PRESETS = {

  /* ---------- 1. dragon 龙族霸主 ---------- */
  dragon: {
    main: [
      // 高星怪 8
      "blueyes", "blueyes", "blueyes",
      "redeyes", "redeyes", "redeyes",
      "summonedskull", "summonedskull",
      // 龙族/相关低星 13
      "speardragon", "speardragon", "speardragon",
      "lordofdragons", "lordofdragons",
      "kaibaman", "kaibaman",
      "meteor", "meteor",
      "harpiespet",
      "witch", "sangan",
      // 泛用低星 11
      "celtic", "celtic", "gemini", "gemini", "lajinn", "lajinn",
      "kuriboh", "kuriboh", "exiled", "mysticalelf", "mysticalelf",
      "magicianoffaith",
      // 魔法 18
      "flute", "flute", "burststream", "burststream", "stamping",
      "silvercry", "silvercry", "ancientrules",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "mountain",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: ["blueyes_ultimate", "meteorb"],
  },

  /* ---------- 2. fiend 恶魔军团 ---------- */
  fiend: {
    main: [
      // 高星怪 7
      "summonedskull", "summonedskull", "summonedskull",
      "despair", "despair",
      "darkmagician", "darkmagician",
      // 恶魔/暗属性低星 17
      "lajinn", "lajinn", "lajinn",
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "giantgerm", "giantgerm", "giantgerm",
      "kuriboh", "kuriboh", "kuriboh",
      "oldvindictive", "oldvindictive",
      // 泛用低星 8
      "yomiship", "penguin", "maneater", "maneater",
      "exiled", "mysticalelf", "gemini", "gemini",
      // 魔法 18
      "yami", "yami",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "fissure", "smashing", "swords",
      "axeofdespair", "axeofdespair", "magepower",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "waboku", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 3. spellcaster 魔导院 ---------- */
  spellcaster: {
    main: [
      // 高星怪 6
      "darkmagician", "darkmagician", "darkmagician",
      "darkmagiciangirl", "darkmagiciangirl",
      "summonedskull",
      // 魔法师族低星 17
      "gemini", "gemini", "gemini",
      "mysticalelf", "mysticalelf", "mysticalelf",
      "witch", "witch", "witch",
      "oldvindictive", "oldvindictive",
      "magicianoffaith", "magicianoffaith",
      "skilledwhitemagician", "skilledwhitemagician", "skilledwhitemagician",
      "lordofdragons",
      // 泛用低星 9
      "sangan", "sangan", "kuriboh", "kuriboh",
      "exiled", "maneater", "lajinn", "lajinn", "penguin",
      // 魔法 18
      "thousandknives", "thousandknives",
      "darkmagicattack", "darkmagicattack",
      "curtain", "magicaldimension", "magicaldimension",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "yami", "magepower",
      // 陷阱 10
      "magiciancircle", "magiciancircle",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential",
    ],
    extra: [],
  },

  /* ---------- 4. beastwarrior 野兽战士 ---------- */
  beastwarrior: {
    main: [
      // 高星怪 6
      "gaia", "gaia",
      "ehero_bladedge", "ehero_bladedge",
      "swordstalker", "swordstalker",
      // 兽战士/战士低星 17
      "battleox", "battleox", "battleox",
      "goblin", "goblin", "goblin",
      "ehero_wildheart", "ehero_wildheart", "ehero_wildheart",
      "amazoness", "amazoness",
      "warriordai", "warriordai",
      "commandknight", "commandknight",
      "maraudingcaptain", "maraudingcaptain",
      // 泛用低星 9
      "celtic", "celtic", "celtic",
      "axe", "axe", "exiled", "sangan", "kuriboh", "kuriboh",
      // 魔法 18
      "reinforcement", "reinforcement",
      "warriorreturning", "warriorreturning",
      "aforces", "aforces",
      "polymerization", "polymerization", "e_call",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity",
      "united",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: ["ehero_wildedge", "ehero_wildedge"],
  },

  /* ---------- 5. flip 翻转奇袭 ---------- */
  flip: {
    main: [
      // 高星怪 4
      "summonedskull", "summonedskull", "darkmagician", "gaia",
      // 翻转核心 12
      "maneater", "maneater", "maneater",
      "oldvindictive", "oldvindictive", "oldvindictive",
      "magicianoffaith", "magicianoffaith", "magicianoffaith",
      "penguin", "penguin", "penguin",
      // 泛用低星 16
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "kuriboh", "kuriboh", "kuriboh",
      "giantgerm", "giantgerm",
      "yomiship", "yomiship",
      "exiled", "mysticalelf", "stone",
      // 魔法 18
      "swords", "swords",
      "noblemanofcrossout", "noblemanofcrossout",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing",
      "axeofdespair", "magepower", "blackpendant",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "waboku", "callofhaunted", "torrential",
    ],
    extra: [],
  },

  /* ---------- 6. water 深海军团 ---------- */
  water: {
    main: [
      // 高星怪 3
      "redeyes", "summonedskull", "gaia",
      // 水属性核心 12
      "penguin", "penguin", "penguin",
      "yomiship", "yomiship", "yomiship",
      "sinisterserpent", "sinisterserpent", "sinisterserpent",
      "ehero_bubbleman", "ehero_bubbleman", "ehero_bubbleman",
      // 泛用低星 17
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "kuriboh", "kuriboh",
      "magicianoffaith", "magicianoffaith",
      "oldvindictive", "oldvindictive",
      "mysticalelf", "mysticalelf",
      "exiled", "maneater", "stone",
      // 魔法 18
      "raigeki", "darkhole", "mst", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "fissure", "smashing", "swords", "swords",
      "magepower", "united", "forest",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "waboku", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 7. rock 岩石堡垒 ---------- */
  rock: {
    main: [
      // 高星怪 3
      "valkyrion", "valkyrion", "ancientgeargolem",
      // 岩石核心 15
      "magnet_alpha", "magnet_alpha", "magnet_alpha",
      "magnet_beta", "magnet_beta", "magnet_beta",
      "magnet_gamma", "magnet_gamma", "magnet_gamma",
      "magnet_delta", "magnet_delta", "magnet_delta",
      "stone", "stone", "stone",
      // 泛用低星 14
      "ehero_clayman", "ehero_clayman",
      "witch", "witch", "sangan", "sangan",
      "kuriboh", "kuriboh", "exiled", "mysticalelf",
      "maneater", "oldvindictive", "oldvindictive", "penguin",
      // 魔法 18
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "smashing", "swords", "swords",
      "axeofdespair", "axeofdespair", "magepower", "united",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 8. pyro 烈焰战场 ---------- */
  pyro: {
    main: [
      // 高星怪 4
      "meteorb", "summonedskull", "summonedskull", "gaia",
      // 炎属性/burn 核心 8
      "ehero_burstinatrix", "ehero_burstinatrix", "ehero_burstinatrix",
      "commandknight", "commandknight",
      "giantgerm", "giantgerm", "giantgerm",
      // 其他低星 20
      "cannonsoldier", "cannonsoldier", "cannonsoldier",
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "kuriboh", "kuriboh", "kuriboh",
      "oldvindictive", "oldvindictive",
      "exiled", "exiled",
      "goblin", "goblin",
      "lajinn", "lajinn",
      // 魔法 18
      "infernofire", "infernofire",
      "blackpendant", "blackpendant",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing",
      "yami", "axeofdespair", "magepower",
      // 陷阱 10
      "ringofdestruction", "ringofdestruction",
      "magiccylinder", "magiccylinder",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "waboku", "dimensionalprison",
    ],
    extra: ["meteorb"],
  },

  /* ---------- 9. thunder 雷霆机械 ---------- */
  thunder: {
    main: [
      // 高星怪 6
      "cyberdragon", "cyberdragon", "cyberdragon",
      "jinzo", "jinzo",
      "ancientgeargolem",
      // 机械核心 15
      "greengadget", "greengadget",
      "redgadget", "redgadget",
      "yellowgadget", "yellowgadget",
      "reflectbounder", "reflectbounder",
      "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon",
      "proto", "proto",
      "cannonsoldier",
      // 泛用低星 11
      "witch", "witch", "sangan", "sangan",
      "kuriboh", "kuriboh", "exiled", "mysticalelf",
      "gemini", "maneater", "oldvindictive",
      // 魔法 18
      "powerbond", "powerbond",
      "cyberrepair", "cyberrepair",
      "polymerization",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing",
      "mountain", "magepower",
      // 陷阱 10
      "trapstun", "trapstun",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "torrential", "bottomless",
    ],
    extra: ["cybertwin", "cybertwin", "cybertwin"],
  },

  /* ---------- 10. equip 武装强化 ---------- */
  equip: {
    main: [
      // 高星怪 7
      "blueyes", "blueyes",
      "darkmagician", "darkmagician",
      "summonedskull", "summonedskull",
      "gaia",
      // 低星高攻 25
      "celtic", "celtic", "celtic",
      "gemini", "gemini", "gemini",
      "axe", "axe", "axe",
      "battleox", "battleox", "battleox",
      "lajinn", "lajinn", "lajinn",
      "goblin", "goblin",
      "speardragon", "speardragon",
      "witch", "witch",
      "sangan", "sangan",
      "kuriboh", "kuriboh",
      // 魔法 18
      "axeofdespair", "axeofdespair", "axeofdespair",
      "magepower", "magepower", "magepower",
      "united", "united", "united",
      "blackpendant",
      "prematureburial", "prematureburial",
      "metalmorph", "metalmorph",
      "raigeki", "darkhole", "mst", "monsterreborn",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 11. stall 铜墙铁壁 ---------- */
  stall: {
    main: [
      // 高星怪 3
      "ancientgeargolem", "valkyrion", "summonedskull",
      // 防守核心 19
      "stone", "stone", "stone",
      "mysticalelf", "mysticalelf", "mysticalelf",
      "ehero_clayman", "ehero_clayman", "ehero_clayman",
      "reflectbounder", "reflectbounder",
      "commandknight", "commandknight",
      "penguin", "penguin",
      "maneater", "maneater",
      "oldvindictive", "oldvindictive",
      // 泛用低星 10
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "kuriboh", "kuriboh", "kuriboh",
      "magicianoffaith",
      // 魔法 18
      "swords", "swords", "swords",
      "shieldsword", "shieldsword",
      "gianttrunade", "gianttrunade",
      "mst", "mst",
      "raigeki", "darkhole", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "magepower", "united",
      // 陷阱 10
      "waboku", "waboku",
      "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "negateattack",
      "dimensionalprison", "callofhaunted", "torrential",
    ],
    extra: [],
  },

  /* ---------- 12. burn 烈焰灼烧 ---------- */
  burn: {
    main: [
      // 高星怪 2
      "summonedskull", "summonedskull",
      // burn 核心 8
      "giantgerm", "giantgerm", "giantgerm",
      "cannonsoldier", "cannonsoldier", "cannonsoldier",
      "reflectbounder", "reflectbounder",
      // 检索/防御 9
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "kuriboh", "kuriboh", "kuriboh",
      // 其他低星 13
      "oldvindictive", "oldvindictive",
      "maneater", "maneater",
      "penguin", "yomiship",
      "exiled", "exiled",
      "lajinn", "lajinn",
      "mysticalelf", "mysticalelf",
      "goblin",
      // 魔法 18
      "infernofire", "infernofire",
      "blackpendant", "blackpendant", "blackpendant",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      "magepower",
      // 陷阱 10
      "ringofdestruction", "ringofdestruction",
      "magiccylinder", "magiccylinder",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "waboku", "torrential",
    ],
    extra: [],
  },

  /* ---------- 13. fusion 融合召唤 ---------- */
  fusion: {
    main: [
      // 高星怪 3
      "ehero_bladedge", "blueyes", "summonedskull",
      // 融合素材核心 17
      "ehero_avian", "ehero_avian", "ehero_avian",
      "ehero_burstinatrix", "ehero_burstinatrix", "ehero_burstinatrix",
      "ehero_clayman", "ehero_clayman",
      "ehero_sparkman", "ehero_sparkman", "ehero_sparkman",
      "ehero_bubbleman", "ehero_bubbleman",
      "ehero_wildheart", "ehero_wildheart",
      "cyberdragon", "cyberdragon",
      // 检索/其他低星 12
      "ehero_stratos", "ehero_stratos",
      "witch", "witch", "sangan", "sangan",
      "kuriboh", "kuriboh", "gemini", "mysticalelf",
      "exiled", "maneater",
      // 魔法 18
      "polymerization", "polymerization", "polymerization",
      "powerbond", "powerbond",
      "e_call", "e_call",
      "redeyesfusion",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "magepower",
      // 陷阱 10
      "hero_signal", "hero_barrier",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential",
    ],
    extra: [
      "ehero_flamewingman", "ehero_flamewingman",
      "ehero_thundergiant", "ehero_thundergiant",
      "ehero_wildedge", "cybertwin", "cybertwin",
      "blueyes_ultimate",
    ],
  },

  /* ---------- 14. beatdown 绝对武力 ---------- */
  beatdown: {
    main: [
      // 高星怪 11
      "blueyes", "blueyes", "blueyes",
      "darkmagician", "darkmagician",
      "summonedskull", "summonedskull", "summonedskull",
      "gaia", "gaia",
      "redeyes",
      // 低星高攻 21
      "goblin", "goblin", "goblin",
      "speardragon", "speardragon", "speardragon",
      "gemini", "gemini", "gemini",
      "lajinn", "lajinn", "lajinn",
      "axe", "axe", "axe",
      "battleox", "battleox",
      "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon",
      // 魔法 18
      "axeofdespair", "axeofdespair", "axeofdespair",
      "magepower", "magepower",
      "united", "united",
      "metalmorph",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 15. control 掌控全局 ---------- */
  control: {
    main: [
      // 高星怪 4
      "jinzo", "jinzo", "summonedskull", "darkmagician",
      // 控制核心 21
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "kuriboh", "kuriboh", "kuriboh",
      "oldvindictive", "oldvindictive", "oldvindictive",
      "maneater", "maneater", "maneater",
      "penguin", "penguin",
      "exiled", "exiled",
      "yomiship", "yomiship",
      // 其他低星 7
      "mysticalelf", "mysticalelf",
      "gemini", "gemini",
      "lajinn", "goblin", "speardragon",
      // 魔法 18
      "mst", "mst", "mst",
      "heavystorm", "gianttrunade",
      "noblemanofcrossout", "noblemanofcrossout",
      "changeofheart", "changeofheart",
      "raigeki", "darkhole", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity",
      "fissure", "smashing", "yami",
      // 陷阱 10
      "solemnjudgment", "magicjammer", "trapstun", "dusttornado",
      "traphole", "mirrorforce", "sakuretsu",
      "magiccylinder", "waboku", "torrential",
    ],
    extra: [],
  },

  /* ---------- 16. graveyard 墓地复苏 ---------- */
  graveyard: {
    main: [
      // 高星怪 7
      "vampirelord", "vampirelord",
      "ryukokki", "ryukokki",
      "blueyes", "summonedskull", "patrician",
      // 墓地核心 18
      "zombiemaster", "zombiemaster", "zombiemaster",
      "spiritreaper", "spiritreaper", "spiritreaper",
      "sinisterserpent", "sinisterserpent", "sinisterserpent",
      "magicianoffaith", "magicianoffaith", "magicianoffaith",
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      // 其他低星 7
      "kuriboh", "kuriboh",
      "oldvindictive", "oldvindictive",
      "maneater", "penguin", "yomiship",
      // 魔法 18
      "monsterreborn", "monsterreborn",
      "prematureburial", "prematureburial",
      "bookoflife", "bookoflife", "bookoflife",
      "magicalstoneexcavation", "magicalstoneexcavation",
      "cyberrepair",
      "raigeki", "darkhole", "mst", "mst",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      // 陷阱 10
      "callofhaunted", "callofhaunted",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 17. handtrap 手卡干扰 ---------- */
  handtrap: {
    main: [
      // 高星怪 3
      "summonedskull", "summonedskull", "darkmagician",
      // 手坑/防御核心 16
      "kuriboh", "kuriboh", "kuriboh",
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "giantgerm", "giantgerm", "giantgerm",
      "yomiship", "yomiship",
      "penguin", "penguin",
      // 翻转/防御 13
      "maneater", "maneater", "maneater",
      "oldvindictive", "oldvindictive", "oldvindictive",
      "magicianoffaith", "magicianoffaith",
      "mysticalelf", "mysticalelf",
      "stone", "exiled", "goblin",
      // 魔法 18
      "potofgreed", "potofgreed", "potofgreed",
      "gracefulcharity", "gracefulcharity",
      "magicalstoneexcavation",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "changeofheart", "fissure", "smashing",
      "swords", "swords",
      "magepower", "blackpendant",
      // 陷阱 10
      "waboku", "waboku",
      "negateattack", "negateattack",
      "dimensionalprison", "magiccylinder",
      "traphole", "mirrorforce", "sakuretsu", "torrential",
    ],
    extra: [],
  },

  /* ---------- 18. chaos 光暗混沌 ---------- */
  chaos: {
    main: [
      // 高星怪 6
      "blueyes", "blueyes",
      "darkmagician", "darkmagician",
      "summonedskull", "summonedskull",
      // 光属性 18
      "mysticalelf", "mysticalelf", "mysticalelf",
      "ehero_sparkman", "ehero_sparkman",
      "ehero_bubbleman", "ehero_bubbleman",
      "skilledwhitemagician", "skilledwhitemagician",
      "dunames", "dunames",
      "shiningabyss",
      "mudora",
      "hoshiningen", "hoshiningen",
      "mars", "kaibaman", "magicianoffaith",
      // 暗属性 8
      "witch", "witch",
      "sangan", "sangan",
      "kuriboh", "kuriboh",
      "oldvindictive", "lajinn",
      // 魔法 18
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      "axeofdespair", "magepower", "united",
      "yami", "mountain", "ancientrules",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: ["blueyes_ultimate"],
  },

  /* ---------- 19. search 检索压缩 ---------- */
  search: {
    main: [
      // 高星怪 4
      "summonedskull", "summonedskull", "darkmagician", "blueyes",
      // 检索核心 19
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "ehero_stratos", "ehero_stratos", "ehero_stratos",
      "greengadget", "greengadget",
      "redgadget", "redgadget",
      "yellowgadget", "yellowgadget",
      "maraudingcaptain", "maraudingcaptain",
      "warriordai", "warriordai",
      // 其他低星 9
      "kuriboh", "kuriboh", "kuriboh",
      "magicianoffaith", "magicianoffaith",
      "oldvindictive", "maneater",
      "gemini", "mysticalelf",
      // 魔法 18
      "reinforcement", "reinforcement",
      "e_call", "e_call",
      "warriorreturning", "cyberrepair",
      "magicalstoneexcavation",
      "potofgreed", "potofgreed", "potofgreed",
      "gracefulcharity", "gracefulcharity",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn", "changeofheart",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 20. monarch 帝王降临 ---------- */
  monarch: {
    main: [
      // 高星怪 12
      "blueyes", "blueyes",
      "darkmagician", "darkmagician",
      "summonedskull", "summonedskull", "summonedskull",
      "gaia", "gaia",
      "redeyes",
      "vampirelord", "jinzo",
      // 低星（祭品/支援）20
      "mysticalelf", "mysticalelf", "mysticalelf",
      "stone", "stone",
      "witch", "witch",
      "sangan", "sangan",
      "kuriboh", "kuriboh",
      "goblin",
      "lajinn", "lajinn",
      "gemini", "celtic", "axe", "battleox",
      "exiled", "magicianoffaith",
      // 魔法 18
      "ancientrules", "ancientrules",
      "curtain", "flute",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      "axeofdespair", "magepower",
      // 陷阱 10
      "championsvigilance", "championsvigilance",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 21. gadget 齿轮机械 ---------- */
  gadget: {
    main: [
      // 高星怪 6
      "cyberdragon", "cyberdragon",
      "jinzo", "ancientgeargolem",
      "summonedskull", "gaia",
      // 齿轮核心 9
      "greengadget", "greengadget", "greengadget",
      "redgadget", "redgadget", "redgadget",
      "yellowgadget", "yellowgadget", "yellowgadget",
      // 机械低星 11
      "proto", "proto", "proto",
      "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon",
      "reflectbounder", "reflectbounder",
      "cannonsoldier", "cannonsoldier",
      // 泛用低星 6
      "witch", "sangan", "kuriboh", "kuriboh", "gemini", "mysticalelf",
      // 魔法 18
      "powerbond", "powerbond",
      "cyberrepair", "cyberrepair",
      "polymerization",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords", "magepower",
      // 陷阱 10
      "trapstun", "trapstun",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "torrential", "bottomless",
    ],
    extra: ["cybertwin", "cybertwin"],
  },

  /* ---------- 22. cyber 电子龙OTK ---------- */
  cyber: {
    main: [
      // 高星怪 5
      "cyberdragon", "cyberdragon", "cyberdragon",
      "ancientgeargolem", "summonedskull",
      // 电子/机械低星 15
      "proto", "proto", "proto",
      "greengadget", "greengadget",
      "redgadget", "redgadget",
      "yellowgadget", "yellowgadget",
      "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon",
      "reflectbounder", "reflectbounder",
      // 泛用低星 12
      "witch", "witch", "sangan", "sangan",
      "kuriboh", "kuriboh", "gemini", "gemini",
      "lajinn", "lajinn", "exiled", "mysticalelf",
      // 魔法 18
      "powerbond", "powerbond", "powerbond",
      "cyberrepair", "cyberrepair",
      "polymerization",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      // 陷阱 10
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted",
      "torrential", "bottomless", "trapstun",
    ],
    extra: ["cybertwin", "cybertwin", "cybertwin"],
  },

  /* ---------- 23. jinzo 人造人陷阱封印 ---------- */
  jinzo: {
    main: [
      // 高星怪 5
      "jinzo", "jinzo", "jinzo",
      "summonedskull", "darkmagician",
      // 机械低星 12
      "proto", "proto", "proto",
      "greengadget", "greengadget",
      "redgadget", "redgadget",
      "yellowgadget", "yellowgadget",
      "mechanicalchaser", "mechanicalchaser",
      "xheadcannon",
      // 泛用低星 15
      "witch", "witch", "witch",
      "sangan", "sangan", "sangan",
      "kuriboh", "kuriboh", "kuriboh",
      "gemini", "gemini",
      "lajinn", "lajinn",
      "exiled", "mysticalelf",
      // 魔法 18
      "raigeki", "darkhole", "mst", "mst", "heavystorm",
      "monsterreborn", "potofgreed", "potofgreed", "gracefulcharity",
      "changeofheart", "fissure", "smashing", "swords", "gianttrunade",
      "axeofdespair", "magepower", "united", "yami",
      // 陷阱 10
      "trapstun", "trapstun", "trapstun",
      "traphole", "mirrorforce", "sakuretsu",
      "magiccylinder", "waboku", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 24. ancientgear 古代机械 ---------- */
  ancientgear: {
    main: [
      // 高星怪 5
      "ancientgeargolem", "ancientgeargolem", "ancientgeargolem",
      "summonedskull", "gaia",
      // 机械低星 14
      "proto", "proto", "proto",
      "greengadget", "greengadget",
      "redgadget", "redgadget",
      "yellowgadget", "yellowgadget",
      "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon",
      "reflectbounder",
      // 泛用低星 13
      "witch", "witch", "sangan", "sangan",
      "kuriboh", "kuriboh", "gemini", "gemini",
      "lajinn", "lajinn", "goblin", "goblin", "exiled",
      // 魔法 18
      "powerbond", "powerbond",
      "cyberrepair", "polymerization",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      "axeofdespair", "magepower",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 25. ehero_pure 纯元素英雄 ---------- */
  ehero_pure: {
    main: [
      // 高星怪 4
      "ehero_bladedge", "ehero_bladedge", "ehero_bladedge",
      "darkmagician",
      // 英雄低星 22
      "ehero_avian", "ehero_avian", "ehero_avian",
      "ehero_burstinatrix", "ehero_burstinatrix", "ehero_burstinatrix",
      "ehero_clayman", "ehero_clayman", "ehero_clayman",
      "ehero_sparkman", "ehero_sparkman", "ehero_sparkman",
      "ehero_bubbleman", "ehero_bubbleman", "ehero_bubbleman",
      "ehero_wildheart", "ehero_wildheart", "ehero_wildheart",
      "ehero_stratos", "ehero_stratos", "ehero_stratos",
      // 泛用低星 7
      "witch", "sangan", "kuriboh", "kuriboh", "gemini", "mysticalelf", "exiled",
      // 魔法 18
      "polymerization", "polymerization", "polymerization",
      "e_call", "e_call", "e_call",
      "magicaldimension",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "swords", "fissure",
      // 陷阱 10
      "hero_signal", "hero_signal",
      "hero_barrier", "hero_barrier",
      "traphole", "mirrorforce", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted",
    ],
    extra: [
      "ehero_flamewingman", "ehero_flamewingman",
      "ehero_thundergiant", "ehero_thundergiant",
      "ehero_wildedge", "ehero_wildedge",
    ],
  },

  /* ---------- 26. vampire 吸血鬼 ---------- */
  vampire: {
    main: [
      // 高星怪 6
      "vampirelord", "vampirelord", "vampirelord",
      "ryukokki", "ryukokki",
      "despair",
      // 不死低星 15
      "zombiemaster", "zombiemaster", "zombiemaster",
      "spiritreaper", "spiritreaper", "spiritreaper",
      "patrician", "patrician",
      "sinisterserpent", "sinisterserpent", "sinisterserpent",
      "witch", "witch",
      "sangan", "sangan",
      // 泛用低星 11
      "kuriboh", "kuriboh",
      "oldvindictive", "oldvindictive",
      "maneater", "maneater",
      "magicianoffaith", "magicianoffaith",
      "mysticalelf", "mysticalelf",
      "exiled",
      // 魔法 18
      "bookoflife", "bookoflife", "bookoflife",
      "mummycall", "mummycall",
      "prematureburial",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      // 陷阱 10
      "callofhaunted", "callofhaunted",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 27. amazoness 亚马逊剑士 ---------- */
  amazoness: {
    main: [
      // 高星怪 5
      "gaia", "gaia",
      "swordstalker", "swordstalker",
      "summonedskull",
      // 战士低星 18
      "amazoness", "amazoness", "amazoness",
      "commandknight", "commandknight", "commandknight",
      "maraudingcaptain", "maraudingcaptain", "maraudingcaptain",
      "warriordai", "warriordai",
      "celtic", "celtic", "celtic",
      "axe", "axe",
      "exiled", "exiled",
      // 泛用低星 9
      "witch", "witch", "sangan", "sangan",
      "kuriboh", "kuriboh", "gemini", "mysticalelf", "lajinn",
      // 魔法 18
      "reinforcement", "reinforcement",
      "warriorreturning", "warriorreturning",
      "aforces", "united",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 28. skilled_magician 熟练魔术师 ---------- */
  skilled_magician: {
    main: [
      // 高星怪 5
      "darkmagician", "darkmagician", "darkmagician",
      "darkmagiciangirl", "darkmagiciangirl",
      // 魔法师低星 18
      "skilledwhitemagician", "skilledwhitemagician", "skilledwhitemagician",
      "gemini", "gemini", "gemini",
      "mysticalelf", "mysticalelf", "mysticalelf",
      "witch", "witch", "witch",
      "oldvindictive", "oldvindictive",
      "magicianoffaith", "magicianoffaith",
      "lordofdragons", "lordofdragons",
      // 泛用低星 9
      "sangan", "sangan", "kuriboh", "kuriboh",
      "lajinn", "lajinn", "exiled", "maneater", "penguin",
      // 魔法 18
      "thousandknives", "thousandknives",
      "darkmagicattack", "darkmagicattack",
      "curtain", "magicaldimension",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "yami", "magepower", "swords",
      // 陷阱 10
      "magiciancircle", "magiciancircle",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential",
    ],
    extra: [],
  },

  /* ---------- 29. marauding 切入队长战士 ---------- */
  marauding: {
    main: [
      // 高星怪 5
      "gaia", "gaia",
      "swordstalker",
      "summonedskull", "darkmagician",
      // 战士低星 19
      "maraudingcaptain", "maraudingcaptain", "maraudingcaptain",
      "commandknight", "commandknight", "commandknight",
      "amazoness", "amazoness",
      "warriordai", "warriordai",
      "celtic", "celtic", "celtic",
      "axe", "axe", "axe",
      "exiled", "exiled", "exiled",
      // 泛用低星 8
      "witch", "sangan", "kuriboh", "kuriboh",
      "gemini", "gemini", "mysticalelf", "lajinn",
      // 魔法 18
      "reinforcement", "reinforcement",
      "warriorreturning", "warriorreturning",
      "aforces", "united",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 30. angel 天使代行者 ---------- */
  angel: {
    main: [
      // 高星怪 4
      "blueyes", "darkmagician", "summonedskull", "gaia",
      // 天使低星 16
      "dunames", "dunames", "dunames",
      "shiningabyss", "shiningabyss", "shiningabyss",
      "mudora", "mudora", "mudora",
      "hoshiningen", "hoshiningen", "hoshiningen",
      "mars", "mars",
      "ehero_sparkman", "ehero_sparkman",
      // 泛用低星 12
      "mysticalelf", "mysticalelf", "mysticalelf",
      "skilledwhitemagician", "skilledwhitemagician",
      "witch", "witch", "sangan", "sangan",
      "kuriboh", "kuriboh", "magicianoffaith",
      // 魔法 18
      "ancientrules", "silvercry", "mountain",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      "axeofdespair", "magepower", "united",
      // 陷阱 10
      "solemnwishes", "solemnwishes",
      "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential",
    ],
    extra: [],
  },

};

// ===== 卡组元数据（选卡组界面展示用） =====
const DECK_META = {
  dragon: { name: "龙族霸主", desc: "以三张青眼白龙与真红眼为核心的高打点龙族卡组，唤龙笛、龙之支配者快速调度大龙，白龙疾风弹打出爆发伤害，可融合召唤青眼究极龙。" },
  fiend: { name: "恶魔军团", desc: "恶魔召唤与来自黑暗的绝望领衔的暗属性恶魔军团，铺场后以装备魔法强化，地裂与粉碎清扫障碍，稳步压制。" },
  spellcaster: { name: "魔导院", desc: "黑魔术师领衔的魔法师族正统卡组，熟练的白魔术师串联魔法，千把刀、黑·魔·导与魔术师之阵联动终结对局。" },
  beastwarrior: { name: "野兽战士", desc: "米诺陶洛斯、哥布林突击部队等兽战士与元素英雄混编的中速强攻，增援、联合军与团结之力全面强化。" },
  flip: { name: "翻转奇袭", desc: "食人虫、报复之老魔术师等翻转效果怪为核心，覆盖防守、翻转反制，抹杀之使徒精准针对里侧怪兽。" },
  water: { name: "深海军团", desc: "企鹅士兵、死者之船等水属性防守反击体系，高防消耗对手资源，场地与装备魔法逐步建立优势。" },
  rock: { name: "岩石堡垒", desc: "磁石战士四兄弟与岩石高守备阵容，可合体召唤磁石战士·电磁武神，攻守一体稳步推进。" },
  pyro: { name: "烈焰战场", desc: "炎属性进攻卡组，黑炎弹、黑项链与破坏轮持续削减对手生命值，加农炮兵提供直伤补刀。" },
  thunder: { name: "雷霆机械", desc: "电子龙与机械族混编的科技流，力量焊接融合电子双生龙，人造人封锁陷阱，攻守节奏均衡。" },
  equip: { name: "武装强化", desc: "装备魔法特化，恶魔之斧、魔之力、团结之力满编，低星怪兽武装后攻击力暴涨，速攻碾压。" },
  stall: { name: "铜墙铁壁", desc: "光之护封剑、神之恩惠与高守备怪兽构建的纯防守体系，拖延战局消耗对手，再以上级怪兽反击。" },
  burn: { name: "烈焰灼烧", desc: "烧血特化，加农炮兵、巨大病毒、黑项链、破坏轮全方位削减生命值，不依赖战斗也能取胜。" },
  fusion: { name: "融合召唤", desc: "融合魔法满编的特化卡组，把元素英雄与电子龙融合成火焰翼人、电子双生龙、青眼究极龙等八种强力怪兽。" },
  beatdown: { name: "绝对武力", desc: "十一张上级怪兽的暴力卡组，青眼白龙、恶魔召唤、暗黑骑士盖亚全线高打点，配合装备魔法正面碾压。" },
  control: { name: "掌控全局", desc: "干扰控制流，心变夺取对手怪兽，大风暴与旋风清场，神之宣告、魔法干扰守护战局，逐步积累优势。" },
  graveyard: { name: "墓地复苏", desc: "不死与墓地利用卡组，生者之书、过早的埋葬、活死人的呼声反复唤醒墓地怪兽，僵尸之主持续展开攻势。" },
  handtrap: { name: "手卡干扰", desc: "手卡干扰与资源战卡组，栗子球、巨大病毒在手即可反制，大量抽卡魔法与防御陷阱保障续航。" },
  chaos: { name: "光暗混沌", desc: "光与暗属性均衡混编，姆多拉、闪耀深渊等光暗主力并进，阵容灵活、难以被针对。" },
  search: { name: "检索压缩", desc: "检索特化，三眼怪、黑森林的魔女、天空侠与齿轮互相串联，快速找到关键卡并压缩卡组。" },
  monarch: { name: "帝王降临", desc: "上级怪兽多达十二张的祭品展开卡组，远古规则与黑魔术的幕帘直接召唤大牌，王者看破守护压制。" },
  gadget: { name: "齿轮机械", desc: "绿、红、黄三色齿轮各三张互相检索，机械族低星铺场，力量焊接融合电子双生龙完成终结。" },
  cyber: { name: "电子龙OTK", desc: "电子龙与原型电子龙满编，三张力量焊接融合三只电子双生龙，一回合打出毁灭性伤害的速攻卡组。" },
  jinzo: { name: "陷阱封印", desc: "以人造人-念力震慑者封锁双方陷阱的科技流，陷阱无力化满编，在无陷阱干扰的环境下正面对决。" },
  ancientgear: { name: "古代机械", desc: "三张古代机械巨人领衔的机械强攻，机械下级铺场铺垫，装备魔法与粉碎爆裂持续施压。" },
  ehero_pure: { name: "纯元素英雄", desc: "元素英雄全员集结，天空侠检索、E·紧急呼叫调度，融合召唤火焰翼人、雷霆巨人、荒野大侠作战。" },
  vampire: { name: "吸血鬼", desc: "吸血鬼领主与龙骨鬼领衔的不死军团，生者之书与木乃伊的呼声快速苏生，削魂的死灵稳固防线。" },
  amazoness: { name: "亚马逊剑士", desc: "亚马逊剑士与指挥骑士为核心的战士族卡组，增援、战士的生还与联合军强化，攻守兼备。" },
  skilled_magician: { name: "熟练魔术师", desc: "熟练的白魔术师积累魔法计数召唤黑魔术师，配合千把刀、黑·魔·导与魔术师之阵的魔术师体系。" },
  marauding: { name: "切入队长", desc: "切入队长串联战士接连出阵，指挥骑士提升全队攻击，增援与战士的生还保持场面不断。" },
  angel: { name: "天使代行者", desc: "月之使者、闪耀深渊、姆多拉等光属性天使阵容，神之惠回复生命，攻守均衡的光辉卡组。" },
};

// ===== 构建函数（与 cards.mjs 中 buildDeck/buildExtra 语义一致） =====
function buildExtraDeck(preset) {
  const def = EXTRA_DECK_PRESETS[preset];
  if (!def) return [];
  return (def.extra || []).filter((id) => CARD_BY_ID[id]);
}

function buildMainDeck(preset) {
  const def = EXTRA_DECK_PRESETS[preset];
  if (!def) return [];
  const counts = {};
  for (const id of def.main) {
    if (CARD_BY_ID[id]) counts[id] = (counts[id] || 0) + 1;
  }
  const deck = [];
  for (const id of Object.keys(counts)) {
    for (let i = 0; i < counts[id]; i++) deck.push(id);
  }
  return deck.slice(0, 60);
}

// ===== 校验工具：检查单套卡组是否合规 =====
function validateDeck(preset) {
  const def = EXTRA_DECK_PRESETS[preset];
  if (!def) return { ok: false, errors: [`预设 "${preset}" 不存在`] };
  const errors = [];
  const counts = {};
  let monster = 0, spell = 0, trap = 0;
  for (const id of def.main) {
    if (!CARD_BY_ID[id]) { errors.push(`未知卡牌 id: ${id}`); continue; }
    counts[id] = (counts[id] || 0) + 1;
    const c = CARD_BY_ID[id];
    if (c.type === "monster") monster++;
    else if (c.type === "spell") spell++;
    else if (c.type === "trap") trap++;
  }
  for (const [id, n] of Object.entries(counts)) {
    if (n > 3) errors.push(`卡 ${id} 出现 ${n} 次，超过上限 3`);
  }
  const total = def.main.length;
  if (total !== 60) errors.push(`主卡组 ${total} 张，应为 60`);
  return {
    ok: errors.length === 0,
    errors,
    stats: { total, monster, spell, trap },
  };
}

// 批量校验全部卡组
function validateAll() {
  const report = {};
  let allOk = true;
  for (const name of Object.keys(EXTRA_DECK_PRESETS)) {
    const r = validateDeck(name);
    report[name] = r;
    if (!r.ok) allOk = false;
  }
  return { allOk, report };
}

export {
  EXTRA_DECK_PRESETS,
  DECK_META,
  buildMainDeck,
  buildExtraDeck,
  validateDeck,
  validateAll,
};
