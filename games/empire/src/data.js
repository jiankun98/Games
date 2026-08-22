/* 商业帝国（移动版）—— 纯配置数据（无逻辑）
 * 所有数值口径：
 *   - "游戏日"：1 游戏日 = 120 现实秒；分红/租金/便利店利润按游戏日结算
 *   - "每小时"：挂机 1 现实小时 = 3600 秒；8 家新公司按小时结算（tickHour）
 *   - 股价步进间隔 2s，房产/藏品价格步进间隔 5s（vol/drift 均为单步参数）
 */

/* ===== 全局公式与节奏常量 ===== */
export const FORMULA = {
  startCash: 31000,        // 开局现金：正好够开一家便利店，剩 1 千
  baseSalary: 30,         // 无产业时的打工保底（元/游戏日），防止开店前把钱亏光卡死
  gameDay: 120,            // 1 游戏日 = 120 现实秒（慢节奏总闸）
  offlineEff: 0.35,        // 离线收益效率
  hourDays: 30,          // 每现实小时 = 30 游戏日（= 3600/gameDay），每小时收益换算用
  hourTick: 3600,          // 新公司每小时结算周期（现实秒）
  offlineCap: 24 * 3600,   // 离线时长封顶（现实秒）
  offlineMinGap: 60,       // 超过该秒数才结算离线
  saveKey: "empire_save_v3",
  saveInterval: 5,         // 自动存档间隔（秒）
  stockStep: 2,            // 股价步进间隔（秒）
  stockClamp: 0.08,        // 股价单步涨跌上限 ±8%
  propStep: 5,             // 房产价格步进间隔（秒）
  itemStep: 5,             // 藏品价格步进间隔（秒）
  dayTick: 120,            // 游戏日结算周期（= gameDay）
  histLen: 150,            // 走势图保留点数
  newsMin: 45,             // 新闻最短间隔（秒）
  newsMax: 90,
  recordsMax: 100,         // 收支流水保留条数
  winTarget: 1e12,         // 万亿 → 登顶
  // 公司池/横切参数
  investTax: 0,            // 分红注资税率（当前免）
  ipoThreshold: 1e9,       // 上市净资产门槛 10 亿
  ipoRating: 4,            // 上市评级要求 A 级（索引 4）
  groupCount: 3,           // 组集团最低家数
  groupCostCut: 0.10,      // 集团成本 -10%
  groupBoost: 0.10,        // 集团收益 +10%
  groupMcapMul: 1.2,       // 集团市值溢价
  ipoInject: 0.50,         // IPO 注入净资产 50%
  issuePct: 0.10,          // 增发 = 市值 10% 现金
  issueMcapMul: 0.92,      // 增发后市值 ×0.92
  buybackPct: 0.90,        // 回购支付市值 90%
  liquidateAssetRate: 0.40, // 清算资产按 40% 拍卖
  auctionHours: 5,           // 拍卖款延迟到账上限（小时）；实际按拍卖款价值 1~5h 分档
  reputationDur: 168 * 3600, // 声誉 debuff 持续（现实秒）
  reputationPenalty: 0.10  // 开设费 +10%
};

/* ===== 税收机制（总览页累计展示） ===== */
export const TAX = {
  stamp: 0.001,        // 股票卖出印花税（按成交额）
  dividend: 0.10,      // 股息税
  deed: 0.015,         // 房产买入契税
  propertySale: 0.05,  // 房产卖出综合税（增值税+个税简化）
  rent: 0.10,          // 租金收入税
  consume: 0.03,       // 藏品买入消费税
  trade: 0.02,         // 藏品卖出交易税
  income: 0.25         // 产业所得税
};

export const TAX_META = [
  { key: "stamp",        name: "股票印花税" },
  { key: "dividend",     name: "股息税" },
  { key: "deed",         name: "房产契税" },
  { key: "propertySale", name: "房产交易税" },
  { key: "rent",         name: "租金税" },
  { key: "consume",      name: "奢侈品消费税" },
  { key: "trade",        name: "藏品交易税" },
  { key: "income",       name: "产业所得税" }
];

/* ===== 股票板块模板 =====
 * vol 单步波动 / drift 单步漂移 / div 每游戏日股息率
 */
export const STOCK_SECTORS = {
  tech:      { name: "科技", vol: 0.016, drift: 0.000035, div: 0.0005 },
  consume:   { name: "消费", vol: 0.012, drift: 0.000025, div: 0.0008 },
  pharma:    { name: "医药", vol: 0.014, drift: 0.000028, div: 0.0007 },
  energy:    { name: "能源", vol: 0.015, drift: 0.000020, div: 0.001 },
  finance:   { name: "金融", vol: 0.011, drift: 0.000018, div: 0.0012 },
  realestat: { name: "地产", vol: 0.013, drift: 0.000012, div: 0.0008 },
  military:  { name: "军工", vol: 0.015, drift: 0.000026, div: 0.0005 },
  industry:  { name: "工业", vol: 0.012, drift: 0.000020, div: 0.0009 },
  agri:      { name: "农业", vol: 0.014, drift: 0.000018, div: 0.0007 },
  media:     { name: "传媒", vol: 0.017, drift: 0.000030, div: 0.0003 },
  logistics: { name: "物流", vol: 0.012, drift: 0.000022, div: 0.0008 },
  utility:   { name: "公用", vol: 0.009, drift: 0.000012, div: 0.0014 },
  newenergy: { name: "新能源", vol: 0.018, drift: 0.000032, div: 0.0004 }
};

/* ===== 股票 45 支：国内 30 + 海外 15 =====
 * region: domestic 国内 / overseas 海外（引擎对海外叠加更高波动）
 * shares: 股本（亿股），市值 = 股价 × shares
 * cyc: 周期股（叠加 600s 景气周期）
 */
