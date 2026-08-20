/* 商业帝国 —— 纯配置数据（无逻辑）
 * 挂载为 window.EMPIRE_DATA / globalThis.EMPIRE_DATA，浏览器与 node 测试共用。
 */
(function (global) {
  "use strict";

  /* ===== 全局公式与平衡常量 ===== */
  var FORMULA = {
    startCash: 500,          // 开局现金（元）
    baseSalary: 8,           // 打工底薪（元/秒），保底现金流
    levelCostGrowth: 1.11,   // 产业升级费用倍率
    levelCapBonus: 0.05,     // 每级产能 +5%
    levelDemandLin: 0.6,     // 需求随等级线性 +50%/级
    levelDemandMile: 10,     // 每 10 级一个里程碑
    levelDemandMileMult: 1.5,// 里程碑需求 ×1.5
    hireFeeSeconds: 30,      // 雇佣费 = 30 秒薪水
    refreshCost: 0.5,        // 刷新招聘候选花费（按产业规模计）
    repairRatio: 0.4,        // 维修费 = 设备购价 40%（按损耗比例）
    scrapRatio: 0.1,         // 报废残值 = 购价 10%
    noEquipCap: 1,           // 无设备时的地摊产能上限（单位/秒）
    repMin: 0.5, repMax: 1.5,
    repDownRate: 0.012,      // 供不应求时口碑下降/秒
    repUpRate: 0.008,        // 服务过剩时口碑上升/秒
    gameDay: 60,             // 1 游戏日 = 60 现实秒
    offlineEff: 0.6,         // 离线收益效率
    offlineCap: 24 * 3600,   // 离线时长封顶（秒）
    winTarget: 1e12,         // 万亿 → 登顶首富
    stockStep: 2,            // 股价步进间隔（游戏秒）
    stockClamp: 0.08,        // 单步涨跌上限 ±8%
    stockHistLen: 150,       // 走势图保留点数
    ingStep: 1,              // 原料价格步进间隔（秒）
    antiqueStep: 5,          // 古董价格步进间隔（秒）
    saveKey: "empire_save_v1",
    saveInterval: 5,         // 自动存档间隔（秒）
    divDay: 60,              // 分红周期（游戏秒）
    divPriceDip: 0.995       // 派息日股价微降
  };

  /* 员工品质档位 */
  var QUALITIES = [
    { id: "normal", name: "普通", effMult: 1.0, salaryMult: 1.0, weight: 0.55, color: "#9aa4b8" },
    { id: "skilled", name: "熟练", effMult: 1.5, salaryMult: 1.9, weight: 0.32, color: "#5aa2e8" },
    { id: "gold", name: "金牌", effMult: 2.2, salaryMult: 3.0, weight: 0.13, color: "#e8b64c" }
  ];

  /* ===== 原料市场（14 种，全局波动） ===== */
  var INGREDIENTS = [
    { id: "flour",   name: "面粉",   base: 1,   vol: 0.02,  rev: 0.05 },
    { id: "egg",     name: "鸡蛋",   base: 1.2, vol: 0.025, rev: 0.06 },
    { id: "meat",    name: "猪肉",   base: 8,   vol: 0.035, rev: 0.05 },
    { id: "veg",     name: "蔬菜",   base: 2,   vol: 0.045, rev: 0.08 },
    { id: "milk",    name: "牛奶",   base: 3,   vol: 0.025, rev: 0.05 },
    { id: "tea",     name: "茶叶",   base: 10,  vol: 0.03,  rev: 0.05 },
    { id: "fruit",   name: "水果",   base: 4,   vol: 0.04,  rev: 0.07 },
    { id: "coffee",  name: "咖啡豆", base: 25,  vol: 0.05,  rev: 0.06 },
    { id: "sugar",   name: "糖",     base: 2,   vol: 0.02,  rev: 0.04 },
    { id: "oil",     name: "食用油", base: 6,   vol: 0.025, rev: 0.05 },
    { id: "elec",    name: "电力",   base: 1,   vol: 0.03,  rev: 0.10 },
    { id: "fuel",    name: "汽油",   base: 7,   vol: 0.04,  rev: 0.08 },
    { id: "lithium", name: "锂",     base: 60,  vol: 0.055, rev: 0.04 },
    { id: "silicon", name: "硅料",   base: 80,  vol: 0.05,  rev: 0.04 }
  ];

  /* ===== 12 大产业 =====
   * 通用字段：
   *  unlock 开业费 / levelCost 升级基准费 / upkeep 每级基础维护（元/秒）/ demandBase 基础需求（单位/秒）
   *  positions 岗位 {name, salary 薪水/秒, eff 单位产能/秒}
   *  equipment 设备 {name, price, cap 产能上限, upkeep 维护/秒, wearRate 耐久损耗}
   *    fleet 类产业的 equipment 即车辆：mileage 里程寿命，kmPerUnit 见 special
   *  recipes 配方 {name, price 售价, ings 每单位原料, learn 学习费, pre 前置, needEquip 所需设备, eff 系数}
   */
  var INDUSTRIES = [
    {
      id: "breakfast", name: "早餐铺", icon: "早", unlock: 50, upkeep: 0.05, demandBase: 2, levelCost: 60,
      desc: "民以食为天。雇帮厨、学配方，从一屉包子开始你的商业帝国。",
      special: null,
      positions: [
        { id: "bc", name: "帮厨", salary: 0.2, eff: 1 },
        { id: "sy", name: "收银", salary: 0.35, eff: 1.3 },
        { id: "zc", name: "主厨", salary: 1.2, eff: 3 }
      ],
      equipment: [
        { id: "steamer", name: "蒸笼", price: 80, cap: 2, upkeep: 0.02, wearRate: 0.9 },
        { id: "griddle", name: "煎台", price: 220, cap: 4, upkeep: 0.05, wearRate: 0.7 },
        { id: "fryer", name: "炸锅", price: 500, cap: 8, upkeep: 0.12, wearRate: 0.6 },
        { id: "stove", name: "精品灶台", price: 1600, cap: 16, upkeep: 0.35, wearRate: 0.45 }
      ],
      recipes: [
        { id: "zhou", name: "白粥馒头", price: 2, ings: { flour: 0.15 }, learn: 0, eff: 1 },
        { id: "baozi", name: "鲜肉包子", price: 4, ings: { flour: 0.2, meat: 0.15 }, learn: 30, eff: 1.05 },
        { id: "jianbing", name: "煎饼果子", price: 6.5, ings: { flour: 0.2, egg: 0.3 }, learn: 90, pre: "baozi", needEquip: "griddle", eff: 1.1 },
        { id: "doujiang", name: "豆浆油条", price: 5, ings: { flour: 0.15, oil: 0.12, sugar: 0.1 }, learn: 200, pre: "jianbing", needEquip: "fryer", eff: 1.15 },
        { id: "changfen", name: "广式肠粉", price: 9, ings: { flour: 0.15, meat: 0.2, veg: 0.2 }, learn: 500, pre: "doujiang", eff: 1.25 },
        { id: "taocan", name: "精品早点套餐", price: 16, ings: { flour: 0.3, meat: 0.3, egg: 0.3, veg: 0.2 }, learn: 1500, pre: "changfen", needEquip: "stove", eff: 1.45 }
      ]
    },
    {
      id: "tea", name: "奶茶店", icon: "茶", unlock: 700, upkeep: 0.5, demandBase: 5, levelCost: 320,
      desc: "年轻人的第一杯快乐水。夏季销量起飞，冬季要靠新品续命。",
      special: { type: "season", period: 240, amp: 0.35 },
      positions: [
        { id: "dy", name: "店员", salary: 0.5, eff: 1.5 },
        { id: "ts", name: "调茶师", salary: 1.5, eff: 3.2 },
        { id: "dz", name: "店长", salary: 4, eff: 6.5 }
      ],
      equipment: [
        { id: "sealer", name: "封口机", price: 300, cap: 3, upkeep: 0.06, wearRate: 0.8 },
        { id: "icemaker", name: "制冰机", price: 900, cap: 6, upkeep: 0.18, wearRate: 0.6 },
        { id: "blender", name: "冰沙机", price: 2400, cap: 12, upkeep: 0.5, wearRate: 0.5 },
        { id: "bar", name: "旗舰吧台", price: 7000, cap: 24, upkeep: 1.4, wearRate: 0.35 }
      ],
      recipes: [
        { id: "zhenzhu", name: "珍珠奶茶", price: 9, ings: { tea: 0.06, milk: 0.15, sugar: 0.12 }, learn: 0, eff: 1 },
        { id: "guocha", name: "鲜果茶", price: 14, ings: { fruit: 0.3, tea: 0.05, sugar: 0.1 }, learn: 260, eff: 1.08 },
        { id: "naigai", name: "芝士奶盖", price: 18, ings: { tea: 0.07, milk: 0.28, sugar: 0.15 }, learn: 800, pre: "guocha", eff: 1.15 },
        { id: "shengye", name: "生椰拿铁", price: 22, ings: { milk: 0.3, coffee: 0.05, sugar: 0.1 }, learn: 2000, pre: "naigai", needEquip: "blender", eff: 1.2 },
        { id: "dingzhi", name: "四季限定款", price: 30, ings: { fruit: 0.4, tea: 0.08, milk: 0.2, sugar: 0.15 }, learn: 5200, pre: "shengye", needEquip: "bar", eff: 1.35 }
      ]
    },
    {
      id: "store", name: "便利店", icon: "便", unlock: 5000, upkeep: 3, demandBase: 12, levelCost: 1800,
      desc: "灯火通明的社区堡垒。多 SKU 同时上架，24 小时永不停业。",
      special: { type: "multisku", stable: 1.15 },
      positions: [
        { id: "sy", name: "收银员", salary: 1.2, eff: 4 },
        { id: "lh", name: "理货员", salary: 2, eff: 5.5 },
        { id: "dz", name: "店长", salary: 6, eff: 12 }
      ],
      equipment: [
        { id: "shelf", name: "标准货架", price: 2200, cap: 6, upkeep: 0.5, wearRate: 0.5 },
        { id: "cooler", name: "冷链冷柜", price: 5200, cap: 12, upkeep: 1.6, wearRate: 0.55 },
        { id: "pos", name: "智能收银系统", price: 13000, cap: 24, upkeep: 4, wearRate: 0.35 },
        { id: "warehouse", name: "智能仓储", price: 34000, cap: 48, upkeep: 11, wearRate: 0.25 }
      ],
      recipes: [
        { id: "baihuo", name: "日用百货", price: 15, ings: { oil: 0.4, sugar: 0.5 }, learn: 0, eff: 1 },
        { id: "bianbian", name: "鲜食便当", price: 22, ings: { meat: 0.25, veg: 0.35, egg: 0.25 }, learn: 1200, needEquip: "cooler", eff: 1.05 },
        { id: "ziyou", name: "自有品牌", price: 32, ings: { oil: 0.35, sugar: 0.5, veg: 0.3 }, learn: 3600, pre: "baihuo", eff: 1.1 },
        { id: "service", name: "24h 便民服务", price: 48, ings: {}, learn: 9600, needEquip: "pos", eff: 0.95 },
        { id: "tuangou", name: "社区团购", price: 65, ings: { fruit: 0.45, veg: 0.45, meat: 0.15 }, learn: 24000, needEquip: "warehouse", eff: 1.2 }
      ]
    },
    {
      id: "fleet", name: "网约车队", icon: "车", unlock: 32000, upkeep: 15, demandBase: 15, levelCost: 10000,
      desc: "车轮上的现金流。买车要算里程寿命与残值，早晚高峰单量翻倍。",
      special: { type: "fleet", rushPeriod: 120, rushAmp: 0.5, kmPerUnit: 3 },
      positions: [
        { id: "jz", name: "兼职司机", salary: 3, eff: 3 },
        { id: "qz", name: "全职司机", salary: 8, eff: 7 },
        { id: "jp", name: "金牌司机", salary: 24, eff: 18 }
      ],
      equipment: [
        { id: "eco", name: "经济型轿车", price: 9500, cap: 4, upkeep: 0.8, wearRate: 0, mileage: 15000, fuelType: "fuel" },
        { id: "comfort", name: "舒适型轿车", price: 26000, cap: 8, upkeep: 2, wearRate: 0, mileage: 22000, fuelType: "fuel" },
        { id: "nev", name: "新能源车", price: 44000, cap: 10, upkeep: 0.9, wearRate: 0, mileage: 30000, fuelType: "elec" },
        { id: "lux", name: "豪华型轿车", price: 96000, cap: 16, upkeep: 5, wearRate: 0, mileage: 26000, fuelType: "fuel" }
      ],
      recipes: [
        { id: "kuai", name: "快车单", price: 13, ings: { fuel: 0.35 }, learn: 0, eff: 1 },
        { id: "shun", name: "顺风拼车", price: 8.5, ings: { fuel: 0.22 }, learn: 7000, eff: 1.3 },
        { id: "zhuan", name: "专车单", price: 19, ings: { fuel: 0.45 }, learn: 21000, needEquip: "comfort", eff: 1.1 },
        { id: "haohua", name: "豪华专车", price: 32, ings: { fuel: 0.6 }, learn: 72000, needEquip: "lux", eff: 1.2 }
      ]
    },
    {
      id: "coffee", name: "咖啡连锁", icon: "咖", unlock: 120000, upkeep: 60, demandBase: 30, levelCost: 45000,
      desc: "都市白领的续命血浆。咖啡豆价格剧烈波动，锁豆是门学问。",
      special: { type: "coffee", ingId: "coffee", thresh: 1.5, demandPenalty: 0.15 },
      positions: [
        { id: "kfs", name: "咖啡师", salary: 9, eff: 16 },
        { id: "zb", name: "值班主管", salary: 24, eff: 32 },
        { id: "jp", name: "金牌咖啡师", salary: 70, eff: 75 }
      ],
      equipment: [
        { id: "semi", name: "半自动咖啡机", price: 100000, cap: 22, upkeep: 30, wearRate: 0.5 },
        { id: "espresso", name: "意式工作站", price: 270000, cap: 45, upkeep: 75, wearRate: 0.4 },
        { id: "roaster", name: "烘豆机", price: 720000, cap: 90, upkeep: 190, wearRate: 0.3 },
        { id: "flag", name: "精品旗舰店台", price: 1800000, cap: 180, upkeep: 480, wearRate: 0.22 }
      ],
      recipes: [
        { id: "americano", name: "美式咖啡", price: 24, ings: { coffee: 0.14 }, learn: 0, eff: 1 },
        { id: "latte", name: "拿铁", price: 30, ings: { coffee: 0.14, milk: 0.3 }, learn: 48000, eff: 1.08 },
        { id: "pour", name: "手冲精品", price: 48, ings: { coffee: 0.28 }, learn: 144000, pre: "latte", eff: 1.15 },
        { id: "origin", name: "限定产地系列", price: 72, ings: { coffee: 0.32, milk: 0.2, sugar: 0.2 }, learn: 420000, pre: "pour", needEquip: "roaster", eff: 1.3 }
      ]
    },
    {
      id: "gym", name: "健身房", icon: "健", unlock: 500000, upkeep: 300, demandBase: 45, levelCost: 200000,
      desc: "贩卖自律与多巴胺。会员办卡预收现金流，器材损耗是隐痛。",
      special: { type: "prepaid", bonus: 0.15 },
      positions: [
        { id: "hj", name: "会籍顾问", salary: 40, eff: 55 },
        { id: "jl", name: "巡场教练", salary: 100, eff: 100 },
        { id: "zj", name: "私教总监", salary: 320, eff: 280 }
      ],
      equipment: [
        { id: "treadmill", name: "跑步机区", price: 260000, cap: 30, upkeep: 160, wearRate: 0.9 },
        { id: "strength", name: "力量器械区", price: 700000, cap: 60, upkeep: 420, wearRate: 0.7 },
        { id: "pool", name: "游泳馆", price: 1800000, cap: 120, upkeep: 1100, wearRate: 0.5 },
        { id: "rehab", name: "康复理疗中心", price: 4200000, cap: 240, upkeep: 2700, wearRate: 0.35 }
      ],
      recipes: [
        { id: "month", name: "月卡", price: 320, ings: { elec: 25 }, learn: 0, eff: 1 },
        { id: "season", name: "季卡", price: 820, ings: { elec: 60 }, learn: 250000, eff: 1.06 },
        { id: "year", name: "年卡", price: 2700, ings: { elec: 170 }, learn: 680000, pre: "season", eff: 1.12 },
        { id: "pt", name: "私教课程", price: 420, ings: { elec: 12 }, learn: 2100000, needEquip: "strength", eff: 1.2 },
        { id: "rehabC", name: "康复理疗", price: 880, ings: { elec: 35 }, learn: 5600000, needEquip: "rehab", eff: 1.35 }
      ]
    },
    {
      id: "ecom", name: "电商平台", icon: "电", unlock: 2800000, upkeep: 1600, demandBase: 65, levelCost: 1000000,
      desc: "流量为王。大促日 GMV 狂飙三倍，备货成本也随之水涨船高。",
      special: { type: "promo", period: 300, promoLen: 25, mult: 3, costMult: 1.2 },
      positions: [
        { id: "kf", name: "客服", salary: 180, eff: 130 },
        { id: "cc", name: "仓储专员", salary: 450, eff: 300 },
        { id: "yd", name: "运营总监", salary: 1400, eff: 850 }
      ],
      equipment: [
        { id: "wh", name: "中心仓库", price: 1900000, cap: 90, upkeep: 900, wearRate: 0.5 },
        { id: "sort", name: "自动分拣线", price: 4800000, cap: 180, upkeep: 2300, wearRate: 0.35 },
        { id: "cloud", name: "智能云仓", price: 12000000, cap: 360, upkeep: 5800, wearRate: 0.25 },
        { id: "global", name: "全球物流网", price: 30000000, cap: 720, upkeep: 14500, wearRate: 0.18 }
      ],
      recipes: [
        { id: "ziying", name: "自营百货", price: 160, ings: { oil: 2, sugar: 2, veg: 2 }, learn: 0, eff: 1 },
        { id: "jiadian", name: "家电专场", price: 420, ings: { silicon: 1, elec: 25 }, learn: 1400000, eff: 1.08 },
        { id: "daprom", name: "大促专场", price: 850, ings: { oil: 3, fruit: 3, meat: 1.2 }, learn: 4400000, eff: 1.12 },
        { id: "haiwaigou", name: "全球购", price: 1600, ings: { coffee: 2, fruit: 4, sugar: 4 }, learn: 12000000, needEquip: "global", eff: 1.25 }
      ]
    },
    {
      id: "game", name: "手游工作室", icon: "游", unlock: 13000000, upkeep: 9000, demandBase: 90, levelCost: 6000000,
      desc: "爆款有生命周期：立项烧钱、上线爆红、热度衰减，再立项再战。",
      special: { type: "lifecycle", decay: 0.006, floor: 0.25, relaunchCost: 0.25 },
      positions: [
        { id: "coder", name: "程序员", salary: 1100, eff: 620 },
        { id: "plan", name: "游戏策划", salary: 2800, eff: 1400 },
        { id: "art", name: "主美", salary: 8500, eff: 4000 }
      ],
      equipment: [
        { id: "office", name: "研发办公区", price: 12000000, cap: 130, upkeep: 6000, wearRate: 0.4 },
        { id: "server", name: "服务器集群", price: 30000000, cap: 260, upkeep: 16000, wearRate: 0.5 },
        { id: "mocap", name: "动捕棚", price: 80000000, cap: 520, upkeep: 40000, wearRate: 0.3 }
      ],
      recipes: [
        { id: "casual", name: "休闲小游戏", price: 550, ings: { elec: 60 }, learn: 0, eff: 1 },
        { id: "card", name: "中度卡牌", price: 1300, ings: { elec: 110, silicon: 0.6 }, learn: 8000000, eff: 1.08 },
        { id: "slg", name: "SLG 大作", price: 3200, ings: { elec: 230, silicon: 1.2 }, learn: 24000000, pre: "card", eff: 1.15 },
        { id: "open", name: "开放世界", price: 8500, ings: { elec: 450, silicon: 2.5 }, learn: 65000000, pre: "slg", needEquip: "mocap", eff: 1.3 }
      ]
    },
    {
      id: "ev", name: "新能源车厂", icon: "能", unlock: 90000000, upkeep: 65000, demandBase: 120, levelCost: 40000000,
      desc: "碳中和浪潮。锂价周期牵动成本，研发解锁高端车型。",
      special: { type: "lithium", ingId: "lithium", thresh: 1.4, band: 0.25 },
      positions: [
        { id: "worker", name: "产线工人", salary: 7500, eff: 3200 },
        { id: "eng", name: "工程师", salary: 24000, eff: 8500 },
        { id: "academician", name: "院士专家", salary: 82000, eff: 26000 }
      ],
      equipment: [
        { id: "batt", name: "电池产线", price: 70000000, cap: 170, upkeep: 48000, wearRate: 0.45 },
        { id: "assembly", name: "总装线", price: 220000000, cap: 340, upkeep: 120000, wearRate: 0.35 },
        { id: "rnd", name: "研发中心", price: 600000000, cap: 680, upkeep: 300000, wearRate: 0.2 }
      ],
      recipes: [
        { id: "ecar", name: "经济型 EV", price: 5800, ings: { lithium: 2.2, silicon: 1, elec: 120 }, learn: 0, eff: 1 },
        { id: "suv", name: "中端 SUV", price: 13500, ings: { lithium: 4, silicon: 2, elec: 240 }, learn: 60000000, eff: 1.08 },
        { id: "sedan", name: "高端轿车", price: 33000, ings: { lithium: 6, silicon: 4, elec: 380 }, learn: 180000000, pre: "suv", eff: 1.15 },
        { id: "hyper", name: "电动超跑", price: 88000, ings: { lithium: 10, silicon: 8, elec: 600 }, learn: 450000000, pre: "sedan", needEquip: "rnd", eff: 1.3 }
      ]
    },
    {
      id: "semi", name: "半导体集团", icon: "芯", unlock: 700000000, upkeep: 420000, demandBase: 150, levelCost: 150000000,
      desc: "周期之王。晶圆厂折旧惊人，景气周期里萧条与暴利轮转。",
      special: { type: "cycle", period: 600, amp: 0.5, base: 1.1 },
      positions: [
        { id: "process", name: "工艺工程师", salary: 52000, eff: 22000 },
        { id: "rd", name: "研发院士", salary: 180000, eff: 70000 },
        { id: "team", name: "顶尖研发团队", salary: 560000, eff: 210000 }
      ],
      equipment: [
        { id: "fab", name: "晶圆厂", price: 600000000, cap: 260, upkeep: 380000, wearRate: 0.4 },
        { id: "adv", name: "先进制程线", price: 1600000000, cap: 520, upkeep: 950000, wearRate: 0.3 },
        { id: "osat", name: "封测中心", price: 4000000000, cap: 1040, upkeep: 2400000, wearRate: 0.22 }
      ],
      recipes: [
        { id: "mature", name: "成熟制程", price: 13000, ings: { silicon: 4, elec: 380 }, learn: 0, eff: 1 },
        { id: "advp", name: "先进制程", price: 32000, ings: { silicon: 8, elec: 700 }, learn: 350000000, needEquip: "adv", eff: 1.12 },
        { id: "chiplet", name: "Chiplet 封装", price: 85000, ings: { silicon: 12, elec: 1100 }, learn: 1100000000, pre: "advp", eff: 1.25 }
      ]
    },
    {
      id: "space", name: "商业航天", icon: "星", unlock: 3500000000, upkeep: 3600000, demandBase: 140, levelCost: 1500000000,
      desc: "星辰大海的订单制生意：周期结算一笔笔巨额发射款。",
      special: { type: "order", period: 30, bonus: 1.6 },
      positions: [
        { id: "rocketEng", name: "火箭工程师", salary: 700000, eff: 300000 },
        { id: "launchTeam", name: "发射团队", salary: 2200000, eff: 900000 }
      ],
      equipment: [
        { id: "pad", name: "发射工位", price: 3500000000, cap: 220, upkeep: 3500000, wearRate: 0.5 },
        { id: "reuse", name: "可复用火箭", price: 15000000000, cap: 550, upkeep: 8500000, wearRate: 0.05, reuseMax: 20 },
        { id: "starport", name: "星际飞船港", price: 40000000000, cap: 1100, upkeep: 21000000, wearRate: 0.3 }
      ],
      recipes: [
        { id: "sat", name: "商业卫星发射", price: 220000, ings: { silicon: 22, fuel: 55 }, learn: 0, eff: 1 },
        { id: "tour", name: "太空旅游", price: 650000, ings: { fuel: 110, silicon: 6 }, learn: 4500000000, eff: 1.1 },
        { id: "cargo", name: "星际货运", price: 1600000, ings: { fuel: 220, silicon: 33 }, learn: 14000000000, pre: "tour", eff: 1.22 }
      ]
    },
    {
      id: "meta", name: "元宇宙帝国", icon: "宇", unlock: 26000000000, upkeep: 30000000, demandBase: 110, levelCost: 12000000000,
      desc: "算力即权力。电费是最大开支，用户飞轮一旦转起便势不可挡。",
      special: { type: "flywheel", repMax: 1.8, repWeight: 2 },
      positions: [
        { id: "algo", name: "算法工程师", salary: 6500000, eff: 2200000 },
        { id: "content", name: "内容团队", salary: 20000000, eff: 6800000 }
      ],
      equipment: [
        { id: "dc1", name: "算力中心 A", price: 30000000000, cap: 420, upkeep: 33000000, wearRate: 0.4 },
        { id: "dcx", name: "算力中心 X", price: 160000000000, cap: 850, upkeep: 83000000, wearRate: 0.3 }
      ],
      recipes: [
        { id: "land", name: "虚拟地产", price: 3200000, ings: { elec: 2600 }, learn: 0, eff: 1 },
        { id: "nft", name: "数字藏品", price: 8500000, ings: { elec: 5200, silicon: 6 }, learn: 30000000000, eff: 1.08 },
        { id: "holo", name: "全息社交", price: 21000000, ings: { elec: 10000, silicon: 12 }, learn: 100000000000, eff: 1.15 },
        { id: "bci", name: "脑机接口", price: 52000000, ings: { elec: 17000, silicon: 24 }, learn: 280000000000, eff: 1.3 }
      ]
    }
  ];

  /* ===== 股市（45 支） =====
   * style: blue 蓝筹（低波动高股息）/ growth 成长（高波动低股息）/ cyc 周期（联动半导体周期）
   * volMul / divMul 相对板块模板的倍率；ing 与对应原料价联动
   */
  var STOCK_SECTORS = {
    tech:     { name: "科技", vol: 0.016, drift: 0.000035, div: 0.0015 },
    consume:  { name: "消费", vol: 0.012, drift: 0.000025, div: 0.0025 },
    pharma:   { name: "医药", vol: 0.014, drift: 0.000028, div: 0.002 },
    energy:   { name: "能源", vol: 0.015, drift: 0.00002, div: 0.003 },
    finance:  { name: "金融", vol: 0.011, drift: 0.000018, div: 0.0035 },
    realestat:{ name: "地产", vol: 0.013, drift: 0.000012, div: 0.0025 },
    military: { name: "军工", vol: 0.015, drift: 0.000026, div: 0.0015 },
    industry: { name: "工业", vol: 0.012, drift: 0.00002, div: 0.0028 },
    agri:     { name: "农业", vol: 0.014, drift: 0.000018, div: 0.002 },
    media:    { name: "传媒", vol: 0.017, drift: 0.00003, div: 0.001 },
    logistics:{ name: "物流", vol: 0.012, drift: 0.000022, div: 0.0025 },
    utility:  { name: "公用", vol: 0.009, drift: 0.000012, div: 0.004 },
    newenergy:{ name: "新能源", vol: 0.018, drift: 0.000032, div: 0.0012 },
    meta:     { name: "元宇宙", vol: 0.021, drift: 0.00004, div: 0.0008 }
  };

  var STOCKS = [
    // 科技 8
    { id: "st01", name: "星辰科技", sector: "tech", style: "growth", price0: 48, volMul: 1.2, divMul: 0.6, blurb: "云计算与人工智能基础设施龙头。" },
    { id: "st02", name: "量子芯动", sector: "tech", style: "cyc", price0: 92, volMul: 1.4, divMul: 0.5, blurb: "芯片设计公司，业绩随半导体周期大起大落。", cyc: true },
    { id: "st03", name: "云端漫步", sector: "tech", style: "growth", price0: 26, volMul: 1.1, divMul: 0.4, blurb: "SaaS 服务商，订阅收入稳步爬升。" },
    { id: "st04", name: "极智智能", sector: "tech", style: "growth", price0: 15, volMul: 1.5, divMul: 0.2, blurb: "大模型新贵，尚未盈利，故事极大。" },
    { id: "st05", name: "光年网络", sector: "tech", style: "blue", price0: 63, volMul: 0.7, divMul: 1.2, blurb: "通信设备老兵，现金流稳健。" },
    { id: "st06", name: "硅谷创新", sector: "tech", style: "growth", price0: 8.5, volMul: 1.6, divMul: 0.1, blurb: "科创板次新股，波动剧烈。" },
    { id: "st07", name: "天工软件", sector: "tech", style: "blue", price0: 37, volMul: 0.8, divMul: 1.1, blurb: "工业软件隐形冠军。" },
    { id: "st08", name: "蜂鸟互联", sector: "tech", style: "growth", price0: 21, volMul: 1.15, divMul: 0.5, blurb: "移动互联网老兵转型 AI。" },
    // 消费 5
    { id: "sc01", name: "国民白酒", sector: "consume", style: "blue", price0: 180, volMul: 0.6, divMul: 1.4, blurb: "高端白酒龙头，提价永动机。" },
    { id: "sc02", name: "喜甜食品", sector: "consume", style: "blue", price0: 42, volMul: 0.7, divMul: 1.3, blurb: "糖果乳品巨头，需求刚性。" },
    { id: "sc03", name: "悦己美妆", sector: "consume", style: "growth", price0: 33, volMul: 1.1, divMul: 0.6, blurb: "国货美妆当红炸子鸡。" },
    { id: "sc04", name: "鲜果集团", sector: "consume", style: "cyc", price0: 12, volMul: 1.2, divMul: 0.8, blurb: "生鲜连锁，利润被水果价格左右。", ing: "fruit" },
    { id: "sc05", name: "潮流玩具", sector: "consume", style: "growth", price0: 55, volMul: 1.3, divMul: 0.3, blurb: "盲盒经济，情绪价值贩卖机。" },
    // 医药 4
    { id: "sp01", name: "仁心制药", sector: "pharma", style: "blue", price0: 68, volMul: 0.7, divMul: 1.3, blurb: "仿制药+创新药双轮驱动。" },
    { id: "sp02", name: "基因未来", sector: "pharma", style: "growth", price0: 27, volMul: 1.4, divMul: 0.2, blurb: "基因编辑前沿，十年磨一剑。" },
    { id: "sp03", name: "康健医疗", sector: "pharma", style: "blue", price0: 51, volMul: 0.8, divMul: 1.2, blurb: "医疗器械白马股。" },
    { id: "sp04", name: "百草中药", sector: "pharma", style: "blue", price0: 19, volMul: 0.9, divMul: 1.1, blurb: "老字号中药，稳如老狗。" },
    // 能源 4
    { id: "se01", name: "巨无霸石油", sector: "energy", style: "blue", price0: 88, volMul: 0.8, divMul: 1.5, blurb: "桶油天下，分红慷慨。" },
    { id: "se02", name: "深蓝海油", sector: "energy", style: "cyc", price0: 24, volMul: 1.2, divMul: 1.1, blurb: "海上采油，油价敏感。", ing: "fuel" },
    { id: "se03", name: "华夏电网", sector: "utility", style: "blue", price0: 45, volMul: 0.5, divMul: 1.6, blurb: "电网垄断经营，类债资产。" },
    { id: "se04", name: "煤炭巨人", sector: "energy", style: "cyc", price0: 16, volMul: 1.3, divMul: 1.2, blurb: "黑色金矿，周期剧烈。", ing: "oil" },
    // 金融 5
    { id: "sf01", name: "宇宙银行", sector: "finance", style: "blue", price0: 32, volMul: 0.5, divMul: 1.6, blurb: "宇宙第一大行，股息率感人。" },
    { id: "sf02", name: "平安是福保险", sector: "finance", style: "blue", price0: 74, volMul: 0.7, divMul: 1.4, blurb: "保险巨头，久期之王。" },
    { id: "sf03", name: "金牛证券", sector: "finance", style: "cyc", price0: 18, volMul: 1.5, divMul: 0.7, blurb: "牛市旗手，成交量放大器。" },
    { id: "sf04", name: "信托控股", sector: "finance", style: "cyc", price0: 11, volMul: 1.4, divMul: 0.9, blurb: "影子银行，风起云涌。" },
    { id: "sf05", name: "消费金融", sector: "finance", style: "growth", price0: 9.2, volMul: 1.2, divMul: 0.6, blurb: "分期生意，年轻人钱包收割机。" },
    // 地产 3
    { id: "sr01", name: "万家置业", sector: "realestat", style: "cyc", price0: 14, volMul: 1.3, divMul: 1.0, blurb: "住宅开发龙头，政策敏感。" },
    { id: "sr02", name: "环球商业地产", sector: "realestat", style: "blue", price0: 39, volMul: 0.8, divMul: 1.4, blurb: "持有核心商圈收租。" },
    { id: "sr03", name: "筑安建设", sector: "industry", style: "blue", price0: 22, volMul: 0.9, divMul: 1.2, blurb: "基建施工国家队。" },
    // 军工 3
    { id: "sm01", name: "苍穹航空", sector: "military", style: "blue", price0: 57, volMul: 0.8, divMul: 1.1, blurb: "战机总装，国之重器。" },
    { id: "sm02", name: "铁马兵工", sector: "military", style: "blue", price0: 25, volMul: 0.9, divMul: 1.0, blurb: "装甲与弹药制造商。" },
    { id: "sm03", name: "星链防务", sector: "military", style: "growth", price0: 68, volMul: 1.3, divMul: 0.4, blurb: "军事卫星网络新势力。" },
    // 工业 3（含筑安建设）
    { id: "si01", name: "重工巨擘", sector: "industry", style: "cyc", price0: 13, volMul: 1.2, divMul: 1.1, blurb: "挖掘机与船舶之心。", cyc: true },
    { id: "si02", name: "精密制造", sector: "industry", style: "growth", price0: 46, volMul: 1.0, divMul: 0.6, blurb: "高端机床与机器人。" },
    // 农业 2
    { id: "sa01", name: "金穗种业", sector: "agri", style: "cyc", price0: 17, volMul: 1.1, divMul: 0.8, blurb: "种业安全担当。", ing: "veg" },
    { id: "sa02", name: "牧原天下", sector: "agri", style: "cyc", price0: 28, volMul: 1.3, divMul: 0.7, blurb: "猪周期亲历者。", ing: "meat" },
    // 传媒 3
    { id: "smd01", name: "流光影视", sector: "media", style: "growth", price0: 23, volMul: 1.3, divMul: 0.3, blurb: "爆款内容制造机。" },
    { id: "smd02", name: "声动传媒", sector: "media", style: "growth", price0: 9.8, volMul: 1.5, divMul: 0.2, blurb: "短视频生态掘金者。" },
    { id: "smd03", name: "游梦网络", sector: "media", style: "growth", price0: 62, volMul: 1.2, divMul: 0.4, blurb: "游戏发行大厂，项目周期明显。", cyc: true },
    // 物流 2
    { id: "sl01", name: "神行快递", sector: "logistics", style: "blue", price0: 35, volMul: 0.8, divMul: 1.3, blurb: "快递网络霸主。" },
    { id: "sl02", name: "远洋航运", sector: "logistics", style: "cyc", price0: 20, volMul: 1.6, divMul: 0.9, blurb: "运价周期之王。", cyc: true },
    // 公用 2（含华夏电网）
    { id: "su01", name: "清泉水务", sector: "utility", style: "blue", price0: 15, volMul: 0.5, divMul: 1.5, blurb: "自来水特许经营。" },
    { id: "su02", name: "绿能燃气", sector: "utility", style: "blue", price0: 28, volMul: 0.6, divMul: 1.4, blurb: "城市燃气运营商。" },
    // 新能源 4
    { id: "sn01", name: "锂都矿业", sector: "newenergy", style: "cyc", price0: 78, volMul: 1.5, divMul: 0.6, blurb: "锂矿资源股，锂价晴雨表。", ing: "lithium" },
    { id: "sn02", name: "阳光光伏", sector: "newenergy", style: "growth", price0: 44, volMul: 1.2, divMul: 0.5, blurb: "光伏组件龙头。" },
    { id: "sn03", name: "雷驰汽车", sector: "newenergy", style: "growth", price0: 96, volMul: 1.3, divMul: 0.3, blurb: "新能源整车明星。" },
    { id: "sn04", name: "储核能源", sector: "newenergy", style: "cyc", price0: 31, volMul: 1.2, divMul: 0.8, blurb: "储能与电网侧新军。" },
    // 元宇宙 2
    { id: "sz01", name: "幻境科技", sector: "meta", style: "growth", price0: 52, volMul: 1.6, divMul: 0.2, blurb: "VR/AR 头显先行者。" },
    { id: "sz02", name: "元宇计算", sector: "meta", style: "growth", price0: 36, volMul: 1.5, divMul: 0.3, blurb: "元宇宙算力提供商。", ing: "elec" }
  ];

  /* ===== 房产（8 种） ===== */
  var PROPERTIES = [
    { id: "p1", name: "老破小",     icon: "房", price: 50000,      vol: 0.002,  drift: 0.00018, yield: 0.0015, desc: "地段尚可的老公房，租金稳。" },
    { id: "p2", name: "城郊公寓",   icon: "寓", price: 260000,     vol: 0.0022, drift: 0.0002,  yield: 0.0015, desc: "地铁末端的年轻人们。" },
    { id: "p3", name: "学区房",     icon: "学", price: 1300000,    vol: 0.0028, drift: 0.00022, yield: 0.0012, desc: "政策风向标，胆大者的游戏。" },
    { id: "p4", name: "江景大平层", icon: "景", price: 5600000,    vol: 0.003,  drift: 0.00025, yield: 0.0012, desc: "一线江景，豪宅标杆。" },
    { id: "p5", name: "山间别墅",   icon: "墅", price: 24000000,   vol: 0.0032, drift: 0.00026, yield: 0.001,  desc: "稀缺山水资源。" },
    { id: "p6", name: "甲级写字楼", icon: "楼", price: 90000000,   vol: 0.0035, drift: 0.00028, yield: 0.0013, desc: "CBD 现金流压舱石。" },
    { id: "p7", name: "购物中心",   icon: "购", price: 360000000,  vol: 0.0038, drift: 0.0003,  yield: 0.0014, desc: "商圈之王的租金帝国。" },
    { id: "p8", name: "私人海岛",   icon: "岛", price: 1800000000, vol: 0.0045, drift: 0.00032, yield: 0.0008, desc: "顶级富豪的社交名片。" }
  ];

  /* ===== 古董（8 种） ===== */
  var ANTIQUES = [
    { id: "a1", name: "陈年茅台",   icon: "酒", price: 600000,    vol: 0.05, drift: 0.0006, desc: "液体黄金，越放越香。" },
    { id: "a2", name: "青花瓷瓶",   icon: "瓷", price: 800000,    vol: 0.06, drift: 0.0008, desc: "元青花残件也价值连城。" },
    { id: "a3", name: "名家字画",   icon: "画", price: 3200000,   vol: 0.07, drift: 0.001,  desc: "纸绢千年，墨韵无价。" },
    { id: "a4", name: "和田玉摆件", icon: "玉", price: 10000000,  vol: 0.065, drift: 0.0009, desc: "君子如玉，温润而泽。" },
    { id: "a5", name: "机械名表",   icon: "表", price: 26000000,  vol: 0.055, drift: 0.0007, desc: "腕上的精密艺术。" },
    { id: "a6", name: "青铜爵",     icon: "爵", price: 60000000,  vol: 0.075, drift: 0.0011, desc: "商周礼器，博物馆级。" },
    { id: "a7", name: "珍邮全集",   icon: "邮", price: 150000000, vol: 0.07,  drift: 0.001,  desc: "方寸之间，一版八十万。" },
    { id: "a8", name: "璀璨粉钻",   icon: "钻", price: 520000000, vol: 0.08,  drift: 0.0012, desc: "稀有彩钻，硬通货之王。" }
  ];

  /* ===== 商店 ===== */
  var SHOP = {
    books: [
      { id: "b1", name: "《地摊经济学》",   price: 12000,       bonus: 0.05, desc: "全局净利 +5%" },
      { id: "b2", name: "《现金流管理》",   price: 120000,      bonus: 0.08, desc: "全局净利 +8%" },
      { id: "b3", name: "《商业模式革新》", price: 1200000,     bonus: 0.12, desc: "全局净利 +12%" },
      { id: "b4", name: "《谈判的艺术》",   price: 12000000,    bonus: 0.15, desc: "全局净利 +15%" },
      { id: "b5", name: "《宏观周期论》",   price: 120000000,   bonus: 0.2,  desc: "全局净利 +20%" },
      { id: "b6", name: "《首富思维》",     price: 1200000000,  bonus: 0.25, desc: "全局净利 +25%" }
    ],
    luxuries: [
      { id: "l1", name: "名表",       price: 1200000,     bonus: 0.02, desc: "资产 +2% 加成" },
      { id: "l2", name: "超级跑车",   price: 12000000,    bonus: 0.03, desc: "资产 +3% 加成" },
      { id: "l3", name: "豪华游艇",   price: 60000000,    bonus: 0.05, desc: "资产 +5% 加成" },
      { id: "l4", name: "山顶庄园",   price: 240000000,   bonus: 0.07, desc: "资产 +7% 加成" },
      { id: "l5", name: "私人飞机",   price: 1200000000,  bonus: 0.1,  desc: "资产 +10% 加成" },
      { id: "l6", name: "足球俱乐部", price: 6000000000,  bonus: 0.15, desc: "资产 +15% 加成" }
    ],
    consumables: [
      { id: "c1", name: "浓缩咖啡", price: 8000,    dur: 60,  mult: 2, desc: "60 秒全局净利 ×2" },
      { id: "c2", name: "能量饮料", price: 80000,   dur: 120, mult: 2, desc: "120 秒全局净利 ×2" },
      { id: "c3", name: "商业晚宴", price: 800000,  dur: 300, mult: 2, desc: "300 秒全局净利 ×2" }
    ]
  };

  /* ===== 新闻事件池 ===== */
  var NEWS = [
    { id: "n1",  text: "{s}发布革命性新品，订单排到明年！", target: "stock", power: 1, dur: 45 },
    { id: "n2",  text: "机构调研密集，{s}被一致看多。", target: "stock", power: 0.8, dur: 40 },
    { id: "n3",  text: "{s}业绩超预期，宣布提高分红。", target: "stock", power: 0.9, dur: 40 },
    { id: "n4",  text: "北向资金大举买入{s}。", target: "stock", power: 0.7, dur: 35 },
    { id: "n5",  text: "重磅！{s}获得行业独家牌照。", target: "stock", power: 1.1, dur: 50 },
    { id: "n6",  text: "{s}被立案调查，股价承压。", target: "stock", power: -1, dur: 45 },
    { id: "n7",  text: "{s}大股东减持公告引发抛售。", target: "stock", power: -0.8, dur: 40 },
    { id: "n8",  text: "{s}产品召回，品牌受损。", target: "stock", power: -0.9, dur: 40 },
    { id: "n9",  text: "分析师下调{s}评级至卖出。", target: "stock", power: -0.7, dur: 35 },
    { id: "n10", text: "行业新规出台，{s}短期承压。", target: "stock", power: -1.1, dur: 50 },
    { id: "n11", text: "极端天气来袭，{g}供应紧张价格飙升。", target: "ing", power: 1, dur: 60 },
    { id: "n12", text: "{g}主产区大丰收，批发价跳水。", target: "ing", power: -0.8, dur: 55 },
    { id: "n13", text: "进口关税调整，{g}成本上浮。", target: "ing", power: 0.7, dur: 50 },
    { id: "n14", text: "物流罢工结束，{g}运输恢复价格回落。", target: "ing", power: -0.6, dur: 45 },
    { id: "n15", text: "央行降息！楼市暖风频吹。", target: "property", power: 1, dur: 60 },
    { id: "n16", text: "限购新政传闻四起，购房者观望。", target: "property", power: -0.8, dur: 55 },
    { id: "n17", text: "城市新规划落地，核心地段看涨。", target: "property", power: 0.8, dur: 60 },
    { id: "n18", text: "收藏市场火热，古董拍卖频出天价。", target: "antique", power: 1, dur: 60 },
    { id: "n19", text: "拍卖行鉴出赝品风波，藏家趋于谨慎。", target: "antique", power: -0.9, dur: 55 },
    { id: "n20", text: "海外资本入场扫货顶级藏品。", target: "antique", power: 0.8, dur: 60 }
  ];

  /* ===== 称号阶梯 ===== */
  var TITLES = [
    { worth: 0,      name: "打工人" },
    { worth: 1e4,    name: "万元户" },
    { worth: 1e5,    name: "小老板" },
    { worth: 1e6,    name: "百万富翁" },
    { worth: 1e7,    name: "创业新贵" },
    { worth: 1e8,    name: "亿万富豪" },
    { worth: 1e9,    name: "行业巨擘" },
    { worth: 1e10,   name: "资本大鳄" },
    { worth: 1e11,   name: "商界传奇" },
    { worth: 1e12,   name: "世界首富" }
  ];

  var DATA = {
    FORMULA: FORMULA,
    QUALITIES: QUALITIES,
    INGREDIENTS: INGREDIENTS,
    INDUSTRIES: INDUSTRIES,
    STOCK_SECTORS: STOCK_SECTORS,
    STOCKS: STOCKS,
    PROPERTIES: PROPERTIES,
    ANTIQUES: ANTIQUES,
    SHOP: SHOP,
    NEWS: NEWS,
    TITLES: TITLES
  };

  global.EMPIRE_DATA = DATA;
})(typeof window !== "undefined" ? window : globalThis);
