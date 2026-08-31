"use strict";
/*
 * 游戏王·大模型玩家（与内置 AiPlayer 同一契约的可替换对手）
 *  - 实现引擎回调的 5 个方法：mainPhase / battlePhase / pickTargets / pickDiscard / decideChain。
 *  - 每一步把"净化后的局面 + 枚举好的合法动作候选表"发给大模型，模型只需回答 {"id":序号,"why":"简短理由"}。
 *  - 行动执行完全复用内置 AI 走过的引擎原语（doSummon / activateAndResolve / damageStep ...），规则安全性一致。
 *  - 任何失败（未配置/网络/超时/非法输出）都回退内置 AiPlayer 的对应决策，对局永不中断。
 *  - 信息净化：模型只能看到自己手牌与双方明面信息；对手手牌仅张数，里侧卡一律"里侧卡牌"。
 * 依赖顺序：cards.js -> index.js -> ai-player.js -> llm-player.js
 */
(function () {
  const AI_MONSTER_ZONES = 5;
  const AI_NO_EVENT = {};
  const REQUEST_TIMEOUT = 90000; // 单次决策超时（思考型模型留足时间）
  const CFG_KEY = "ygo.llm";

  /* ===================== 供应商预设与配置存取（供 UI 复用） ===================== */
  const PRESETS = [
    { name: "智谱 GLM", baseUrl: "https://open.bigmodel.cn/api/paas/v4", model: "glm-4-flash" },
    { name: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
    { name: "通义 Qwen（DashScope）", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", model: "qwen-plus" },
    { name: "Moonshot / Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
    { name: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    { name: "Ollama（本地）", baseUrl: "http://localhost:11434/v1", model: "qwen2.5:7b" },
    { name: "自定义", baseUrl: "", model: "" },
  ];
  const DEFAULT_CFG = {
    preset: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    apiKey: "ad6c5e56bb1f48299214f888d66b31a6.dG8JQxPPEaIfipWI",
    model: "glm-5.3-flash",
    temperature: 0.3,
    callMode: "proxy",
    thinking: "low", // off=尝试关闭；low/high/max=开启思考档位（始终思考的模型不支持 off，会自动降级为 low）
  };
  /** 思考参数：off 请求关闭；low/high/max 为思考档位 */
  function thinkingParam(mode) {
    if (mode === "low" || mode === "high" || mode === "max")
      return { type: "enabled", reasoning_effort: mode };
    return { type: "disabled" };
  }
  /** 思考档位对应的决策超时 */
  function timeoutFor(mode) {
    if (mode === "low") return 150000;
    if (mode === "high") return 180000;
    if (mode === "max") return 240000;
    return REQUEST_TIMEOUT;
  }
  function loadCfg() {
    try {
      const raw = JSON.parse(localStorage.getItem(CFG_KEY) || "{}");
      return { ...DEFAULT_CFG, ...(raw && typeof raw === "object" ? raw : {}) };
    } catch (e) {
      return { ...DEFAULT_CFG };
    }
  }
  function saveCfg(cfg) {
    try {
      localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    } catch (e) {
      /* 忽略存储失败 */
    }
  }
  function cfgReady(cfg) {
    return !!(cfg && cfg.baseUrl && cfg.model);
  }

  /** 连通性测试：非流式发一条 "回复 OK"（供配置面板按钮使用） */
  async function testConnection(cfg) {
    if (!cfgReady(cfg)) throw new Error("请先填写 Base URL 与模型");
    const { url, headers, body } = buildRequest(cfg, [
      { role: "user", content: "回复 OK" },
    ], false);
    const r = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const t = await r.text();
    if (!r.ok) throw new Error("HTTP " + r.status + " " + t.slice(0, 120));
    return t.slice(0, 80);
  }

  /* ===================== 传输层（OpenAI 兼容 /chat/completions） ===================== */
  function buildRequest(cfg, messages, stream, forceThinking) {
    const url =
      cfg.callMode === "direct"
        ? cfg.baseUrl.replace(/\/+$/, "") + "/chat/completions"
        : "/api/llm";
    const headers = { "Content-Type": "application/json" };
    const body = {
      model: cfg.model,
      messages,
      temperature: cfg.temperature ?? 0.3,
      stream: !!stream,
      // 思考档位：off 尝试关闭（不支持时服务端报 1210，自动降级 low）；low/high/max 开启思考
      thinking: thinkingParam(forceThinking || cfg.thinking || "off"),
    };
    if (cfg.callMode === "direct") {
      if (cfg.apiKey) headers["Authorization"] = "Bearer " + cfg.apiKey;
    } else {
      // 代理模式：密钥经本地服务转发（服务端 config.json 可兜底），避免密钥进浏览器日志
      body.baseUrl = cfg.baseUrl;
      body.apiKey = cfg.apiKey;
    }
    return { url, headers, body };
  }
  /** 从模型输出中稳健抽取 JSON 对象（容忍 markdown 包裹/前后杂text/截断） */
  function extractJson(raw) {
    if (!raw) return null;
    try {
      const a = JSON.parse(raw);
      if (a && typeof a === "object") return a;
    } catch (e) { }
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        const b = JSON.parse(m[0]);
        if (b && typeof b === "object") return b;
      } catch (e) { }
    }
    return null;
  }
  /** 单轮决策请求：返回解析后的 JSON 对象。
   *  - 两次机会（第二次附带纠错提示）；
   *  - 遇 1210「该模型始终思考」自动改用 low 档重试（不消耗纠错机会）；
   *  - 超时中断由内部 AbortController 管理，按思考档位放宽。 */
  async function askLLM(cfg, messages) {
    let lastErr = null;
    let needCorrection = false;
    let forceLow = false;
    const ctrl = new AbortController();
    const timer = setTimeout(
      () => ctrl.abort(),
      timeoutFor(forceLow ? "low" : cfg.thinking || "off"),
    );
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const msgs = needCorrection
          ? messages.concat([
            {
              role: "user",
              content:
                "你上一次的输出无法解析或不在候选范围内。请忽略之前的结果，严格只输出一个 JSON 对象，不要任何解释或代码块。",
            },
          ])
          : messages;
        const { url, headers, body } = buildRequest(
          cfg,
          msgs,
          false,
          forceLow ? "low" : undefined,
        );
        try {
          const resp = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: ctrl.signal,
          });
          if (!resp.ok) {
            const t = await resp.text().catch(() => "");
            if (!forceLow && /1210|不支持关闭思考/.test(t)) {
              forceLow = true; // 模型始终思考：立即改用 low 档重试
              attempt--;
              continue;
            }
            throw new Error("HTTP " + resp.status + " " + t.slice(0, 160));
          }
          const data = await resp.json();
          const msg =
            (data.choices && data.choices[0] && data.choices[0].message) || {};
          const json = extractJson(msg.content || "");
          if (json) return json;
          lastErr = new Error("输出无法解析为 JSON");
          needCorrection = true;
        } catch (e) {
          if (e && e.name === "AbortError") throw e;
          lastErr = e;
          needCorrection = false;
        }
      }
      throw lastErr || new Error("LLM 决策失败");
    } finally {
      clearTimeout(timer);
    }
  }

  /* ===================== 系统提示词 ===================== */
  const SYS_MAIN = `你是《游戏王》决斗高手，执"AI"方，与玩家轮流对决，目标是让对方 LP 归 0。
核心规则：每回合通常召唤/覆盖仅 1 次；5-6星怪兽召唤需1只祭品、7星以上需2只；陷阱覆盖后当回合不能发动；攻击表示怪兽每只每回合攻击1次；ATK 对撞差值造成战斗伤害；LP 归 0 或需抽卡时卡组为空即败。
你会收到当前局面摘要与一个【候选动作表】。每个候选有唯一 id。
【输出格式】只输出一个 JSON 对象（不要 markdown、不要解释）：
{"id":候选id, "why":"不超过20字的中文理由"}
没有合适动作时选择"结束主要阶段"的候选。防守优先级：保留陷阱覆盖、场面劣势时优先召唤守备表示或覆盖。`;

  const SYS_BATTLE = `你是《游戏王》决斗高手，当前处于你的战斗阶段。
规则：每只攻击表示怪兽本回合可攻击 1 次；可指定对方怪兽为目标（对方无怪兽时必须直接攻击）；攻击守备怪兽时，ATK 不及其 DEF 会受到差值反伤。
你会收到可攻击的怪兽与目标候选表，每个候选有唯一 id。
【输出格式】只输出一个 JSON 对象：{"id":候选id, "why":"不超过20字的中文理由"}
没有值得发动的攻击时选择"停止攻击"候选。`;

  const SYS_CHAIN = `你是《游戏王》决斗高手，现在对方发动了效果/召唤/攻击宣言，询问你是否连锁发动陷阱或魔法。
你会收到可连锁的卡列表与事件说明。连锁卡发动后进入连锁结算（后发先至）。
【输出格式】只输出一个 JSON 对象：{"id":候选id, "why":"不超过20字的中文理由"}
不值得连锁时选择"不连锁"候选（节省资源也是高手之道）。`;

  const SYS_TARGET = `你是《游戏王》决斗高手，一个效果需要你选择目标。
你会收到候选目标表与需要选择的数量 count。请从候选中选择最有利的目标。
【输出格式】只输出一个 JSON 对象：{"ids":[候选id...], "why":"不超过20字的中文理由"}
ids 必须恰好包含 count 个不重复的候选 id。`;

  const SYS_DISCARD = `你是《游戏王》决斗高手，需要从手牌丢弃 1 张卡（结算代价/手牌上限）。
通常保留高攻击怪兽与关键魔法陷阱，丢弃价值最低的。
【输出格式】只输出一个 JSON 对象：{"id":候选id, "why":"不超过20字的中文理由"}`;

  /* ===================== LlmPlayer ===================== */
  class LlmPlayer {
    constructor() {
      this.duel = null;
      this.fallback = null; // 内置 AiPlayer，兜底用
      this.cfg = loadCfg();
      this.onThinking = null; // (bool) => void：思考中横幅
      this.onWhy = null; // (text) => void：决策理由（写日志）
      this.onFallback = null; // (msg) => void：回退提示
      this._fallbackToasted = false;
    }
    attach(duel, fallback) {
      this.duel = duel;
      this.fallback = fallback;
      this.cfg = loadCfg();
    }
    get s() { return this.duel.state; }
    get p() { return this.duel.cur(); }
    get oppP() { return this.duel.curOpp(); }
    delay() { return this.duel.delay(); }

    /* ---------- 通用：取一次模型决策（候选表中选一个 id） ---------- */
    async decide(candidates, stateText, sysPrompt, tag) {
      if (!cfgReady(this.cfg)) throw new Error("大模型未配置");
      const lines = candidates
        .map((c, i) => `${i + 1}. ${c.label}`)
        .join("\n");
      const user =
        stateText +
        "\n\n【候选动作表】\n" +
        lines +
        '\n\n请只输出 JSON：{"id":序号, "why":"理由"}';
      this._think(tag, true);
      try {
        let correction = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          const json = await askLLM(this.cfg, [
            { role: "system", content: sysPrompt },
            { role: "user", content: user + correction },
          ]);
          const id = Number(json && json.id);
          const why = typeof json.why === "string" ? json.why.slice(0, 40) : "";
          if (Number.isInteger(id) && id >= 1 && id <= candidates.length) {
            if (why && this.onWhy) this.onWhy(why);
            return candidates[id - 1];
          }
          // id 非法：带纠错提示再问一次
          correction =
            "\n\n你上一次输出的 id 无效（" +
            JSON.stringify(json).slice(0, 60) +
            "）。id 必须是候选表中存在的序号，只输出 JSON。";
        }
        throw new Error("候选 id 越界");
      } finally {
        this._think(tag, false);
      }
    }
    _think(tag, on) {
      if (this.onThinking) this.onThinking(on, tag);
    }
    /** 回退到内置 AI，并对局内提示一次 */
    fallbackNotify(method, err) {
      if (!this._fallbackToasted && this.onFallback) {
        this._fallbackToasted = true;
        this.onFallback(
          "大模型决策失败（" +
          (err && err.message ? err.message.slice(0, 60) : "未知错误") +
          "），本步由内置 AI 代打",
        );
      }
      return this.fallback[method].apply(this.fallback, [].slice.call(arguments, 2));
    }

    /* ---------- 局面序列化（信息净化：不给对手手牌/里侧卡身份） ---------- */
    monText(m, who) {
      if (!m) return null;
      if (m.faceDown)
        return { zone: who, text: "里侧卡牌", atk: "?", def: "?", pos: "里侧" };
      const st = this.duel.stats(m);
      return {
        zone: who,
        text: m.name,
        atk: st.atk,
        def: st.def,
        pos: m.position === "atk" ? "攻击表示" : "守备表示",
        lv: m.level,
      };
    }
    stateText() {
      const s = this.s;
      const p = this.p;
      const opp = this.oppP;
      const meKey = this.duel._ownerKey(p);
      const line = (arr) =>
        arr
          .map((m, i) => {
            const t = this.monText(m, meKey);
            return t
              ? `#${i} ${t.text} ${t.atk === "?" ? "" : `攻${t.atk}/守${t.def} `}${t.pos}`
              : null;
          })
          .filter(Boolean)
          .join("；") || "（空）";
      const stLine = (arr) =>
        arr
          .map((c, i) => {
            if (!c) return null;
            if (c.faceDown) return `#${i} 里侧卡牌`;
            return `#${i} ${c.name}${c.type === "monster" ? ` 攻${this.duel.stats(c).atk}` : ""}`;
          })
          .filter(Boolean)
          .join("；") || "（空）";
      const handLine = p.hand
        .map((c, i) => {
          let t = `#${i} ${c.name}`;
          if (c.type === "monster")
            t += ` ${c.level}星 ${c.race || ""} 攻${c.atk || 0}/守${c.def || 0}`;
          else t += `（${c.type === "spell" ? "魔法" : "陷阱"}${c.subtype ? "·" + c.subtype : ""}）`;
          if (c.text) t += ` 【${c.text.slice(0, 60)}${c.text.length > 60 ? "…" : ""}】`;
          return t;
        })
        .join("\n");
      const phaseName = {
        draw: "抽卡", standby: "准备", main1: "主要阶段1",
        battle: "战斗阶段", main2: "主要阶段2", end: "结束",
      }[s.phase] || s.phase;
      return (
        `【局面】第${s.turn}回合 ${phaseName}｜你LP:${p.lp} 对方LP:${opp.lp}\n` +
        `你的手牌（#序号）：\n${handLine || "（无）"}\n` +
        `你的怪兽区：${line(p.monsterZone)}\n` +
        `对方怪兽区：${line(opp.monsterZone)}\n` +
        `你的魔陷区：${stLine(p.spellZone)}\n` +
        `对方魔陷区：${stLine(opp.spellZone)}\n` +
        `对方手牌数量：${opp.hand.length}｜你墓地怪兽：${p.graveyard.filter((c) => c.type === "monster").map((c) => c.name).join(",") || "无"
        }`
      );
    }

    /* ===================== 主要阶段 ===================== */
    async mainPhase() {
      const s = this.s;
      const p = this.p;
      const oppP = this.oppP;
      let guard = 0;
      while (guard++ < 30 && !s.winner) {
        let cand;
        try {
          cand = this.enumMain(p, oppP);
        } catch (e) {
          cand = null;
        }
        if (!cand || !cand.length) break;
        let choice = null;
        try {
          choice = await this.decide(cand, this.stateText(), SYS_MAIN, "main");
        } catch (e) {
          this.duel.log("🤖 大模型思考失败：" + (e.message || e));
          if (!s.winner) await this.fallback.mainPhase(); // 本阶段剩余动作交给内置 AI
          return;
        }
        if (!choice || choice.act === "pass") break;
        try {
          await this.execMain(choice);
        } catch (e) {
          this.duel.log("🤖 动作执行异常，结束主要阶段。");
          break;
        }
        await this.delay();
      }
      this.duel.emitView();
    }
    /** 枚举当前主要阶段全部合法动作 */
    enumMain(p, oppP) {
      const d = this.duel;
      const out = [];
      const myMon = d.monsters(p);
      const hand = p.hand.map((c, i) => ({ c, i }));
      const push = (act, label, extra) =>
        out.push(Object.assign({ act, label }, extra || {}));
      // 手牌魔法：可发动（有 manualTrigger 且条件满足、魔陷区有空位）
      if (d.freeSTZones(p).length) {
        for (const x of hand) {
          if (x.c.type !== "spell") continue;
          const tr = d.manualTrigger(x.c);
          if (!tr) continue;
          if (tr.condition && !tr.condition(x.c, AI_NO_EVENT, d.g)) continue;
          push("spell", `发动魔法「${x.c.name}」${x.c.text ? "：" + x.c.text.slice(0, 30) : ""}`, { i: x.i });
        }
      }
      // 手牌怪兽起动效果（特殊召唤类）
      for (const x of hand) {
        if (x.c.type !== "monster") continue;
        const tr = d.manualTrigger(x.c);
        if (!tr) continue;
        if (tr.condition && !tr.condition(x.c, AI_NO_EVENT, d.g)) continue;
        push("hand-effect", `发动手牌怪兽效果「${x.c.name}」`, { i: x.i });
      }
      // 通常召唤 / 覆盖 / 祭品召唤
      if (!p.normalSummonUsed && d.freeMonsterZones(p).length) {
        for (const x of hand) {
          if (x.c.type !== "monster") continue;
          const lv = x.c.level || 0;
          if (lv >= 5) {
            const need = lv >= 7 ? 2 : 1;
            if (myMon.length >= need) {
              const sorted = myMon
                .slice()
                .sort((a, b) => this.monValue(a) - this.monValue(b))
                .map((m) => p.monsterZone.indexOf(m));
              push("summon", `祭品召唤 ${need}祭品 召唤「${x.c.name}」（${lv}星 攻${x.c.atk}）`, {
                i: x.i, kind: "tribute", tributes: sorted.slice(0, need),
              });
            }
          } else {
            const flip = !!(
              x.c.effect && x.c.effect.triggers &&
              x.c.effect.triggers.some((t) => t.event === "flip")
            );
            push("summon", `通常召唤（攻击表示）「${x.c.name}」（${lv}星 攻${x.c.atk}/守${x.c.def}）`, { i: x.i, kind: "normal" });
            push("summon", `覆盖（里侧守备）「${x.c.name}」${flip ? "（反转效果怪，推荐覆盖）" : ""}`, { i: x.i, kind: "set" });
          }
        }
      }
      // 场上怪兽起动效果
      for (const m of myMon) {
        if (m.faceDown) continue;
        const tr = d.manualTrigger(m);
        if (!tr) continue;
        push("ignite", `发动场上怪兽效果「${m.name}」${m.text ? "：" + m.text.slice(0, 30) : ""}`, { zone: p.monsterZone.indexOf(m) });
      }
      // 覆盖魔陷（含魔法覆盖；上限 3 张里侧）
      const setCount = d.spells(p).filter((c) => c.faceDown).length;
      if (d.freeSTZones(p).length && setCount < 3) {
        for (const x of hand) {
          if (x.c.type === "monster") continue;
          push("set", `覆盖「${x.c.name}」（${x.c.type === "trap" ? "陷阱" : "魔法"}${x.c.subtype ? "·" + x.c.subtype : ""}）`, { i: x.i });
        }
      }
      push("pass", "结束主要阶段（进入战斗/下一步）");
      return out;
    }
    /** 执行候选动作（与内置 AiPlayer 相同的引擎原语调用方式） */
    async execMain(c) {
      const d = this.duel;
      const p = this.p;
      if (c.act === "spell") {
        const card = p.hand[c.i];
        if (!card) return;
        const trigger = d.manualTrigger(card);
        if (!trigger) return;
        if (trigger.condition && !trigger.condition(card, AI_NO_EVENT, d.g)) return;
        d._activator = "ai";
        let targets = null;
        if (trigger.acquireTargets) {
          targets = await trigger.acquireTargets(card, AI_NO_EVENT, d.g);
          if (targets === null) return;
        }
        const zi = d.freeSTZones(p)[0];
        if (zi == null) return;
        p.hand.splice(c.i, 1);
        p.spellZone[zi] = card;
        card.faceDown = false;
        card.location = "spell";
        card.controller = "ai";
        await d.activateAndResolve("ai", card, trigger, null, "spell-hand", targets);
      } else if (c.act === "hand-effect") {
        const card = p.hand[c.i];
        if (!card) return;
        const trigger = d.manualTrigger(card);
        if (!trigger) return;
        if (trigger.condition && !trigger.condition(card, AI_NO_EVENT, d.g)) return;
        await d.activateAndResolve("ai", card, trigger, null, "monster-effect");
      } else if (c.act === "summon") {
        const card = p.hand[c.i];
        if (!card) return;
        const zi = d.freeMonsterZones(p)[0];
        if (c.kind === "tribute") {
          for (const ti of c.tributes || [])
            if (p.monsterZone[ti]) await d.tribute(p.monsterZone[ti]);
          p.hand.splice(c.i, 1);
          d.placeMonster(p, card, zi, "atk", false);
          p.normalSummonUsed = true;
          d.log(`AI 祭品召唤 ${card.name}！`);
          await d.doSummon("ai", card, "tribute");
        } else if (c.kind === "set") {
          p.hand.splice(c.i, 1);
          d.placeMonster(p, card, zi, "def", true);
          p.normalSummonUsed = true;
          p.setThisTurn[zi] = true;
          d.log("AI 覆盖了1只怪兽。");
          await d.doSummon("ai", card, "set");
        } else {
          p.hand.splice(c.i, 1);
          d.placeMonster(p, card, zi, "atk", false);
          p.normalSummonUsed = true;
          d.log(`AI 通常召唤 ${card.name}。`);
          await d.doSummon("ai", card, "normal");
        }
      } else if (c.act === "ignite") {
        const m = p.monsterZone[c.zone];
        if (!m) return;
        const trigger = d.manualTrigger(m);
        if (!trigger) return;
        await d.activateAndResolve("ai", m, trigger, null, "monster-effect");
      } else if (c.act === "set") {
        const card = p.hand[c.i];
        if (!card) return;
        const zi = d.freeSTZones(p)[0];
        p.hand.splice(c.i, 1);
        p.spellZone[zi] = card;
        card.faceDown = true;
        card.turnSet = this.s.turn;
        card.location = "spell";
        card.controller = "ai";
        d.log("AI 覆盖了1张魔陷卡。");
        d.emitView();
      }
    }

    /* ===================== 战斗阶段 ===================== */
    async battlePhase() {
      const d = this.duel;
      const s = this.s;
      // 光之护封剑封锁：与内置 AI 同步跳过（镜像其判定）
      if (s.me.attackLockTurns > 0) {
        d.log("AI 受光之护封剑影响，跳过战斗阶段。");
        d.emitView();
        if (!s.winner) await d.enterMain2();
        return;
      }
      const p = this.p;
      const oppP = this.oppP;
      let guard = 0;
      while (guard++ < 20 && !s.winner && s.phase === "battle") {
        const cand = this.enumAttack(p, oppP);
        if (!cand.length) break;
        let choice = null;
        try {
          choice = await this.decide(cand, this.stateText(), SYS_BATTLE, "battle");
        } catch (e) {
          this.duel.log("🤖 大模型思考失败：" + (e.message || e));
          if (!s.winner) await this.fallback.battlePhase(); // 战斗阶段整体交给内置 AI（其内部会进入主阶段2）
          return;
        }
        if (!choice || choice.act === "stop") break;
        await this.delay();
        const { attacker, zoneIdx, targetIdx } = choice;
        p.attacked[zoneIdx] = true;
        s.attackNegated = false;
        s.endBattlePhase = false;
        s.currentAttack = { attacker, atkOwner: "ai" };
        let target = targetIdx != null ? oppP.monsterZone[targetIdx] : null;
        if (this.duel.monsters(oppP).length === 0) target = null;
        d.log(`AI 的 ${attacker.name} 发动攻击！${target ? "目标：" + target.name : "直接攻击"}`);
        await d.emit({
          kind: "attack_declare", actor: "ai", attacker, attackerOwner: "ai",
          target, targetOwner: "me",
        });
        if (s.endBattlePhase) break;
        if (s.attackNegated) {
          d.emitView();
          continue;
        }
        if (!d.isValid(attacker)) {
          d.log(`${attacker.name} 已不在场上，攻击中止。`);
          d.emitView();
          continue;
        }
        if (target && !d.isValid(target)) {
          if (d.monsters(oppP).length === 0) target = null;
          else target = oppP.monsterZone.find((m) => m) || null;
        }
        await d.damageStep(attacker, "ai", target, "me");
        if (s.winner) break;
      }
      if (!s.winner) await d.enterMain2();
    }
    /** 枚举攻击候选：每只可攻击怪兽 × 每个目标 / 直接攻击 */
    enumAttack(p, oppP) {
      const d = this.duel;
      const out = [];
      const attackers = p.monsterZone
        .map((m, i) => ({ m, i }))
        .filter((x) => !!x.m && !x.m.faceDown && x.m.position === "atk" && !p.attacked[x.i]);
      if (!attackers.length) return out;
      const oppMon = d.monsters(oppP);
      for (const a of attackers) {
        const aAtk = d.stats(a.m).atk;
        if (oppMon.length === 0) {
          out.push({ act: "attack", attacker: a.m, zoneIdx: a.i, targetIdx: null, label: `「${a.m.name}」（攻${aAtk}）直接攻击对方玩家` });
          continue;
        }
        for (let ti = 0; ti < AI_MONSTER_ZONES; ti++) {
          const t = oppP.monsterZone[ti];
          if (!t) continue;
          const tDesc = t.faceDown
            ? "里侧卡牌（守备，攻守未知，有风险）"
            : `「${t.name}」${t.position === "atk" ? "攻击表示 攻" + d.stats(t).atk : "守备表示 守" + d.stats(t).def}`;
          out.push({
            act: "attack", attacker: a.m, zoneIdx: a.i, targetIdx: ti,
            label: `「${a.m.name}」（攻${aAtk}）攻击 ${tDesc}`,
          });
        }
      }
      out.push({ act: "stop", label: "停止攻击（进入主要阶段2）" });
      return out;
    }

    /* ===================== 连锁决策 ===================== */
    async decideChain(playerKey, event, chainable) {
      // 无可连锁卡：直接放行（与内置 AI 行为一致）
      if (!chainable || !chainable.length) return { pass: true };
      const evDesc = this.eventText(event);
      const cand = chainable.map((x, i) => ({
        act: "chain", card: x.card, trigger: x.trigger,
        label: `连锁发动「${x.card.name}」（${x.card.type === "trap" ? "陷阱" : "魔法"}${x.card.text ? "：" + x.card.text.slice(0, 40) : ""}）`,
      }));
      cand.push({ act: "pass", label: "不连锁（保留这张卡以后再用）" });
      let choice = null;
      try {
        choice = await this.decide(cand, this.stateText() + "\n\n【触发事件】" + evDesc, SYS_CHAIN, "chain");
      } catch (e) {
        return this.fallbackNotify("decideChain", e, playerKey, event, chainable);
      }
      if (!choice || choice.act === "pass") return { pass: true };
      return { pass: false, card: choice.card, trigger: choice.trigger };
    }
    eventText(ev) {
      const who = ev.actor === "me" ? "玩家" : "AI";
      switch (ev.kind) {
        case "summon_attempt":
          return `${who} 召唤 ${ev.monster && !ev.hidden ? "「" + ev.monster.name + "」" : "怪兽（里侧）"}（神之宣告可无效）`;
        case "summon":
          return `${who} 召唤了 ${ev.monster && !ev.hidden ? "「" + ev.monster.name + "」攻" + this.duel.stats(ev.monster).atk : "里侧怪兽"}`;
        case "attack_declare":
          return `${who} 的「${ev.attacker ? ev.attacker.name : "?"}」宣言攻击${ev.target ? "，目标「" + ev.target.name + "」" : "（直接攻击）"}`;
        case "activate":
          return `${who} 发动了「${ev.card ? ev.card.name : "?"}」`;
        case "damage_calc":
          return `伤害计算：${who} 将受到 ${ev.damage || 0} 点战斗伤害`;
        default:
          return ev.kind;
      }
    }

    /* ===================== 目标与弃牌 ===================== */
    async pickTargets(msg, options, count) {
      const c = count || 1;
      if (!options || !options.length)
        return this.fallback.pickTargets(msg, options, c);
      const cand = options.map((o, i) => ({
        id: i,
        label: `#${i} ${o.card && !o.card.faceDown ? o.card.name + "（" + (o.label || "") + "）" : "里侧卡牌"}`,
      }));
      try {
        const stateText =
          this.stateText() + `\n\n【选目标要求】${msg}；需要选择 ${c} 个目标。`;
        const json = await this.decideMulti(cand, stateText, SYS_TARGET, c, "target");
        return json.map((i) => options[i].value);
      } catch (e) {
        return this.fallbackNotify("pickTargets", e, msg, options, c);
      }
    }
    /** 多选版本：{"ids":[...]}，恰好 count 个且不重复、均在范围内 */
    async decideMulti(candidates, stateText, sysPrompt, count, tag) {
      if (!cfgReady(this.cfg)) throw new Error("大模型未配置");
      const lines = candidates.map((x) => `${x.id + 1}. ${x.label}`).join("\n");
      const user =
        stateText + "\n\n【候选目标表】\n" + lines +
        `\n\n请只输出 JSON：{"ids":[${new Array(count).fill("候选id").join(",")}], "why":"理由"}（共 ${count} 个）`;
      this._think(tag, true);
      try {
        let correction = "";
        for (let attempt = 0; attempt < 2; attempt++) {
          const json = await askLLM(this.cfg, [
            { role: "system", content: sysPrompt },
            { role: "user", content: user + correction },
          ]);
          const ids = Array.isArray(json && json.ids)
            ? json.ids.map(Number)
            : [];
          const ok =
            ids.length === count &&
            ids.every(
              (n) => Number.isInteger(n) && n >= 1 && n <= candidates.length,
            ) &&
            new Set(ids).size === count;
          if (ok) {
            if (json.why && this.onWhy) this.onWhy(String(json.why).slice(0, 40));
            return ids.map((n) => n - 1);
          }
          correction =
            "\n\n你上一次输出的 ids 无效（" +
            JSON.stringify(json).slice(0, 60) +
            "）。ids 必须恰好 " +
            count +
            " 个、互不重复且都来自候选表序号，只输出 JSON。";
        }
        throw new Error("目标 ids 非法");
      } finally {
        this._think(tag, false);
      }
    }
    async pickDiscard(hand) {
      const cand = hand.map((c, i) => {
        let t = `丢弃 #${i} ${c.name}`;
        if (c.type === "monster") t += `（${c.level || 0}星 攻${c.atk || 0}/守${c.def || 0}）`;
        else t += `（${c.type === "spell" ? "魔法" : "陷阱"}${c.subtype ? "·" + c.subtype : ""}${c.text ? "：" + c.text.slice(0, 24) : ""}）`;
        return { act: "discard", idx: i, label: t };
      });
      try {
        const choice = await this.decide(cand, this.stateText(), SYS_DISCARD, "discard");
        if (choice && typeof choice.idx === "number") return choice.idx;
        throw new Error("弃牌决策非法");
      } catch (e) {
        return this.fallbackNotify("pickDiscard", e, hand);
      }
    }

    /* ---------- 估值（供祭品/枚举排序，与内置 AI 一致） ---------- */
    monValue(m) {
      const st = this.duel.stats(m);
      return st.atk + st.def * 0.2 + (m.effect ? 300 : 0);
    }
  }

  window.LlmPlayer = LlmPlayer;
  window.YGO_LLM = { PRESETS, DEFAULT_CFG, loadCfg, saveCfg, cfgReady, testConnection };
})();