export const STOCKS = [
  /* ---- 国内 30 ---- */
  { id: "st01", name: "星辰科技",   region: "domestic", sector: "tech",      price0: 48,   volMul: 1.2, divMul: 0.6, shares: 68,   blurb: "云计算与人工智能基础设施龙头。" },
  { id: "st02", name: "量子芯动",   region: "domestic", sector: "tech",      price0: 92,   volMul: 1.4, divMul: 0.5, shares: 8,    blurb: "芯片设计公司，业绩随半导体周期大起大落。", cyc: true },
  { id: "st03", name: "云端漫步",   region: "domestic", sector: "tech",      price0: 26,   volMul: 1.1, divMul: 0.4, shares: 25,   blurb: "SaaS 服务商，订阅收入稳步爬升。" },
  { id: "st06", name: "科创先锋",   region: "domestic", sector: "tech",      price0: 8.5,  volMul: 1.6, divMul: 0.1, shares: 3,    blurb: "科创板次新股，波动剧烈。" },
  { id: "st07", name: "天工软件",   region: "domestic", sector: "tech",      price0: 37,   volMul: 0.8, divMul: 1.1, shares: 12,   blurb: "工业软件隐形冠军。" },
  { id: "st08", name: "蜂鸟互联",   region: "domestic", sector: "tech",      price0: 21,   volMul: 1.15, divMul: 0.5, shares: 40,  blurb: "移动互联网老兵转型 AI。" },
  { id: "sc01", name: "国民白酒",   region: "domestic", sector: "consume",   price0: 180,  volMul: 0.6, divMul: 1.4, shares: 125,  blurb: "高端白酒龙头，提价永动机。" },
  { id: "sc02", name: "喜甜食品",   region: "domestic", sector: "consume",   price0: 42,   volMul: 0.7, divMul: 1.3, shares: 60,   blurb: "糖果乳品巨头，需求刚性。" },
  { id: "sc03", name: "悦己美妆",   region: "domestic", sector: "consume",   price0: 33,   volMul: 1.1, divMul: 0.6, shares: 9,    blurb: "国货美妆当红炸子鸡。" },
  { id: "sc04", name: "鲜果集团",   region: "domestic", sector: "consume",   price0: 12,   volMul: 1.2, divMul: 0.8, shares: 30,   blurb: "生鲜连锁，利润被水果价格左右。" },
  { id: "sp01", name: "仁心制药",   region: "domestic", sector: "pharma",    price0: 68,   volMul: 0.7, divMul: 1.3, shares: 32,   blurb: "仿制药+创新药双轮驱动。" },
  { id: "sp02", name: "基因未来",   region: "domestic", sector: "pharma",    price0: 27,   volMul: 1.4, divMul: 0.2, shares: 6,    blurb: "基因编辑前沿，十年磨一剑。" },
  { id: "sp04", name: "百草中药",   region: "domestic", sector: "pharma",    price0: 19,   volMul: 0.9, divMul: 1.1, shares: 24,   blurb: "老字号中药，稳如老狗。" },
  { id: "se01", name: "巨无霸石油", region: "domestic", sector: "energy",    price0: 88,   volMul: 0.8, divMul: 1.5, shares: 1800, blurb: "桶油天下，分红慷慨。" },
  { id: "se02", name: "深蓝海油",   region: "domestic", sector: "energy",    price0: 24,   volMul: 1.2, divMul: 1.1, shares: 480,  blurb: "海上采油，油价敏感。" },
  { id: "se04", name: "煤炭巨人",   region: "domestic", sector: "energy",    price0: 16,   volMul: 1.3, divMul: 1.2, shares: 600,  blurb: "黑色金矿，周期剧烈。", cyc: true },
  { id: "sf01", name: "宇宙银行",   region: "domestic", sector: "finance",   price0: 32,   volMul: 0.5, divMul: 1.6, shares: 3200, blurb: "宇宙第一大行，股息率感人。" },
  { id: "sf02", name: "安福保险",   region: "domestic", sector: "finance",   price0: 74,   volMul: 0.7, divMul: 1.4, shares: 180,  blurb: "保险巨头，久期之王。" },
  { id: "sf03", name: "金牛证券",   region: "domestic", sector: "finance",   price0: 18,   volMul: 1.5, divMul: 0.7, shares: 90,   blurb: "牛市旗手，成交量放大器。", cyc: true },
  { id: "sf04", name: "信托控股",   region: "domestic", sector: "finance",   price0: 11,   volMul: 1.4, divMul: 0.9, shares: 55,   blurb: "影子银行，风起云涌。" },
  { id: "sf05", name: "消费金融",   region: "domestic", sector: "finance",   price0: 9.2,  volMul: 1.2, divMul: 0.6, shares: 40,   blurb: "分期生意，年轻人钱包收割机。" },
  { id: "sr01", name: "万家置业",   region: "domestic", sector: "realestat", price0: 14,   volMul: 1.3, divMul: 1.0, shares: 240,  blurb: "住宅开发龙头，政策敏感。" },
  { id: "sr02", name: "环球商业地产", region: "domestic", sector: "realestat", price0: 39, volMul: 0.8, divMul: 1.4, shares: 45,   blurb: "持有核心商圈收租。" },
  { id: "sm01", name: "苍穹航空",   region: "domestic", sector: "military",  price0: 57,   volMul: 0.8, divMul: 1.1, shares: 28,   blurb: "战机总装，国之重器。" },
  { id: "sm03", name: "星链防务",   region: "domestic", sector: "military",  price0: 68,   volMul: 1.3, divMul: 0.4, shares: 7,    blurb: "军事卫星网络新势力。" },
  { id: "sa01", name: "金穗种业",   region: "domestic", sector: "agri",      price0: 17,   volMul: 1.1, divMul: 0.8, shares: 26,   blurb: "种业安全担当。" },
  { id: "sa02", name: "牧原天下",   region: "domestic", sector: "agri",      price0: 28,   volMul: 1.3, divMul: 0.7, shares: 55,   blurb: "猪周期亲历者。", cyc: true },
  { id: "se03", name: "华夏电网",   region: "domestic", sector: "utility",   price0: 45,   volMul: 0.5, divMul: 1.6, shares: 900,  blurb: "电网垄断经营，类债资产。" },
  { id: "su01", name: "清泉水务",   region: "domestic", sector: "utility",   price0: 15,   volMul: 0.5, divMul: 1.5, shares: 300,  blurb: "自来水特许经营。" },
  { id: "sl01", name: "神行快递",   region: "domestic", sector: "logistics", price0: 35,   volMul: 0.8, divMul: 1.3, shares: 50,   blurb: "快递网络霸主。" },

  /* ---- 海外 15（整体高波动、低股息，引擎叠加区域系数） ---- */
  { id: "ov01", name: "环宇科技",   region: "overseas", sector: "tech",      price0: 220,  volMul: 0.9, divMul: 0.9, shares: 150,  blurb: "消费电子与生态帝国，现金奶牛。" },
  { id: "ov02", name: "星云搜索",   region: "overseas", sector: "tech",      price0: 175,  volMul: 1.1, divMul: 0.5, shares: 125,  blurb: "搜索与广告之王，AI 军备竞赛核心。" },
  { id: "ov03", name: "天穹智能",   region: "overseas", sector: "tech",      price0: 105,  volMul: 1.5, divMul: 0.1, shares: 24,   blurb: "算力卖铲人，涨起来没有天花板。", cyc: true },
  { id: "ov04", name: "电速车厂",   region: "overseas", sector: "newenergy", price0: 85,   volMul: 1.6, divMul: 0.0, shares: 32,   blurb: "电动车的信仰图腾，波动惊人。" },
  { id: "ov05", name: "元界社交",   region: "overseas", sector: "media",     price0: 62,   volMul: 1.3, divMul: 0.5, shares: 26,   blurb: "社交帝国押注元宇宙。" },
  { id: "ov06", name: "全球可乐",   region: "overseas", sector: "consume",   price0: 68,   volMul: 0.5, divMul: 1.6, shares: 215,  blurb: "快乐水配方印钞机，百年不倒。" },
  { id: "ov07", name: "咖啡王国",   region: "overseas", sector: "consume",   price0: 96,   volMul: 0.7, divMul: 1.4, shares: 115,  blurb: "全球咖啡连锁，成瘾性现金流。" },
  { id: "ov08", name: "雨林电商",   region: "overseas", sector: "logistics", price0: 185,  volMul: 1.2, divMul: 0.0, shares: 104,  blurb: "电商+云双引擎，不赚钱也要扩张。" },
  { id: "ov09", name: "花街投行",   region: "overseas", sector: "finance",   price0: 410,  volMul: 1.1, divMul: 1.0, shares: 32,   blurb: "顶级投行，牛市印钞机。", cyc: true },
  { id: "ov10", name: "雄鹰银行",   region: "overseas", sector: "finance",   price0: 230,  volMul: 0.7, divMul: 1.5, shares: 285,  blurb: "零售银行巨擘，息差之王。" },
  { id: "ov11", name: "黑金能源",   region: "overseas", sector: "energy",    price0: 115,  volMul: 0.8, divMul: 1.5, shares: 400,  blurb: "百年石油巨头，分红机器。" },
  { id: "ov12", name: "辉光制药",   region: "overseas", sector: "pharma",    price0: 48,   volMul: 0.8, divMul: 1.3, shares: 560,  blurb: "创新药+疫苗双料巨头。" },
  { id: "ov13", name: "猎鹰航天",   region: "overseas", sector: "military",  price0: 310,  volMul: 1.4, divMul: 0.0, shares: 8,    blurb: "可回收火箭开创者，星辰大海。" },
  { id: "ov14", name: "流光影音",   region: "overseas", sector: "media",     price0: 78,   volMul: 1.4, divMul: 0.3, shares: 42,   blurb: "流媒体订阅霸主，内容军备赛。" },
  { id: "ov15", name: "环球度假",   region: "overseas", sector: "media",     price0: 105,  volMul: 0.9, divMul: 1.1, shares: 180,  blurb: "乐园与影视王国，贩卖快乐。" }
];

