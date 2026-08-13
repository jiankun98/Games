// 卡组预设（60 张上限；怪兽≈55%、其中 1-4 星≈75%；魔法≈1/3、陷阱≈1/6）
// 由 run/rewrite-decks.js 注入 cards.js，勿手改本文件
const DECK_PRESETS = {
    classic: {
        main: [
            // 低星怪 24
            "celtic", "celtic", "gemini", "gemini", "axe", "axe", "battleox", "battleox",
            "lajinn", "lajinn", "stone", "stone", "mysticalelf", "mysticalelf",
            "maneater", "maneater", "oldvindictive", "oldvindictive", "witch", "sangan",
            "exiled", "goblin", "kuriboh", "sinisterserpent",
            // 高星怪 8
            "blueyes", "blueyes", "darkmagician", "darkmagician", "summonedskull", "summonedskull", "gaia", "gaia",
            // 魔法 18
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "shieldsword", "fissure", "fissure", "smashing",
            "swords", "heavystorm", "axeofdespair", "axeofdespair", "magepower",
            // 陷阱 10
            "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "magiccylinder",
            "waboku", "waboku", "callofhaunted", "torrential",
        ],
        extra: [],
    },
    hero: {
        main: [
            // 低星怪 24
            "ehero_avian", "ehero_avian", "ehero_avian", "ehero_burstinatrix", "ehero_burstinatrix", "ehero_burstinatrix",
            "ehero_clayman", "ehero_clayman", "ehero_sparkman", "ehero_sparkman", "ehero_sparkman",
            "ehero_bubbleman", "ehero_bubbleman", "ehero_wildheart", "ehero_wildheart",
            "ehero_stratos", "ehero_stratos", "gemini", "gemini", "celtic", "celtic",
            "magicianoffaith", "kuriboh", "witch",
            // 高星怪 7
            "ehero_bladedge", "ehero_bladedge", "ehero_bladedge", "darkmagician", "darkmagician", "gaia", "summonedskull",
            // 魔法 19
            "polymerization", "polymerization", "polymerization", "e_call", "e_call",
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "axeofdespair", "magepower", "fissure", "smashing",
            // 陷阱 10
            "hero_barrier", "hero_barrier", "hero_signal", "hero_signal",
            "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: ["ehero_flamewingman", "ehero_flamewingman", "ehero_thundergiant", "ehero_thundergiant", "ehero_wildedge", "ehero_wildedge"],
    },
    machine: {
        main: [
            // 低星怪 25
            "greengadget", "greengadget", "redgadget", "redgadget", "yellowgadget", "yellowgadget",
            "mechanicalchaser", "mechanicalchaser", "xheadcannon", "xheadcannon", "reflectbounder", "reflectbounder",
            "proto", "proto", "proto", "goblin", "goblin", "goblin",
            "cannonsoldier", "witch", "sangan", "kuriboh", "kuriboh", "gemini", "gemini",
            // 高星怪 8
            "cyberdragon", "cyberdragon", "cyberdragon", "jinzo", "jinzo",
            "ancientgeargolem", "ancientgeargolem", "ancientgeargolem",
            // 魔法 17
            "powerbond", "powerbond", "cyberrepair", "cyberrepair",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed", "gracefulcharity",
            "changeofheart", "swords", "axeofdespair", "axeofdespair", "magepower", "united",
            // 陷阱 10
            "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "torrential", "bottomless",
            "solemnjudgment", "ringofdestruction", "dusttornado", "trapstun",
        ],
        extra: ["cybertwin", "cybertwin", "cybertwin"],
    },
    blueeyes: {
        main: [
            // 低星怪 24
            "kaibaman", "kaibaman", "kaibaman", "lordofdragons", "lordofdragons",
            "gemini", "gemini", "lajinn", "lajinn", "celtic", "celtic", "battleox",
            "witch", "sangan", "kuriboh", "kuriboh", "stone", "stone",
            "mysticalelf", "mysticalelf", "maneater", "magicianoffaith", "exiled", "sinisterserpent",
            // 高星怪 8
            "blueyes", "blueyes", "blueyes", "summonedskull", "summonedskull", "gaia", "darkmagician", "darkmagician",
            // 魔法 18
            "flute", "flute", "ancientrules", "ancientrules", "silvercry", "silvercry",
            "burststream", "burststream", "stamping", "polymerization", "polymerization",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed", "gracefulcharity",
            // 陷阱 10
            "championsvigilance", "championsvigilance",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: ["blueyes_ultimate", "blueyes_ultimate"],
    },
    darkmagician: {
        main: [
            // 低星怪 25
            "darkmagiciangirl", "darkmagiciangirl", "skilledwhitemagician", "skilledwhitemagician",
            "gemini", "gemini", "gemini", "mysticalelf", "mysticalelf", "celtic", "celtic",
            "magicianoffaith", "magicianoffaith", "oldvindictive", "oldvindictive",
            "witch", "witch", "sangan", "kuriboh", "exiled", "maneater",
            "stone", "battleox", "lajinn", "axe",
            // 高星怪 8
            "darkmagician", "darkmagician", "darkmagician", "summonedskull", "summonedskull", "gaia", "gaia", "blueyes",
            // 魔法 17
            "thousandknives", "thousandknives", "darkmagicattack", "curtain", "curtain", "magicaldimension", "magicaldimension",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure",
            // 陷阱 10
            "magiciancircle", "magiciancircle",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: [],
    },
    redeyes: {
        main: [
            // 低星怪 25
            "meteor", "meteor", "meteor", "battleox", "battleox", "goblin", "goblin",
            "gemini", "gemini", "lajinn", "lajinn", "celtic", "celtic", "speardragon", "speardragon",
            "witch", "sangan", "kuriboh", "kuriboh", "exiled", "maneater", "stone",
            "mysticalelf", "magicianoffaith", "axe", "silverfang",
            // 高星怪 8
            "redeyes", "redeyes", "redeyes", "summonedskull", "summonedskull", "gaia", "blueyes",
            // 魔法 17
            "redeyesfusion", "redeyesfusion", "polymerization", "polymerization",
            "infernofire", "infernofire", "metalmorph", "metalmorph",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: ["meteorb", "meteorb"],
    },
    harpie: {
        main: [
            // 低星怪 25
            "harpylady", "harpylady", "harpylady", "harpiesisters", "harpiesisters",
            "harpiespet", "harpiespet", "celtic", "celtic", "battleox", "battleox",
            "gemini", "gemini", "lajinn", "lajinn", "axe", "axe",
            "witch", "sangan", "kuriboh", "kuriboh", "exiled", "mysticalelf", "magicianoffaith", "maneater", "axe",
            // 高星怪 7
            "summonedskull", "summonedskull", "gaia", "darkmagician", "blueyes", "redeyes",
            // 魔法 18
            "elegantegotist", "elegantegotist", "huntingground", "huntingground",
            "harpiesfeatherduster", "harpiesfeatherduster",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "magepower", "fissure", "smashing",
            // 陷阱 10
            "hystericparty", "hystericparty",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: [],
    },
    magnet: {
        main: [
            // 低星怪 25
            "magnet_alpha", "magnet_alpha", "magnet_alpha", "magnet_beta", "magnet_beta", "magnet_beta",
            "magnet_gamma", "magnet_gamma", "magnet_gamma", "magnet_delta", "magnet_delta", "magnet_delta",
            "stone", "stone", "stone", "goblin", "goblin", "battleox", "battleox",
            "gemini", "gemini", "witch", "sangan", "kuriboh", "exiled", "axe",
            // 高星怪 7
            "valkyrion", "valkyrion", "valkyrion", "summonedskull", "gaia", "darkmagician", "blueyes",
            // 魔法 18
            "polymerization", "polymerization",
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure", "smashing", "axeofdespair", "magepower", "united",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: [],
    },
    warrior: {
        main: [
            // 低星怪 25
            "maraudingcaptain", "maraudingcaptain", "maraudingcaptain", "warriordai", "warriordai",
            "amazoness", "amazoness", "commandknight", "commandknight",
            "exiled", "exiled", "celtic", "celtic", "axe", "axe", "gemini", "gemini",
            "battleox", "battleox", "witch", "sangan", "kuriboh", "magicianoffaith", "mysticalelf", "axe",
            // 高星怪 8
            "swordstalker", "swordstalker", "gaia", "gaia", "summonedskull", "summonedskull", "darkmagician", "blueyes",
            // 魔法 17
            "reinforcement", "reinforcement", "warriorreturning", "warriorreturning", "aforces",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "united", "magepower", "axeofdespair",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: [],
    },
    zombie: {
        main: [
            // 低星怪 25
            "zombiemaster", "zombiemaster", "zombiemaster", "spiritreaper", "spiritreaper", "spiritreaper",
            "patrician", "patrician", "mysticalelf", "mysticalelf", "lajinn", "lajinn", "gemini", "gemini",
            "witch", "witch", "sangan", "sangan", "kuriboh", "kuriboh", "maneater", "maneater",
            "oldvindictive", "exiled", "magicianoffaith",
            // 高星怪 8
            "vampirelord", "vampirelord", "ryukokki", "ryukokki", "despair", "despair",
            "summonedskull", "summonedskull",
            // 魔法 17
            "bookoflife", "bookoflife", "bookoflife", "mummycall", "mummycall",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure", "smashing", "axeofdespair",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: [],
    },
    fairy: {
        main: [
            // 低星怪 25
            "dunames", "dunames", "dunames", "shiningabyss", "shiningabyss", "mudora", "mudora",
            "hoshiningen", "hoshiningen", "hoshiningen", "mars", "mars",
            "mysticalelf", "mysticalelf", "mysticalelf", "gemini", "gemini", "magicianoffaith", "magicianoffaith",
            "kuriboh", "kuriboh", "witch", "sangan", "exiled", "oldvindictive",
            // 高星怪 7
            "gaia", "summonedskull", "summonedskull", "darkmagician", "darkmagician", "blueyes", "redeyes",
            // 魔法 18
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure", "smashing",
            "axeofdespair", "axeofdespair", "magepower", "united", "blackpendant", "shieldsword",
            // 陷阱 10
            "solemnwishes", "solemnwishes",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: [],
    },
};