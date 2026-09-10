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
      // 高星龙 6
      "blueyes", "blueyes", "blueyes",
      "redeyes", "redeyes", "redeyes",
      // 中坚龙 13
      "tyrantdragon", "tyrantdragon", "tyrantdragon",
      "lusterdragon", "lusterdragon", "lusterdragon",
      "alexandritedragon", "alexandritedragon", "alexandritedragon",
      "speardragon", "speardragon", "speardragon",
      "harpiespet",
      // 龙族支援 13
      "meteor", "meteor", "meteor",
      "lordofdragons", "lordofdragons", "lordofdragons",
      "kaibaman", "kaibaman",
      "thunderdragon", "thunderdragon", "thunderdragon",
      "decoydragon", "decoydragon",
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
      // 高星恶魔 5
      "summonedskull", "summonedskull", "summonedskull",
      "darkrulerhades", "darkrulerhades",
      // 恶魔族 27（无其他怪兽）
      "archfiendsoldier", "archfiendsoldier", "archfiendsoldier",
      "skullarchfiend", "skullarchfiend", "skullarchfiend",
      "infernalqueen", "infernalqueen", "infernalqueen",
      "newdoria", "newdoria", "newdoria",
      "despair", "despair", "despair",
      "lajinn", "lajinn", "lajinn",
      "sangan", "sangan", "sangan",
      "giantgerm", "giantgerm", "giantgerm",
      "kuriboh", "kuriboh", "kuriboh",
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
      // 高星魔法师 5
      "darkmagician", "darkmagician", "darkmagician",
      "darkmagiciangirl", "darkmagiciangirl",
      // 魔法师族 27（无其他怪兽）
      "skilledwhitemagician", "skilledwhitemagician", "skilledwhitemagician",
      "skilledblackmagician", "skilledblackmagician", "skilledblackmagician",
      "breaker", "breaker", "breaker",
      "magicianvalkyria", "magicianvalkyria", "magicianvalkyria",
      "apprenticemagician", "apprenticemagician", "apprenticemagician",
      "gemini", "gemini", "gemini",
      "mysticalelf", "mysticalelf", "mysticalelf",
      "witch", "witch", "witch",
      "magicianoffaith", "magicianoffaith",
      "oldvindictive",
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
      // 兽战士/战士 32（无其他怪兽）
      "battleox", "battleox", "battleox",
      "goblin", "goblin", "goblin",
      "alligatorsword", "alligatorsword", "alligatorsword",
      "gazelle", "gazelle", "gazelle",
      "ehero_wildheart", "ehero_wildheart", "ehero_wildheart",
      "ehero_bladedge", "ehero_bladedge", "ehero_bladedge",
      "commandknight", "commandknight", "commandknight",
      "maraudingcaptain", "maraudingcaptain", "maraudingcaptain",
      "warriordai", "warriordai",
      "celtic", "celtic", "celtic",
      "axe", "axe", "axe",
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
      // 水属性 21（无其他怪兽）
      "penguin", "penguin", "penguin",
      "yomiship", "yomiship", "yomiship",
      "sinisterserpent", "sinisterserpent", "sinisterserpent",
      "ehero_bubbleman", "ehero_bubbleman", "ehero_bubbleman",
      "sevencolorfish", "sevencolorfish", "sevencolorfish",
      "suijin", "suijin", "suijin",
      "aquamadoor", "aquamadoor",
      "gogigagagagigo",
      // 魔法 29
      "raigeki", "darkhole", "mst", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "potofgreed", "gracefulcharity",
      "gracefulcharity", "changeofheart", "changeofheart",
      "fissure", "fissure", "fissure", "smashing", "smashing",
      "swords", "swords", "swords",
      "magepower", "magepower", "united", "united", "forest",
      "axeofdespair", "blackpendant", "gianttrunade",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "waboku", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 7. rock 岩石堡垒 ---------- */
  rock: {
    main: [
      // 岩石族 25（无其他怪兽）
      "magnet_alpha", "magnet_alpha", "magnet_alpha",
      "magnet_beta", "magnet_beta", "magnet_beta",
      "magnet_gamma", "magnet_gamma", "magnet_gamma",
      "magnet_delta", "magnet_delta", "magnet_delta",
      "stone", "stone", "stone",
      "giantsoldierofstone", "giantsoldierofstone", "giantsoldierofstone",
      "rockogre", "rockogre", "rockogre",
      "ehero_clayman", "ehero_clayman", "ehero_clayman",
      "valkyrion", "valkyrion",
      // 魔法 25
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "smashing", "swords", "swords",
      "axeofdespair", "axeofdespair", "magepower", "magepower",
      "united", "united", "swords", "fissure", "blackpendant",
      "prematureburial",
      // 陷阱 10
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu",
      "magiccylinder", "waboku", "callofhaunted", "torrential", "bottomless",
    ],
    extra: [],
  },

  /* ---------- 8. pyro 烈焰战场 ---------- */
  pyro: {
    main: [
      // 炎属性 18（无其他怪兽）
      "ehero_burstinatrix", "ehero_burstinatrix", "ehero_burstinatrix",
      "commandknight", "commandknight", "commandknight",
      "cannonsoldier", "cannonsoldier", "cannonsoldier",
      "blazinginpachi", "blazinginpachi", "blazinginpachi",
      "flamemanipulator", "flamemanipulator", "flamemanipulator",
      "firekraken", "firekraken", "firekraken",
      // 魔法 32
      "infernofire", "infernofire", "infernofire",
      "blackpendant", "blackpendant", "blackpendant",
      "raigeki", "darkhole", "mst", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "potofgreed",
      "gracefulcharity", "gracefulcharity", "changeofheart",
      "fissure", "fissure", "smashing", "smashing",
      "swords", "swords", "swords",
      "yami", "yami", "axeofdespair", "axeofdespair",
      "magepower", "magepower", "united",
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
      // 五帝 14
      "zaborg", "zaborg", "zaborg",
      "mobius", "mobius", "mobius",
      "thestalos", "thestalos", "thestalos",
      "granmarg", "granmarg", "granmarg",
      "raiza", "raiza",
      // 祭品/臣下 18
      "mysticalelf", "mysticalelf", "mysticalelf",
      "stone", "stone", "stone",
      "gemini", "gemini", "gemini",
      "battleox", "battleox", "battleox",
      "witch", "witch",
      "sangan", "sangan",
      "kuriboh", "kuriboh",
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
      // 齿轮三兄弟 9
      "greengadget", "greengadget", "greengadget",
      "redgadget", "redgadget", "redgadget",
      "yellowgadget", "yellowgadget", "yellowgadget",
      // 机械族 23（无其他怪兽）
      "cyberdragon", "cyberdragon", "cyberdragon",
      "jinzo", "jinzo",
      "ancientgeargolem",
      "ancientgearbeast", "ancientgearbeast",
      "proto", "proto", "proto",
      "mechanicalchaser", "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon", "xheadcannon",
      "reflectbounder", "reflectbounder", "reflectbounder",
      "cannonsoldier", "cannonsoldier", "cannonsoldier",
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
      // 电子龙核心 6
      "cyberdragon", "cyberdragon", "cyberdragon",
      "proto", "proto", "proto",
      // 机械族 26（无其他怪兽）
      "cyberphoenix", "cyberphoenix", "cyberphoenix",
      "ydragonhead", "ydragonhead", "ydragonhead",
      "zmetaltank", "zmetaltank", "zmetaltank",
      "xheadcannon", "xheadcannon", "xheadcannon",
      "mechanicalchaser", "mechanicalchaser", "mechanicalchaser",
      "reflectbounder", "reflectbounder", "reflectbounder",
      "cannonsoldier", "cannonsoldier", "cannonsoldier",
      "geargolem", "geargolem", "geargolem",
      "jinzo", "jinzo",
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
    extra: ["cybertwin", "cybertwin", "cybertwin", "cyberend", "cyberend"],
  },

  /* ---------- 23. jinzo 人造人陷阱封印 ---------- */
  jinzo: {
    main: [
      // 人造人核心 3
      "jinzo", "jinzo", "jinzo",
      // 机械族 29（无其他怪兽）
      "proto", "proto", "proto",
      "greengadget", "greengadget", "greengadget",
      "redgadget", "redgadget", "redgadget",
      "yellowgadget", "yellowgadget", "yellowgadget",
      "mechanicalchaser", "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon",
      "reflectbounder", "reflectbounder", "reflectbounder",
      "cannonsoldier", "cannonsoldier", "cannonsoldier",
      "geargolem", "geargolem", "geargolem",
      "cyberdragon", "cyberdragon",
      "ancientgeargolem",
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
      // 古代机械核心 9
      "ancientgeargolem", "ancientgeargolem", "ancientgeargolem",
      "ancientgearbeast", "ancientgearbeast", "ancientgearbeast",
      "ancientgearsoldier", "ancientgearsoldier", "ancientgearsoldier",
      // 机械族 23（无其他怪兽）
      "geargolem", "geargolem",
      "proto", "proto", "proto",
      "greengadget", "greengadget", "greengadget",
      "redgadget", "redgadget", "redgadget",
      "yellowgadget", "yellowgadget", "yellowgadget",
      "mechanicalchaser", "mechanicalchaser", "mechanicalchaser",
      "xheadcannon", "xheadcannon",
      "reflectbounder", "reflectbounder",
      "cannonsoldier", "cannonsoldier",
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
      // 元素英雄全员纯血：高星 5
      "ehero_bladedge", "ehero_bladedge",
      "ehero_neos", "ehero_neos", "ehero_neos",
      // 下级元素英雄 27
      "ehero_avian", "ehero_avian", "ehero_avian",
      "ehero_burstinatrix", "ehero_burstinatrix", "ehero_burstinatrix",
      "ehero_clayman", "ehero_clayman", "ehero_clayman",
      "ehero_sparkman", "ehero_sparkman", "ehero_sparkman",
      "ehero_bubbleman", "ehero_bubbleman", "ehero_bubbleman",
      "ehero_wildheart", "ehero_wildheart", "ehero_wildheart",
      "ehero_stratos", "ehero_stratos", "ehero_stratos",
      "ehero_woodsman", "ehero_woodsman", "ehero_woodsman",
      "ehero_necroshade", "ehero_necroshade", "ehero_necroshade",
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
      "ehero_wildedge",
      "ehero_shiningflarewingman",
      "ehero_shiningphoenixenforcer",
      "ehero_mudballman",
      "ehero_steamhealer",
    ],
  },

  /* ---------- 26. vampire 吸血鬼 ---------- */
  vampire: {
    main: [
      // 高星不死 6
      "vampirelord", "vampirelord", "vampirelord",
      "ryukokki", "ryukokki", "ryukokki",
      // 不死族 26（无其他怪兽）
      "zombiemaster", "zombiemaster", "zombiemaster",
      "spiritreaper", "spiritreaper", "spiritreaper",
      "despair", "despair", "despair",
      "patrician", "patrician",
      "zombyra", "zombyra", "zombyra",
      "vampirelady", "vampirelady", "vampirelady",
      "goblinzombie", "goblinzombie", "goblinzombie",
      "undeadwarrior", "undeadwarrior", "undeadwarrior",
      "skullservant", "skullservant", "skullservant",
      // 魔法 19
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
      // 高星战士 5
      "gaia", "gaia",
      "swordstalker", "swordstalker", "swordstalker",
      // 战士族 27（无其他怪兽）
      "amazoness", "amazoness", "amazoness",
      "amazonessqueen", "amazonessqueen", "amazonessqueen",
      "commandknight", "commandknight", "commandknight",
      "maraudingcaptain", "maraudingcaptain", "maraudingcaptain",
      "gearfried", "gearfried", "gearfried",
      "warriordai", "warriordai", "warriordai",
      "celtic", "celtic", "celtic",
      "axe", "axe", "axe",
      "exiled", "exiled", "exiled",
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
      // 高星魔法师 6
      "darkmagician", "darkmagician", "darkmagician",
      "darkmagiciangirl", "darkmagiciangirl", "darkmagiciangirl",
      // 魔法师族 26（无其他怪兽）
      "skilledwhitemagician", "skilledwhitemagician", "skilledwhitemagician",
      "skilledblackmagician", "skilledblackmagician", "skilledblackmagician",
      "breaker", "breaker", "breaker",
      "magicianvalkyria", "magicianvalkyria", "magicianvalkyria",
      "apprenticemagician", "apprenticemagician", "apprenticemagician",
      "gemini", "gemini",
      "mysticalelf", "mysticalelf",
      "witch", "witch", "witch",
      "oldvindictive", "oldvindictive",
      "magicianoffaith", "magicianoffaith",
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
      // 高星战士 5
      "gaia", "gaia", "gaia",
      "swordstalker", "swordstalker",
      // 战士族 27（无其他怪兽）
      "maraudingcaptain", "maraudingcaptain", "maraudingcaptain",
      "commandknight", "commandknight", "commandknight",
      "gearfried", "gearfried", "gearfried",
      "amazoness", "amazoness", "amazoness",
      "amazonessqueen", "amazonessqueen", "amazonessqueen",
      "warriordai", "warriordai", "warriordai",
      "celtic", "celtic", "celtic",
      "axe", "axe", "axe",
      "exiled", "exiled", "exiled",
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
      // 光属性天使/仙灵 30（无其他怪兽）
      "dunames", "dunames", "dunames",
      "shiningabyss", "shiningabyss", "shiningabyss",
      "mudora", "mudora", "mudora",
      "hoshiningen", "hoshiningen", "hoshiningen",
      "shiningangel", "shiningangel", "shiningangel",
      "airknightparshath", "airknightparshath", "airknightparshath",
      "zolga", "zolga", "zolga",
      "mars", "mars", "mars",
      "marie", "marie", "marie",
      // 魔法 20
      "ancientrules", "ancientrules", "silvercry", "silvercry", "silvercry", "mountain",
      "raigeki", "darkhole", "mst", "mst", "monsterreborn",
      "potofgreed", "potofgreed", "gracefulcharity", "changeofheart",
      "fissure", "smashing", "swords",
      "axeofdespair", "magepower", "united",
      "swords", "swords",
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
  dragon: { name: "龙族霸主", desc: "海马流程的纯龙族卡组：三张青眼白龙领衔，暴君龙、宝石龙、亚历山大龙等龙族全员集结，唤龙笛与龙之支配者调度大龙，可融合召唤青眼究极龙。" },
  fiend: { name: "恶魔军团", desc: "纯恶魔族军团：恶魔召唤、冥界魔王哈·迪斯、迅雷之魔王、恶魔士兵全线恶魔正统，铺场后以装备魔法强化，地裂与粉碎清扫障碍。" },
  spellcaster: { name: "魔导院", desc: "纯魔法师族正统：黑魔术师领衔，熟练的白/黑魔术师、破坏剑士、魔术师女武神、见习魔术师全员魔术师血统，千把刀与黑·魔·导终结对局。" },
  beastwarrior: { name: "野兽战士", desc: "纯兽战士/战士血统：米诺陶洛斯、哥布林突击部队、鳄鱼剑士、幻兽王加泽尔与元素英雄刃锋侠并肩，增援与团结之力全面强化。" },
  flip: { name: "翻转奇袭", desc: "食人虫、报复之老魔术师等翻转效果怪为核心，覆盖防守、翻转反制，抹杀之使徒精准针对里侧怪兽。" },
  water: { name: "深海军团", desc: "纯水属性阵容：企鹅士兵、死者之船、水精灵苏伊金、水魔道士、七色鲸与深海巨怪加吉戈，高防消耗逐步建立优势。" },
  rock: { name: "岩石堡垒", desc: "纯岩石族阵容：磁石战士四兄弟与巨石人、岩石食人魔并肩，黏土侠镇守防线，攻守一体稳步推进。" },
  pyro: { name: "烈焰战场", desc: "纯炎属性进攻卡组：爆裂女郎、加农炮兵、燃烧的因帕奇、火焰克拉肯全线纵火，黑项链与破坏轮持续削减生命值。" },
  thunder: { name: "雷霆机械", desc: "电子龙与机械族混编的科技流，力量焊接融合电子双生龙，人造人封锁陷阱，攻守节奏均衡。" },
  equip: { name: "武装强化", desc: "装备魔法特化，恶魔之斧、魔之力、团结之力满编，低星怪兽武装后攻击力暴涨，速攻碾压。" },
  stall: { name: "铜墙铁壁", desc: "光之护封剑、神之恩惠与高守备怪兽构建的纯防守体系，拖延战局消耗对手，再以上级怪兽反击。" },
  burn: { name: "烈焰灼烧", desc: "烧血特化，加农炮兵、巨大病毒、黑项链、破坏轮全方位削减生命值，不依赖战斗也能取胜。" },
  fusion: { name: "融合召唤", desc: "融合魔法满编的特化卡组，把元素英雄与电子龙融合成火焰翼人、电子双生龙、青眼究极龙等强力怪兽。" },
  beatdown: { name: "绝对武力", desc: "十一张上级怪兽的暴力卡组，青眼白龙、恶魔召唤、暗黑骑士盖亚全线高打点，配合装备魔法正面碾压。" },
  control: { name: "掌控全局", desc: "干扰控制流，心变夺取对手怪兽，大风暴与旋风清场，神之宣告、魔法干扰守护战局，逐步积累优势。" },
  graveyard: { name: "墓地复苏", desc: "不死与墓地利用卡组，生者之书、过早的埋葬、活死人的呼声反复唤醒墓地怪兽，僵尸之主持续展开攻势。" },
  handtrap: { name: "手卡干扰", desc: "手卡干扰与资源战卡组，栗子球、巨大病毒在手即可反制，大量抽卡魔法与防御陷阱保障续航。" },
  chaos: { name: "光暗混沌", desc: "光与暗属性均衡混编，姆多拉、闪耀深渊等光暗主力并进，阵容灵活、难以被针对。" },
  search: { name: "检索压缩", desc: "检索特化，三眼怪、黑森林的魔女、天空侠与齿轮互相串联，快速找到关键卡并压缩卡组。" },
  monarch: { name: "帝王降临", desc: "五帝满编的帝王卡组：雷帝扎博尔格破坏怪兽、冰帝梅比乌斯清扫魔陷、炎帝特斯塔罗斯烧血，臣下做祭品，君临战场。" },
  gadget: { name: "齿轮机械", desc: "纯机械族阵容：绿、红、黄三色齿轮各三张互相检索，电子龙与人造人坐镇，力量焊接融合电子双生龙完成终结。" },
  cyber: { name: "电子龙OTK", desc: "丸藤亮的电子龙纯血：电子龙与原型电子龙满编，电子凤凰护卫，力量焊接融合电子双生龙、电子终结龙，一回合打出毁灭性伤害。" },
  jinzo: { name: "陷阱封印", desc: "以人造人-念力震慑者领衔的纯机械族卡组，封锁双方陷阱，陷阱无力化满编，在无陷阱干扰的环境下正面对决。" },
  ancientgear: { name: "古代机械", desc: "三张古代机械巨人领衔的纯机械族强攻，古代机械兽与士兵推进，装备魔法与粉碎爆裂持续施压。" },
  ehero_pure: { name: "纯元素英雄", desc: "游城十代的元素英雄全员集结：新宇侠、森林侠、暗影侠参战，天空侠检索调度，融合召唤火焰翼人、闪耀火焰翼人、雷霆巨人、泥球侠等英雄阵容作战。" },
  vampire: { name: "吸血鬼", desc: "纯不死族军团：吸血鬼领主与龙骨鬼领衔，暗黑僵尸兵、吸血鬼淑女、哥布林僵尸并肩，生者之书与木乃伊的呼声快速苏生。" },
  amazoness: { name: "亚马逊剑士", desc: "纯战士族阵容：亚马逊女王与亚马逊剑士领衔，铁骑士吉亚弗里德、指挥骑士、切入队长并肩，增援与联合军强化，攻守兼备。" },
  skilled_magician: { name: "熟练魔术师", desc: "纯魔法师族体系：熟练的白/黑魔术师积累魔法计数召唤黑魔术师，破坏剑士与女武神护卫，千把刀与黑·魔·导终结对局。" },
  marauding: { name: "切入队长", desc: "纯战士族串联：切入队长呼唤战友接连出阵，铁骑士与亚马逊女王压阵，指挥骑士提升全队攻击，增援保持场面不断。" },
  angel: { name: "天使代行者", desc: "纯光之天使阵容：光辉天使、空中骑士帕拉修斯、佐尔加、月之使者与姆多拉并肩，神之惠回复生命，攻守均衡的光辉卡组。" },
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