/* ===== 房产 10 种：国内 7 + 海外 3 =====
 * yield: 每游戏日租金率；价格夹在基准 0.5~12 倍间慢波动
 */
export const PROPERTIES = [
  { id: "p1",  name: "老破小",       region: "domestic", price: 50000,     vol: 0.0020, drift: 0.00018, yield: 0.0010, icon: "🏘️", desc: "地段尚可的老公房，租金回报率高。" },
  { id: "p2",  name: "城郊公寓",     region: "domestic", price: 260000,    vol: 0.0022, drift: 0.00020, yield: 0.0009, icon: "🏢", desc: "地铁末端的年轻人们。" },
  { id: "p3",  name: "学区房",       region: "domestic", price: 1300000,   vol: 0.0028, drift: 0.00022, yield: 0.0007, icon: "🎓", desc: "政策风向标，胆大者的游戏。" },
  { id: "p4",  name: "江景大平层",   region: "domestic", price: 5600000,   vol: 0.0030, drift: 0.00025, yield: 0.0006, icon: "🌇", desc: "一线江景，豪宅标杆。" },
  { id: "p5",  name: "山间别墅",     region: "domestic", price: 24000000,  vol: 0.0032, drift: 0.00026, yield: 0.0005, icon: "🏡", desc: "稀缺山水资源。" },
  { id: "p6",  name: "甲级写字楼",   region: "domestic", price: 90000000,  vol: 0.0035, drift: 0.00028, yield: 0.0007, icon: "🏬", desc: "CBD 现金流压舱石。" },
  { id: "p7",  name: "购物中心",     region: "domestic", price: 360000000, vol: 0.0038, drift: 0.00030, yield: 0.0007, icon: "🛍️", desc: "商圈之王的租金帝国。" },
  { id: "p8",  name: "曼哈顿阁楼",   region: "overseas", price: 120000000, vol: 0.0033, drift: 0.00027, yield: 0.0005, icon: "🌃", desc: "世界十字路口的天际线资产。" },
  { id: "p9",  name: "银座商铺",     region: "overseas", price: 450000000, vol: 0.0036, drift: 0.00029, yield: 0.0019, icon: "🏮", desc: "东京核心商圈，寸土寸金。" },
  { id: "p10", name: "私人海岛",     region: "overseas", price: 1800000000, vol: 0.0045, drift: 0.00032, yield: 0.0004, icon: "🏝️", desc: "顶级富豪的社交名片。" }
];

