// === 人生模拟器 (Life Simulator) · 像素版 ===
//  index.js —— 引擎：像素角色渲染 + 事件数据 + 人生状态机
//  入口：game.html 中 new LifeGame(rootEl).start()

(function () {
  "use strict";

  // ---------- 调色板 ----------
  const SKIN_TONES = ["#f2c9a0", "#e8b58a", "#d9a066", "#b87746", "#8a5a32"];
  const HAIR_COLORS = ["#2b2118", "#4a3526", "#6b4a2a", "#8a8a8a", "#c0392b", "#d9b94a"];
  const SHIRT_COLORS = ["#c0392b", "#2980b9", "#27ae60", "#8e44ad", "#d35400", "#16a085", "#2c3e50", "#c2185b"];
  const PANTS_COLORS = ["#34495e", "#2c3e50", "#5d4037", "#37474f", "#455a64"];
  const PALETTE = {
    ".": null,
    s: "#f2c9a0", S: "#d9a066", // 肤色 / 阴影
    h: "#2b2118", H: "#1a130d", // 头发 / 头发阴影
    e: "#1a1a1a", // 眼睛
    m: "#b54848", // 嘴
    k: "#c0392b", // 腮红
    t: "#c0392b", T: "#8e1c14", // 上衣 / 阴影
    p: "#34495e", P: "#22303d", // 裤子
    o: "#3a2a1a", // 鞋
    w: "#ffffff", // 眼白 / 高光
  };

  // ---------- 姓名库 ----------
  const SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏".split("");
  const NAME_CHARS = "浩宇梓涵欣怡子轩雨桐俊杰梦琪嘉诚思远雅琪宇航若曦子涵博文诗涵昊然芷晴".split("");

  // ---------- 天赋 ----------
  const TALENTS = [
    { id: "rich",    name: "富二代",   desc: "出身富贵，开局金钱 ×3，家境 +2", effect: { wealth: 2, moneyMul: 3 } },
    { id: "beauty",  name: "天生丽质", desc: "颜值即正义，颜值 +3", effect: { cha: 3 } },
    { id: "genius",  name: "神童",     desc: "天赋异禀，智力 +3", effect: { int: 3 } },
    { id: "iron",    name: "铁人",     desc: "体魄强健，体质 +3，死亡概率 -30%", effect: { hp: 3, deathResist: 0.3 } },
    { id: "koi",     name: "锦鲤",     desc: "好运连连，好事件概率提升", effect: { luck: 0.4 } },
    { id: "longlife",name: "长寿基因", desc: "命中注定长寿，寿命 +15", effect: { maxAge: 15 } },
    { id: "romance", name: "桃花命",   desc: "魅力四射，更多感情事件", effect: { romance: 0.5 } },
    { id: "workaholic",name:"工作狂",  desc: "事业心强，工作收入 +50%", effect: { workMul: 0.5 } },
    { id: "mystic",  name: "神秘体质", desc: "命运多舛却总有转机，心情低于 30 时自动回血", effect: { mystic: true } },
  ];

  // ---------- 事件库 ----------
  // effect 键：cha/int/hp/wealth(家境,基本固定) / money / mood / age(增寿) / die / flag
  // requires：触发门槛；weight：权重；once：仅触发一次
  const EVENTS = [
    // ===== 婴幼儿 0-3 =====
    { id: "walk", age: [1, 2], text: "你学会了走路，踉踉跄跄地扑进妈妈怀里。",
      choices: [{ text: "继续探索世界", effect: { int: 1, hp: 1, mood: 8 } }] },
    { id: "sick_baby", age: [0, 3], text: "你发了一场高烧，整夜啼哭。",
      choices: [{ text: "祈求平安", effect: { hp: -2, mood: -10 } }] },
    { id: "early_edu", age: [1, 3], text: "父母送你去早教班，你对色彩产生了兴趣。",
      choices: [{ text: "认真听课", effect: { int: 1, mood: 5 } }] },

    // ===== 童年 4-12 =====
    { id: "kindergarten", age: [3, 4], text: "你被送进幼儿园，第一次离开父母。",
      choices: [{ text: "交到新朋友", effect: { mood: 8, int: 1 } }, { text: "哭着要回家", effect: { mood: -8 } }] },
    { id: "bully", age: [5, 11], text: "高年级的同学拦住了你，要你交出零花钱。",
      choices: [
        { text: "勇敢反抗", effect: { hp: 1, mood: 6, cha: 1 } },
        { text: "告诉老师", effect: { int: 1, mood: 2 } },
        { text: "忍气吞声", effect: { mood: -15, money: -20 } },
      ] },
    { id: "talent_find", age: [6, 10], text: "老师发现你在某方面有过人之处。",
      choices: [
        { text: "其实是长得好看", effect: { cha: 2, mood: 8 } },
        { text: "其实是脑子灵光", effect: { int: 2, mood: 8 } },
        { text: "其实是跑得快", effect: { hp: 2, mood: 8 } },
      ] },
    { id: "exam_first", age: [7, 12], requires: { int: 6 }, text: "期中考试你拿了全班第一！",
      choices: [{ text: "再接再厉", effect: { int: 1, mood: 12, flag: "学霸" } }] },
    { id: "exam_bad", age: [7, 12], requires: { int_max: 4 }, text: "这次考试你考砸了，不敢把试卷拿回家。",
      choices: [{ text: "暗暗发誓努力", effect: { int: 1, mood: -6 } }, { text: "破罐子破摔", effect: { mood: -10, int: -1 } }] },
    { id: "pet", age: [6, 12], text: "你在路边遇到一只流浪小猫。",
      choices: [
        { text: "带回家收养", effect: { mood: 15, money: -50, hp: 1 } },
        { text: "远远地看一眼", effect: { mood: 3 } },
      ] },
    { id: "myopia", age: [8, 12], text: "你看黑板越来越模糊，近视了。",
      choices: [{ text: "戴上眼镜", effect: { int: 1, cha: -1, mood: -3 } }] },
    { id: "art_class", age: [5, 11], requires: { wealth: 4 }, text: "父母给你报了才艺班。",
      choices: [
        { text: "学钢琴", effect: { cha: 1, int: 1, money: -200, mood: 6 } },
        { text: "学画画", effect: { int: 1, cha: 1, money: -200, mood: 6 } },
      ] },
    { id: "find_money", age: [5, 12], text: "你在地上捡到一张钞票。",
      choices: [{ text: "揣进兜里", effect: { money: 30, mood: 6 } }, { text: "交给警察", effect: { mood: 8, cha: 1 } }] },

    // ===== 少年 13-18 =====
    { id: "first_love", age: [13, 17], requires: { cha: 5 }, text: "你收到了一封情书，心跳加速。",
      choices: [
        { text: "悄悄在一起", effect: { mood: 20, flag: "初恋" } },
        { text: "以学业为重", effect: { int: 1, mood: -3 } },
      ] },
    { id: "first_love_fail", age: [13, 17], requires: { cha_max: 4 }, text: "你向喜欢的人表白，却被婉拒。",
      choices: [{ text: "埋头读书", effect: { int: 1, mood: -12 } }] },
    { id: "rebel", age: [14, 17], text: "你和父母大吵一架，摔门而出。",
      choices: [
        { text: "去网吧通宵", effect: { mood: 10, hp: -1, int: -1, money: -30 } },
        { text: "冷静后回家", effect: { mood: -4, int: 1 } },
      ] },
    { id: "gamer", age: [13, 17], text: "你迷上了一款网络游戏，彻夜不休。",
      choices: [
        { text: "再打一局", effect: { mood: 12, int: -1, hp: -1 } },
        { text: "卸载游戏", effect: { int: 1, mood: -5 } },
      ] },
    { id: "sports_meet", age: [13, 18], requires: { hp: 6 }, text: "校运动会上你大放异彩。",
      choices: [{ text: "勇夺冠军", effect: { hp: 1, cha: 1, mood: 12, flag: "运动健将" } }] },
    { id: "part_time", age: [16, 18], text: "暑假你想去打零工赚零花钱。",
      choices: [{ text: "去快餐店打工", effect: { money: 300, hp: -1, mood: 4 } }] },
    { id: "gaokao", age: [18, 18], text: "人生第一大考——高考来临。",
      choices: [
        { text: "全力冲刺", effect: { mood: -8 } }, // 结果由 int 决定，在 nextYear 内特殊处理
      ] },
    { id: "campus_bully", age: [13, 16], text: "你被几个同学孤立、嘲弄。",
      choices: [
        { text: "转学逃离", effect: { mood: -8, money: -500, wealth: -1 } },
        { text: "默默承受", effect: { mood: -22, hp: -1 } },
        { text: "寻求帮助", effect: { mood: -6, int: 1 } },
      ] },

    // ===== 青年 19-30 =====
    { id: "college", age: [19, 19], text: "你步入大学校园，开启新生活。",
      choices: [
        { text: "努力学习拿奖学金", effect: { int: 2, money: 500, mood: 8 } },
        { text: "参加社团广交朋友", effect: { cha: 2, mood: 12 } },
        { text: "翘课打游戏", effect: { mood: 14, int: -1, hp: -1 } },
      ] },
    { id: "fail_course", age: [19, 23], text: "这学期你挂了一门必修课。",
      choices: [{ text: "下学期补考", effect: { int: -1, mood: -10 } }] },
    { id: "first_job", age: [22, 28], text: "你迎来了人生第一份工作。",
      choices: [
        { text: "进大厂卷起来", effect: { money: 6000, mood: 5, hp: -1 } },
        { text: "找份安稳的工作", effect: { money: 3500, mood: 6 } },
      ] },
    { id: "startup", age: [24, 30], text: "朋友拉你一起创业。",
      choices: [
        { text: "押上全部积蓄", effect: { money: -3000, mood: 8, flag: "创业者" } },
        { text: "婉言拒绝", effect: { mood: 2 } },
      ] },
    { id: "date", age: [20, 30], requires: { cha: 5 }, text: "经人介绍，你开始了一段恋情。",
      choices: [{ text: "认真交往", effect: { mood: 16, money: -200 } }] },
    { id: "breakup", age: [20, 30], text: "你和恋人因为琐事分手了。",
      choices: [{ text: "借酒消愁", effect: { mood: -18, hp: -1, money: -100 } }, { text: "投入工作", effect: { mood: -8, money: 500 } }] },
    { id: "scam", age: [22, 30], requires: { int_max: 5 }, text: "有人推荐你一个'稳赚不赔'的投资项目。",
      choices: [{ text: "把积蓄投进去", effect: { money: -5000, mood: -15 } }, { text: "保持警惕", effect: { int: 1, mood: 4 } }] },
    { id: "gym", age: [20, 30], text: "同事拉你去健身房。",
      choices: [{ text: "坚持锻炼", effect: { hp: 1, cha: 1, mood: 6, money: -300 } }] },
    { id: "abroad", age: [24, 30], requires: { wealth: 7 }, text: "你获得了一个出国深造的机会。",
      choices: [{ text: "出国留学", effect: { int: 2, mood: 20, money: -3000, flag: "海归" } }] },

    // ===== 中年 31-55 =====
    { id: "marry", age: [25, 40], text: "你和恋人决定步入婚姻殿堂。",
      choices: [
        { text: "举办盛大婚礼", effect: { mood: 30, money: -2000, flag: "已婚" } },
        { text: "旅行结婚", effect: { mood: 25, money: -1500, flag: "已婚" } },
      ] },
    { id: "child", age: [28, 42], requires: { flag: "已婚" }, text: "你的孩子出生了，啼哭声响彻产房。",
      choices: [{ text: "初为人父母", effect: { mood: 22, money: -1500, hp: -1, flag: "为人父母" } }] },
    { id: "promote", age: [28, 50], requires: { int: 7 }, text: "上司提拔你升了职。",
      choices: [{ text: "扛起更大的责任", effect: { money: 5000, mood: 12, hp: -1 } }] },
    { id: "job_hop", age: [28, 50], text: "猎头给你开出了更高的薪水。",
      choices: [
        { text: "果断跳槽", effect: { money: 4000, mood: 6 } },
        { text: "留在舒适区", effect: { mood: 2 } },
      ] },
    { id: "house", age: [30, 45], text: "你考虑买一套属于自己的房子。",
      choices: [
        { text: "咬牙贷款买房", effect: { money: -8000, mood: 16, flag: "有房" } },
        { text: "继续租房", effect: { mood: -2, money: -800 } },
      ] },
    { id: "midlife", age: [40, 50], text: "你陷入了中年危机，夜不能寐。",
      choices: [{ text: "找心理医生聊聊", effect: { mood: -8, money: -500, int: 1 } }, { text: "独自硬扛", effect: { mood: -16, hp: -1 } }] },
    { id: "divorce", age: [30, 55], requires: { flag: "已婚" }, text: "你和伴侣的矛盾到了不可调和的地步。",
      choices: [{ text: "协议离婚", effect: { mood: -25, money: -3000, flag: "离婚" } }] },
    { id: "checkup", age: [35, 55], text: "单位组织了年度体检。",
      choices: [{ text: "认真检查", effect: { mood: -2 } }] }, // 结果由 hp 决定，特殊处理
    { id: "overwork", age: [30, 50], requires: { hp_max: 3 }, text: "连续加班一个月，你感到胸口发闷。",
      choices: [{ text: "请几天假休息", effect: { hp: 1, money: -500, mood: 4 } }, { text: "继续硬撑", effect: { hp: -2, mood: -6 } }] },
    { id: "invest", age: [30, 55], text: "你研究了一只热门股票。",
      choices: [
        { text: "重仓买入", effect: { money: 3000, mood: 8 } }, // 收益随 int 调整
        { text: "谨慎观望", effect: { mood: 2 } },
      ] },
    { id: "parents_ill", age: [40, 55], text: "父母年迈病倒，需要你照顾。",
      choices: [{ text: "尽孝床前", effect: { mood: -12, money: -2000, hp: -1 } }] },

    // ===== 老年 56+ =====
    { id: "retire", age: [60, 60], text: "你正式退休，告别了职场。",
      choices: [{ text: "享受悠闲时光", effect: { mood: 14, money: -500 } }] },
    { id: "grandchild", age: [58, 80], requires: { flag: "为人父母" }, text: "孙子/孙女出生了，你笑得合不拢嘴。",
      choices: [{ text: "含饴弄孙", effect: { mood: 20, money: -500 } }] },
    { id: "square_dance", age: [60, 80], text: "小区广场舞队伍邀请你加入。",
      choices: [{ text: "成为领舞", effect: { hp: 1, cha: 1, mood: 12, flag: "广场舞王" } }] },
    { id: "chronic", age: [60, 100], text: "体检发现了慢性病，需要长期服药。",
      choices: [{ text: "按时吃药控制", effect: { hp: -2, money: -800, mood: -6 } }] },
    { id: "travel_old", age: [60, 85], text: "老伙计们约你一起去旅行。",
      choices: [{ text: "说走就走", effect: { mood: 25, money: -2500, hp: -1 } }] },
    { id: "fall", age: [70, 100], text: "你在浴室里不慎摔倒。",
      choices: [{ text: "艰难爬起", effect: { hp: -3, mood: -10 } }] },
    { id: "dementia", age: [75, 100], text: "你开始记不清最近发生的事。",
      choices: [{ text: "用笔记本记下一切", effect: { int: -2, mood: -8 } }] },
    { id: "century", age: [100, 100], text: "你迎来了百岁寿辰，亲朋好友齐聚一堂！",
      choices: [{ text: "吹灭蜡烛许愿", effect: { mood: 50, flag: "百岁老人" } }] },

    // ===== 随机意外（全年龄段，低权重） =====
    { id: "car_accident", age: [18, 70], weight: 0.4, text: "一场突如其来的车祸！",
      choices: [{ text: "与死神擦肩", effect: { hp: -3, mood: -15, money: -500 } }, { text: "伤重不治", effect: { die: true } }] },
    { id: "lottery", age: [20, 80], weight: 0.5, text: "你买彩票居然中了奖！",
      choices: [{ text: "低调领奖", effect: { money: 5000, mood: 18 } }] },
  ];

  // 平静的一年 —— 兜底事件
  const FILLERS = [
    "这一年风平浪静，日子波澜不惊地过去了。",
    "你按部就班地生活，没有特别的事情发生。",
    "平淡的一年，你学会了与自己相处。",
    "时光悄悄流逝，你又长大了一岁。",
    "日子像流水一样滑过指尖。",
    "你过着普通人的一天又一天。",
  ];

  // ---------- 工具 ----------
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const $ = (id) => document.getElementById(id);

  // ---------- 像素角色渲染 ----------
  // 32×32 网格，每格 px 像素。按人生阶段绘制不同造型。
  function stageOf(age) {
    if (age <= 2) return "baby";
    if (age <= 12) return "child";
    if (age <= 18) return "teen";
    if (age <= 55) return "adult";
    return "elder";
  }

  function makeAppearance() {
    return {
      skin: pick(SKIN_TONES),
      hair: pick(HAIR_COLORS),
      shirt: pick(SHIRT_COLORS),
      pants: pick(PANTS_COLORS),
      longHair: Math.random() < 0.4,
    };
  }

  // 在网格坐标系绘制一个实心块
  function blk(ctx, px, x, y, w, h, color) {
    if (!color) return;
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x) * px, Math.round(y) * px, w * px, h * px);
  }

  function shade(hex, amt) {
    // amt 正数变亮，负数变暗
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(r + amt, 0, 255); g = clamp(g + amt, 0, 255); b = clamp(b + amt, 0, 255);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // 绘制场景背景（随阶段变化）
  function drawScene(ctx, px, stage) {
    const W = 32, H = 32;
    let sky1, sky2, ground;
    if (stage === "baby") { sky1 = "#f6d6e0"; sky2 = "#fbe7ee"; ground = "#e8c9a0"; }
    else if (stage === "elder") { sky1 = "#f6a96b"; sky2 = "#f8c98a"; ground = "#7a5a3a"; }
    else { sky1 = "#8ecae6"; sky2 = "#bde0f0"; ground = "#6ab04c"; }
    // 天空渐变（分段填色）
    for (let y = 0; y < 24; y++) {
      const t = y / 24;
      const c = t < 0.5 ? sky1 : sky2;
      blk(ctx, px, 0, y, W, 1, c);
    }
    // 地面
    blk(ctx, px, 0, 24, W, 8, ground);
    blk(ctx, px, 0, 24, W, 1, shade(ground, -20));
    // 太阳/月亮
    if (stage === "elder") {
      for (let i = 0; i < 4; i++) { blk(ctx, px, 3 + i, 3, 1, 1, "#fff4d6"); blk(ctx, px, 3, 3 + i, 1, 1, "#fff4d6"); blk(ctx, px, 3 + i, 6, 1, 1, "#fff4d6"); blk(ctx, px, 6, 3 + i, 1, 1, "#fff4d6"); blk(ctx, px, 4, 4, 2, 2, "#fff4d6"); }
    } else {
      blk(ctx, px, 24, 3, 5, 5, "#ffd84a");
      blk(ctx, px, 23, 4, 1, 3, "#ffd84a"); blk(ctx, px, 29, 4, 1, 3, "#ffd84a"); blk(ctx, px, 25, 2, 3, 1, "#ffd84a"); blk(ctx, px, 25, 8, 3, 1, "#ffd84a");
    }
    // 场景道具
    if (stage === "baby") {
      // 婴儿床围栏
      for (let x = 2; x < 30; x += 4) blk(ctx, px, x, 20, 1, 8, "#c98a4b");
      blk(ctx, px, 1, 20, 30, 1, "#a9743f");
    } else if (stage === "child" || stage === "teen") {
      // 远处小树
      blk(ctx, px, 2, 18, 2, 6, "#5a3a1a"); blk(ctx, px, 1, 15, 4, 4, "#3a8a3a");
      blk(ctx, px, 28, 19, 2, 5, "#5a3a1a"); blk(ctx, px, 27, 16, 4, 4, "#3a8a3a");
    } else if (stage === "adult") {
      // 办公楼剪影
      blk(ctx, px, 1, 12, 8, 12, "#5a6470"); blk(ctx, px, 24, 10, 7, 14, "#4a5460");
      for (let y = 13; y < 22; y += 2) for (let x = 2; x < 8; x += 2) blk(ctx, px, x, y, 1, 1, "#ffe08a");
      for (let y = 11; y < 22; y += 2) for (let x = 25; x < 30; x += 2) blk(ctx, px, x, y, 1, 1, "#ffe08a");
    } else {
      // 老年：长椅
      blk(ctx, px, 22, 21, 8, 1, "#5a3a1a"); blk(ctx, px, 23, 22, 1, 3, "#5a3a1a"); blk(ctx, px, 28, 22, 1, 3, "#5a3a1a");
    }
  }

  // 绘制角色（带呼吸 / 眨眼动画）
  function drawCharacter(ctx, px, app, age, t) {
    const stage = stageOf(age);
    const skin = app.skin, hair = age >= 56 ? "#8a8a8a" : app.hair;
    const shirt = app.shirt, pants = app.pants;
    const shirtDk = shade(shirt, -28), pantsDk = shade(pants, -22), skinDk = shade(skin, -22);
    const bob = Math.round(Math.sin(t / 380) * 0.4); // 上下浮动
    const blink = (t % 3200) < 120; // 眨眼
    const baseY = bob;

    const eye = (ex, ey) => {
      if (blink) { blk(ctx, px, ex, ey + 1, 2, 1, skinDk); return; }
      blk(ctx, px, ex, ey, 2, 2, "#1a1a1a");
      blk(ctx, px, ex, ey, 1, 1, "#ffffff");
    };

    if (stage === "baby") {
      // 被包裹的婴儿，大头
      const hx = 11, hy = 8 + baseY;
      // 包被
      blk(ctx, px, 9, 17, 14, 9, shirt); blk(ctx, px, 9, 17, 14, 1, shirtDk); blk(ctx, px, 9, 25, 14, 1, shade(shirt, -40));
      // 头
      blk(ctx, px, hx, hy, 10, 9, skin); blk(ctx, px, hx, hy, 10, 1, skinDk); blk(ctx, px, hx, hy + 8, 10, 1, skinDk);
      blk(ctx, px, hx - 1, hy + 2, 1, 5, skin); blk(ctx, px, hx + 10, hy + 2, 1, 5, skin);
      // 头发
      blk(ctx, px, hx + 1, hy - 1, 8, 2, hair); blk(ctx, px, hx + 2, hy - 2, 6, 1, hair);
      eye(hx + 2, hy + 3); eye(hx + 6, hy + 3);
      blk(ctx, px, hx + 4, hy + 6, 2, 1, "#b54848"); // 嘴
      blk(ctx, px, hx + 1, hy + 5, 1, 1, "#f4a0a0"); blk(ctx, px, hx + 8, hy + 5, 1, 1, "#f4a0a0"); // 腮红
    } else {
      // 站立人形：头 + 身体 + 四肢，按阶段调整比例
      let headW, headH, bodyH, legH, bodyY;
      if (stage === "child") { headW = 9; headH = 8; bodyH = 7; legH = 6; }
      else if (stage === "teen") { headW = 8; headH = 8; bodyH = 9; legH = 8; }
      else if (stage === "adult") { headW = 8; headH = 8; bodyH = 10; legH = 8; }
      else { headW = 8; headH = 8; bodyH = 9; legH = 7; } // elder

      const cx = 16; // 中心
      const headX = cx - Math.floor(headW / 2);
      const headY = 4 + baseY;
      bodyY = headY + headH;
      const bodyW = headW + 2;
      const bodyX = cx - Math.floor(bodyW / 2);

      // 腿
      const legY = bodyY + bodyH;
      blk(ctx, px, bodyX + 1, legY, 3, legH, pants); blk(ctx, px, bodyX + 1, legY, 3, 1, pantsDk);
      blk(ctx, px, bodyX + bodyW - 4, legY, 3, legH, pants); blk(ctx, px, bodyX + bodyW - 4, legY, 3, 1, pantsDk);
      // 鞋
      blk(ctx, px, bodyX + 1, legY + legH, 3, 1, "#2a1a0a"); blk(ctx, px, bodyX + bodyW - 4, legY + legH, 3, 1, "#2a1a0a");
      // 身体（上衣）
      blk(ctx, px, bodyX, bodyY, bodyW, bodyH, shirt); blk(ctx, px, bodyX, bodyY, bodyW, 1, shirtDk); blk(ctx, px, bodyX, bodyY, 1, bodyH, shirtDk);
      // 手臂
      blk(ctx, px, bodyX - 1, bodyY + 1, 2, bodyH - 1, shirt); blk(ctx, px, bodyX + bodyW - 1, bodyY + 1, 2, bodyH - 1, shirt);
      blk(ctx, px, bodyX - 1, bodyY + bodyH, 2, 1, skin); blk(ctx, px, bodyX + bodyW - 1, bodyY + bodyH, 2, 1, skin);
      // 头
      blk(ctx, px, headX, headY, headW, headH, skin); blk(ctx, px, headX, headY, headW, 1, skinDk); blk(ctx, px, headX, headY + headH - 1, headW, 1, skinDk);
      blk(ctx, px, headX - 1, headY + 2, 1, headH - 3, skin); blk(ctx, px, headX + headW, headY + 2, 1, headH - 3, skin);
      // 头发
      if (stage === "elder") {
        blk(ctx, px, headX + 1, headY, headW - 2, 1, hair); // 秃顶，仅边缘
        blk(ctx, px, headX, headY, 1, 3, hair); blk(ctx, px, headX + headW - 1, headY, 1, 3, hair);
      } else if (app.longHair && stage !== "child") {
        blk(ctx, px, headX - 1, headY, headW + 2, 2, hair); blk(ctx, px, headX - 1, headY + 2, 1, headH, hair); blk(ctx, px, headX + headW, headY + 2, 1, headH, hair);
        blk(ctx, px, headX, headY - 1, headW, 1, hair);
      } else {
        blk(ctx, px, headX, headY, headW, 2, hair); blk(ctx, px, headX, headY - 1, headW, 1, hair);
        blk(ctx, px, headX - 1, headY + 1, 1, 1, hair); blk(ctx, px, headX + headW, headY + 1, 1, 1, hair);
      }
      // 眼睛 + 嘴
      const ey = headY + 4;
      eye(headX + 1, ey); eye(headX + headW - 3, ey);
      blk(ctx, px, headX + Math.floor(headW / 2) - 1, headY + headH - 2, 2, 1, "#b54848");
      // 老人拐杖
      if (stage === "elder") {
        blk(ctx, px, bodyX + bodyW + 1, bodyY - 2, 1, bodyH + 4, "#8a5a2a"); blk(ctx, px, bodyX + bodyW, bodyY - 2, 2, 1, "#8a5a2a");
      }
    }
  }

  // ---------- 人生游戏主类 ----------
  const STAT_KEYS = ["cha", "int", "hp", "wealth", "money", "mood"];
  const STAT_LABEL = { cha: "颜值", int: "智力", hp: "体质", wealth: "家境", money: "金钱", mood: "心情" };

  function LifeGame(root) {
    this.root = root;
    this.canvas = $("stage");
    this.ctx = this.canvas.getContext("2d");
    this.px = 6; // 像素块大小
    this.canvas.width = 32 * this.px;
    this.canvas.height = 32 * this.px;
    this.ctx.imageSmoothingEnabled = false;
    this.state = null;
    this.titleApp = makeAppearance();
    this.auto = false;
    this.autoTimer = null;
    this.pending = null; // 当前待选择的事件
    this.firedOnce = new Set();
    this._raf = null;
    this._startRaf();
  }

  LifeGame.prototype._startRaf = function () {
    const self = this;
    function loop(t) {
      self._render(t);
      self._raf = requestAnimationFrame(loop);
    }
    this._raf = requestAnimationFrame(loop);
  };

  LifeGame.prototype._render = function (t) {
    const ctx = this.ctx, px = this.px;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const age = this.state ? this.state.age : 0;
    const stage = stageOf(age);
    drawScene(ctx, px, stage);
    if (this.state) drawCharacter(ctx, px, this.state.app, age, t);
    else {
      // 标题画面：用固定外观的成年角色
      drawCharacter(ctx, px, this.titleApp, 25, t);
    }
  };

  // 开始：进入角色创建
  LifeGame.prototype.start = function () {
    this.showCreation();
  };

  // ---------- 角色创建 ----------
  LifeGame.prototype.showCreation = function () {
    const self = this;
    const modal = $("creation");
    modal.classList.add("show");

    const rollAttrs = () => {
      // 4 项属性，每项 3-10，总和约 20
      const attrs = { cha: 0, int: 0, hp: 0, wealth: 0 };
      let total = 0;
      do {
        attrs.cha = 3 + rand(8); attrs.int = 3 + rand(8); attrs.hp = 3 + rand(8); attrs.wealth = 3 + rand(8);
        total = attrs.cha + attrs.int + attrs.hp + attrs.wealth;
      } while (total < 18 || total > 24);
      return attrs;
    };

    let attrs = rollAttrs();
    let talents = pickTalents(3);
    let chosenTalent = null;

    const reroll = () => { attrs = rollAttrs(); renderAttrs(); };
    const rerollTalents = () => { talents = pickTalents(3); chosenTalent = null; renderTalents(); };

    function renderAttrs() {
      const box = $("c-attrs");
      box.innerHTML = "";
      ["cha", "int", "hp", "wealth"].forEach((k) => {
        const row = document.createElement("div");
        row.className = "attr-row";
        row.innerHTML = '<span class="attr-name">' + STAT_LABEL[k] + '</span>' +
          '<span class="attr-bar"><i style="width:' + (attrs[k] * 10) + '%"></i></span>' +
          '<span class="attr-val">' + attrs[k] + '</span>';
        box.appendChild(row);
      });
      $("c-total").textContent = "总和 " + (attrs.cha + attrs.int + attrs.hp + attrs.wealth) + " / 24";
    }

    function renderTalents() {
      const box = $("c-talents");
      box.innerHTML = "";
      talents.forEach((tal, i) => {
        const el = document.createElement("div");
        el.className = "talent" + (chosenTalent === i ? " selected" : "");
        el.innerHTML = '<b>' + tal.name + '</b><span>' + tal.desc + '</span>';
        el.onclick = () => { chosenTalent = i; renderTalents(); };
        box.appendChild(el);
      });
    }

    function pickTalents(n) {
      const pool = TALENTS.slice();
      const out = [];
      for (let i = 0; i < n && pool.length; i++) out.push(pool.splice(rand(pool.length), 1)[0]);
      return out;
    }

    $("c-reroll").onclick = reroll;
    $("c-reroll-talent").onclick = rerollTalents;
    $("c-start").onclick = () => {
      if (chosenTalent === null) { $("c-tip").textContent = "请先选择一个天赋"; return; }
      $("c-tip").textContent = "";
      modal.classList.remove("show");
      const tal = talents[chosenTalent];
      const name = pick(SURNAMES) + pick(NAME_CHARS) + (Math.random() < 0.5 ? pick(NAME_CHARS) : "");
      self.beginLife(attrs, tal, name);
    };

    renderAttrs();
    renderTalents();
  };

  // ---------- 开始人生 ----------
  LifeGame.prototype.beginLife = function (attrs, talent, name) {
    const t = talent.effect;
    const wealth = clamp(attrs.wealth + (t.wealth || 0), 0, 10);
    let money = wealth * 1500;
    if (t.moneyMul) money = Math.round(money * t.moneyMul);
    this.state = {
      name: name,
      talent: talent,
      app: makeAppearance(),
      age: 0,
      alive: true,
      cha: attrs.cha + (t.cha || 0),
      int: attrs.int + (t.int || 0),
      hp: attrs.hp + (t.hp || 0),
      wealth: wealth,
      money: money, mood: 70,
      flags: new Set(),
      log: [],
      achievements: [],
      moodSum: 70, moodCount: 1,
      maxAge: 75 + (talent.effect.maxAge || 0),
      deathResist: talent.effect.deathResist || 0,
      luck: talent.effect.luck || 0,
      workMul: talent.effect.workMul || 0,
      romance: talent.effect.romance || 0,
      mystic: !!talent.effect.mystic,
    };
    this.firedOnce = new Set();
    // 出生叙述
    const birthDesc = this.state.wealth >= 8
      ? "你出生在一个钟鸣鼎食之家，含着金汤匙降临人世。"
      : this.state.wealth >= 5
      ? "你出生在一个温馨的小康家庭。"
      : this.state.wealth >= 3
      ? "你出生在一个普通人家，父母都是勤恳的打工人。"
      : "你出生在一个贫困的家庭，日子捉襟见肘。";
    this.appendLog("【出生】" + birthDesc, "birth");
    this.appendLog("天赋「" + talent.name + "」已激活。" , "talent");
    this.updateHud();
    this.nextYear();
  };

  // ---------- 推进一年 ----------
  LifeGame.prototype.nextYear = function () {
    const s = this.state;
    if (!s || !s.alive) return;
    s.age++;
    // 心情自然回归 50
    if (s.mood < 50) s.mood += 1; else if (s.mood > 50) s.mood -= 0;
    s.mood = clamp(s.mood, 0, 100);

    // 神秘体质：低心情回血
    if (s.mystic && s.mood < 30 && s.hp < 8) { s.hp += 1; this.appendLog("神秘力量涌动，你恢复了些许元气。", "mystic"); }

    // 寿终判定
    if (s.age > s.maxAge) {
      return this.die("寿终正寝，安详离世。");
    }
    // 老年随机死亡
    if (s.age >= 60) {
      let p = (s.age - 60) * 0.012 + 0.01;
      p *= (1 - s.deathResist);
      if (s.hp < 3) p += 0.08;
      if (Math.random() < p) return this.die("年迈体衰，在睡梦中安然长眠。");
    }
    // 体质归零
    if (s.hp <= 0) return this.die("身体不堪重负，你倒下了。");

    // 触发事件
    const ev = this.pickEvent();
    if (ev) {
      this.handleEvent(ev);
    } else {
      // 兜底：平静的一年
      this.appendLog(s.age + "岁 · " + pick(FILLERS), "filler");
      this.finishYear();
    }
  };

  // ---------- 选取事件 ----------
  LifeGame.prototype.pickEvent = function () {
    const s = this.state;
    const candidates = [];
    for (const ev of EVENTS) {
      if (ev.age && (s.age < ev.age[0] || s.age > ev.age[1])) continue;
      if (ev.once && this.firedOnce.has(ev.id)) continue;
      if (ev.requires) {
        if (ev.requires.flag && !s.flags.has(ev.requires.flag)) continue;
        for (const k in ev.requires) {
          if (k === "flag") continue;
          if (k.endsWith("_max")) { const key = k.slice(0, -4); if (s[key] > ev.requires[k]) continue; }
          else if (s[k] < ev.requires[k]) continue;
        }
      }
      let w = ev.weight || 1;
      if (s.luck && this._isGoodEvent(ev)) w *= 1 + s.luck;
      if (s.romance && /初恋|恋情|表白/.test(ev.text)) w *= 1 + s.romance;
      candidates.push({ ev, w });
    }
    if (!candidates.length) return null;
    let total = 0; for (const c of candidates) total += c.w;
    let r = Math.random() * total;
    for (const c of candidates) { r -= c.w; if (r <= 0) return c.ev; }
    return candidates[candidates.length - 1].ev;
  };

  LifeGame.prototype._isGoodEvent = function (ev) {
    // 粗略判断“好事件”：选项里有 mood 正向
    return ev.choices.some((c) => (c.effect.mood || 0) > 0 && !(c.effect.die));
  };

  // ---------- 处理事件（展示选项） ----------
  LifeGame.prototype.handleEvent = function (ev) {
    const s = this.state;
    if (ev.once) this.firedOnce.add(ev.id);
    this.appendLog(s.age + "岁 · " + ev.text, "event");

    // 特殊事件：高考 / 体检 结果依赖属性，但保留选项流程
    this.pending = ev;
    this.renderChoices(ev);
  };

  LifeGame.prototype.renderChoices = function (ev) {
    const box = $("choices");
    box.innerHTML = "";
    ev.choices.forEach((ch, i) => {
      const btn = document.createElement("button");
      btn.className = "choice";
      btn.innerHTML = "<span class='choice-idx'>" + (i + 1) + "</span>" + ch.text;
      btn.onclick = () => this.choose(i);
      box.appendChild(btn);
    });
    // 自动模式：智能选择
    if (this.auto && ev.choices.length) {
      const i = this._autoPick(ev);
      this._autoTimer = setTimeout(() => this.choose(i), 450);
    }
  };

  LifeGame.prototype._autoPick = function (ev) {
    // 启发式：选择综合收益最高的选项（避开死亡）
    let best = 0, bestScore = -1e9;
    ev.choices.forEach((ch, i) => {
      const e = ch.effect || {};
      if (e.die) return;
      let score = (e.mood || 0) * 1.2 + (e.hp || 0) * 3 + (e.cha || 0) * 2 + (e.int || 0) * 2 + (e.money || 0) * 0.002 - (e.die ? 1000 : 0);
      if (score > bestScore) { bestScore = score; best = i; }
    });
    return best;
  };

  LifeGame.prototype.choose = function (i) {
    if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
    const ev = this.pending;
    if (!ev) return;
    const ch = ev.choices[i];
    this.pending = null;
    // 特殊事件后处理
    this.applyEffect(ch.effect || {}, ev);
    this.finishYear();
  };

  // ---------- 应用效果 ----------
  LifeGame.prototype.applyEffect = function (eff, ev) {
    const s = this.state;
    const deltas = [];
    const addDelta = (label, v) => { if (v) deltas.push(label + " " + (v > 0 ? "+" : "") + v); };

    if (eff.cha) { s.cha = clamp(s.cha + eff.cha, 0, 15); addDelta("颜值", eff.cha); }
    if (eff.int) { s.int = clamp(s.int + eff.int, 0, 15); addDelta("智力", eff.int); }
    if (eff.hp) { s.hp = clamp(s.hp + eff.hp, 0, 15); addDelta("体质", eff.hp); }
    if (eff.wealth) { s.wealth = clamp(s.wealth + eff.wealth, 0, 10); addDelta("家境", eff.wealth); }
    if (eff.money) {
      let m = eff.money;
      if (m > 0 && /工作|升职|跳槽|打工|创业/.test(ev ? ev.text : "") && s.workMul) m = Math.round(m * (1 + s.workMul));
      // 投资收益随智力
      if (ev && /股票|投资/.test(ev.text) && m > 0) m = Math.round(m * (0.5 + s.int * 0.15));
      s.money = Math.max(0, s.money + m); addDelta("金钱", m);
    }
    if (eff.mood) { s.mood = clamp(s.mood + eff.mood, 0, 100); addDelta("心情", eff.mood); }
    if (eff.flag) { s.flags.add(eff.flag); s.achievements.push(eff.flag); }

    // 特殊事件结果
    if (ev && ev.id === "gaokao") {
      let result;
      if (s.int >= 8) { result = "你考上了顶尖名校，全家欢腾！"; s.flags.add("名校"); s.achievements.push("高考状元"); s.mood = clamp(s.mood + 30, 0, 100); s.int += 1; deltas.push("心情 +30"); }
      else if (s.int >= 5) { result = "你考上一所普通大学。"; s.mood = clamp(s.mood + 8, 0, 100); }
      else { result = "你高考落榜，心情低落。"; s.mood = clamp(s.mood - 20, 0, 100); deltas.push("心情 -20"); }
      this.appendLog("  ↳ " + result, "result");
    }
    if (ev && ev.id === "checkup") {
      if (s.hp < 4) { s.hp = clamp(s.hp - 2, 0, 15); this.appendLog("  ↳ 体检发现健康问题，需要调养。（体质 -2）", "result"); }
      else { this.appendLog("  ↳ 各项指标正常，继续保持。", "result"); }
    }
    if (ev && ev.id === "startup") {
      if (Math.random() < (s.int >= 7 ? 0.6 : 0.25)) {
        const gain = 8000 + rand(8000);
        s.money += gain; s.mood = clamp(s.mood + 20, 0, 100);
        this.appendLog("  ↳ 创业大获成功，赚到 " + gain + " 元！", "result");
      } else {
        this.appendLog("  ↳ 创业失败，积蓄打了水漂。", "result");
        s.mood = clamp(s.mood - 15, 0, 100);
      }
    }

    if (deltas.length) this.appendLog("  ↳ " + deltas.join("，"), "delta");
    if (eff.die) return this.die("命运在此刻戛然而止。");
    if (s.hp <= 0) return this.die("你的身体撑不住了。");
  };

  // ---------- 一年结束：更新统计 / HUD ----------
  LifeGame.prototype.finishYear = function () {
    const s = this.state;
    s.moodSum += s.mood; s.moodCount++;
    // 金钱微薄收入（成年后）
    if (s.age >= 22 && s.age < 60) {
      const inc = Math.round((s.int * 200 + s.cha * 100) * (1 + s.workMul));
      if (inc > 0) { s.money += inc; }
    }
    // 房贷/生活支出（成年）
    if (s.age >= 25 && s.age < 60) s.money = Math.max(0, s.money - Math.round(300 + s.age * 5));
    this.updateHud();
    // 继续下一年
    if (this.auto) {
      this._autoTimer = setTimeout(() => this.nextYear(), 350);
    } else {
      this._showContinue();
    }
  };

  LifeGame.prototype._showContinue = function () {
    const box = $("choices");
    box.innerHTML = "";
    const btn = document.createElement("button");
    btn.className = "choice continue";
    btn.textContent = "下一年 ▶";
    btn.onclick = () => this.nextYear();
    box.appendChild(btn);
    // 键盘继续
  };

  // ---------- HUD / 日志 ----------
  LifeGame.prototype.updateHud = function () {
    const s = this.state;
    if (!s) return;
    $("hud-name").textContent = s.name;
    $("hud-age").textContent = s.age + " 岁";
    $("hud-talent").textContent = s.talent.name;
    const stats = [
      ["颜值", s.cha, 10], ["智力", s.int, 10], ["体质", s.hp, 10],
      ["家境", s.wealth, 10], ["金钱", s.money, 20000], ["心情", s.mood, 100],
    ];
    const box = $("stats");
    box.innerHTML = "";
    stats.forEach(([label, val, max]) => {
      const pct = clamp((val / max) * 100, 0, 100);
      const row = document.createElement("div");
      row.className = "stat-row";
      const disp = label === "金钱" ? fmtMoney(val) : Math.round(val);
      row.innerHTML = '<span class="stat-name">' + label + '</span>' +
        '<span class="stat-bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="stat-val">' + disp + '</span>';
      box.appendChild(row);
    });
    // 心情着色
    const moodRow = box.lastChild;
    if (s.mood < 30) moodRow.classList.add("bad");
    else if (s.mood < 60) moodRow.classList.add("warn");
  };

  function fmtMoney(v) {
    if (v >= 10000) return (v / 10000).toFixed(1) + "w";
    return v + "";
  }

  LifeGame.prototype.appendLog = function (text, cls) {
    const s = this.state;
    s && s.log.push({ text, cls });
    const log = $("log");
    const line = document.createElement("div");
    line.className = "log-line " + (cls || "");
    line.textContent = text;
    log.appendChild(line);
    log.scrollTop = log.scrollHeight;
  };

  // ---------- 死亡 / 结算 ----------
  LifeGame.prototype.die = function (reason) {
    const s = this.state;
    s.alive = false;
    this.stopAuto();
    this.appendLog("【终】" + reason + " 享年 " + s.age + " 岁。", "death");
    this.showEnding(reason);
  };

  LifeGame.prototype.showEnding = function (reason) {
    const s = this.state;
    const avgMood = s.moodSum / s.moodCount;
    const base = ((s.cha + s.int + s.hp) / 3) * 6; // 0-60
    const moneyScore = Math.min(30, s.money / 800);
    const moodScore = (avgMood / 100) * 25; // 0-25
    const ageScore = clamp((s.age - 18) * 0.3, 0, 15); // 0-15
    let score = base + moneyScore + moodScore + ageScore;
    // 天赋/成就加成
    if (s.achievements.length) score += s.achievements.length * 1.5;
    score = Math.round(score);

    let grade, title;
    if (score >= 95) { grade = "S"; title = "传奇人生"; }
    else if (score >= 80) { grade = "A"; title = "辉煌人生"; }
    else if (score >= 65) { grade = "B"; title = "顺遂人生"; }
    else if (score >= 50) { grade = "C"; title = "平凡人生"; }
    else if (score >= 35) { grade = "D"; title = "坎坷人生"; }
    else { grade = "F"; title = "摆烂王者"; }

    const achNames = {
      学霸: "学霸", 初恋: "初恋", 运动健将: "运动健将", 创业者: "创业达人", 海归: "海归精英",
      已婚: "步入婚姻", 为人父母: "为人父母", 有房: "有房一族", 离婚: "经历离异",
      广场舞王: "广场舞王", 百岁老人: "百岁老人", 名校: "名校毕业", "高考状元": "高考状元",
    };
    const achList = [...new Set(s.achievements)].map((a) => achNames[a] || a);

    $("end-grade").textContent = grade;
    $("end-grade").className = "end-grade g-" + grade.toLowerCase();
    $("end-title").textContent = title;
    $("end-summary").innerHTML =
      "<p><b>" + s.name + "</b> · 享年 <b>" + s.age + "</b> 岁</p>" +
      "<p class='muted'>" + reason + "</p>" +
      "<p>综合评分：<b>" + score + "</b> · 平均心情 " + Math.round(avgMood) + " · 遗产 " + fmtMoney(s.money) + " 元</p>" +
      (achList.length ? "<p class='ach'>" + achList.map((a) => "「" + a + "」").join("") + "</p>" : "<p class='muted'>一生平平淡淡，没有特别成就。</p>");

    // 结算日志
    const evLog = $("end-log");
    evLog.innerHTML = "";
    s.log.forEach((l) => {
      const d = document.createElement("div");
      d.className = "log-line " + (l.cls || "");
      d.textContent = l.text;
      evLog.appendChild(d);
    });
    evLog.scrollTop = 0;

    $("ending").classList.add("show");
  };

  // ---------- 自动模式 ----------
  LifeGame.prototype.toggleAuto = function () {
    this.auto = !this.auto;
    const btn = $("btn-auto");
    btn.textContent = this.auto ? "⏸ 暂停" : "⏩ 自动";
    btn.classList.toggle("on", this.auto);
    if (this.auto) {
      // 若当前停在「下一年」按钮或有选项，触发
      if (this.pending) { const i = this._autoPick(this.pending); this._autoTimer = setTimeout(() => this.choose(i), 300); }
      else if (this.state && this.state.alive && !$("choices").querySelector(".continue")) { /* 等待选项渲染 */ }
      else if (this.state && this.state.alive) { this._autoTimer = setTimeout(() => this.nextYear(), 300); }
    } else {
      this.stopAuto();
      if (this.state && this.state.alive && !this.pending) this._showContinue();
    }
  };

  LifeGame.prototype.stopAuto = function () {
    if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
  };

  LifeGame.prototype.restart = function () {
    this.stopAuto();
    this.state = null;
    this.firedOnce = new Set();
    this.pending = null;
    this.auto = false;
    $("btn-auto").textContent = "⏩ 自动";
    $("btn-auto").classList.remove("on");
    $("log").innerHTML = "";
    $("choices").innerHTML = "";
    $("ending").classList.remove("show");
    this.updateHudEmpty();
    this.showCreation();
  };

  LifeGame.prototype.updateHudEmpty = function () {
    $("hud-name").textContent = "——";
    $("hud-age").textContent = "——";
    $("hud-talent").textContent = "——";
    $("stats").innerHTML = "";
  };

  // ---------- 暴露 ----------
  window.LifeGame = LifeGame;
})();
