// === 族谱·传家 (Lineage) · 家族传承模拟器 ===
//  index.js -- 引擎：人物/家族模型、年度演算（经济/婚育/生死）、
//              递归树布局、SVG 像章肖像、缩放平移渲染、决策系统、终结结算
//  入口：game.html 中 new LineageGame(rootEl).start()

(function () {
  "use strict";

  // ---------- 工具 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = (n) => Math.floor(Math.random() * n);
  const pick = (arr) => arr[rand(arr.length)];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const $ = (id) => document.getElementById(id);
  function rrng(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

  // ---------- 姓名库 ----------
  const SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎".split("");
  const MALE_NAMES = ["景","轩","泽","渊","瑾","瑜","峻","衡","昭","珩","澄","昂","恪","慎","谦","睿","瀚","朗","卓","恒","慎","岳","崧","龄","麒","骥","鸿","鹄","鹤","卿","文昌","景行","怀瑾","子昂","伯庸","元礼","德昭","叔达","明远","承嗣","宗翰","克家","绍祖","延年","景福","嘉树","茂叔"];
  const FEMALE_NAMES = ["婉","清","嫣","芷","蕙","兰","琼","瑶","瑾","玥","璎","婉","姣","妍","婧","婵","娟","娴","婷","宁","宛","蓉","薇","芸","萱","蕊","晗","晗","昭","熙","清照","淑真","徽音","令仪","静姝","蕙仙","玉奴","婉清","语嫣","碧落","瑾瑜","芷若","念慈","如懿","若曦","灵犀","婉容"];
  const SPOUSE_SURNAMES = "林黄陈刘张王李赵吴周徐孙马朱胡郭何高林郑谢罗梁宋唐许韩冯邓曹彭".split("");

  // ---------- 职业 ----------
  // salary: 年收入；req: 'college' 需太学；variable: 浮动幅度；risk: 额外死亡风险
  const CAREERS = [
    { id: "farmer",   name: "务农",   salary: 190,  req: null,     desc: "面朝黄土，收入微薄但安稳" },
    { id: "artisan",  name: "匠人",   salary: 330,  req: null,     desc: "手艺傍身，衣食无忧" },
    { id: "merchant", name: "商贾",   salary: 460,  req: null,     variable: 220, desc: "走南闯北，收入丰厚但有风险" },
    { id: "military", name: "武将",   salary: 540,  req: null,     risk: 0.012, desc: "戎马倥偬，建功立业" },
    { id: "teacher",  name: "教书",   salary: 390,  req: "college", desc: "传道授业，清贵之选" },
    { id: "physician",name: "医者",   salary: 430,  req: "college", desc: "悬壶济世，受人敬重" },
    { id: "scholar",  name: "文官",   salary: 760,  req: "college", desc: "金榜题名，官运亨通" },
    { id: "minister", name: "侍郎",   salary: 1050, req: "college", risk: 0.006, desc: "位列朝堂，权倾一时" },
  ];
  const CAREER_BY_ID = Object.fromEntries(CAREERS.map((c) => [c.id, c]));

  // ---------- 出身 ----------
  const BACKGROUNDS = [
    { id: "humble",   name: "寒门",   treasury: 700,  desc: "家徒四壁，白手起家" },
    { id: "common",   name: "小康",   treasury: 3200, desc: "薄有恒产，衣食不愁" },
    { id: "wealthy",  name: "富户",   treasury: 12000,desc: "钟鸣鼎食，家底殷实" },
  ];

  // ---------- 树布局常量 ----------
  const CARD_W = 136, CARD_H = 96, SIB_GAP = 28, COUPLE_GAP = 20, GEN_GAP = 84;

  // ---------- 人物 ----------
  let _pid = 1;
  function makePerson(opts) {
    const seed = (_pid * 2654435761) >>> 0;
    return {
      id: "p" + _pid++,
      seed,
      name: opts.name,
      surname: opts.surname,
      gender: opts.gender,
      birthMonth: opts.birthMonth,
      deathMonth: null,
      generation: opts.generation || 0,
      parents: opts.parents || [],
      spouse: null,
      children: [],
      career: opts.career || null,        // career id
      educated: opts.educated || false,   // 是否读过太学
      schooling: opts.schooling || false, // 在读蒙学
      retired: false,
      marriedIn: !!opts.marriedIn,        // 外姓嫁入/入赘
      isBlood: opts.isBlood !== false,    // 本族血脉（族谱主线）
      wasMarried: false,                  // 是否曾丧偶
      tempStatus: null,                   // away远行 / mourning守制 / prison入狱
      tempUntil: 0,                       // 临时状态到期年
      omen: null,                         // 谶语 {type:"noble"|"premature"}
      hasConcubine: false,                // 纳妾（旺丁）
      traits: opts.traits || [],
    };
  }

  function fullName(p) { return p.surname + p.name; }
  function ageOf(p, month) { const m = p.deathMonth != null ? p.deathMonth : month; return Math.floor((m - p.birthMonth) / 12); }
  function ageMonthsOf(p, month) { return (p.deathMonth != null ? p.deathMonth : month) - p.birthMonth; }
  function ymLabel(s) { return s.year + "年" + (((s.month - 1) % 12) + 1) + "月"; }
  function isAlive(p) { return p.deathMonth == null; }
  function statusOf(p, year) {
    if (!isAlive(p)) return "已故";
    const a = ageOf(p, year);
    if (a < 6) return "幼龄";
    if (a < 18) return p.schooling ? "蒙学" : "垂髫";
    if (p.tempStatus === "away") return "远行";
    if (p.tempStatus === "mourning") return "守制";
    if (p.tempStatus === "prison") return "系狱";
    if (p.retired) return "颐养";
    if (p.career) return CAREER_BY_ID[p.career].name;
    return "待业";
  }

  // ---------- 肖像 SVG ----------
  const SKIN_TONES = ["#f3d5b8", "#ecc39a", "#e0ad82", "#cf9a6e"];
  const GARMENT_M = ["#3a4a5a", "#4a3a3a", "#3a4a3a", "#4a4a3a", "#5a3a3a", "#2f4f4f"];
  const GARMENT_F = ["#7a3a4a", "#6a4a6a", "#3a5a6a", "#7a5a3a", "#5a3a5a", "#4a6a6a"];
  const HAIR_DARK = ["#1a1410", "#2b2018", "#3a2a1a", "#4a3526", "#1e1612"];
  function portraitSVG(p, year, size) {
    const rng = mulberry32(p.seed);
    const age = ageOf(p, year);
    const dead = !isAlive(p);
    const isMale = p.gender === "male";
    const skin = rrng(rng, SKIN_TONES);
    const hair = age >= 58 ? "#b8b0a4" : rrng(rng, HAIR_DARK);
    const garment = isMale ? rrng(rng, GARMENT_M) : rrng(rng, GARMENT_F);
    const bgTint = isMale ? ["#e6dcc0", "#dcd0b0", "#e0d4b8"][Math.floor(rng() * 3)] : ["#ecd6c8", "#e8d0c0", "#eed8c8"][Math.floor(rng() * 3)];
    const ring = dead ? "#9a8d6a" : "#b8924a";
    const op = dead ? 0.55 : 1;

    // 五官微调（每个个体固定）
    const eyeDy = Math.round((rng() - 0.5) * 2);
    const mouthType = Math.floor(rng() * 3);

    const parts = [];
    parts.push(`<svg viewBox="0 0 100 100" width="${size}" height="${size}" style="display:block">`);
    parts.push(`<defs><radialGradient id="g${p.id}" cx="50%" cy="38%" r="62%"><stop offset="0%" stop-color="${bgTint}" stop-opacity="1"/><stop offset="100%" stop-color="${shade(bgTint, -22)}" stop-opacity="1"/></radialGradient></defs>`);
    parts.push(`<circle cx="50" cy="50" r="49" fill="url(#g${p.id})" opacity="${op}"/>`);
    parts.push(`<circle cx="50" cy="50" r="48.5" fill="none" stroke="${ring}" stroke-width="1.4" opacity="${op}"/>`);
    // 肩领
    parts.push(`<path d="M16,100 Q18,74 34,68 Q42,72 50,72 Q58,72 66,68 Q82,74 84,100 Z" fill="${garment}" opacity="${op}"/>`);
    parts.push(`<path d="M42,72 Q50,80 58,72" fill="none" stroke="${shade(garment, -28)}" stroke-width="2" opacity="${op}"/>`);
    // 颈
    parts.push(`<rect x="44" y="60" width="12" height="14" rx="5" fill="${shade(skin, -12)}" opacity="${op}"/>`);
    // 脸
    parts.push(`<ellipse cx="50" cy="46" rx="16.5" ry="19" fill="${skin}" opacity="${op}"/>`);
    // 耳
    parts.push(`<ellipse cx="33.5" cy="47" rx="2.6" ry="3.6" fill="${shade(skin, -10)}" opacity="${op}"/>`);
    parts.push(`<ellipse cx="66.5" cy="47" rx="2.6" ry="3.6" fill="${shade(skin, -10)}" opacity="${op}"/>`);
    // 头发
    if (isMale) {
      parts.push(`<path d="M33,40 Q33,24 50,24 Q67,24 67,40 Q67,34 60,32 Q55,30 50,31 Q45,30 40,32 Q33,34 33,40 Z" fill="${hair}" opacity="${op}"/>`);
      if (age < 12) parts.push(`<path d="M36,30 Q50,18 64,30 Q60,26 50,25 Q40,26 36,30 Z" fill="${hair}" opacity="${op}"/>`);
    } else {
      parts.push(`<path d="M30,44 Q28,24 50,22 Q72,24 70,44 Q70,56 66,64 Q68,52 64,40 Q60,30 50,29 Q40,30 36,40 Q32,52 34,64 Q30,56 30,44 Z" fill="${hair}" opacity="${op}"/>`);
      parts.push(`<path d="M34,30 Q50,18 66,30 Q60,24 50,23 Q40,24 34,30 Z" fill="${hair}" opacity="${op}"/>`);
    }
    // 眉
    parts.push(`<path d="M40,41 Q43,39.5 46,41" fill="none" stroke="${hair}" stroke-width="1.3" stroke-linecap="round" opacity="${op}"/>`);
    parts.push(`<path d="M54,41 Q57,39.5 60,41" fill="none" stroke="${hair}" stroke-width="1.3" stroke-linecap="round" opacity="${op}"/>`);
    // 眼
    parts.push(`<ellipse cx="43" cy="${45 + eyeDy}" rx="1.7" ry="2.3" fill="#2a2018" opacity="${op}"/>`);
    parts.push(`<ellipse cx="57" cy="${45 + eyeDy}" rx="1.7" ry="2.3" fill="#2a2018" opacity="${op}"/>`);
    // 鼻
    parts.push(`<path d="M50,47 Q48.5,52 50,53 Q51.5,52 50,47" fill="none" stroke="${shade(skin, -28)}" stroke-width="0.9" opacity="${op}"/>`);
    // 嘴
    if (mouthType === 0) parts.push(`<path d="M46,57 Q50,58.5 54,57" fill="none" stroke="#9a4a3a" stroke-width="1.1" stroke-linecap="round" opacity="${op}"/>`);
    else if (mouthType === 1) parts.push(`<path d="M46,57 Q50,56 54,57" fill="none" stroke="#9a4a3a" stroke-width="1.1" stroke-linecap="round" opacity="${op}"/>`);
    else parts.push(`<line x1="47" y1="57" x2="53" y2="57" stroke="#9a4a3a" stroke-width="1.1" stroke-linecap="round" opacity="${op}"/>`);
    // 腮红（女性/幼年）
    if (!isMale || age < 12) {
      parts.push(`<ellipse cx="40" cy="52" rx="2.4" ry="1.6" fill="#e8a090" opacity="${0.4 * op}"/>`);
      parts.push(`<ellipse cx="60" cy="52" rx="2.4" ry="1.6" fill="#e8a090" opacity="${0.4 * op}"/>`);
    }
    parts.push(`</svg>`);
    return parts.join("");
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = clamp(r + amt, 0, 255); g = clamp(g + amt, 0, 255); b = clamp(b + amt, 0, 255);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ---------- 自动推进节奏 ----------
  const AUTO_TICK_MS = 2000;
  const uid = () => "d" + Math.random().toString(36).slice(2, 7);
  const STALE = "事过境迁，已无须决断。";

  // ---------- 随机事件池（影响收入与人口，需玩家抉择） ----------
  // make(g) 返回决策对象 {id,kind,title,text,targetId,choices:[{text,sub,apply(g)->文案}]} 或 null
  const DECISION_EVENTS = [
    // 染疾
    { weight: 3, make(g) {
      const s = g.state;
      const living = [...s.members.values()].filter((p) => isAlive(p) && ageOf(p, s.month) >= 3 && ageOf(p, s.month) <= 80);
      if (!living.length) return null;
      const p = pick(living), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "染疾", targetId: pid,
        text: name + "忽染沉疴，卧床不起，高热不退，须速决断。",
        choices: [
          { text: "重金请名医", sub: "-400 贯", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; g.adjustTreasury(-400); return name + "经名医诊治，转危为安。"; } },
          { text: "听天由命", sub: "或病故", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; if (Math.random() < 0.35) { g.killMember(p); return name + "药石无灵，不幸病故。"; } return name + "命硬，竟自挺了过来。"; } },
        ] };
    } },
    // 天灾
    { weight: 1.2, make(g) {
      const t = pick(["大旱", "大水", "蝗灾", "霜冻"]);
      return { id: uid(), kind: "event", title: "天灾·" + t, targetId: null,
        text: "今岁" + t + "成灾，赤地千里，族中生计艰难，恐有饿殍之虞。",
        choices: [
          { text: "开仓赈济", sub: "-1500 贯", apply: (g) => { g.adjustTreasury(-1500); return "开仓放粮，族人安然度荒。"; } },
          { text: "节衣缩食", sub: "-300 贯，老幼或罹难", apply: (g) => { g.adjustTreasury(-300); const vuln = [...g.state.members.values()].filter((p) => isAlive(p) && (ageOf(p, g.state.month) < 10 || ageOf(p, g.state.month) >= 65)); const died = []; for (const p of vuln) if (Math.random() < 0.25) { g.killMember(p); died.push(fullName(p)); } return "节衣缩食度日" + (died.length ? "，" + died.join("、") + "不幸罹难。" : "，侥幸度荒。"); } },
        ] };
    } },
    // 商机
    { weight: 1.5, make(g) {
      if (g.state.treasury < 3000) return null;
      return { id: uid(), kind: "event", title: "商机", targetId: null,
        text: "有商贾携一桩买卖相邀，或可获厚利，亦恐血本无归。",
        choices: [
          { text: "投入 2000 贯", sub: "博 4500 贯", apply: (g) => { if (g.state.treasury < 2000) return "家产已不足，未能成行。"; g.adjustTreasury(-2000); if (Math.random() < 0.55) { g.adjustTreasury(4500); return "生意大赚，净赚 2500 贯！"; } return "生意亏折，血本无归。"; } },
          { text: "婉言观望", sub: "无得失", apply: () => "审时度势，按兵不动。", decline: true },
        ] };
    } },
    // 征役
    { weight: 1, make(g) {
      const s = g.state;
      const cands = [...s.members.values()].filter((p) => isAlive(p) && p.gender === "male" && p.isBlood && ageOf(p, s.month) >= 18 && ageOf(p, s.month) <= 40);
      if (!cands.length) return null;
      const p = pick(cands), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "征役", targetId: pid,
        text: name + "被官府点丁，须往边关服役，吉凶未卜。",
        choices: [
          { text: "应役前往", sub: "8% 阵亡", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; if (Math.random() < 0.08) { g.killMember(p); return name + "马革裹尸，魂归故里。"; } return name + "历险归来，无恙还乡。"; } },
          { text: "行贿免役", sub: "-1000 贯", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; g.adjustTreasury(-1000); return name + "行贿上下，免了此役。"; } },
        ] };
    } },
    // 收养义子
    { weight: 0.9, make(g) {
      const s = g.state;
      const seen = new Set(), couples = [];
      for (const p of s.members.values()) if (isAlive(p) && p.spouse && !seen.has(p.id)) { seen.add(p.id); seen.add(p.spouse); couples.push(p); }
      if (!couples.length) return null;
      const a = pick(couples), aid = a.id, sid = a.spouse;
      return { id: uid(), kind: "event", title: "收养", targetId: aid,
        text: "远亲遭逢变故，欲将一子托付" + fullName(a) + "抚养，是否收为义子？",
        choices: [
          { text: "收为义子", sub: "-500 贯，+1 族人", apply: (g) => { const s = g.state; const ap = s.members.get(aid); if (!ap || !isAlive(ap)) return STALE; g.adjustTreasury(-500); const gdr = Math.random() < 0.5 ? "male" : "female"; const child = g.addMember({ name: pick(gdr === "male" ? MALE_NAMES : FEMALE_NAMES), surname: s.surname, gender: gdr, birthMonth: s.month - 12, generation: a.generation + 1, parents: [aid, sid], isBlood: true }); ap.children.push(child.id); const sp = s.members.get(sid); if (sp) sp.children.push(child.id); return "收养义子" + fullName(child) + "入籍。"; } },
          { text: "婉拒", sub: "", apply: () => "婉言谢绝。", decline: true },
        ] };
    } },
    // 盗匪
    { weight: 1.1, make(g) {
      if (g.state.treasury < 2000) return null;
      return { id: uid(), kind: "event", title: "盗匪", targetId: null,
        text: "深夜盗匪入宅，劫去财物若干，如何处置？",
        choices: [
          { text: "报官追讨", sub: "-200 贯", apply: (g) => { g.adjustTreasury(-200); if (Math.random() < 0.5) { g.adjustTreasury(800); return "报官追讨，追回大半。"; } return "报官无果，徒耗钱财。"; } },
          { text: "招募护院", sub: "-700 贯", apply: (g) => { g.adjustTreasury(-700); return "招募护院，今后可保安宁。"; } },
          { text: "忍气吞声", sub: "-1200 贯", apply: (g) => { g.adjustTreasury(-1200); return "忍气吞声，损失惨重。"; }, decline: true },
        ] };
    } },
    // 瘟疫
    { weight: 0.4, make(g) {
      if (g.state.members.size < 3) return null;
      return { id: uid(), kind: "event", title: "瘟疫", targetId: null,
        text: "四乡瘟疫流行，族中亦有人染病，情势危急。",
        choices: [
          { text: "隔离救治", sub: "-2000 贯", apply: (g) => { g.adjustTreasury(-2000); const vuln = [...g.state.members.values()].filter(isAlive); const died = []; for (const p of vuln) if (Math.random() < 0.08) { g.killMember(p); died.push(fullName(p)); } return "隔离救治，疫情渐息" + (died.length ? "，" + died.join("、") + "殁于瘟疫。" : "。"); } },
          { text: "闭门祈福", sub: "伤亡难料", apply: (g) => { const vuln = [...g.state.members.values()].filter(isAlive); const died = []; for (const p of vuln) if (Math.random() < 0.22) { g.killMember(p); died.push(fullName(p)); } return "闭门祈福" + (died.length ? "，" + died.join("、") + "殁于瘟疫。" : "，竟得幸免。"); } },
        ] };
    } },
    // 丧偶续弦 / 改嫁
    { weight: 1.3, make(g) {
      const s = g.state;
      const cands = [...s.members.values()].filter((p) => isAlive(p) && !p.spouse && p.wasMarried && p.isBlood && ageOf(p, s.month) >= 22 && ageOf(p, s.month) <= 48);
      if (!cands.length) return null;
      const p = pick(cands), pid = p.id, name = fullName(p);
      const sg = p.gender === "male" ? "female" : "male";
      const ss = pick(SPOUSE_SURNAMES), sn = pick(sg === "male" ? MALE_NAMES : FEMALE_NAMES);
      const dowry = Math.round(400 + Math.random() * 1500);
      const qdesc = dowry > 1400 ? "名门" : dowry > 800 ? "良家" : "寒门";
      return { id: uid(), kind: "event", title: "议亲", targetId: pid,
        text: name + "丧偶未续，有人议亲，对方" + ss + sn + "（" + qdesc + "），聘礼 " + dowry + " 贯。",
        choices: [
          { text: "应允", sub: dowry + " 贯", accept: true, apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p) || p.spouse) return STALE; if (g.state.treasury < dowry) return "家产不足，婚事作罢。"; g.adjustTreasury(-dowry); const sp = g.addMember({ name: sn, surname: ss, gender: sg, birthMonth: p.birthMonth + Math.round((Math.random() - 0.5) * 48), generation: p.generation, marriedIn: true, isBlood: false }); sp.career = pick(["artisan", "merchant", "farmer", "teacher"]); p.spouse = sp.id; sp.spouse = p.id; return name + "与" + fullName(sp) + "结为连理。"; } },
          { text: "婉拒", sub: "", apply: () => name + "无意再娶。", decline: true },
        ] };
    } },
    // ===== 喜庆正向 =====
    // 祥瑞降世
    { weight: 0.5, make(g) {
      return { id: uid(), kind: "event", title: "祥瑞", targetId: null,
        text: "族中现祥瑞之兆（嘉禾合穗、白鹿现），或主吉运。",
        choices: [
          { text: "上表献瑞", sub: "-300 贯，+名望", apply: (g) => { g.adjustTreasury(-300); g.adjustPrestige(12); if (Math.random() < 0.2) { g.adjustTreasury(2000); return "献瑞得御赐赏银 2000 贯，族誉远扬。"; } return "上表献瑞，族中名望渐显。"; } },
          { text: "秘而不宣", sub: "+微名望", apply: (g) => { g.adjustPrestige(4); return "秘而不宣，以为吉兆。"; }, decline: true },
        ] };
    } },
    // 丰收
    { weight: 1.6, make(g) {
      return { id: uid(), kind: "event", title: "丰收", targetId: null,
        text: "今岁风调雨顺，五谷丰登，仓廪充盈。",
        choices: [
          { text: "设宴庆贺", sub: "-300 贯，+名望", apply: (g) => { g.adjustTreasury(-300); g.adjustPrestige(5); return "设宴庆贺，族人尽欢。"; } },
          { text: "入仓备荒", sub: "+500 贯", apply: (g) => { g.adjustTreasury(500); return "余粮入仓，以备荒年。"; }, decline: true },
        ] };
    } },
    // 御赐旌表
    { weight: 0.6, make(g) {
      if (g.state.prestige < 25) return null;
      return { id: uid(), kind: "event", title: "御赐", targetId: null,
        text: "族中声名远播，朝廷旌表赐匾。",
        choices: [
          { text: "设坛谢恩", sub: "-500 贯，+名望", apply: (g) => { g.adjustTreasury(-500); g.adjustPrestige(15); return "设坛谢恩，御赐\"义门\"匾额，名望大增。"; } },
          { text: "低调谢恩", sub: "+名望", apply: (g) => { g.adjustPrestige(8); return "低调谢恩，收匾供奉。"; }, decline: true },
        ] };
    } },
    // ===== 科举仕途 =====
    // 科举应试
    { weight: 1.2, make(g) {
      const s = g.state;
      const cands = [...s.members.values()].filter((p) => isAlive(p) && p.isBlood && p.educated && !p.tempStatus && ageOf(p, s.month) >= 18 && ageOf(p, s.month) <= 40 && p.career !== "scholar" && p.career !== "minister");
      if (!cands.length) return null;
      const p = pick(cands), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "科举", targetId: pid,
        text: name + "学有所成，可赴京应试，然盘缠不菲。",
        choices: [
          { text: "全力备考", sub: "-600 贯", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; if (g.state.treasury < 600) return "盘缠不足，未能成行。"; g.adjustTreasury(-600); if (Math.random() < 0.5) { p.career = Math.random() < 0.3 ? "minister" : "scholar"; p.educated = true; g.adjustPrestige(15); return name + "高中" + (p.career === "minister" ? "甲榜，授侍郎" : "进士") + "，光耀门楣！"; } return name + "名落孙山，铩羽而归。"; } },
          { text: "弃考", sub: "", apply: () => name + "无意功名，弃考不出。", decline: true },
        ] };
    } },
    // 升迁贬谪
    { weight: 1, make(g) {
      const s = g.state;
      const cands = [...s.members.values()].filter((p) => isAlive(p) && !p.tempStatus && (p.career === "scholar" || p.career === "minister" || p.career === "military") && ageOf(p, s.month) >= 25);
      if (!cands.length) return null;
      const p = pick(cands), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "考课", targetId: pid,
        text: name + "任上逢朝廷考课，或升或贬。",
        choices: [
          { text: "钻营打点", sub: "-800 贯", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; g.adjustTreasury(-800); if (Math.random() < 0.6) { if (p.career === "scholar") p.career = "minister"; g.adjustPrestige(8); return name + "上下打点，得获升迁。"; } return name + "打点无果，原地不动。"; } },
          { text: "听天由命", sub: "升降各半", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; const r = Math.random(); if (r < 0.4) { if (p.career === "scholar") p.career = "minister"; g.adjustPrestige(6); return name + "政绩卓著，获升迁。"; } else if (r < 0.7) { p.career = p.career === "minister" ? "scholar" : "artisan"; g.adjustPrestige(-8); return name + "考课不佳，遭贬谪。"; } return name + "考课平平，无升无降。"; } },
        ] };
    } },
    // ===== 家族大戏 =====
    // 嫡庶之争
    { weight: 0.8, make(g) {
      const s = g.state;
      if (s.flags.has("succession")) return null;
      const seen = new Set(), couples = [];
      for (const p of s.members.values()) {
        if (isAlive(p) && p.spouse && !seen.has(p.id)) { seen.add(p.id); seen.add(p.spouse);
          const kids = p.children.map((id) => s.members.get(id)).filter((c) => c && isAlive(c) && c.isBlood && ageOf(c, s.month) >= 16);
          if (kids.length >= 2) couples.push(p);
        }
      }
      if (!couples.length) return null;
      const p = pick(couples), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "嫡庶之争", targetId: pid,
        text: name + "膝下诸子争嫡，暗中角立，须早定储嗣。",
        choices: [
          { text: "立长不立幼", sub: "", apply: (g) => { g.adjustPrestige(-2); return name + "立长不立幼，暂息纷争。"; } },
          { text: "立贤不立长", sub: "+名望，或埋患", apply: (g) => { g.adjustPrestige(3); if (Math.random() < 0.3) g.state.flags.add("succession"); return name + "立贤不立长，众议稍平。"; } },
          { text: "均分家业", sub: "恐埋分家之患", apply: (g) => { g.state.flags.add("succession"); return name + "均分家业以安诸子，却埋下分家之患。"; }, decline: true },
        ] };
    } },
    // 过继
    { weight: 0.7, make(g) {
      const s = g.state;
      const cands = [...s.members.values()].filter((p) => isAlive(p) && p.isBlood && p.spouse && p.children.length === 0 && ageOf(p, s.month) >= 30 && ageOf(p, s.month) <= 55);
      if (!cands.length) return null;
      const p = pick(cands), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "过继", targetId: pid,
        text: name + "膝下无子，族中议从兄弟房中过继一子承祧。",
        choices: [
          { text: "过继侄辈", sub: "+1 子嗣", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p) || !p.spouse) return STALE; const gdr = Math.random() < 0.6 ? "male" : "female"; const cn = pick(gdr === "male" ? MALE_NAMES : FEMALE_NAMES); const child = g.addMember({ name: cn, surname: g.state.surname, gender: gdr, birthMonth: g.state.month - 72, generation: p.generation + 1, parents: [pid, p.spouse], isBlood: true }); p.children.push(child.id); const sp = g.state.members.get(p.spouse); if (sp) sp.children.push(child.id); return name + "过继" + (gdr === "male" ? "一子" : "一女") + "承祧，取名" + cn + "。"; } },
          { text: "暂不过继", sub: "", apply: () => name + "暂不过继，听天由命。", decline: true },
        ] };
    } },
    // 结仇
    { weight: 0.7, make(g) {
      const s = g.state;
      if (s.flags.has("feud")) return null;
      if (s.treasury < 1500 && s.prestige < 20) return null;
      return { id: uid(), kind: "event", title: "结怨", targetId: null,
        text: "族中与邻邑大户起了龃龉，恐结世仇。",
        choices: [
          { text: "重金化解", sub: "-1500 贯", apply: (g) => { g.adjustTreasury(-1500); return "重金赔礼，化干戈为玉帛。"; } },
          { text: "针锋相对", sub: "结仇，后患无穷", apply: (g) => { g.state.flags.add("feud"); return "针锋相对，自此结下世仇。"; }, decline: true },
        ] };
    } },
    // 纳妾
    { weight: 0.8, make(g) {
      const s = g.state;
      const cands = [...s.members.values()].filter((p) => isAlive(p) && p.isBlood && p.gender === "male" && p.spouse && !p.hasConcubine && !p.tempStatus && ageOf(p, s.month) >= 25 && ageOf(p, s.month) <= 50 && s.treasury >= 800);
      if (!cands.length) return null;
      const p = pick(cands), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "纳妾", targetId: pid,
        text: name + "子嗣单薄，有人荐一女子为妾。",
        choices: [
          { text: "纳之为妾", sub: "-800 贯，助旺丁", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; g.adjustTreasury(-800); p.hasConcubine = true; return name + "纳妾，子嗣可期。"; } },
          { text: "婉拒", sub: "", apply: () => name + "无意纳妾。", decline: true },
        ] };
    } },
    // ===== 长线经营 =====
    // 置田庄
    { weight: 1, make(g) {
      if (g.state.treasury < 3000) return null;
      return { id: uid(), kind: "event", title: "置田", targetId: null,
        text: "邻乡有良田出售，置办可得岁计之利。",
        choices: [
          { text: "置田 3000 贯", sub: "+200 贯/年", apply: (g) => { if (g.state.treasury < 3000) return "家产不足，未能成事。"; g.adjustTreasury(-3000); g.addProperty(200); return "购得良田，每年可增收 200 贯。"; } },
          { text: "暂不置办", sub: "", apply: () => "审时度势，暂不置办。", decline: true },
        ] };
    } },
    // 修祠堂
    { weight: 0.7, make(g) {
      if (g.state.treasury < 2500 || g.state.month <= g.state.buffMortalityUntil) return null;
      return { id: uid(), kind: "event", title: "修祠", targetId: null,
        text: "祖祠年久失修，族人议重修祠堂以安祖灵。",
        choices: [
          { text: "修缮祠堂", sub: "-2500 贯，十年减灾", apply: (g) => { g.adjustTreasury(-2500); g.state.buffMortalityUntil = g.state.month + 120; g.adjustPrestige(6); return "祠堂焕然，祖灵安佑，十年内族中殒伤减少。"; } },
          { text: "暂缓", sub: "", apply: () => "暂缓修缮。", decline: true },
        ] };
    } },
    // 远行走商
    { weight: 0.8, make(g) {
      const s = g.state;
      const c = [...s.members.values()].filter((p) => isAlive(p) && p.isBlood && p.gender === "male" && !p.tempStatus && ageOf(p, s.month) >= 20 && ageOf(p, s.month) <= 45);
      if (!c.length) return null;
      const p = pick(c), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "远行", targetId: pid,
        text: name + "欲远赴他乡贩货，或获厚利，或历险难，数载方归。",
        choices: [
          { text: "遣其远行", sub: "离族 4 年", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; p.tempStatus = "away"; p.tempUntil = g.state.month + 48; return name + "束装就道，远行而去。"; } },
          { text: "留守家中", sub: "", apply: () => name + "留守家中，安分度日。", decline: true },
        ] };
    } },
    // 祭祀祖荫
    { weight: 1, make(g) {
      if (g.state.month <= g.state.buffMortalityUntil) return null;
      return { id: uid(), kind: "event", title: "祭祀", targetId: null,
        text: "时值祭祖之期，隆重与否关乎祖荫。",
        choices: [
          { text: "隆重祭祀", sub: "-200 贯，三年庇佑", apply: (g) => { g.adjustTreasury(-200); g.state.buffMortalityUntil = g.state.month + 36; return "隆重祭祀，祖荫庇佑三年。"; } },
          { text: "从简", sub: "-30 贯", apply: (g) => { g.adjustTreasury(-30); return "从简祭祀，聊表孝心。"; }, decline: true },
        ] };
    } },
    // ===== 江湖志怪 =====
    // 方士求丹
    { weight: 0.6, make(g) {
      const s = g.state;
      if (s.treasury < 1500) return null;
      const elders = [...s.members.values()].filter((p) => isAlive(p) && ageOf(p, s.month) >= 55);
      if (!elders.length) return null;
      const p = pick(elders), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "方士", targetId: pid,
        text: "有方士登门，称能炼丹延年，索金甚昂。",
        choices: [
          { text: "重金求丹", sub: "-1500 贯", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; g.adjustTreasury(-1500); const r = Math.random(); if (r < 0.15) { p.birthMonth -= 96; return name + "服丹见效，似还少八载。"; } else if (r < 0.5) { return name + "服丹无益，所幸无碍。"; } return "方士卷款而逃，方知是骗局。"; } },
          { text: "斥之", sub: "", apply: () => "斥退方士，不为所惑。", decline: true },
        ] };
    } },
    // 异人投奔
    { weight: 0.5, make(g) {
      return { id: uid(), kind: "event", title: "异人", targetId: null,
        text: "有身手不凡的异人欲投族中求庇。",
        choices: [
          { text: "收留为护院", sub: "-400 贯，御仇防盗", apply: (g) => { g.adjustTreasury(-400); g.state.flags.add("guarded"); return "收留异人为护院，此后盗匪仇家难犯。"; } },
          { text: "拒之门外", sub: "", apply: () => "婉拒异人。", decline: true },
        ] };
    } },
    // ===== 灾祸加码 =====
    // 兵乱
    { weight: 0.3, make(g) {
      if (g.state.members.size < 4) return null;
      return { id: uid(), kind: "event", title: "兵乱", targetId: null,
        text: "兵燹骤至，流兵过境，烧杀抢掠。",
        choices: [
          { text: "举族避祸", sub: "-2000 贯", apply: (g) => { g.adjustTreasury(-2000); const vuln = [...g.state.members.values()].filter(isAlive); const died = []; for (const p of vuln) if (Math.random() < 0.05) { g.killMember(p); died.push(fullName(p)); } return "举族避祸" + (died.length ? "，" + died.join("、") + "殁于乱军。" : "，得保大体。"); } },
          { text: "固守自保", sub: "死伤难料，或立军功", apply: (g) => { const vuln = [...g.state.members.values()].filter(isAlive); const died = []; for (const p of vuln) if (Math.random() < 0.18) { g.killMember(p); died.push(fullName(p)); } if (Math.random() < 0.3) { g.adjustPrestige(10); return "固守退敌，反立军功，名望大增" + (died.length ? "；" + died.join("、") + "殁于战。" : "。"); } return "固守自保" + (died.length ? "，" + died.join("、") + "殁于战。" : "，侥幸得全。"); } },
        ] };
    } },
    // 火灾
    { weight: 0.6, make(g) {
      return { id: uid(), kind: "event", title: "火灾", targetId: null,
        text: "夜半走水，火势凶猛，危及家财。",
        choices: [
          { text: "招人扑救", sub: "-400 贯", apply: (g) => { g.adjustTreasury(-400); g.adjustTreasury(-Math.round(Math.random() * 600)); return "奋力扑救，损折尚轻。"; } },
          { text: "听之任之", sub: "损失惨重", apply: (g) => { g.adjustTreasury(-1500 - Math.round(Math.random() * 1500)); return "火势蔓延，损失惨重。"; }, decline: true },
        ] };
    } },
    // 诬告官司
    { weight: 0.7, make(g) {
      const s = g.state;
      const cands = [...s.members.values()].filter((p) => isAlive(p) && p.isBlood && !p.tempStatus && (p.career === "scholar" || p.career === "minister" || s.treasury >= 2000) && ageOf(p, s.month) >= 22);
      if (!cands.length) return null;
      const p = pick(cands), pid = p.id, name = fullName(p);
      return { id: uid(), kind: "event", title: "官司", targetId: pid,
        text: name + "遭人诬告，讼狱缠身，须速决断。",
        choices: [
          { text: "上下打点", sub: "-1200 贯", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; g.adjustTreasury(-1200); return name + "破财消灾，官司了结。"; } },
          { text: "对簿公堂", sub: "或入狱或昭雪", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; const r = Math.random(); if (r < 0.4) { p.tempStatus = "prison"; p.tempUntil = g.state.month + 24; g.adjustPrestige(-10); return name + "败诉入狱，名望受损。"; } else if (r < 0.75) { return name + "对簿公堂，侥幸脱罪。"; } g.adjustPrestige(5); return name + "昭雪获释，反得清誉。"; } },
        ] };
    } },
  ];

  // ---------- 游戏主类 ----------
  function LineageGame(root) {
    this.root = root;
    this.viewport = $("tree-viewport");
    this.world = $("tree-world");
    this.svg = $("tree-svg");
    this.state = null;
    this.zoom = 1;
    this.panX = 0;
    this.panY = 0;
    this.auto = false;
    this.autoTimer = null;
    this._dragging = false;
    this._dragStart = null;
    this._bindViewport();
  }

  // 创建开局人物
  LineageGame.prototype.start = function () { this.showCreation(); };

  LineageGame.prototype.showCreation = function () {
    const self = this;
    const modal = $("creation");
    modal.classList.add("show");
    let gender = "male";
    let surname = pick(SURNAMES);
    let bg = BACKGROUNDS[1];

    const renderGender = () => {
      $("c-gender-m").classList.toggle("sel", gender === "male");
      $("c-gender-f").classList.toggle("sel", gender === "female");
    };
    const renderBg = () => {
      $("c-bg").innerHTML = "";
      BACKGROUNDS.forEach((b) => {
        const el = document.createElement("div");
        el.className = "bg-opt" + (bg.id === b.id ? " sel" : "");
        el.innerHTML = "<b>" + b.name + "</b><span>" + b.desc + "<i>起始家产 " + b.treasury + " 贯</i></span>";
        el.onclick = () => { bg = b; renderBg(); };
        $("c-bg").appendChild(el);
      });
    };

    $("c-surname").textContent = surname;
    $("c-roll-surname").onclick = () => { surname = pick(SURNAMES); $("c-surname").textContent = surname; };
    $("c-gender-m").onclick = () => { gender = "male"; renderGender(); };
    $("c-gender-f").onclick = () => { gender = "female"; renderGender(); };
    $("c-start").onclick = () => {
      modal.classList.remove("show");
      const name = pick(gender === "male" ? MALE_NAMES : FEMALE_NAMES);
      self.beginLineage(surname, name, gender, bg);
    };
    renderGender();
    renderBg();
  };

  LineageGame.prototype.beginLineage = function (surname, name, gender, bg) {
    _pid = 1;
    const year = 1; // 纪月从 1 开始（12 月 = 1 年）
    const founder = makePerson({
      name, surname, gender, birthMonth: year - 240, generation: 0, isBlood: true,
    });
    // 开局给一个职业
    founder.career = bg.id === "wealthy" ? "merchant" : bg.id === "common" ? "artisan" : "farmer";
    this.state = {
      surname, dynastyName: surname + "氏家族",
      month: year, startMonth: year, year, startYear: year,
      treasury: bg.treasury,
      members: new Map([[founder.id, founder]]),
      rootId: founder.id,
      log: [],
      decisions: [],
      selectedId: founder.id,
      stats: { totalBorn: 1, totalDied: 0, peakTreasury: bg.treasury, generations: 1 },
      ended: false,
      wasNegative: false,
      prestige: 0,            // 名望
      property: 0,            // 田产年被动收入
      flags: new Set(),       // 族级 flag：feud/succession/guarded
      buffMortalityUntil: 0,  // 死亡率减免到期年（修祠/祭祀）
    };
    this.appendLog("【元年初】" + surname + "氏开基立业，" + fullName(founder) + "立于族谱之巅。出身" + bg.name + "，家产 " + bg.treasury + " 贯。", "epic");
    // 开局即有一次说媒机会
    this.queueMarriageProspect(founder.id, true);
    this.renderAll();
    this.centerOnRoot();
    // 默认自动推进（慢节奏），遇事件则停滞待决
    this.auto = true;
    $("btn-auto").textContent = "⏸ 暂停";
    $("btn-auto").classList.add("on");
    this._autoStep();
  };

  // ---------- 年度演算 ----------
  LineageGame.prototype.tickYear = function () {
    const s = this.state;
    if (!s || s.ended) return;
    s.month++;
    s.year = Math.floor((s.month - 1) / 12) + 1;
    const living = [...s.members.values()].filter(isAlive);
    let income = 0, expense = 0;
    const events = [];

    // 1) 收支与成长
    for (const p of living) {
      const age = ageOf(p, s.month);
      const am = ageMonthsOf(p, s.month);
      // 入学 / 毕业（精确到月，避免重复）
      if (am === 72) { p.schooling = true; events.push(fullName(p) + "入蒙学读书。"); }
      if (p.schooling && am === 216) { p.schooling = false; }
      // 退休
      if (!p.retired && age >= 65 && p.career) { p.retired = true; events.push(fullName(p) + "年事已高，告老还乡。"); }
      // 收入（守制/远行/入狱期间无俸）
      if (!p.tempStatus && p.career && !p.retired && age >= 18) {
        const c = CAREER_BY_ID[p.career];
        let sal = c.salary;
        if (c.variable) sal += (Math.random() - 0.45) * c.variable;
        income += sal / 12;
      } else if (!p.tempStatus && p.retired) {
        income += ((CAREER_BY_ID[p.career]?.salary || 200) * 0.25) / 12;
      }
      // 支出（口粮，按月）
      let upkeep = age < 6 ? 40 : age < 18 ? (p.schooling ? 130 : 80) : age < 60 ? 95 : 120;
      expense += upkeep / 12;
    }

    if (s.property > 0) income += s.property / 12;   // 田产被动收入（按月）
    s.lastIncome = income; s.lastExpense = expense;
    this.adjustTreasury(income - expense);           // 统一入口：触发飘字/脉冲/数字滚动
    s.stats.peakTreasury = Math.max(s.stats.peakTreasury, s.treasury);
    if (s.treasury < 0 && !s.wasNegative) { s.wasNegative = true; this.toast("家道中落", "家产入不敷出", "warn"); }

    // 2) 生育
    const couples = new Set();
    for (const p of living) {
      if (p.spouse && !couples.has(p.id + "|" + p.spouse)) {
        couples.add(p.id + "|" + p.spouse);
        couples.add(p.spouse + "|" + p.id);
        const w = s.members.get(p.spouse);
        const mother = p.gender === "female" ? p : w;
        const father = p.gender === "male" ? p : w;
        const mAge = ageOf(mother, s.month);
        if (mAge >= 20 && mAge <= 38 && !father.tempStatus && !mother.tempStatus) {
          const cap = father.hasConcubine ? 7 : 5;
          const chance = (father.hasConcubine ? 0.42 : 0.3) / 12;
          if (mother.children.length < cap && Math.random() < chance) {
            const twins = Math.random() < 0.08;
            const names = [];
            for (let k = 0; k < (twins ? 2 : 1); k++) {
              const cg = Math.random() < 0.52 ? "male" : "female";
              const cn = pick(cg === "male" ? MALE_NAMES : FEMALE_NAMES);
              const child = makePerson({
                name: cn, surname: this.state.surname, gender: cg,
                birthMonth: s.month, generation: Math.max(father.generation, mother.generation) + 1,
                parents: [father.id, mother.id], isBlood: true,
              });
              if (Math.random() < 0.04) child.omen = Math.random() < 0.55 ? { type: "noble" } : { type: "premature" };
              s.members.set(child.id, child);
              father.children.push(child.id);
              mother.children.push(child.id);
              s.stats.totalBorn++;
              s.stats.generations = Math.max(s.stats.generations, child.generation + 1);
              names.push(cn);
            }
            events.push(fullName(father) + "与" + fullName(mother) + (twins ? "喜得双丁" : "喜添新丁") + "，取名" + names.join("、") + "。");
            this.toast(twins ? "双丁临门" : "喜添丁", names.join("、"), "birth");
          }
        }
      }
    }

    // 3) 成年决策：事业 / 谶语应验
    for (const p of living) {
      if (!isAlive(p)) continue;
      const am = ageMonthsOf(p, s.month);
      // 谶语应验（18 岁 = 216 月）
      if (am === 216 && p.omen && !p.omen.resolved && p.isBlood) {
        p.omen.resolved = true;
        if (p.omen.type === "noble") {
          p.career = "scholar"; p.educated = true; this.adjustPrestige(12);
          events.push(fullName(p) + "应谶而显，才名远播。");
        } else {
          if (Math.random() < 0.4) { this.killMember(p); events.push(fullName(p) + "应谶夭折，命数难违。"); }
          else events.push(fullName(p) + "谶语未应，安然长成。");
        }
      }
      if (am === 216 && !p.career && p.isBlood && !s.decisions.some((d) => d.targetId === p.id && d.kind === "career")) {
        this.queueCareerDecision(p.id);
      }
    }

    // 4) 婚配机会（随机）
    for (const p of living) {
      if (!isAlive(p) || p.tempStatus) continue;
      const age = ageOf(p, s.month);
      if (!p.spouse && age >= 19 && age <= 42 && p.isBlood && Math.random() < 0.22 / 12) {
        if (!s.decisions.some((d) => d.targetId === p.id && d.kind === "marriage")) {
          this.queueMarriageProspect(p.id, false);
        }
      }
    }

    // 4.5) 随机事件（年化 10%，与人口无关，已下调）
    if (Math.random() < 0.10 / 12 && s.decisions.length < 3) {
      this.queueRandomEvent();
    }

    // 4.6) 特殊触发事件（节庆/寿宴/寻仇/分家）
    if (s.month % 72 === 0 && !s.decisions.some((d) => d.kind === "festival")) this.queueFestival();
    for (const p of living) {
      if (!isAlive(p) || !p.isBlood) continue;
      const am = ageMonthsOf(p, s.month);
      if ((am === 720 || am === 840 || am === 960) && !s.decisions.some((d) => d.targetId === p.id && d.kind === "birthday")) this.queueBirthday(p.id);
    }
    if (s.flags.has("feud") && Math.random() < 0.25 / 12 && !s.decisions.some((d) => d.kind === "feud-attack")) this.queueFeudAttack();
    if (s.flags.has("succession") && [...s.members.values()].filter((p) => p.isBlood && isAlive(p) && ageOf(p, s.month) >= 18).length >= 6 && Math.random() < 0.2 / 12 && !s.decisions.some((d) => d.kind === "split")) this.queueFamilySplit();

    // 5) 死亡
    const dying = [];
    for (const p of living) {
      if (!isAlive(p)) continue;
      const age = ageOf(p, s.month);
      let dp = 0.004;
      if (age < 1) dp = 0.02;
      else if (age <= 50) dp = 0.004;
      else if (age <= 60) dp = 0.014;
      else if (age <= 70) dp = 0.03;
      else if (age <= 80) dp = 0.06;
      else if (age <= 90) dp = 0.12;
      else dp = 0.26;
      if (s.treasury < 0) dp += 0.025;
      if (p.career) dp += CAREER_BY_ID[p.career].risk || 0;
      if (s.month <= s.buffMortalityUntil) dp *= 0.7;  // 修祠/祭祀祖荫
      if (Math.random() < dp / 12) dying.push(p);
    }
    for (const p of dying) this.killMember(p);

    // 5.5) 临时状态到期解除（远行归来 / 守制期满 / 刑满）
    for (const p of living) {
      if (!isAlive(p) || !p.tempStatus) continue;
      if (s.month >= p.tempUntil) {
        const was = p.tempStatus; p.tempStatus = null; p.tempUntil = 0;
        if (was === "away") {
          const r = Math.random();
          if (r < 0.55) { const gain = 2000 + Math.floor(Math.random() * 3000); this.adjustTreasury(gain); events.push(fullName(p) + "远行归来，获利 " + gain + " 贯。"); this.toast("远行归来", "+" + gain + "贯", "birth"); }
          else if (r < 0.70) { this.killMember(p); events.push(fullName(p) + "客死他乡，魂归故里。"); }
          else { events.push(fullName(p) + "远行归来，一无所获。"); }
        } else if (was === "mourning") {
          events.push(fullName(p) + "守制期满，复出理事。");
        } else if (was === "prison") {
          events.push(fullName(p) + "刑满释归。");
        }
      }
    }

    // 6) 记账日志
    if (events.length) events.forEach((e) => this.appendLog("【" + ymLabel(s) + "】" + e, "event"));
    const net = Math.round(income - expense);
    this.appendLog("【" + ymLabel(s) + "】月入 <span class='amt-gain'>+" + Math.round(income) + " 贯</span>，月支 <span class='amt-loss'>-" + Math.round(expense) + " 贯</span>，结余 <span class='" + (net >= 0 ? "amt-gain" : "amt-loss") + "'>" + (net >= 0 ? "+" : "") + net + " 贯</span>，家产 " + Math.round(s.treasury) + " 贯。", "ledger", true);

    // 7) 终局判定
    const aliveNow = [...s.members.values()].some(isAlive);
    if (!aliveNow) { this.endGame("族中再无活口，" + s.dynastyName + "自此断绝。"); return; }
    if (s.treasury < -4000) { this.endGame("债台高筑，家道败落，族谱终成绝响。"); return; }

    this.renderAll();
  };

  LineageGame.prototype.killMember = function (p) {
    const s = this.state;
    p.deathMonth = s.month;
    s.stats.totalDied++;
    const spouse = p.spouse ? s.members.get(p.spouse) : null;
    if (spouse) { spouse.spouse = null; spouse.wasMarried = true; }
    p.spouse = null;
    const age = ageOf(p, s.month);
    // 丁忧：在朝为官的子嗣守制三年
    for (const cid of p.children) {
      const c = s.members.get(cid);
      if (c && isAlive(c) && !c.tempStatus && c.career && CAREER_BY_ID[c.career] && CAREER_BY_ID[c.career].req === "college" && !c.retired) {
        c.tempStatus = "mourning"; c.tempUntil = s.month + 36;
        this.appendLog("  " + fullName(c) + "丁忧守制，暂离任所。", "event");
      }
    }
    let cause = "享年 " + age + " 岁";
    if (age < 1) cause = "夭折";
    else if (age < 50) cause = "英年早逝，享年 " + age;
    else if (age >= 80) cause = "寿终正寝，享年 " + age;
    this.appendLog("【" + ymLabel(s) + "】" + fullName(p) + cause + "。", "death");
    this.toast("族人辞世", fullName(p) + "·" + age + "岁", "death");
  };

  // ---------- 决策生成 ----------
  LineageGame.prototype.queueCareerDecision = function (pid) {
    const s = this.state;
    const p = s.members.get(pid);
    const choices = [];
    CAREERS.filter((c) => c.req === null).forEach((c) => {
      choices.push({ text: c.name, sub: c.salary + "贯/年", apply: () => { p.career = c.id; return fullName(p) + "从事" + c.name + "。"; } });
    });
    if (s.treasury >= 2000 && !p.educated) {
      CAREERS.filter((c) => c.req === "college").forEach((c) => {
        choices.push({ text: "太学·" + c.name, sub: c.salary + "贯/年", college: true, apply: (g) => { g.adjustTreasury(-2000); p.educated = true; p.career = c.id; return fullName(p) + "入太学深造（耗资 2000 贯），后从事" + c.name + "。"; } });
      });
    }
    s.decisions.push({ id: uid(), kind: "career", title: "择业", text: fullName(p) + "已至弱冠之年，当择立身之道。", targetId: pid, choices });
    this.appendLog("【" + ymLabel(s) + "】" + fullName(p) + "已至弱冠，当择立身之道。", "decide");
  };

  LineageGame.prototype.queueMarriageProspect = function (pid, guaranteed) {
    const s = this.state;
    const p = s.members.get(pid);
    if (p.spouse) return;
    const sg = p.gender === "male" ? "female" : "male";
    const ss = pick(SPOUSE_SURNAMES);
    const sn = pick(sg === "male" ? MALE_NAMES : FEMALE_NAMES);
    const quality = clamp(Math.random() + s.prestige * 0.003, 0, 1);
    const dowry = Math.round(500 + quality * 2200 + (guaranteed ? -300 : 0));
    const qdesc = quality > 0.7 ? "名门之后" : quality > 0.4 ? "良家子" : "寒门出身";
    const text = "有人为" + fullName(p) + "提亲，对方" + ss + sn + "（" + qdesc + "），聘礼 " + dowry + " 贯。";
    const choices = [
      { text: "应亲", sub: dowry + " 贯", accept: true, apply: (g) => {
        if (g.state.treasury < dowry) return "家产不足以备聘礼，婚事作罢。";
        g.adjustTreasury(-dowry);
        const spouse = g.addMember({ name: sn, surname: ss, gender: sg, birthMonth: p.birthMonth + Math.round((Math.random() - 0.5) * 48), generation: p.generation, marriedIn: true, isBlood: false });
        spouse.career = quality > 0.6 ? pick(["scholar", "merchant", "minister", "physician"]) : quality > 0.3 ? pick(["artisan", "teacher", "merchant"]) : pick(["farmer", "artisan"]);
        spouse.educated = quality > 0.55;
        p.spouse = spouse.id; spouse.spouse = p.id;
        return fullName(p) + "与" + fullName(spouse) + "结为连理，聘礼 " + dowry + " 贯。";
      } },
      { text: "婉拒", sub: "", decline: true, apply: () => fullName(p) + "婉拒了这门亲事。" },
    ];
    s.decisions.push({ id: uid(), kind: "marriage", title: "提亲", text, targetId: pid, choices });
    this.appendLog("【" + ymLabel(s) + "】" + text, "decide");
  };

  LineageGame.prototype.queueRandomEvent = function () {
    const s = this.state;
    const eligible = [];
    for (const ev of DECISION_EVENTS) {
      const dec = ev.make(this);
      if (dec) eligible.push({ dec, w: ev.weight });
    }
    if (!eligible.length) return;
    let total = 0; for (const e of eligible) total += e.w;
    let r = Math.random() * total, chosen = eligible[0].dec;
    for (const e of eligible) { r -= e.w; if (r <= 0) { chosen = e.dec; break; } }
    s.decisions.push(chosen);
    this.appendLog("【" + ymLabel(s) + "】" + chosen.text, "decide");
  };

  // ---------- 名望/田产 辅助 ----------
  LineageGame.prototype.adjustPrestige = function (delta) {
    this.state.prestige = Math.max(0, this.state.prestige + delta);
    this.floatDelta("hud-prestige", delta, "");
  };
  LineageGame.prototype.addProperty = function (income) {
    this.state.property += income;
  };

  // ---------- 特殊触发事件 ----------
  LineageGame.prototype.queueFestival = function () {
    const s = this.state;
    const f = pick(["元宵", "中秋", "春节", "重阳"]);
    s.decisions.push({ id: uid(), kind: "festival", title: "节庆·" + f, targetId: null,
      text: "时值" + f + "佳节，族中当如何度过？",
      choices: [
        { text: "大办宴庆", sub: "-500 贯，+名望", apply: (g) => { g.adjustTreasury(-500); g.adjustPrestige(6); return f + "大宴族人，宾主尽欢。"; } },
        { text: "从简度节", sub: "-80 贯", apply: (g) => { g.adjustTreasury(-80); return f + "从简度节。"; }, decline: true },
      ] });
    this.appendLog("【" + ymLabel(s) + "】时值" + f + "佳节。", "decide");
  };

  LineageGame.prototype.queueBirthday = function (pid) {
    const s = this.state;
    const p = s.members.get(pid); if (!p) return;
    const a = ageOf(p, s.month);
    s.decisions.push({ id: uid(), kind: "birthday", title: "寿宴", targetId: pid,
      text: fullName(p) + "逢" + a + "寿辰，当贺。",
      choices: [
        { text: "大办寿宴", sub: "-600 贯，+名望", apply: (g) => { const p = g.state.members.get(pid); if (!p || !isAlive(p)) return STALE; g.adjustTreasury(-600); g.adjustPrestige(8); return fullName(p) + a + "大寿，贺客盈门。"; } },
        { text: "家宴从简", sub: "-100 贯", apply: (g) => { g.adjustTreasury(-100); return fullName(p) + "寿辰家宴从简。"; }, decline: true },
      ] });
    this.appendLog("【" + ymLabel(s) + "】" + fullName(p) + "逢" + a + "寿辰。", "decide");
  };

  LineageGame.prototype.queueFeudAttack = function () {
    const s = this.state;
    if (s.flags.has("guarded")) { s.flags.delete("feud"); s.flags.delete("guarded"); this.appendLog("【" + ymLabel(s) + "】仇家来犯，赖护院击退，世仇暂解。", "event"); return; }
    s.decisions.push({ id: uid(), kind: "feud-attack", title: "寻仇", targetId: null,
      text: "仇家纠众上门寻仇，来势汹汹。",
      choices: [
        { text: "花钱消灾", sub: "-1000 贯", apply: (g) => { g.adjustTreasury(-1000); if (Math.random() < 0.5) { g.state.flags.delete("feud"); return "破财消灾，仇家退去，世仇暂解。"; } return "暂破财消灾，仇怨犹在。"; } },
        { text: "以牙还牙", sub: "死伤难料", apply: (g) => { const vuln = [...g.state.members.values()].filter((p) => isAlive(p) && p.isBlood); if (Math.random() < 0.5 && vuln.length) { const v = pick(vuln); g.killMember(v); g.state.flags.delete("feud"); return "械斗中" + fullName(v) + "殒命，仇家亦退，世仇暂了。"; } g.adjustTreasury(-800); return "互有死伤，仇家退去。"; }, decline: true },
      ] });
    this.appendLog("【" + ymLabel(s) + "】仇家纠众寻仇。", "decide");
  };

  LineageGame.prototype.queueFamilySplit = function () {
    const s = this.state;
    s.decisions.push({ id: uid(), kind: "split", title: "分家", targetId: null,
      text: "族大人多，诸房纷争不已，分家之议再起。",
      choices: [
        { text: "和平分家", sub: "国库减半", apply: (g) => { const st = g.state; st.flags.delete("succession"); st.treasury = Math.round(st.treasury / 2); g.adjustPrestige(-5); return "诸房分家，国库减半，各立门户。"; } },
        { text: "强行压制", sub: "-名望", apply: (g) => { g.state.flags.delete("succession"); g.adjustPrestige(-12); return "强行压制分家之议，暗流犹存。"; }, decline: true },
      ] });
    this.appendLog("【" + ymLabel(s) + "】分家之议再起。", "decide");
  };

  // ---------- 决策弹窗 ----------
  LineageGame.prototype.showEventModal = function (dec) {
    if (!dec) return;
    const s = this.state;
    const idx = s.decisions.indexOf(dec) + 1;
    $("ev-title").textContent = dec.title;
    $("ev-progress").textContent = s.decisions.length > 1 ? "事务 " + idx + " / " + s.decisions.length : "";
    const tbox = $("ev-target");
    if (dec.targetId) {
      const p = s.members.get(dec.targetId);
      if (p) {
        tbox.style.display = "flex";
        tbox.innerHTML = '<div class="ev-portrait">' + portraitSVG(p, s.month, 56) + '</div>' +
          '<div><div class="ev-name">' + fullName(p) + '</div><div class="ev-sub">' + (p.gender === "male" ? "男" : "女") + " · " + ageOf(p, s.month) + "岁 · " + statusOf(p, s.month) + "</div></div>";
      } else tbox.style.display = "none";
    } else tbox.style.display = "none";
    $("ev-text").textContent = dec.text;
    const ch = $("ev-choices");
    ch.innerHTML = "";
    dec.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "ev-choice" + (c.college ? " col" : "") + (c.decline ? " decline" : "") + (c.accept ? " accept" : "");
      b.innerHTML = c.text + (c.sub ? "<i>" + c.sub + "</i>" : "");
      b.onclick = () => this.resolveDecision(dec.id, i);
      ch.appendChild(b);
    });
    $("event-modal").classList.add("show");
  };

  LineageGame.prototype.hideEventModal = function () {
    $("event-modal").classList.remove("show");
  };

  LineageGame.prototype.resolveDecision = function (decId, idx) {
    const s = this.state;
    const dec = s.decisions.find((d) => d.id === decId);
    if (!dec) return;
    const choice = dec.choices[idx];
    if (!choice) return;
    let result = "";
    try { result = choice.apply(this) || ""; } catch (e) { result = "（处理异常）"; if (console && console.error) console.error(e); }
    if (result) this.appendLog("  ↳ " + result, "result");
    s.decisions = s.decisions.filter((d) => d.id !== decId);
    this.renderAll();
    // 抉择致全族覆灭，直接终局
    if (![...s.members.values()].some(isAlive)) { this.hideEventModal(); this.endGame("族中再无活口，" + s.dynastyName + "自此断绝。"); return; }
    if (s.ended) { this.hideEventModal(); return; }
    if (s.decisions.length > 0) {
      this.showEventModal(s.decisions[0]);
    } else {
      this.hideEventModal();
      if (this.auto) this._autoTimer = setTimeout(() => this._autoStep(), 500);
    }
  };

  // ---------- 经济/人口辅助 ----------
  LineageGame.prototype.adjustTreasury = function (delta) {
    const s = this.state;
    const before = s.treasury;
    s.treasury += delta;
    s.stats.peakTreasury = Math.max(s.stats.peakTreasury, s.treasury);
    if (delta) this._treasuryFx(before, s.treasury, delta);
  };

  // ---------- HUD 动效 ----------
  // 飘字 + 底色脉冲：hostId 为 .stat 内的 .v 元素 id
  LineageGame.prototype.floatDelta = function (hostId, delta, unit) {
    const host = $(hostId);
    if (!host || !delta) return;
    const stat = host.closest(".stat") || host.parentElement;
    if (!stat) return;
    const d = document.createElement("div");
    d.className = "float-delta " + (delta > 0 ? "gain" : "loss");
    d.textContent = (delta > 0 ? "+" : "") + Math.round(delta) + (unit || "");
    stat.appendChild(d);
    // 同屏最多 3 个飘字，超出移除最旧
    const floats = stat.querySelectorAll(".float-delta");
    if (floats.length > 3) floats[0].remove();
    setTimeout(() => d.remove(), 1500);
    // 重触发脉冲动画
    stat.classList.remove("pulse-gain", "pulse-loss");
    void stat.offsetWidth;
    stat.classList.add(delta > 0 ? "pulse-gain" : "pulse-loss");
  };

  // 数字滚动补间
  LineageGame.prototype._tweenVal = function (el, from, to, fmt) {
    if (el._raf) cancelAnimationFrame(el._raf);
    const t0 = performance.now(), dur = 500;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - k, 3);
      el.textContent = fmt(from + (to - from) * e);
      el._raf = k < 1 ? requestAnimationFrame(step) : null;
    };
    el._raf = requestAnimationFrame(step);
  };

  LineageGame.prototype._treasuryFx = function (from, to, delta) {
    const el = $("hud-treasury");
    if (!el) return;
    this.floatDelta("hud-treasury", delta, " 贯");
    this._tweenVal(el, from, to, (v) => Math.round(v) + " 贯");
  };

  LineageGame.prototype.addMember = function (opts) {
    const s = this.state;
    const m = makePerson(opts);
    s.members.set(m.id, m);
    s.stats.totalBorn++;
    if (m.isBlood) s.stats.generations = Math.max(s.stats.generations, (m.generation || 0) + 1);
    return m;
  };

  LineageGame.prototype.toast = function (title, sub, type) {
    const box = $("toast-container");
    if (!box) return;
    const t = document.createElement("div");
    t.className = "toast " + (type || "");
    t.innerHTML = "<b>" + title + "</b>" + (sub ? "<span>" + sub + "</span>" : "");
    box.appendChild(t);
    setTimeout(() => { t.classList.add("out"); setTimeout(() => t.remove(), 400); }, 2600);
  };

  // 主动说媒
  LineageGame.prototype.arrangeMarriage = function (pid) {
    const s = this.state;
    const p = s.members.get(pid);
    if (!p || p.spouse) return;
    if (s.decisions.some((d) => d.targetId === pid && d.kind === "marriage")) return;
    this.queueMarriageProspect(pid, true);
    this.renderAll();
    if (!this.auto) this.showEventModal(s.decisions[0]);
  };

  // ---------- 树布局 ----------
  LineageGame.prototype.layout = function () {
    const s = this.state;
    const pos = new Map(); // id -> {x, y, gen}
    const members = s.members;

    // 血脉子孙（仅沿血脉递归，配偶随主放置）
    const childrenOf = (id) => {
      const p = members.get(id);
      return p.children.slice().sort((a, b) => members.get(a).birthMonth - members.get(b).birthMonth);
    };
    const subtreeW = (id) => {
      const p = members.get(id);
      const adults = p.spouse ? 2 : 1;
      const coupleW = adults * CARD_W + (adults - 1) * COUPLE_GAP;
      const kids = childrenOf(id);
      if (!kids.length) return coupleW;
      let w = 0;
      kids.forEach((k, i) => { w += subtreeW(k); if (i < kids.length - 1) w += SIB_GAP; });
      return Math.max(coupleW, w);
    };
    const place = (id, leftX, gen) => {
      const p = members.get(id);
      const adults = p.spouse ? 2 : 1;
      const coupleW = adults * CARD_W + (adults - 1) * COUPLE_GAP;
      const w = subtreeW(id);
      const coupleLeft = leftX + (w - coupleW) / 2;
      pos.set(id, { x: coupleLeft, y: gen * (CARD_H + GEN_GAP), gen });
      if (p.spouse) pos.set(p.spouse, { x: coupleLeft + CARD_W + COUPLE_GAP, y: gen * (CARD_H + GEN_GAP), gen });
      const kids = childrenOf(id);
      if (kids.length) {
        let kw = 0;
        kids.forEach((k, i) => { kw += subtreeW(k); if (i < kids.length - 1) kw += SIB_GAP; });
        let kx = leftX + (w - kw) / 2;
        kids.forEach((k, i) => { place(k, kx, gen + 1); kx += subtreeW(k) + (i < kids.length - 1 ? SIB_GAP : 0); });
      }
    };
    place(s.rootId, 0, 0);
    // 孤立的嫁入者（无血脉主，理论上不存在）兜底
    return pos;
  };

  // ---------- 渲染 ----------
  LineageGame.prototype.renderAll = function () {
    this.renderTree();
    this.renderHud();
    this.renderLog();
    this.renderDetail();
  };

  LineageGame.prototype.renderTree = function () {
    const s = this.state;
    if (!s) return;
    const pos = this.layout();
    // 计算边界
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pos.forEach((p) => {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x + CARD_W);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y + CARD_H);
    });
    const pad = 60;
    const worldW = Math.max(400, maxX - minX + pad * 2);
    const worldH = Math.max(300, maxY - minY + pad * 2);
    const offX = pad - minX, offY = pad - minY;

    // SVG 连线
    const lines = [];
    members_loop: for (const [id, p] of s.members) {
      const me = pos.get(id);
      if (!me) continue;
      // 婚姻线：仅血脉主画（避免重复）
      if (p.spouse && p.isBlood) {
        const sp = pos.get(p.spouse);
        if (sp) {
          const y = me.y + CARD_H / 2;
          lines.push(`<line x1="${me.x + CARD_W}" y1="${y}" x2="${sp.x}" y2="${y}" class="ln-marriage"/>`);
          // 子嗣下行线
          const kids = p.children.slice().sort((a,b)=>s.members.get(a).birthMonth - s.members.get(b).birthMonth);
          if (kids.length) {
            const midX = (me.x + CARD_W + sp.x) / 2;
            const busY = me.y + CARD_H + GEN_GAP / 2;
            lines.push(`<path d="M${midX},${me.y + CARD_H} L${midX},${busY}" class="ln-descent"/>`);
            const kidPositions = kids.map(k => pos.get(k)).filter(Boolean);
            const firstX = kidPositions[0].x + CARD_W / 2;
            const lastX = kidPositions[kidPositions.length - 1].x + CARD_W / 2;
            lines.push(`<path d="M${firstX},${busY} L${lastX},${busY}" class="ln-descent"/>`);
            for (const kp of kidPositions) {
              lines.push(`<path d="M${kp.x + CARD_W / 2},${busY} L${kp.x + CARD_W / 2},${kp.y}" class="ln-descent"/>`);
            }
          }
        }
      } else if (!p.spouse && p.isBlood) {
        // 单身有子（理论上需配偶，兜底）
        const kids = p.children.slice();
        if (kids.length) {
          const midX = me.x + CARD_W / 2;
          const busY = me.y + CARD_H + GEN_GAP / 2;
          lines.push(`<path d="M${midX},${me.y + CARD_H} L${midX},${busY}" class="ln-descent"/>`);
          const kidPositions = kids.map(k => pos.get(k)).filter(Boolean);
          const firstX = kidPositions[0].x + CARD_W / 2;
          const lastX = kidPositions[kidPositions.length - 1].x + CARD_W / 2;
          lines.push(`<path d="M${firstX},${busY} L${lastX},${busY}" class="ln-descent"/>`);
          for (const kp of kidPositions) lines.push(`<path d="M${kp.x + CARD_W / 2},${busY} L${kp.x + CARD_W / 2},${kp.y}" class="ln-descent"/>`);
        }
      }
    }
    this.svg.setAttribute("width", worldW);
    this.svg.setAttribute("height", worldH);
    // 连线坐标系与卡片一致：整体平移 (offX, offY)
    this.svg.innerHTML = `<g transform="translate(${offX},${offY})">${lines.join("")}</g>`;
    this.world.style.width = worldW + "px";
    this.world.style.height = worldH + "px";

    // 卡片
    const cardsHost = $("tree-cards");
    cardsHost.innerHTML = "";
    cardsHost.style.width = worldW + "px";
    cardsHost.style.height = worldH + "px";
    for (const [id, p] of s.members) {
      const me = pos.get(id);
      if (!me) continue;
      const card = document.createElement("div");
      const dead = !isAlive(p);
      card.className = "mcard" + (dead ? " dead" : "") + (p.marriedIn ? " marriedin" : "") + (id === s.selectedId ? " sel" : "");
      card.style.left = (me.x + offX) + "px";
      card.style.top = (me.y + offY) + "px";
      const age = ageOf(p, s.month);
      const status = statusOf(p, s.month);
      const star = p.educated ? '<span class="edu">太学</span>' : "";
      card.innerHTML =
        '<div class="mcard-portrait">' + portraitSVG(p, s.month, 44) + '</div>' +
        '<div class="mcard-info">' +
          '<div class="mcard-name">' + (p.isBlood ? "" : "") + p.name + (p.marriedIn ? '<span class="exsur">' + p.surname + '</span>' : "") + '</div>' +
          '<div class="mcard-meta">' + (dead ? "已故·" + age : age + "岁") + ' · ' + status + star + '</div>' +
        '</div>';
      card.onclick = () => { s.selectedId = id; this.renderAll(); };
      cardsHost.appendChild(card);
    }
    this._offX = offX; this._offY = offY; this._worldW = worldW; this._worldH = worldH;
    this.applyTransform();
  };

  LineageGame.prototype.applyTransform = function () {
    // 取整平移量，避免亚像素渲染导致文字发虚
    this.world.style.transform = `translate(${Math.round(this.panX)}px, ${Math.round(this.panY)}px) scale(${this.zoom})`;
  };

  LineageGame.prototype.centerOnRoot = function () {
    const vp = this.viewport.getBoundingClientRect();
    this.zoom = 1;
    this.panX = vp.width / 2 - (this._worldW || 400) / 2;
    this.panY = 30;
    this.applyTransform();
  };

  LineageGame.prototype.zoomBy = function (factor, cx, cy) {
    const vp = this.viewport.getBoundingClientRect();
    cx = cx - vp.left; cy = cy - vp.top;
    const newZoom = clamp(this.zoom * factor, 0.35, 2.2);
    const k = newZoom / this.zoom;
    this.panX = cx - (cx - this.panX) * k;
    this.panY = cy - (cy - this.panY) * k;
    this.zoom = newZoom;
    this.applyTransform();
  };

  LineageGame.prototype._bindViewport = function () {
    const self = this;
    const vp = this.viewport;
    vp.addEventListener("wheel", (e) => {
      e.preventDefault();
      self.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, e.clientX, e.clientY);
    }, { passive: false });
    vp.addEventListener("mousedown", (e) => {
      if (e.target.closest(".mcard")) return;
      self._dragging = true;
      self._dragStart = { x: e.clientX, y: e.clientY, px: self.panX, py: self.panY };
      vp.classList.add("grabbing");
    });
    window.addEventListener("mousemove", (e) => {
      if (!self._dragging) return;
      self.panX = self._dragStart.px + (e.clientX - self._dragStart.x);
      self.panY = self._dragStart.py + (e.clientY - self._dragStart.y);
      self.applyTransform();
    });
    window.addEventListener("mouseup", () => { self._dragging = false; vp.classList.remove("grabbing"); });
    // 触摸：单指拖拽平移，双指捏合缩放
    let pinch = null;
    vp.addEventListener("touchstart", (e) => {
      if (e.touches.length === 2) {
        self._dragging = false;
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinch = { dist: Math.hypot(dx, dy), cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      } else if (e.touches.length === 1 && !e.target.closest(".mcard")) {
        self._dragging = true;
        self._dragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY, px: self.panX, py: self.panY };
      }
    }, { passive: true });
    vp.addEventListener("touchmove", (e) => {
      if (pinch && e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        const factor = dist / pinch.dist;
        if (Math.abs(factor - 1) > 0.003) self.zoomBy(factor, pinch.cx, pinch.cy);
        pinch = { dist, cx: (e.touches[0].clientX + e.touches[1].clientX) / 2, cy: (e.touches[0].clientY + e.touches[1].clientY) / 2 };
      } else if (self._dragging && e.touches.length === 1) {
        self.panX = self._dragStart.px + (e.touches[0].clientX - self._dragStart.x);
        self.panY = self._dragStart.py + (e.touches[0].clientY - self._dragStart.y);
        self.applyTransform();
      }
    }, { passive: true });
    vp.addEventListener("touchend", (e) => {
      if (e.touches.length < 2) pinch = null;
      if (e.touches.length === 0) self._dragging = false;
    });
  };

  // ---------- HUD / 日志 / 决策 / 详情 ----------
  LineageGame.prototype.renderHud = function () {
    const s = this.state;
    if (!s) return;
    $("hud-dynasty").textContent = s.dynastyName;
    $("hud-year").textContent = "第" + s.year + "年" + (((s.month - 1) % 12) + 1) + "月";
    const living = [...s.members.values()].filter(isAlive).length;
    $("hud-members").textContent = living + " 口 / " + s.members.size + " 人";
    $("hud-gen").textContent = s.stats.generations + " 代";
    const tr = $("hud-treasury");
    if (!tr._raf) tr.textContent = Math.round(s.treasury) + " 贯"; // 补间进行中不覆盖
    tr.className = "v " + (s.treasury < 0 ? "neg" : s.treasury >= s.stats.peakTreasury ? "pos" : "");
    const cf = $("hud-cashflow");
    if (cf) {
      if (s.lastIncome != null) {
        cf.innerHTML = "<span class='amt-gain'>+" + Math.round(s.lastIncome) + "</span> <span class='amt-loss'>-" + Math.round(s.lastExpense) + "</span>";
      }
    }
    const pr = $("hud-prestige");
    if (pr) pr.textContent = s.prestige;
  };

  LineageGame.prototype.renderLog = function () {
    const s = this.state;
    const log = $("log");
    log.innerHTML = "";
    const recent = s.log.slice(-60);
    recent.forEach((l) => {
      const d = document.createElement("div");
      d.className = "log-line " + (l.cls || "");
      if (l.html) d.innerHTML = l.text; else d.textContent = l.text;
      log.appendChild(d);
    });
    log.scrollTop = log.scrollHeight;
  };

  LineageGame.prototype.appendLog = function (text, cls, html) {
    this.state.log.push({ text, cls, html: !!html });
  };

  LineageGame.prototype.renderDecisions = function () {
    return; // 已由事件弹窗取代，此方法保留为空
    const s = this.state;
    const box = $("decisions");
    box.innerHTML = "";
    if (!s.decisions.length) {
      box.innerHTML = '<div class="dec-empty">暂无待办事务</div>';
      return;
    }
    s.decisions.forEach((d) => {
      const p = s.members.get(d.personId);
      const card = document.createElement("div");
      card.className = "dec-card";
      if (d.type === "career") {
        let optsHtml = "";
        // 太学选项（若负担得起）
        if (s.treasury >= 2000) {
          optsHtml += '<div class="dec-college">可送入太学（2000 贯），解锁文官/医者/教书/侍郎：</div>';
        }
        const avail = CAREERS.filter((c) => c.req === null || (c.req === "college" && p.educated));
        optsHtml += '<div class="dec-opts">' + avail.map((c) =>
          '<button class="dec-opt" data-c="' + c.id + '" data-col="0">' + c.name + '<i>' + c.salary + '贯/年</i></button>'
        ).join("") + '</div>';
        if (s.treasury >= 2000 && !p.educated) {
          optsHtml += '<div class="dec-opts">' + CAREERS.filter(c => c.req === "college").map((c) =>
            '<button class="dec-opt opt-col" data-c="' + c.id + '" data-col="1">太学→' + c.name + '<i>' + c.salary + '贯/年</i></button>'
          ).join("") + '</div>';
        }
        card.innerHTML = '<div class="dec-title">▸ ' + fullName(p) + ' · 择业</div>' + optsHtml;
        card.querySelectorAll(".dec-opt").forEach((b) => {
          b.onclick = () => this.resolveCareer(d.id, b.dataset.c, b.dataset.col === "1");
        });
      } else if (d.type === "marriage") {
        const pr = d.prospect;
        const qdesc = pr.quality > 0.7 ? "名门之后" : pr.quality > 0.4 ? "良家子" : "寒门出身";
        const can = s.treasury >= pr.dowry;
        card.innerHTML =
          '<div class="dec-title">▸ ' + fullName(p) + ' · 提亲</div>' +
          '<div class="dec-prospect">' + pr.surname + pr.name + '（' + (pr.gender === "male" ? "男" : "女") + '）· ' + qdesc + ' · 聘礼 ' + pr.dowry + ' 贯</div>' +
          '<div class="dec-opts">' +
            '<button class="dec-opt opt-accept ' + (can ? "" : "disabled") + '" data-acc="1">' + (can ? "应亲" : "家产不足") + '</button>' +
            '<button class="dec-opt opt-decline" data-acc="0">婉拒</button>' +
          '</div>';
        card.querySelectorAll(".dec-opt").forEach((b) => {
          b.onclick = () => { if (b.classList.contains("disabled")) return; this.resolveMarriage(d.id, b.dataset.acc === "1"); };
        });
      }
      box.appendChild(card);
    });
  };

  LineageGame.prototype.renderDetail = function () {
    const s = this.state;
    const box = $("detail");
    if (!s || !s.members.has(s.selectedId)) { box.innerHTML = '<div class="dec-empty">点选族人查看详情</div>'; return; }
    const p = s.members.get(s.selectedId);
    const age = ageOf(p, s.month);
    const spouse = p.spouse ? s.members.get(p.spouse) : null;
    const parents = p.parents.map((id) => s.members.get(id)).filter(Boolean);
    const kids = p.children.map((id) => s.members.get(id)).filter(Boolean);
    const canMarry = isAlive(p) && !p.spouse && age >= 18 && age <= 50 && p.isBlood &&
      !s.decisions.some((d) => d.targetId === p.id && d.kind === "marriage");
    // 个人年收支估算（与 tickYear 口径一致）
    let pIncome = 0;
    if (isAlive(p) && !p.tempStatus) {
      if (p.career && !p.retired && age >= 18) pIncome = CAREER_BY_ID[p.career].salary;
      else if (p.retired && p.career) pIncome = (CAREER_BY_ID[p.career]?.salary || 200) * 0.25;
    }
    const pUpkeep = !isAlive(p) ? 0 : age < 6 ? 40 : age < 18 ? (p.schooling ? 130 : 80) : age < 60 ? 95 : 120;
    box.innerHTML =
      '<div class="dt-head">' +
        '<div class="dt-portrait">' + portraitSVG(p, s.month, 64) + '</div>' +
        '<div><div class="dt-name">' + fullName(p) + '</div>' +
        '<div class="dt-sub">' + (p.gender === "male" ? "男" : "女") + ' · ' + (isAlive(p) ? age + "岁" : "已故·" + age) + ' · 第' + (p.generation + 1) + "代" + (p.marriedIn ? " · 嫁入" : "") + '</div></div>' +
      '</div>' +
      '<div class="dt-row"><span>身份</span><b>' + statusOf(p, s.month) + (p.educated ? " · 太学" : "") + (p.retired ? " · 致仕" : "") + '</b></div>' +
      (isAlive(p) ?
        '<div class="dt-row"><span>年俸入</span><b class="amt-gain">+' + Math.round(pIncome) + ' 贯</b></div>' +
        '<div class="dt-row"><span>年支度</span><b class="amt-loss">-' + Math.round(pUpkeep) + ' 贯</b></div>' : '') +
      '<div class="dt-row"><span>配偶</span><b>' + (spouse ? fullName(spouse) : "—") + '</b></div>' +
      '<div class="dt-row"><span>父母</span><b>' + (parents.length ? parents.map(fullName).join("、") : "—") + '</b></div>' +
      '<div class="dt-row"><span>子嗣</span><b>' + (kids.length ? kids.length + "人" : "无") + (p.hasConcubine ? " · 有妾" : "") + '</b></div>' +
      (p.omen ? '<div class="dt-row"><span>谶语</span><b>' + (p.omen.resolved ? "已应验" : (p.omen.type === "noble" ? "主显贵" : "主早夭")) + '</b></div>' : '') +
      (canMarry ? '<button class="btn-line" id="dt-marry">为之说媒</button>' : '');
    const mb = $("dt-marry");
    if (mb) mb.onclick = () => this.arrangeMarriage(p.id);
  };

  // ---------- 终局 ----------
  LineageGame.prototype.endGame = function (reason) {
    const s = this.state;
    s.ended = true;
    this.stopAuto();
    this.hideEventModal();
    this.appendLog("【终】" + reason, "epic");
    // 评级
    const span = Math.floor((s.month - s.startMonth) / 12);
    const members = s.members.size;
    const gens = s.stats.generations;
    const peak = s.stats.peakTreasury;
    let grade, title;
    const score = gens * 18 + members * 4 + Math.max(0, peak) / 400 + span * 0.5 + s.prestige * 1.2 + s.property * 0.5;
    if (score >= 200) { grade = "S"; title = "百年望族"; }
    else if (score >= 140) { grade = "A"; title = "钟鸣鼎食"; }
    else if (score >= 90) { grade = "B"; title = "诗礼传家"; }
    else if (score >= 50) { grade = "C"; title = "寻常人家"; }
    else if (score >= 25) { grade = "D"; title = "草草收场"; }
    else { grade = "F"; title = "湮没无闻"; }

    $("end-grade").textContent = grade;
    $("end-grade").className = "end-grade g-" + grade.toLowerCase();
    $("end-title").textContent = title;
    $("end-summary").innerHTML =
      "<p>" + s.dynastyName + " · 立族 " + span + " 载</p>" +
      "<p class='muted'>" + reason + "</p>" +
      "<div class='end-stats'>" +
        "<div><b>" + gens + "</b><span>代</span></div>" +
        "<div><b>" + members + "</b><span>族人</span></div>" +
        "<div><b>" + s.stats.totalBorn + "</b><span>出生</span></div>" +
        "<div><b>" + s.stats.totalDied + "</b><span>故去</span></div>" +
        "<div><b>" + Math.round(peak) + "</b><span>鼎盛家产</span></div>" +
        "<div><b>" + s.prestige + "</b><span>名望</span></div>" +
        "<div><b>" + s.property + "</b><span>田产/年</span></div>" +
      "</div>";
    const evLog = $("end-log");
    evLog.innerHTML = "";
    s.log.slice(-80).forEach((l) => {
      const d = document.createElement("div");
      d.className = "log-line " + (l.cls || "");
      if (l.html) d.innerHTML = l.text; else d.textContent = l.text;
      evLog.appendChild(d);
    });
    $("ending").classList.add("show");
    this.renderAll();
  };

  // ---------- 自动 / 控制 ----------
  LineageGame.prototype.advance = function () {
    const s = this.state;
    if (!s || s.ended) return;
    if (s.decisions.length > 0) { this.showEventModal(s.decisions[0]); return; }
    this.tickYear();
    if (s.ended) return;
    if (s.decisions.length > 0) this.showEventModal(s.decisions[0]);
  };

  LineageGame.prototype.toggleAuto = function () {
    this.auto = !this.auto;
    const btn = $("btn-auto");
    btn.textContent = this.auto ? "⏸ 暂停" : "⏩ 自动";
    btn.classList.toggle("on", this.auto);
    if (this.auto) this._autoStep();
  };
  LineageGame.prototype._autoStep = function () {
    if (!this.auto || !this.state || this.state.ended) return;
    const s = this.state;
    if (s.decisions.length > 0) { this.showEventModal(s.decisions[0]); return; }
    this.tickYear();
    if (s.ended) return;
    if (s.decisions.length > 0) { this.showEventModal(s.decisions[0]); return; }
    this._autoTimer = setTimeout(() => this._autoStep(), AUTO_TICK_MS);
  };
  LineageGame.prototype.stopAuto = function () {
    if (this._autoTimer) { clearTimeout(this._autoTimer); this._autoTimer = null; }
  };

  LineageGame.prototype.restart = function () {
    this.stopAuto();
    this.state = null;
    this.auto = false;
    $("btn-auto").textContent = "⏩ 自动";
    $("btn-auto").classList.remove("on");
    this.hideEventModal();
    $("log").innerHTML = "";
    $("detail").innerHTML = "";
    $("tree-cards").innerHTML = "";
    $("tree-svg").innerHTML = "";
    const tc = $("toast-container"); if (tc) tc.innerHTML = "";
    $("ending").classList.remove("show");
    this.zoom = 1; this.panX = 0; this.panY = 0;
    this.showCreation();
  };

  window.LineageGame = LineageGame;
})();