/* ===== 购物藏品 5 类 32 件（低买高卖赚差价，长线正漂移增值） ===== */
export const COLLECT_CATS = [
  { id: "car",     name: "汽车", icon: "🚗" },
  { id: "plane",   name: "飞机", icon: "✈️" },
  { id: "yacht",   name: "游艇", icon: "🛥️" },
  { id: "antique", name: "古董", icon: "🏺" },
  { id: "luxury",  name: "名牌", icon: "💎" }
];

export const COLLECTIBLES = [
  /* 汽车 7 */
  { id: "c01", cat: "car", name: "城市代步车",   price: 80000,     vol: 0.030, drift: 0.00050, desc: "通勤刚需，保值一般。" },
  { id: "c02", cat: "car", name: "性能轿跑",     price: 600000,    vol: 0.035, drift: 0.00055, desc: "年轻人的第一台大玩具。" },
  { id: "c03", cat: "car", name: "豪华行政座驾", price: 1500000,   vol: 0.038, drift: 0.00060, desc: "后座老板的移动会客厅。" },
  { id: "c04", cat: "car", name: "超级跑车",     price: 4800000,   vol: 0.042, drift: 0.00065, desc: "引擎声浪就是硬通货。" },
  { id: "c05", cat: "car", name: "限量 Hypercar", price: 24000000, vol: 0.048, drift: 0.00075, desc: "全球限量，配额比车难抢。" },
  { id: "c06", cat: "car", name: "古典赛车",     price: 60000000,  vol: 0.055, drift: 0.00085, desc: "勒芒老传奇，拍卖会常客。" },
  { id: "c07", cat: "car", name: "F1 冠军战车",  price: 240000000, vol: 0.065, drift: 0.00100, desc: "世界冠军驾驶过的巅峰机器。" },
  /* 飞机 5 */
  { id: "f01", cat: "plane", name: "私人螺旋桨机", price: 5000000,    vol: 0.035, drift: 0.00055, desc: "通航入门，飞行梦起点。" },
  { id: "f02", cat: "plane", name: "轻型公务机",   price: 35000000,   vol: 0.040, drift: 0.00065, desc: "湾流入门款，商务利器。" },
  { id: "f03", cat: "plane", name: "中型公务机",   price: 120000000,  vol: 0.045, drift: 0.00075, desc: "跨洲直飞，卧室会议室俱全。" },
  { id: "f04", cat: "plane", name: "大型公务机",   price: 450000000,  vol: 0.050, drift: 0.00085, desc: "BBJ 级别，空中行宫。" },
  { id: "f05", cat: "plane", name: "私人宽体客机", price: 1200000000, vol: 0.058, drift: 0.00100, desc: "把整条国际航线搬回家。" },
  /* 游艇 5 */
  { id: "y01", cat: "yacht", name: "小型游艇",     price: 3000000,    vol: 0.033, drift: 0.00052, desc: "周末出海，社交起步。" },
  { id: "y02", cat: "yacht", name: "运动游艇",     price: 15000000,   vol: 0.038, drift: 0.00062, desc: "摩纳哥港口的入场券。" },
  { id: "y03", cat: "yacht", name: "豪华游艇",     price: 60000000,   vol: 0.044, drift: 0.00072, desc: "直升机坪加派对甲板。" },
  { id: "y04", cat: "yacht", name: "超级游艇",     price: 350000000,  vol: 0.052, drift: 0.00088, desc: "百米巨舰，船东晚宴传说。" },
  { id: "y05", cat: "yacht", name: "船王巨舰",     price: 1500000000, vol: 0.060, drift: 0.00105, desc: " floating palace，海上主权象征。" },
  /* 古董 8 */
  { id: "a01", cat: "antique", name: "陈年茅台",   price: 600000,     vol: 0.050, drift: 0.00060, desc: "液体黄金，越放越香。" },
  { id: "a02", cat: "antique", name: "青花瓷瓶",   price: 800000,     vol: 0.060, drift: 0.00080, desc: "元青花残件也价值连城。" },
  { id: "a03", cat: "antique", name: "名家字画",   price: 3200000,    vol: 0.070, drift: 0.00100, desc: "纸绢千年，墨韵无价。" },
  { id: "a04", cat: "antique", name: "和田玉摆件", price: 10000000,   vol: 0.065, drift: 0.00090, desc: "君子如玉，温润而泽。" },
  { id: "a05", cat: "antique", name: "青铜爵",     price: 60000000,   vol: 0.075, drift: 0.00110, desc: "商周礼器，博物馆级。" },
  { id: "a06", cat: "antique", name: "珍邮全集",   price: 150000000,  vol: 0.070, drift: 0.00100, desc: "方寸之间，一版八十万。" },
  { id: "a07", cat: "antique", name: "帝王翡翠",   price: 320000000,  vol: 0.072, drift: 0.00105, desc: "传世老坑玻璃种。" },
  { id: "a08", cat: "antique", name: "璀璨粉钻",   price: 1200000000, vol: 0.080, drift: 0.00120, desc: "稀有彩钻，硬通货之王。" },
  /* 名牌 7 */
  { id: "l01", cat: "luxury", name: "经典名表",     price: 150000,    vol: 0.035, drift: 0.00050, desc: "瑞士机芯，入门收藏。" },
  { id: "l02", cat: "luxury", name: "稀缺铂金包",   price: 450000,    vol: 0.040, drift: 0.00058, desc: "配货制度的终极奖励。" },
  { id: "l03", cat: "luxury", name: "高定珠宝",     price: 2800000,   vol: 0.048, drift: 0.00070, desc: "红毯上的高光时刻。" },
  { id: "l04", cat: "luxury", name: "复杂功能怀表", price: 9000000,   vol: 0.052, drift: 0.00078, desc: "三问陀飞轮，腕间天文台。" },
  { id: "l05", cat: "luxury", name: "皇家珠宝冠冕", price: 68000000,  vol: 0.060, drift: 0.00092, desc: "欧洲旧王室的传世遗珍。" },
  { id: "l06", cat: "luxury", name: "传奇拍卖名钻", price: 380000000, vol: 0.068, drift: 0.00108, desc: "拍卖行纪录保持者。" },
  { id: "l07", cat: "luxury", name: "大师联名系列", price: 1600000000, vol: 0.075, drift: 0.00115, desc: "艺术与工艺的终极联名。" }
];

