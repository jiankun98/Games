/* 赵云与阿斗 —— 数值与配置表（纯数据，无逻辑）
 * 浏览器与 node（run/test-zhaoyun.js 模拟）共用。
 */
(function (global) {
  "use strict";

  var DATA = {};

  /* ==================== 品质 ==================== */
  DATA.QUALITY = {
    gold:   { name: "金", color: "#c9a227", atkMul: 2.0, atkSpeedMul: 1.15, rangeMul: 1.15, charWeight: 0.5 },
    purple: { name: "紫", color: "#7b4ea3", atkMul: 1.7, atkSpeedMul: 1.10, rangeMul: 1.08, charWeight: 1.0 },
    blue:   { name: "蓝", color: "#3d6aa8", atkMul: 1.4, atkSpeedMul: 1.05, rangeMul: 1.04, charWeight: 1.6 },
    green:  { name: "绿", color: "#2f8f5b", atkMul: 1.2, atkSpeedMul: 1.00, rangeMul: 1.00, charWeight: 2.2 }
  };

  /* ==================== 兵种（防御塔） ====================
   * type 攻击方式:
   *   melee  近战单体（快攻）
   *   pierce 直线穿透（命中弹道线上所有敌人）
   *   splash 小范围溅射
   *   snipe  远程单体高伤
   */
  DATA.TROOPS = {
    dao:   { id: "dao",   ch: "刀", name: "刀兵", type: "melee",  range: 115, atkCd: 0.85, atk: 9,  projectile: "slash" },
    qiang: { id: "qiang", ch: "枪", name: "枪兵", type: "pierce", range: 160, atkCd: 1.15, atk: 11, projectile: "thrust" },
    jian:  { id: "jian",  ch: "剑", name: "剑士", type: "splash", range: 140, atkCd: 1.25, atk: 10, splash: 58, projectile: "arc" },
    gong:  { id: "gong",  ch: "弓", name: "弓手", type: "snipe",  range: 235, atkCd: 1.75, atk: 19, projectile: "arrow" }
  };

  /* 等级成长（1~7 级） */
  DATA.LEVEL_MAX = 7;
  DATA.TROOP_ATK_GROWTH = 0.55;   // 每级攻击 +55%
  DATA.TROOP_CD_GROWTH = 0.95;    // 每级攻速间隔 ×0.95
  DATA.GENERAL_EXP_KILLS = 18;    // 武将每击杀 N 个敌人升 1 级

  /* ==================== 武将（16 名：魏蜀吴） ====================
   * chars: 激活所需碎片字（顺序无关，同场即提示拼合）
   * skill.type 由引擎统一执行:
   *   stun / arrowRain / dashPath / leapSmash / holyBlade / sprint /
   *   tyrant / assault / berserk / slam / breakthrough / fireSea /
   *   rapidShot / walling / raidDash / sacrifice
   */
  DATA.GENERALS = [
    /* ---- 蜀 ---- */
    { id: "zhaoyun",  name: "赵云",   chars: ["赵", "云"], faction: "shu", troop: "qiang", quality: "gold",
      skill: { name: "七进七出", type: "dashPath",  cd: 15, value: 3.2, desc: "沿路径来回突进，对全路径敌人造成重创" } },
    { id: "huangzhong", name: "黄忠", chars: ["黄", "忠"], faction: "shu", troop: "gong", quality: "gold",
      skill: { name: "火箭烈",   type: "arrowRain", cd: 14, value: 2.6, count: 8, desc: "万箭齐发，全屏箭雨轰炸" } },
    { id: "guanyu",   name: "关羽",   chars: ["关", "羽"], faction: "shu", troop: "dao", quality: "purple",
      skill: { name: "青龙跳劈", type: "leapSmash", cd: 12, value: 4.5, splash: 90, knock: 70, desc: "跃起猛劈最前之敌，击退并溅射" } },
    { id: "zhangfei", name: "张飞",   chars: ["张", "飞"], faction: "shu", troop: "dao", quality: "purple",
      skill: { name: "当阳咆哮", type: "stun",      cd: 16, value: 2.0, dmg: 1.2, desc: "一声怒喝，全屏敌人眩晕" } },
    { id: "liubei",   name: "刘备",   chars: ["刘", "备"], faction: "shu", troop: "jian", quality: "purple",
      skill: { name: "圣剑",     type: "holyBlade", cd: 15, value: 1.8, buff: 0.25, dur: 8, desc: "圣剑落域击倒敌军，全军攻速大增" } },
    { id: "machao",   name: "马超",   chars: ["马", "超"], faction: "shu", troop: "qiang", quality: "green",
      skill: { name: "锦马冲刺", type: "sprint",    cd: 11, value: 2.2, desc: "策马突袭中程之敌" } },
    /* ---- 魏 ---- */
    { id: "caocao",   name: "曹操",   chars: ["曹", "操"], faction: "wei", troop: "jian", quality: "gold",
      skill: { name: "乱世奸雄", type: "tyrant",    cd: 16, value: 1.8, debuff: 0.25, dur: 8, desc: "雄图天下，全屏伤害并令敌军脆弱" } },
    { id: "zhangliao", name: "张辽", chars: ["张", "辽"], faction: "wei", troop: "qiang", quality: "purple",
      skill: { name: "威震逍遥津", type: "assault", cd: 13, value: 2.8, slow: 0.35, dur: 3, desc: "突袭直进，令全军恐惧减速" } },
    { id: "xuchu",    name: "许褚",   chars: ["许", "褚"], faction: "wei", troop: "dao", quality: "purple",
      skill: { name: "虎痴狂暴", type: "berserk",   cd: 14, value: 0.8, atk: 0.5, dur: 6, desc: "赤膊酣战，攻速攻击暴涨" } },
    { id: "dianwei",  name: "典韦",   chars: ["典", "韦"], faction: "wei", troop: "dao", quality: "purple",
      skill: { name: "古之恶来", type: "slam",      cd: 12, value: 3.0, radius: 150, stun: 0.5, desc: "双戟猛击大地，近域敌军震颤" } },
    { id: "xuhuang",  name: "徐晃",   chars: ["徐", "晃"], faction: "wei", troop: "qiang", quality: "blue",
      skill: { name: "长驱直入", type: "breakthrough", cd: 12, value: 2.4, desc: "大开大合，直线贯穿强敌" } },
    /* ---- 吴 ---- */
    { id: "zhouyu",   name: "周瑜",   chars: ["周", "瑜"], faction: "wu", troop: "gong", quality: "gold",
      skill: { name: "火烧赤壁", type: "fireSea",   cd: 16, value: 0.9, dur: 5, radius: 170, desc: "谈笑间，樯橹灰飞烟灭——大范围火海" } },
    { id: "taishici", name: "太史慈", chars: ["太", "慈"], faction: "wu", troop: "gong", quality: "purple",
      skill: { name: "酣斗连射", type: "rapidShot", cd: 13, value: 3,   dur: 5, desc: "弓开满月，攻击变为连珠三射" } },
    { id: "luxun",    name: "陆逊",   chars: ["陆", "逊"], faction: "wu", troop: "gong", quality: "purple",
      skill: { name: "火烧连营", type: "walling",   cd: 14, value: 0.8, dur: 6, seg: 120, desc: "沿路径布下连营火墙，灼烧过境之敌" } },
    { id: "ganning",  name: "甘宁",   chars: ["甘", "宁"], faction: "wu", troop: "dao", quality: "purple",
      skill: { name: "百骑劫营", type: "raidDash",  cd: 13, value: 1.9, count: 4, desc: "百骑袭营，连斩数敌" } },
    { id: "huanggai", name: "黄盖",   chars: ["黄", "盖"], faction: "wu", troop: "dao", quality: "green",
      skill: { name: "苦肉计",   type: "sacrifice", cd: 15, value: 3.5, tired: 4, desc: "自损爆发，重创四野后力竭" } }
  ];

  DATA.FACTION = {
    shu: { name: "蜀", color: "#9e3b2e" },
    wei: { name: "魏", color: "#3d6aa8" },
    wu:  { name: "吴", color: "#2f7f83" }
  };

  /* 碎片字 → 可拼合的武将（含共享字：张/黄 跨势力复用） */
  DATA.CHAR_MAP = {};
  (function () {
    DATA.GENERALS.forEach(function (g) {
      g.chars.forEach(function (ch) {
        (DATA.CHAR_MAP[ch] = DATA.CHAR_MAP[ch] || []).push(g.id);
      });
    });
  })();

  /* ==================== 敌人 ==================== */
  DATA.ENEMIES = {
    zu:  { id: "zu",  ch: "卒", name: "乱卒",   hpMul: 1.0, spMul: 1.0, rewardMul: 1.0 },
    qi:  { id: "qi",  ch: "骑", name: "轻骑",   hpMul: 0.6, spMul: 2.1, rewardMul: 1.2 },
    dun: { id: "dun", ch: "盾", name: "藤甲盾兵", hpMul: 3.4, spMul: 0.55, rewardMul: 2.2 }
  };

  /* Boss：每 5 波出场，按序轮换，一轮之后全属性 ×cycleMul */
  DATA.BOSSES = [
    { id: "huaxiong", ch: "华雄", skill: "dash",  skillDesc: "疾冲：周期性加速冲刺" },
    { id: "yanliang", ch: "颜良", skill: "split", skillDesc: "双生：阵亡时分裂乱卒" },
    { id: "wenchou",  ch: "文丑", skill: "split", skillDesc: "双生：阵亡时分裂乱卒" },
    { id: "lvbu",     ch: "吕布", skill: "rage",  skillDesc: "无双：残血狂暴，加速减伤" },
    { id: "zhanghe",  ch: "张郃", skill: "dodge", skillDesc: "巧变：短暂无敌" },
    { id: "caoren",   ch: "曹仁", skill: "guard", skillDesc: "铁壁：周期护盾" }
  ];
  DATA.BOSS_HP_BASE = 25;      // Boss 血量 = 同波小兵 HP × (25 + 3×Boss序号)
  DATA.BOSS_HP_STEP = 3;
  DATA.BOSS_CYCLE_MUL = 1.8;   // 轮换一轮后的增强倍数
  DATA.BOSS_REWARD_MUL = 12;   // Boss 击杀馒头倍率（相对小兵）

  /* ==================== 无尽波次曲线 ==================== */
  DATA.WAVES = {
    hpBase: 12,
    hpLinear: 0.32,        // 1~7 波线性成长
    expFrom: 8,            // 第 9 波起叠加指数
    expGrowth: 1.15,
    count: function (w) { return Math.min(30, 6 + Math.floor(w / 2)); },
    spawnGap: function (w) { return Math.max(0.5, 0.9 - 0.01 * w); },
    speedMul: function (w) { return 1 + Math.min(0.6, 0.02 * w); },
    baseSpeed: 54,         // px/s
    killReward: function (w) { return 1 + Math.floor(0.3 * w); },
    waveBonus: function (w) { return 8 + 2 * w; },
    /* 每波兵种组成（权重表）：5 波起混轻骑，8 波起混盾兵，比例渐升 */
    mix: function (w) {
      if (w < 5) return { zu: 1 };
      if (w < 8) return { zu: Math.max(0.3, 1 - 0.05 * w), qi: 0.2 + 0.03 * w };
      return {
        zu: Math.max(0.22, 0.9 - 0.03 * w),
        qi: 0.18 + 0.012 * w,
        dun: 0.1 + 0.01 * w
      };
    }
  };

  /* ==================== 召唤 ==================== */
  DATA.SUMMON = {
    cost0: 10,       // 首次召唤费用
    costStep: 2,     // 每次递增
    benchMax: 5,     // 待命区容量（每次征兵重新随机填满 5 格）
    /* 基础概率池（kind: troop 兵种 / char 武将碎片 / shovel 铲子） */
    pool: [
      { kind: "troop", id: "dao",   w: 24 },
      { kind: "troop", id: "qiang", w: 20 },
      { kind: "troop", id: "jian",  w: 16 },
      { kind: "troop", id: "gong",  w: 14 },
      { kind: "char",  w: 8 },
      { kind: "shovel", w: 10 }
    ],
    recruitBonus: 1.8   // 招贤令：碎片池权重放大倍率（每层）
  };

  /* 出售返还 */
  DATA.SELL = {
    troop: function (lv) { return 5 + 3 * lv; },
    char: 8,
    shovel: 5,
    general: function (lv) { return 25 + 15 * lv; }
  };

  /* ==================== 道具（击杀 Boss 随机抽取） ==================== */
  DATA.ITEMS = [
    /* 被动：获得即全局生效，可叠加 */
    { id: "gongsu",  name: "攻速符", icon: "符", type: "passive", desc: "全军攻速 +15%（可叠加）", value: 0.15 },
    { id: "bingshu", name: "兵书",   icon: "书", type: "passive", desc: "全军攻击 +15%（可叠加）", value: 0.15 },
    { id: "junliang", name: "军粮",  icon: "粮", type: "passive", desc: "击杀馒头收益 +25%（可叠加）", value: 0.25 },
    { id: "zhaoxianling", name: "招贤令", icon: "令", type: "passive", desc: "召唤更易出现武将碎片（可叠加）", value: 1 },
    /* 主动：道具栏最多 2 格，点击使用，一次性 */
    { id: "maobi",   name: "毛笔",   icon: "笔", type: "active", desc: "点选场上任意一个字，随机改写为其他字", value: 0 },
    { id: "zhangu",  name: "战鼓",   icon: "鼓", type: "active", desc: "5 秒内全军攻速翻倍", value: 5 },
    { id: "renxin",  name: "仁心丹", icon: "丹", type: "active", desc: "阿斗回复 1 颗心", value: 1 },
    { id: "huoji",   name: "火计",   icon: "火", type: "active", desc: "火烧连天，全屏敌人重创并灼烧", value: 6 }
  ];
  DATA.ACTIVE_SLOTS = 2;          // 主动道具槽上限
  DATA.ITEM_TO_MANTOU = 15;       // 主动槽满时折算馒头

  /* ==================== 战场网格地图 ====================
   * 15 列 × 10 行，每格 64px，画布 960×640。
   * path  敌军道路格（蛇形三横道，敌人沿格子中心行进）
   * build 预解锁的可布置格（初始 20 个，成片分布便于摆放与凑武将）
   * wild  未开发格（其余全部空地，用铲子开垦为布置格 —— 后期持续扩展）
   */
  DATA.MAP = (function () {
    var cols = 15, rows = 10, cell = 64;
    /* 道路序列（从入口到阿斗） */
    var path = [];
    for (var c = 0; c <= 14; c++) path.push([c, 1]);            // 上道 →
    path.push([14, 2], [14, 3], [14, 4]);                        // 右侧 ↓
    for (c = 13; c >= 0; c--) path.push([c, 4]);                 // 中道 ←
    path.push([0, 5], [0, 6], [0, 7]);                           // 左侧 ↓
    for (c = 1; c <= 14; c++) path.push([c, 7]);                 // 下道 → 阿斗
    /* 初始解锁布置格：两大连片 + 两个小块，紧贴道路 */
    var buildInit = [];
    for (c = 2; c <= 6; c++) { buildInit.push([c, 0]); buildInit.push([c, 2]); }   // 上区 5×2 连片
    buildInit.push([6, 3], [7, 3], [8, 3]);                                         // 中区小块
    buildInit.push([5, 5], [6, 5], [7, 5], [6, 6], [7, 6]);                        // 中下连片
    buildInit.push([3, 8], [4, 8]);                                                 // 下区小块
    return {
      cols: cols, rows: rows, cell: cell,
      fieldW: cols * cell, fieldH: rows * cell,
      path: path,
      adou: [14, 7],
      buildInit: buildInit
    };
  })();

  /* ==================== 全局参数 ==================== */
  DATA.GAME = {
    mantou0: 70,
    hearts0: 5,
    prepareTime: 20,      // 首波准备秒数
    intermissionTime: 25  // 波间倒计时
  };

  global.ZY_DATA = DATA;
})(typeof window !== "undefined" ? window : globalThis);