/* ===== 评级体系（全部产业统一，E~SSS 八级） =====
 * RATING_THRESHOLDS[i] 为升到 i+1 级（D..SSS）所需的累计净利润
 */
export const RATING_NAMES = ["E", "D", "C", "B", "A", "S", "SS", "SSS"];
export const RATING_THRESHOLDS = [1e6, 1e7, 1e8, 1e9, 1e10, 5e10, 2e11]; // 100W,1000W,1亿,10亿,100亿,500亿,2000亿

/* ===== 产业类型配置（9 类公司：便利店 + PRD 8 家） =====
 * 通用口径：
 *   - 便利店走游戏日结算、利润直进主账户（零风险入门）
 *   - 8 家新公司按小时结算（tickHour，1 现实小时 = 3600 秒），
 *     收支走独立公司现金池 st.treasury，池空停摆、注资恢复
 *   - 评级 E~SSS 通用：累计净利润达 [100万,1000万,1亿,10亿,100亿,500亿,2000亿] 升档
 *   - 各公司内部清单（载具/车型/项目/品牌/作品）统一 30 项，费用阶梯式
 *     几何递增，收益锚定回本周期：入门档 ~25 现实小时、高端档 ~80 现实小时
 */

/* ---------- 30 项阶梯清单生成工具 ---------- */
// i(0..29) -> 评级档 0(E)..7(SSS)，每 4 项一档
function tierOf(i) { return Math.min(7, Math.floor(i / 4)); }
// 几何递增费用：从 p0 到 p1 共 30 档
function geoPrice(i, p0, p1) {
  const r = Math.pow(p1 / p0, 1 / 29);
  return Math.round(p0 * Math.pow(r, i));
}
// 回本周期率：入门 h0 小时回本 -> 高端 h1 小时回本（指数空间线性）
function paybackRate(i, h0 = 25, h1 = 80) {
  const r = Math.pow(1 / h1 / (1 / h0), 1 / 29);
  return (1 / h0) * Math.pow(r, i);
}
// 几何递增周期：t0 -> t1
function geoCycle(i, t0, t1) {
  const r = Math.pow(t1 / t0, 1 / 29);
  return Math.round(t0 * Math.pow(r, i));
}

/* ---------- 快递：30 台载具/货机 ---------- */
const EXPRESS_NAMES = [
  "电动三轮", "微型面包", "厢式微货", "轻卡", "皮卡配送", "4.2米厢车", "依维柯", "7.6米中卡",
  "9.6米重卡", "冷藏中卡", "冷链挂车", "高栏重卡", "自卸车", "油罐车", "集装箱卡", "智能无人车",
  "氢能重卡", "跨境全挂", "涡桨货机", "轻型货机", "中型货机", "大型货机", "重型货机", "喷气式货机",
  "超音速货机", "双翼货机", "宽体货机", "航空货站", "物流母舰", "星际驿站"
];
export const EXPRESS_FLEET = EXPRESS_NAMES.map((n, i) => {
  const cost = geoPrice(i, 1e4, 5e7);
  const miles = geoCycle(i, 100, 500);
  return {
    id: "ex" + (i + 1), name: n, rating: tierOf(i), kind: i >= 18 ? "plane" : "vehicle",
    cost, incomePerHour: Math.round(cost * paybackRate(i, 30, 80)),
    maxHours: miles, repairCost: Math.round(cost * 0.10),
    repairHours: geoCycle(i, 1, 5)   // 维修时长按价值 1~5h（上限 5h）
  };
});
for (const v of EXPRESS_FLEET) v.unlocked = v.rating;

/* ---------- 租车：30 款车型（时租） ---------- */
const RENTAL_NAMES = [
  "奇瑞QQ", "比亚迪F3", "五菱宏光", "长安之星", "吉利帝豪", "比亚迪秦", "本田飞度", "丰田威驰",
  "大众捷达", "日产轩逸", "大众朗逸", "本田思域", "丰田卡罗拉", "丰田凯美瑞", "大众迈腾", "本田雅阁",
  "奥迪A4L", "宝马3系", "奔驰C级", "凯迪拉克CT6", "奥迪A6L", "宝马5系", "奔驰E级", "保时捷卡宴",
  "路虎揽胜", "保时捷911", "迈凯伦GT", "法拉利F8", "兰博基尼大牛", "劳斯莱斯幻影"
];
export const RENTAL_FLEET = RENTAL_NAMES.map((n, i) => {
  const cost = geoPrice(i, 5e4, 8e7);
  return {
    id: "rt" + (i + 1), name: n, rating: tierOf(i),
    cost, incomePerHour: Math.round(cost * paybackRate(i, 28, 75)),
    maxHours: 200, repairCost: Math.round(cost * 0.15), repairHours: geoCycle(i, 1, 5)
  };
});

/* ---------- 房地产开发：30 个项目 ---------- */
const ESTATE_NAMES = [
  "基础楼盘", "品质楼盘", "精装公寓", "大平层", "联排别墅", "独栋别墅", "高层住宅", "花园洋房",
  "商务公寓", "江景豪宅", "山间别墅", "商业综合体", "写字楼", "产业园区", "度假酒店", "甲级写字楼",
  "城市地标", "摩天大楼", "天际线大厦", "智慧城邦", "生态新城", "中央商务区", "滨江都会", "未来社区",
  "湾区新城", "超级综合体", "云顶公寓", "填海大都会", "天空之城", "星际城邦"
];
const RE_WAGE = 5e4;   // 建筑队工资（元/时/队），与 INDUSTRY_TYPES.realestate.teamWage 一致
export const ESTATE_PROJECTS = ESTATE_NAMES.map((n, i) => {
  const cost = geoPrice(i, 5e5, 1e10);
  const teams = 1 + Math.floor(i / 5);                   // 所需建筑队 1->7
  // 压缩等待（周期 1~5h，上限 5h）但保持原校准的每小时利润：
  // 回款 = 成本 + 新周期工资 + 原每小时利润 × 新周期（回本锚不变）
  const cycleOld = geoCycle(i, 12, 360);
  const marginOld = 4.2 - 0.8 * (i / 29);
  const profitPerHour = (cost * marginOld - cost - teams * RE_WAGE * cycleOld) / cycleOld;
  const cycle = geoCycle(i, 1, 5);                       // 建筑周期（小时）
  return {
    id: "es" + (i + 1), name: n, rating: tierOf(i),
    cost, cycle, totalIncome: Math.round(cost + teams * RE_WAGE * cycle + profitPerHour * cycle),
    teams,
    unlockRating: tierOf(i)
  };
});

/* ---------- 汽车经销商：30 个品牌（残值/售价） ---------- */
const DEALER_NAMES = [
  "五菱宏光", "长安之星", "东风小康", "比亚迪秦", "吉利帝豪", "奇瑞瑞虎", "大众朗逸", "丰田卡罗拉",
  "本田思域", "日产天籁", "别克君威", "大众帕萨特", "宝马3系", "奔驰C级", "奥迪A4L", "路虎揽胜",
  "保时捷卡宴", "保时捷911", "迈凯伦GT", "阿斯顿马丁", "法拉利F8", "兰博基尼", "劳斯莱斯古思特",
  "宾利飞驰", "布加迪威龙", "柯尼塞格", "帕加尼风神", "西尔贝Tuatara", "布加迪Chiron", "柯尼塞格Regera"
];
export const DEALER_BRANDS = DEALER_NAMES.map((n, i) => {
  const resale = geoPrice(i, 2e4, 3e7);
  const markup = 3.0 - 1.5 * (i / 29);              // 差价率 3 -> 1.5
  return {
    id: "db" + (i + 1), name: n, rating: tierOf(i),
    resale, sellPrice: Math.round(resale * markup),
    repairMul: 2.5 + 0.5 * tierOf(i),              // 维修时长 = 损耗 x (2.5+档位x0.5)，最长 4.8h
    unlockRating: tierOf(i)
  };
});

/* ---------- 信息技术：30 个作品项目 ---------- */
const IT_NAMES = [
  "个人博客", "小程序", "单机游戏", "门户网站", "在线教育", "电商平台", "社交平台", "直播平台",
  "短视频平台", "垂直电商", "网络游戏", "MMO网游", "SaaS系统", "大数据平台", "云服务", "AI应用",
  "自动驾驶系统", "芯片设计", "量子计算", "脑机接口", "元宇宙平台", "航天控制系统", "超级AI",
  "太空互联网", "曲率引擎计算", "反物质能源", "意识上传", "虚拟世界", "星际操作系统", "宇宙级AI"
];
export const IT_PROJECTS = IT_NAMES.map((n, i) => {
  const cost = geoPrice(i, 2e5, 1e10);
  const cycle = geoCycle(i, 1, 5);                  // 研发周期（小时，上限 5h；运营收益不变）
  const opHours = geoCycle(i, 24, 300);             // 运营周期上限（小时）
  const roi = 3.6 - 1.0 * (i / 29);                 // 总回报 3.6 -> 2.6 倍
  return {
    id: "it" + (i + 1), name: n, rating: tierOf(i),
    cost, cycle, opHours,
    incomePerHour: Math.round(cost * roi / opHours),
    decayIncome: Math.round(cost * roi / opHours * 0.10), // 过时后 10%
    pmAbility: Math.round(10 + (i / 29) * 990),     // PM 能力要求 10->1000
    team: [1 + Math.floor(i / 4), Math.floor(i / 6), Math.floor(i / 8)] // 程/设/测
  };
});

/* ===== 公司类型配置 =====
 * cstore：便利店（零风险，直进主账户）
 * 其余 8 家：独立公司池 st.treasury，每小时结算
 */
export const INDUSTRY_TYPES = [
  {
    id: "cstore",
    name: "便利店",
    icon: "🏪",
    color: "green",
    openCost: 30000,
    maxStores: 1000,
    storeIncome: 180,      // 单店收益基准（元/游戏日，税前；税后135/日=4050/现实小时）
    costSlope: 0.18,       // 门店成本线性涨幅
    milestones: [
      { stores: 10,   bonus: 0.10 },
      { stores: 50,   bonus: 0.15 },
      { stores: 100,  bonus: 0.20 },
      { stores: 500,  bonus: 0.25 },
      { stores: 1000, bonus: 0.30 }
    ],
    ratingText: "评级由门店规模里程碑驱动（非累计利润），每升 1 级营收 +5%",
    desc: "灯火通明的社区堡垒。3 万开设，逐步扩张门店网络，规模越大单店收益越高。"
  },

  /* ---------- 快递公司（20 万） ---------- */
  {
    id: "express",
    name: "快递公司",
    icon: "🚚",
    color: "orange",
    openCost: 20e4,
    fleet: EXPRESS_FLEET,
    slots: { vehicle: 5, plane: 1 },
    slotCost: { vehicle: 100e4, plane: 5000e4 },
    slotHours: { vehicle: 1, plane: 4 },   // 建造时长上限 5h
    ratingText: "评级按累计净利润：解锁更高档载具",
    desc: "买载具自动产金，里程满需维修。20 万开设，5 车位 1 机位起步，先跑三轮，再上重卡，最后航空母舰。"
  },

  /* ---------- 银行（50 万） ---------- */
  {
    id: "bank",
    name: "银行",
    icon: "🏦",
    color: "gold",
    openCost: 50e4,
    depositRate: [0.01, 0.10],   // 存款利率范围
    loanRate: [0.05, 0.20],      // 贷款利率范围
    vaultBase: 100e4,            // 金库初始上限 100 万（升级驱动存款规模）
    vaultUpgradeRate: 0.30,      // 升级费 = 当前上限 30%（容量 x1.5）
    ratingText: "评级按累计净利润：解锁更高金库上限",
    desc: "低存高贷赚息差。50 万开设，双利率滑杆自由定价——利率错配会每小时净亏，公司池会亏穿停摆。"
  },

  /* ---------- 租车公司（100 万） ---------- */
  {
    id: "rental",
    name: "租车公司",
    icon: "🚗",
    color: "blue",
    openCost: 100e4,
    fleet: RENTAL_FLEET,
    garageBase: 10,
    garageCost: 50e4,            // 车库扩容 50 万/槽
    ratingText: "评级按累计净利润：解锁更高档车型",
    desc: "只租不卖，按时计费。100 万开设，车库 10 槽起步，车型从奇瑞 QQ 到劳斯莱斯幻影。"
  },

  /* ---------- 房地产开发公司（500 万） ---------- */
  {
    id: "realestate",
    name: "房地产",
    icon: "🏗️",
    color: "red",
    openCost: 500e4,
    teamBase: 1, teamMax: 10,
    teamCost: (n) => 100e4 * Math.pow(n, 2),   // 第 n+1 个建筑队费用
    teamWage: 5e4,                             // 忙队 5 万/时
    projects: ESTATE_PROJECTS,
    ratingText: "评级按累计净利润：解锁更高档项目",
    desc: "盖楼卖楼。500 万开设，1 个建筑队起步，忙队才发工资 5 万/时，选对项目周期到售楼回款。"
  },

  /* ---------- 汽车经销商（2000 万） ---------- */
  {
    id: "dealer",
    name: "汽车经销商",
    icon: "🚘",
    color: "purple",
    openCost: 2000e4,
    brands: DEALER_BRANDS,
    workshopBase: 2, stallBase: 2,
    workshopCost: 200e4, stallCost: 100e4,
    spawnPerHour: 3,                             // 每小时刷 3 辆二手车
    repairWageRate: 0.015,                      // 维修时薪 = 品牌残值 x 1.5%（低档车不再修亏）
    workshopCostPerHour: 1e4,                    // 维修车间 1 万/时
    ratingText: "评级按累计净利润：刷出高级别车辆概率提升",
    desc: "低价收车修好高价卖。2000 万开设，每小时刷 3 辆二手车，损耗 30%~80%，修错车、压库就是亏。"
  },

  /* ---------- 信息技术公司（1 亿） ---------- */
  {
    id: "itcorp",
    name: "信息技术",
    icon: "💻",
    color: "teal",
    openCost: 1e8,
    projects: IT_PROJECTS,
    pmWageMul: 0.05e4,        // PM 工资 = 能力 x 0.05 万/时
    staffWage: 0.1e4,         // 程/设/测 0.1 万/时/人
    layoffMul: 5,             // 解雇赔偿 5 倍时薪
    ratingText: "评级按累计净利润：解锁更高档项目",
    desc: "雇团队做产品，运营期收租，过时收益衰减。1 亿开设，研发四节点随机事件，失败即沉没。"
  },

  /* ---------- 石油能源公司（10 亿） ---------- */
  {
    id: "oil",
    name: "石油能源",
    icon: "🛢️",
    color: "brown",
    openCost: 1e9,
    exploreCost: 100e4,        // 勘探 100 万/次
    exploreChance: 0.30,       // 30% 出油
    platformCost: 1000e4,      // 钻井平台 1000 万
    platformOutput: 1000,      // 1000 桶/时（对齐 PRD）
    platformMaintain: 2e4,     // 维护 2 万/时（不论产出）
    moveCostPerHour: 200e4,    // 枯竭搬运费 200 万/时
    refineryCost: 5000e4,      // 炼油厂 5000 万，利润翻倍
    refineryCapacity: 5000,    // 5000 桶/时
    oilPriceMin: 50, oilPriceMax: 150,
    oilPricePeriod: 4,         // 每 4 小时波动（上限 5h）
    tankBase: 10e4,            // 初始储油罐容量（桶）
    ratingText: "评级按累计净利润：解锁更大储油罐",
    desc: "勘探赌博 + 平台开采 + 油价套利。10 亿开设，勘探 30% 出油，70% 打水漂，维护费不论产出照扣。"
  },

  /* ---------- 俱乐部（50 亿，最简可行） ---------- */
  {
    id: "club",
    name: "俱乐部",
    icon: "⚽",
    color: "green",
    openCost: 5e9,
    academyCost: 1000e4,       // 青训营升级 1000 万/级
    academyCycle: 4,           // 青训 4 小时产 1 员（上限 5h）
    matchBonusBase: 100e4,     // 训练赛胜场奖金 = 评级系数 x 100 万
    sponsorBase: 50e4,         // 赞助基础 50 万/时 x (1+总能力/100)
    sponsorTop: 1000e4,        // 顶级赞助 1000 万/时
    stadiumRep: [200, 1000, 5000, 2e4, 1e5, 5e5, 2e6],    // 声望阈值解锁体育场（门票收入）
    stadiumIncome: [10e4, 30e4, 100e4, 300e4, 1000e4, 3000e4, 1e8], // 每小时门票
    ratingText: "评级按声望：解锁更大体育场",
    desc: "青训+转会+赛事变现。50 亿开设，球员能力 1-100，身价=能力x10 万、工资=能力x0.1 万/时，战绩差时工资高于收入即持续失血。"
  }
];


/* ===== 新闻事件池（驱动市场短线波动） ===== */
export const NEWS = [
  { id: "n01", text: "{s}发布革命性新品，订单排到明年！", target: "stock", power: 1.0, dur: 45 },
  { id: "n02", text: "机构调研密集，{s}被一致看多。", target: "stock", power: 0.8, dur: 40 },
  { id: "n03", text: "{s}业绩超预期，宣布提高分红。", target: "stock", power: 0.9, dur: 40 },
  { id: "n04", text: "北向资金大举买入{s}。", target: "stock", power: 0.7, dur: 35 },
  { id: "n05", text: "{s}被立案调查，股价承压。", target: "stock", power: -1.0, dur: 45 },
  { id: "n06", text: "{s}大股东减持公告引发抛售。", target: "stock", power: -0.8, dur: 40 },
  { id: "n07", text: "分析师下调{s}评级至卖出。", target: "stock", power: -0.7, dur: 35 },
  { id: "n08", text: "央行降息！楼市暖风频吹。", target: "prop", power: 1.0, dur: 60 },
  { id: "n09", text: "限购新政传闻四起，购房者观望。", target: "prop", power: -0.8, dur: 55 },
  { id: "n10", text: "城市新规划落地，核心地段看涨。", target: "prop", power: 0.8, dur: 60 },
  { id: "n11", text: "收藏市场火热，古董拍卖频出天价。", target: "item:antique", power: 1.0, dur: 60 },
  { id: "n12", text: "拍卖行鉴出赝品风波，藏家趋于谨慎。", target: "item:antique", power: -0.9, dur: 55 },
  { id: "n13", text: "超跑交付周期延长，行情水涨船高。", target: "item:car", power: 0.9, dur: 60 },
  { id: "n14", text: "公务机订单排到三年后。", target: "item:plane", power: 0.9, dur: 60 },
  { id: "n15", text: "顶级游艇船位一位难求。", target: "item:yacht", power: 0.9, dur: 60 },
  { id: "n16", text: "奢侈品巨头宣布年度涨价。", target: "item:luxury", power: 1.0, dur: 60 },
  /* 公司经营事件：产业结算利润增益/减益（indBoost/indCut，对全部公司生效） */
  { id: "n17", text: "电商大促爆仓，快递运力紧张量价齐升！", target: "indBoost", power: 0.15, dur: 180 },
  { id: "n18", text: "楼市新政落地，开发商回款全面加速。", target: "indBoost", power: 0.15, dur: 180 },
  { id: "n19", text: "国际油价暴跌，能源公司利润承压。", target: "indCut", power: 0.15, dur: 180 },
  { id: "n20", text: "监管收紧，金融行业息差显著收窄。", target: "indCut", power: 0.15, dur: 180 },
  { id: "n21", text: "全民爆款刷屏，科技产品卖断了货！", target: "indBoost", power: 0.20, dur: 180 },
  { id: "n22", text: "夺冠热潮席卷全城，俱乐部生意火爆！", target: "indBoost", power: 0.20, dur: 180 },
  { id: "n23", text: "极端天气冲击供应链，各行业成本上升。", target: "indCut", power: 0.12, dur: 180 }
];

/* ===== 称号阶梯（万亿以上继续延伸） ===== */
export const TITLES = [
  { worth: 0,      name: "打工人" },
  { worth: 1e4,    name: "万元户" },
  { worth: 1e5,    name: "小老板" },
  { worth: 1e6,    name: "百万富翁" },
  { worth: 1e7,    name: "创业新贵" },
  { worth: 1e8,    name: "亿万富豪" },
  { worth: 1e9,    name: "行业巨擘" },
  { worth: 1e10,   name: "资本大鳄" },
  { worth: 1e11,   name: "商界传奇" },
  { worth: 1e12,   name: "世界首富" },
  { worth: 1e13,   name: "财阀领袖" },
  { worth: 1e14,   name: "星际资本" },
  { worth: 1e15,   name: "宇宙首富" }
];
