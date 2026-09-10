/*
 * 游戏王 3D UI · DOM/HUD 层
 *  状态栏渲染、回合条、连锁横幅、卡牌菜单、模式条、引导 chip、交互弹窗、日志/Toast、帮助/结算/开局面板。
 *  局部可变状态（logBuf/prevLp/winnerShown/lastChainLen/toastTimer）为本模块私有；共享状态读 store.S。
 */
import { animate } from "animejs";
import { S, saveOppMode, hiddenForMe } from "./store.mjs";
import { IC, ATTR_TXT, PHASE_TIPS, PHASE_NAMES, PHASE_ORDER } from "./labels.mjs";
import { sfx } from "./sfx.mjs";
import { flashScreen } from "./domfx.mjs";
import { chipEls, projectMesh, artUrl, setZoneHighlight3D, sync3D } from "./scene.mjs";
import { availableActions } from "./actions.mjs";
import { CARD_BY_ID } from "../cards.mjs";
import { EXTRA_DECK_PRESETS, DECK_META, buildMainDeck, buildExtraDeck } from "../decks.mjs";
import { YGO_LLM } from "../llm-player.mjs";
const $ = (id) => document.getElementById(id);

let toastTimer = null;
let logBuf = [];
let prevLp = { me: 8000, ai: 8000 }; // resetHud 时按 S.startLP 重置
let winnerShown = false;
let lastChainLen = 0;
const stage = document.getElementById("stage"); // 显式获取（原先依赖 window.stage 隐式全局）

      /* ===================== DOM 卡牌（菜单/弹窗展示用） ===================== */
      function cardEl(card, opts = {}) {
        const el = document.createElement("div");
        if (!card) return el;
        if (opts.back) {
          el.className = "card back" + (opts.extraClass || "");
          return el;
        }
        el.className = "card " + card.type + (opts.extraClass || "");
        if (opts.set) {
          el.className = "card set";
          return el;
        }
        const nb = document.createElement("div");
        nb.className = "namebar";
        nb.textContent = card.name;
        el.appendChild(nb);
        const art = document.createElement("div");
        art.className = "art";
        const em = document.createElement("div");
        em.className = "em";
        em.textContent =
          card.type === "monster"
            ? (card.race || "怪兽").replace(/族$/, "")
            : card.type === "spell"
              ? "魔法"
              : "陷阱";
        art.appendChild(em);
        if (card.password && !opts.back && !opts.set) {
          const img = document.createElement("img");
          img.className = "scan";
          img.src = artUrl(card.password);
          img.onerror = () => img.remove();
          img.onload = () => {
            el.classList.add("has-art");
            em.style.display = "none";
          };
          art.appendChild(img);
        }
        el.appendChild(art);
        if (card.type === "monster") {
          const attr = document.createElement("div");
          attr.className = "attr";
          attr.textContent = ATTR_TXT[card.attribute] || "";
          el.appendChild(attr);
          if (card.level) {
            const stars = document.createElement("div");
            stars.className = "stars";
            stars.textContent = "★".repeat(Math.min(card.level, 12));
            el.appendChild(stars);
          }
        } else {
          const sub = document.createElement("div");
          sub.className = "sub";
          sub.textContent = card.subtype || "";
          el.appendChild(sub);
        }
        const foot = document.createElement("div");
        foot.className = "foot";
        if (card.type === "monster") {
          const st = opts.stats || { atk: card.atk, def: card.def };
          foot.innerHTML = `<span>ATK <b>${st.atk ?? "?"}</b></span><span>DEF <b>${st.def ?? "?"}</b></span>`;
        } else {
          foot.innerHTML = `<span>${card.type === "spell" ? "魔法" : "陷阱"}</span><span></span>`;
        }
        el.appendChild(foot);
        return el;
      }
      /* ===================== 渲染（DOM 部分） ===================== */
      /* 阶段进度条：6 节点随当前阶段点亮（我方金色 / AI 回合红色），仅作流程可视化 */
      const PHASE_ICONS = {
        draw: IC.draw,
        standby: IC.check,
        main1: IC.spark,
        battle: IC.sword,
        main2: IC.gear,
        end: IC.flag,
      };
      function renderPhaseTrack(s) {
        const track = $("phase-track");
        if (!track) return;
        if (!track.children.length) {
          for (const ph of PHASE_ORDER) {
            const n = document.createElement("div");
            n.className = "pt-node";
            n.dataset.phase = ph;
            const tip = PHASE_TIPS[ph];
            n.title = tip ? tip[0] : ph;
            n.innerHTML = `<span class="pt-ic">${PHASE_ICONS[ph] || ""}</span>`;
            track.appendChild(n);
            if (ph !== "end") {
              const line = document.createElement("i");
              line.className = "pt-line";
              track.appendChild(line);
            }
          }
          document.querySelectorAll(".lp-ic[data-ic]").forEach((el) => {
            el.innerHTML = IC[el.dataset.ic] || "";
            el.removeAttribute("data-ic");
          });
        }
        const cur = PHASE_ORDER.indexOf(s.phase);
        track.classList.toggle("ai", s.turnPlayer !== "me" && !s.winner);
        let i = 0;
        for (const n of track.querySelectorAll(".pt-node")) {
          n.classList.toggle("cur", i === cur);
          n.classList.toggle("done", cur >= 0 && i < cur);
          i++;
        }
      }
      function render() {
        const s = S.duel && S.duel.state;
        if (!s) return;
        updateLP("me", s.me.lp);
        updateLP("ai", s.ai.lp);
        // 当前行动方 LP 行呼吸光晕
        const meTurn = s.turnPlayer === "me" && !s.winner;
        $("lp-row-me").classList.toggle("active", meTurn);
        $("lp-row-ai").classList.toggle("active", !meTurn && !s.winner);
        renderPhaseTrack(s);
        // 玩家盒：卡组/墓地余量
        $("ai-deck-count").textContent = s.ai.deck.length;
        $("ai-grave-count").textContent = s.ai.graveyard.length;
        $("me-deck-count").textContent = s.me.deck.length;
        $("me-grave-count").textContent = s.me.graveyard.length;
        // 回合信息单一来源：顶部一条完整展示（第 N 回合 · 谁的回合 · 阶段全称）
        const tp = s.turnPlayer;
        $("phase-tag").textContent =
          `第 ${s.turn} 回合 · ` +
          (tp === "me" ? "你的回合" : "AI 回合") +
          " · " +
          (PHASE_NAMES[s.phase] || s.phase);
        $("phase-tag").className = "phase-tag " + tp;
        // 阶段问号：悬停显示该阶段可做什么
        const tipNow = PHASE_TIPS[s.phase];
        $("phase-help").title = tipNow ? `${tipNow[0]}：${tipNow[1]}` : "阶段说明";
        renderTurnBar(s);
        renderChainBanner(s);
        renderPrompt(s);
        renderModeBar();
        try {
          renderChips();
        } catch (e) {
          if (!window.__rcErr) {
            window.__rcErr = true;
            pushLog("[ui] chip渲染失败: " + (e && e.message));
          }
        }
        if (s.winner && !winnerShown) showGameOver(s.winner);
      }
      function updateLP(who, val) {
        const el = $(`lp-${who}`);
        if (el.textContent !== String(val)) {
          el.textContent = val;
          el.classList.remove("bump");
          void el.offsetWidth; // 重启动画
          el.classList.add("bump");
        }
        const fill = $(`lp-${who}-fill`);
        fill.style.width = Math.max(0, (val / (S.startLP || 8000)) * 100) + "%";
        if (val < prevLp[who]) {
          const bar = $(`lp-${who}-bar`);
          bar.classList.remove("hit");
          void bar.offsetWidth;
          bar.classList.add("hit");
          if (who === "me") flashScreen("rgba(229,72,77,0.25)"); // 玩家受击的屏幕红闪
        }
        prevLp[who] = val;
      }
      function renderTurnBar(s) {
        const mine =
          s.turnPlayer === "me" && !s.pending && !s.resolving && !s.winner;
        // 底部只保留操作提示（回合归属/阶段已由顶部单一展示，不再重复）
        const tipNow = PHASE_TIPS[s.phase];
        $("tb-tip").textContent = mine
          ? (tipNow && tipNow[1]) || ""
          : "AI 行动中…";
        $("turn-bar").className = "action-cluster turn-bar" + (mine ? "" : " ai");
        const mainBtn = $("tb-main"),
          endBtn = $("tb-end");
        // cls: "primary"（金底主操作）| "end"（描边高亮次主操作）| "ghost"（弱化）
        const set = (b, label, show, cls, enabled) => {
          if (b.innerHTML !== label) b.innerHTML = label;
          b.style.visibility = show ? "" : "hidden"; // 占位隐藏而非 display:none，避免回合条宽度跳动
          b.className = "tb-btn" + (cls ? " " + cls : "");
          b.disabled = !(mine && enabled);
        };
        const END = IC.flag + " 结束回合<i class='kbd'>P</i>";
        if (s.phase === "main1") {
          set(mainBtn, IC.sword + " 进入战斗<i class='kbd'>B</i>", true, "primary", true);
          set(endBtn, END, true, "end", true);
        } else if (s.phase === "battle") {
          set(mainBtn, IC.gear + " 主阶段 2<i class='kbd'>B</i>", true, "primary", true);
          set(endBtn, END, true, "end", true);
        } else if (s.phase === "main2") {
          set(mainBtn, IC.flag + " 结束回合<i class='kbd'>P</i>", true, "primary", true);
          set(endBtn, "", false, "", true);
        } else {
          set(mainBtn, "—", true, "", false);
          set(endBtn, "", false, "", false);
        }
      }
      function renderChainBanner(s) {
        const el = $("chain-banner");
        const n = s.chain ? s.chain.length : 0;
        if (n) {
          if (n !== lastChainLen) sfx("chain");
          el.classList.add("show");
          el.innerHTML =
            `<b>连锁 ${n}</b>` +
            s.chain
              .map(
                (l, i) =>
                  `<span class="link">${i + 1}. ${l.card.name}（${l.player === "me" ? "玩家" : "AI"}）</span>`,
              )
              .join("");
        } else el.classList.remove("show");
        lastChainLen = n;
      }
      /* ===================== popover 菜单 ===================== */
      function openMenu(card, info, mesh3d) {
        if (S.duel.state.pending || S.duel.state.resolving) return;
        if (S.mode) return; // 任何多步模式（攻击/祭品/放置）中都不弹菜单（路由层已拦，双保险）
        closeMenu();
        S.menuOpen = true;
        const mask = document.createElement("div");
        mask.className = "backdrop";
        mask.onclick = () => closeMenu();
        document.body.appendChild(mask);
        const menu = document.createElement("div");
        menu.className = "card-menu t-" + card.type; // 类型着色：怪兽金棕 / 魔法绿 / 陷阱紫
        menu.id = "card-menu";
        // AI 手牌与里侧卡统一按未知处理（不展示卡名/攻防/效果文本）
        const isOppFacedown = hiddenForMe(card, info);
        const preview = cardEl(card, {
          stats: card.type === "monster" && !isOppFacedown ? S.duel.stats(card) : null,
          back: isOppFacedown,
        });
        preview.classList.add("menu-card");
        menu.appendChild(preview);
        const body = document.createElement("div");
        body.className = "menu-body";
        const meta = document.createElement("div");
        meta.className = "meta";
        if (isOppFacedown)
          meta.innerHTML =
            info && info.kind === "hand"
              ? `<b>对方的手牌</b><br>信息未知`
              : `<b>里侧卡牌</b><br>信息未知`;
        else if (card.type === "monster") {
          const st = S.duel.stats(card);
          meta.innerHTML = `<b>${card.name}</b><br>${card.attribute} · ${card.race} · ${"★".repeat(card.level)} 等级${card.level}<br>ATK <b style="color:var(--accent)">${st.atk}</b> / DEF <b style="color:var(--accent)">${st.def}</b>`;
        } else
          meta.innerHTML = `<b>${card.name}</b><br>${card.type === "spell" ? "魔法" : "陷阱"} · ${card.subtype}`;
        body.appendChild(meta);
        if (!isOppFacedown && card.text) {
          const t = document.createElement("div");
          t.className = "text";
          t.textContent = card.text;
          body.appendChild(t);
        }
        const actions = document.createElement("div");
        actions.className = "actions";
        const acts = availableActions({ duel: S.duel, ic: IC, closeMenu, startTribute, enterAttackMode }, card, info);
        if (acts.length)
          acts.forEach((a) => {
            // 用 button 而非 div：可 Tab 聚焦/回车触发（键盘可达）
            const b = document.createElement("button");
            b.type = "button";
            b.className = "act-btn" + (a.primary ? " primary" : "");
            b.innerHTML = `<span class="ic">${a.icon}</span><span>${a.label}</span>`;
            b.onclick = (e) => {
              e.stopPropagation();
              a.fn();
            };
            actions.appendChild(b);
          });
        else {
          const e = document.createElement("div");
          e.className = "empty";
          e.textContent = "（当前无可执行操作）";
          actions.appendChild(e);
        }
        body.appendChild(actions);
        menu.appendChild(body);
        document.body.appendChild(menu);
        // 定位在 3D 卡牌投影处
      if (mesh3d) {
        const p = projectMesh(mesh3d);
        positionMenuAt(p.x, p.y, menu);
        } else {
          menu.style.left = "50%";
          menu.style.top = "50%";
          menu.style.transform = "translate(-50%,-50%)";
        }
        render();
      }
      function positionMenuAt(x, y, menu) {
        const mw = menu.offsetWidth,
          mh = menu.offsetHeight;
        let left = x - mw / 2;
        let top = y + 10;
        if (top + mh > window.innerHeight - 8) top = y - mh - 10;
        if (top < 8) top = 8;
        left = Math.max(8, Math.min(left, window.innerWidth - mw - 8));
        menu.style.left = left + "px";
        menu.style.top = top + "px";
        menu.style.transform = "none";
      }
      function closeMenu() {
        const m = $("card-menu");
        if (m) m.remove();
        document.querySelectorAll(".backdrop").forEach((b) => b.remove());
        setZoneHighlight3D(null);
        if (S.menuOpen) {
          S.menuOpen = false;
          render();
        }
      }
      /* ===================== 攻击/祭品/放置模式 ===================== */
      function enterAttackMode(zoneIdx) {
        closeMenu();
        S.mode = "attack";
        S.attackZone = zoneIdx;
        render();
        sync3D(); // 模式染色（攻击者蓝/目标红）立即生效
        renderModeBar();
      }
      function startTribute(handIdx) {
        closeMenu();
        S.mode = "tribute";
        S.tributeHandIdx = handIdx;
        S.tributePool = [];
        render();
        sync3D(); // 祭品候选金色高亮立即生效
        renderModeBar();
      }
      function exitMode() {
        S.mode = null;
        S.attackZone = null;
        S.tributeHandIdx = null;
        S.tributePool = [];
        setZoneHighlight3D(null);
        render();
        sync3D(); // 清除模式染色（攻击目标红/祭品金），避免残留
        renderModeBar();
      }
      function toggleTribute(idx) {
        if (S.tributePool.includes(idx))
          S.tributePool = S.tributePool.filter((x) => x !== idx);
        else S.tributePool.push(idx);
        render();
        sync3D(); // 已选祭品金色高亮同步
        renderModeBar();
      }
      function renderModeBar() {
        const bar = $("mode-bar");
        const overlay = $("atk-overlay");
        if (!S.mode) {
          bar.classList.remove("show");
          overlay.classList.remove("show");
          overlay.innerHTML = "";
          return;
        }
        if (S.mode === "attack") {
          // 攻击选择：悬浮居中面板（大按钮/目标提示，远离回合条防误点）
          bar.classList.remove("show");
          overlay.classList.add("show");
          overlay.innerHTML = "";
          const attacker = S.duel.state.me.monsterZone[S.attackZone];
          const title = document.createElement("div");
          title.className = "atk-title";
          title.textContent = (attacker ? attacker.name : "?") + " 正在攻击";
          overlay.appendChild(title);
          if (S.duel.state.ai.monsterZone.every((x) => !x)) {
            const b = document.createElement("button");
            b.className = "btn big";
            b.textContent = "直接攻击";
            b.onclick = () => {
              S.duel.declareAttack(S.attackZone, null);
              exitMode();
            };
            overlay.appendChild(b);
          } else {
            const hint = document.createElement("div");
            hint.className = "atk-hint";
            hint.textContent = "点击对方怪兽（红色高亮）选择攻击目标";
            overlay.appendChild(hint);
          }
          const c = document.createElement("button");
          c.className = "btn ghost";
          c.textContent = "取消";
          c.onclick = () => exitMode();
          overlay.appendChild(c);
          return;
        }
        overlay.classList.remove("show");
        overlay.innerHTML = "";
        bar.classList.add("show");
        bar.innerHTML = "";
        if (S.mode === "tribute") {
          const card = S.duel.state.me.hand[S.tributeHandIdx];
          const need = card.level >= 7 ? 2 : 1;
          const lbl = document.createElement("div");
          lbl.className = "lbl";
          lbl.textContent = `祭品 ${S.tributePool.length}/${need}（金色高亮为已选）`;
          bar.appendChild(lbl);
          const ok = document.createElement("button");
          ok.className = "btn";
          ok.textContent = "召唤";
          ok.disabled = S.tributePool.length !== need;
          ok.onclick = () => {
            if (S.tributePool.length === need) {
              // 祭品选定后直接召唤（zone=null 引擎自动落第一个空格）
              S.duel.tributeSummon(S.tributeHandIdx, [...S.tributePool], null, "atk");
              exitMode();
            }
          };
          bar.appendChild(ok);
          const c = document.createElement("button");
          c.className = "btn ghost";
          c.textContent = "取消";
          c.onclick = () => exitMode();
          bar.appendChild(c);
          return;
        }
      }

      /* ===================== 卡牌引导 chip（战斗攻击 / 祭品已选） ===================== */
      function renderChips() {
        const want = new Map(); // key -> { cls, text, fn }
        const s = S.duel && S.duel.state;
        if (s) {
          // 战斗阶段（未进入攻击选择模式）：可攻击显示"攻击"，不可攻击显示原因
          if (
            s.turnPlayer === "me" &&
            s.phase === "battle" &&
            !s.pending &&
            !s.resolving &&
            !S.mode
          ) {
            s.me.monsterZone.forEach((m, i) => {
              if (!m) return;
              const blk = S.duel.attackBlock(i);
              want.set(
                m.uid,
                blk.ok
                  ? { cls: "atk", text: IC.sword + " 攻击", fn: () => enterAttackMode(i) }
                  : {
                      cls: "dim",
                      text: IC.ban + " " + blk.reason,
                      fn: () => toast(blk.reason),
                    },
              );
            });
          }
          // 祭品选择：已选卡打勾
          if (S.mode === "tribute") {
            s.me.monsterZone.forEach((m, i) => {
              if (!m || !S.tributePool.includes(i)) return;
              want.set(m.uid + ":sel", {
                cls: "sel",
                text: IC.check + " 已选",
                fn: null,
              });
            });
          }
        }
        // 差异更新：不重建未变化的 chip，避免 popIn 动画反复重播引起抖动
        for (const [key, el] of chipEls) {
          if (!want.has(key)) {
            el.remove();
            chipEls.delete(key);
          }
        }
        for (const [key, w] of want) {
          let el = chipEls.get(key);
          if (!el) {
            el = document.createElement("div");
            stage.appendChild(el);
            chipEls.set(key, el);
          }
          if (el.__cls !== w.cls || el.__text !== w.text) {
            el.className = "card-chip " + w.cls;
            el.innerHTML = w.text; // 含内联 SVG 图标
            el.onclick = w.fn || null;
            el.__cls = w.cls;
            el.__text = w.text;
          }
        }
      }
      /* ===================== 卡牌预览浮层（hover 3D 卡牌时左侧展示完整信息） =====================
         scene 层经 S.previewBridge 调用（hud 依赖 scene，scene 反向只经 store 桥接，避免循环 import）。 */
      let previewKey = null;
      function showPreview(card, info) {
        const el = $("card-preview");
        if (!el) return;
        if (!card) {
          if (previewKey) {
            el.classList.remove("show");
            previewKey = null;
          }
          return;
        }
        // AI 手牌与里侧卡对玩家一律未知（防信息泄露：卡名/攻防/效果都不可见）
        const oppHidden = hiddenForMe(card, info);
        const key = card.uid + ":" + (info && info.who) + ":" + (oppHidden ? 1 : 0);
        if (key === previewKey) return;
        previewKey = key;
        el.classList.remove("t-monster", "t-spell", "t-trap");
        if (!oppHidden) el.classList.add("t-" + card.type); // 类型框色
        el.innerHTML = "";
        el.appendChild(
          cardEl(card, {
            back: oppHidden,
            stats: !oppHidden && card.type === "monster" ? S.duel.stats(card) : null,
          }),
        );
        const meta = document.createElement("div");
        meta.className = "pv-meta";
        if (oppHidden)
          meta.innerHTML = info && info.kind === "hand" ? `<b>对方的手牌</b>信息未知` : `<b>里侧卡牌</b>信息未知`;
        else if (card.type === "monster") {
          const st = S.duel.stats(card);
          meta.innerHTML = `<b>${card.name}</b>${card.attribute || ""} ${card.race || ""} · 等级${card.level || "?"}<br>ATK <i class="atkv">${st.atk}</i> / DEF <i class="atkv">${st.def}</i>`;
        } else
          meta.innerHTML = `<b>${card.name}</b>${card.type === "spell" ? "魔法" : "陷阱"} · ${card.subtype || "通常"}`;
        el.appendChild(meta);
        if (!oppHidden && card.text) {
          const t = document.createElement("div");
          t.className = "pv-text";
          t.textContent = card.text;
          el.appendChild(t);
        }
        el.classList.add("show");
      }
      S.previewBridge = { show: showPreview, hide: () => showPreview(null) };

      /* ===================== 弹窗 ===================== */
      function renderPrompt(s) {
        const mask = $("modal-mask");
        const modal = $("modal");
        if (s.winner) return;
        if (!s.pending) {
          // 卡组选择等需要保持的弹窗（dataset.hold）不因“无待决事项”而被关闭
          if (!mask.dataset.gameover && !mask.dataset.hold) {
            mask.classList.remove("show");
            modal.innerHTML = "";
          }
          return;
        }
        if (mask.dataset.hold) return;
        const p = s.pending;
        mask.classList.add("show");
        if (p.kind === "select") {
          modal.innerHTML = `<h3>${p.msg}</h3><div class="opts" id="opts"></div>`;
          const opts = $("opts");
          (p.options || []).forEach((o) => {
            const w = document.createElement("div");
            w.className = "opt";
            const ce = cardEl(o.card, {});
            w.appendChild(ce);
            const lab = document.createElement("div");
            lab.className = "opt-label";
            lab.textContent = o.label || o.card.name;
            w.appendChild(lab);
            w.onclick = () => S.duel.answer(o.value);
            opts.appendChild(w);
          });
        } else if (p.kind === "chain") {
          const ev = p.event || {};
          let title = "是否连锁？";
          if (ev.kind === "attack_declare")
            title = `是否连锁？（${ev.attacker ? ev.attacker.name + " 攻击宣言" : "攻击"}）`;
          else if (ev.kind === "summon")
            title = `是否连锁？（${ev.monster ? (ev.hidden ? "怪兽覆盖" : ev.monster.name + " 召唤") : "召唤"}）`;
          else if (ev.kind === "activate")
            title = `是否连锁？（${ev.card ? ev.card.name + " 发动" : ""}）`;
          else if (ev.kind === "damage_calc") title = `是否连锁？（伤害计算）`;
          modal.innerHTML = `<h3>${title}</h3><div class="opts" id="opts"></div><div class="btns"></div>`;
          const opts = $("opts");
          (p.options || []).forEach((o) => {
            const w = document.createElement("div");
            w.className = "opt";
            const ce = cardEl(o.card, {});
            w.appendChild(ce);
            const lab = document.createElement("div");
            lab.className = "opt-label";
            lab.textContent = o.card.name;
            w.appendChild(lab);
            w.onclick = () => S.duel.answer(o);
            opts.appendChild(w);
          });
          const btns = modal.querySelector(".btns");
          const pass = document.createElement("button");
          pass.className = "btn ghost";
          pass.textContent = "不连锁";
          pass.onclick = () => S.duel.answer({ pass: true });
          btns.appendChild(pass);
        } else if (p.kind === "confirm") {
          modal.innerHTML = `<h3>${p.msg}</h3><div class="btns"></div>`;
          const btns = modal.querySelector(".btns");
          const yes = document.createElement("button");
          yes.className = "btn";
          yes.textContent = "是";
          yes.onclick = () => S.duel.answer(true);
          btns.appendChild(yes);
          const no = document.createElement("button");
          no.className = "btn ghost";
          no.textContent = "否";
          no.onclick = () => S.duel.answer(false);
          btns.appendChild(no);
        }
      }

      /* ===================== 日志/Toast/列表 ===================== */
      function pushLog(msg, imp) {
        logBuf.push(msg);
        if (logBuf.length > 300) logBuf.shift();
        const body = $("log-body");
        const div = document.createElement("div");
        div.className =
          "entry" +
          (imp || /破坏|全灭|无效|伤害|获胜|平局|祭品|特殊召唤|除外/.test(msg)
            ? " imp"
            : "");
        div.textContent = msg;
        body.appendChild(div);
        body.scrollTop = body.scrollHeight;
      }
      function toast(msg) {
        const el = $("toast");
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.classList.remove("show"), 2000);
      }
      function openListModal(title, list) {
        const mask = $("modal-mask");
        const modal = $("modal");
        mask.dataset.gameover = "";
        mask.classList.add("show");
        modal.innerHTML = `<h3>${title}（${list.length}）</h3><div class="opts" id="opts"></div><div class="btns"><button class="btn ghost" id="pile-close">关闭</button></div>`;
        const opts = $("opts");
        list.forEach((c) => {
          const w = document.createElement("div");
          w.className = "opt";
          w.appendChild(
            cardEl(c, { stats: c.type === "monster" ? S.duel.stats(c) : null }),
          );
          const lab = document.createElement("div");
          lab.className = "opt-label";
          lab.textContent = c.name;
          w.appendChild(lab);
          opts.appendChild(w);
        });
        $("pile-close").onclick = () => {
          delete mask.dataset.gameover;
          mask.classList.remove("show");
        };
      }
      /* ===================== 帮助/结束/卡组选择 ===================== */
      function showHelp() {
        const mask = $("modal-mask");
        const modal = $("modal");
        mask.dataset.gameover = "";
        mask.classList.add("show");
        modal.innerHTML = `<h3>游戏说明（3D 版）</h3><div class="help-list">
          <p><b>阶段</b>：抽卡→准备→主要1→战斗→主要2→结束。用底部回合条推进；先手首回合不抽卡、不能攻击。</p>
          <p><b>快捷键</b>：B 推进阶段（进入战斗 / 主阶段 2）、P 结束回合、Esc 关闭菜单 / 取消模式。悬停卡牌可在左侧查看完整卡牌信息。</p>
          <p><b>操作</b>：点击 3D 卡牌弹出操作菜单（召唤/覆盖/发动/攻击等），召唤/覆盖自动落到第一个空格；也可直接把手牌拖到场上指定落点，拖拽中按住 Shift 松手=覆盖（里侧守备）、Ctrl=表侧守备（高星怪兽会转入祭品选择）。点击卡组/墓地堆可查看；右下角可切换视角，滚轮缩放、双击空白复位。</p>
          <p><b>召唤</b>：通常召唤每回合1次；5-6星需1祭品、7星以上需2祭品；覆盖=里侧守备；翻转召唤翻开里侧。</p>
          <p><b>战斗</b>：ATK对ATK比攻差伤害；ATK对守备比攻守，不足部分反伤。含贯穿、直接攻击、攻击响应陷阱。</p>
          <p><b>魔陷</b>：魔法可当回合从手牌发动；陷阱须先覆盖且当回合不可发动。装备给己方怪兽，场地全场生效。</p>
          <p><b>连锁</b>：咒文速度 通常魔法/起动1、陷阱2、反击陷阱3，LIFO结算。伤害步骤可丢弃栗子球免伤。</p>
          <p><b>大模型对手</b>：新对局里把"对手"切到 大模型，可选供应商并填入密钥（仅存本地）。大模型会在枚举出的合法动作中思考决策，理由写入日志；失败/超时自动回退内置 AI。代理模式需先运行 node run/game.js。</p>
          <p><b>胜负</b>：LP归0 或 抽卡时卡组为0 即败。右上角的节奏按钮可调节奏、音效按钮可开关音效。</p>
        </div><div class="btns"><button class="btn ghost" id="help-close">关闭</button></div>`;
        $("help-close").onclick = () => {
          delete mask.dataset.gameover;
          mask.classList.remove("show");
        };
      }
      let gameOverShownFor = null; // 已弹过结算的对局实例（防 resetHud 竞态重弹：再来一局时旧局残留 render 会重置 winnerShown）
      function showGameOver(winner) {
        if (gameOverShownFor === S.duel) return; // 同一对局只弹一次
        gameOverShownFor = S.duel;
        winnerShown = true;
        const mask = $("modal-mask");
        const modal = $("modal");
        // 结算优先级最高：若卡组选择窗仍开着则直接接管
        delete mask.dataset.hold;
        modal.classList.remove("ds-wide");
        mask.dataset.gameover = "1";
        mask.classList.add("show");
        const win = winner === "me",
          draw = winner === "draw";
        // 全屏演出：光斑粒子（胜=金 / 负=暗红）+ 大字缩放点亮 + 按钮上滑
        const particles = Array.from({ length: 36 }, (_, i) => {
          const x = (i * 97) % 100; // 伪随机但确定性的散布
          const delay = (i % 9) * 0.28;
          const dur = 3 + (i % 5) * 0.7;
          const size = 2 + (i % 3) * 2;
          return `<i style="left:${x}%;--gd:${delay}s;--gdur:${dur}s;--gsz:${size}px"></i>`;
        }).join("");
        const title = draw ? "平局" : win ? "胜利" : "败北";
        const sub = draw
          ? "双方同归于尽"
          : win
            ? "你击败了 AI"
            : "AI 取得了胜利";
        modal.className = "modal gameover-show " + (draw ? "draw" : win ? "win" : "lose");
        modal.innerHTML = `
          <div class="go-fx">${particles}</div>
          <div class="gameover">
            <h2 class="${draw ? "draw" : win ? "win" : "lose"}">${title}</h2>
            <p class="go-sub">${sub}</p>
            <div class="btns"><button class="btn" id="again">再来一局</button></div>
          </div>`;
        $("again").onclick = () => {
          delete mask.dataset.gameover;
          mask.classList.remove("show");
          if (S.onAgain) S.onAgain();
        };
      }
      /* ===================== 卡组选择（列表 / 卡组详情 / 卡牌详情 三栏） ===================== */
      const DECK_KEYS = Object.keys(EXTRA_DECK_PRESETS);
      const deckName = (key) => (DECK_META[key] && DECK_META[key].name) || key;
      /* 同名卡合并计数并按 怪兽/魔法/陷阱/额外 分组；30 套只算一次 */
      const deckViewCache = new Map();
      function deckView(key) {
        if (deckViewCache.has(key)) return deckViewCache.get(key);
        const tally = (ids) => {
          const m = new Map();
          for (const id of ids) {
            const c = CARD_BY_ID[id];
            if (!c) continue;
            const e = m.get(id);
            if (e) e.n++;
            else m.set(id, { card: c, n: 1 });
          }
          return [...m.values()];
        };
        const main = tally(buildMainDeck(key));
        const groups = [
          { title: "怪兽", items: main.filter((e) => e.card.type === "monster") },
          { title: "魔法", items: main.filter((e) => e.card.type === "spell") },
          { title: "陷阱", items: main.filter((e) => e.card.type === "trap") },
          { title: "额外卡组", items: tally(buildExtraDeck(key)) },
        ];
        for (const g of groups) g.count = g.items.reduce((s, e) => s + e.n, 0);
        const v = {
          meta: DECK_META[key] || { name: key, desc: "" },
          groups,
          stats: {
            main: groups[0].count + groups[1].count + groups[2].count,
            monster: groups[0].count,
            spell: groups[1].count,
            trap: groups[2].count,
            extra: groups[3].count,
          },
        };
        deckViewCache.set(key, v);
        return v;
      }
      /* 卡牌详情栏（选卡组阶段无对局，直接展示卡面原始数值） */
      function fillCardDetail(box, card) {
        box.innerHTML = "";
        if (!card) {
          const e = document.createElement("div");
          e.className = "ds-cd-empty";
          e.textContent = "点击或悬停卡牌查看详情";
          box.appendChild(e);
          return;
        }
        box.appendChild(cardEl(card, { stats: card.type === "monster" ? { atk: card.atk, def: card.def } : null }));
        const meta = document.createElement("div");
        meta.className = "ds-cd-meta";
        if (card.type === "monster")
          meta.innerHTML = `<b>${card.name}</b>${card.attribute || ""} · ${card.race || ""} · 等级 ${card.level || "?"}${card.fusion ? " · 融合" : ""}<br>ATK <i>${card.atk ?? "?"}</i> / DEF <i>${card.def ?? "?"}</i>`;
        else meta.innerHTML = `<b>${card.name}</b>${card.type === "spell" ? "魔法" : "陷阱"} · ${card.subtype || "通常"}`;
        box.appendChild(meta);
        if (card.text) {
          const t = document.createElement("div");
          t.className = "ds-cd-text";
          t.textContent = card.text;
          box.appendChild(t);
        }
      }
      function openDeckSelect() {
        const mask = $("modal-mask");
        const modal = $("modal");
        mask.dataset.gameover = "";
        mask.dataset.hold = "1";
        mask.classList.add("show");
        modal.classList.add("ds-wide");
        const sel = {
          me: DECK_META[S.deckChoice] ? S.deckChoice : DECK_KEYS[0],
          ai: DECK_META[S.aiDeckChoice] ? S.aiDeckChoice : DECK_KEYS[0],
        };
        let role = "me";
        let pinned = null; // 点选固定的卡牌 id（悬停离开后回到该卡）
        modal.innerHTML = `<h3>选择卡组</h3>
          <div class="ds-hint">第 1 步：左侧点选你的卡组 → 第 2 步：切到「对手卡组」给 AI 选一套 → 底部选对手后开始对局。悬停中栏卡名可看单卡详情。</div>
          <div class="ds-tabs">
            <button type="button" class="ds-tab" data-role="me"><span>你的卡组</span><em id="ds-tab-me"></em></button>
            <button type="button" class="ds-tab" data-role="ai"><span>对手卡组</span><em id="ds-tab-ai"></em></button>
          </div>
          <div class="ds-body">
            <div class="ds-list" id="ds-list"></div>
            <div class="ds-detail" id="ds-detail"></div>
            <div class="ds-card" id="ds-card"></div>
          </div>
          <div class="pick-label">对手</div>
          <div class="opp-row">
            <button type="button" class="opp-opt" id="opp-ai">内置 AI</button>
            <button type="button" class="opp-opt" id="opp-llm">大模型</button>
          </div>
          <div class="llm-cfg" id="llm-cfg" style="display:none">
            <div class="cfg-grid">
              <label>供应商<select id="llm-preset"></select></label>
              <label>模型<input id="llm-model" /></label>
              <label>Base URL<input id="llm-base" /></label>
              <label>API Key<input id="llm-key" type="password" placeholder="留空则用服务端密钥" /></label>
              <label>调用方式<select id="llm-callmode"><option value="proxy">代理（/api/llm）</option><option value="direct">直连</option></select></label>
              <label>温度<input id="llm-temp" type="number" step="0.1" min="0" max="2" /></label>
              <label>思考档位<select id="llm-thinking"><option value="off">关闭（不支持时自动 low）</option><option value="low">low（较快）</option><option value="high">high（更强更慢）</option><option value="max">max（最强最慢）</option></select></label>
            </div>
            <div class="cfg-btns">
              <button class="btn ghost" id="llm-save">保存配置</button>
              <button class="btn ghost" id="llm-test">测试连接</button>
            </div>
            <div class="cfg-note" id="llm-note"></div>
          </div>
          <div class="btns"><button class="btn ghost" id="deck-cancel">取消</button><button class="btn" id="deck-start">开始对局</button></div>`;
        const listEl = $("ds-list");
        const detailEl = $("ds-detail");
        const cardBox = $("ds-card");
        const tabs = [...modal.querySelectorAll(".ds-tab")];
        // 左栏：30 套列表只建一次，切换角色/选择时仅改高亮
        for (const key of DECK_KEYS) {
          const v = deckView(key);
          const it = document.createElement("div");
          it.className = "ds-item";
          it.dataset.key = key;
          it.innerHTML = `<span class="ds-item-name">${v.meta.name}</span><span class="ds-item-sub">怪兽 ${v.stats.monster} · 魔法 ${v.stats.spell} · 陷阱 ${v.stats.trap}${v.stats.extra ? " · 额外 " + v.stats.extra : ""}</span>`;
          it.onclick = () => {
            sel[role] = key;
            pinned = null;
            refresh();
          };
          listEl.appendChild(it);
        }
        // 中栏：卡组简介 + 分组卡表；右栏：卡牌详情（悬停预览、点击固定）
        const renderDetail = (key) => {
          const v = deckView(key);
          detailEl.innerHTML = "";
          const head = document.createElement("div");
          head.className = "ds-head";
          head.innerHTML = `<div class="ds-title">${v.meta.name}</div><div class="ds-stats">主卡组 ${v.stats.main} 张 · 怪兽 ${v.stats.monster} · 魔法 ${v.stats.spell} · 陷阱 ${v.stats.trap} · 额外卡组 ${v.stats.extra} 张</div><p class="ds-desc">${v.meta.desc}</p>`;
          detailEl.appendChild(head);
          const groupsEl = document.createElement("div");
          groupsEl.className = "ds-groups";
          for (const g of v.groups) {
            if (!g.items.length) continue;
            const ge = document.createElement("div");
            ge.className = "ds-group";
            const gt = document.createElement("div");
            gt.className = "ds-group-title";
            gt.textContent = `${g.title}（${g.count}）`;
            ge.appendChild(gt);
            for (const e of g.items) {
              const c = e.card;
              const row = document.createElement("div");
              row.className = "ds-row " + c.type;
              row.dataset.id = c.id;
              const info = c.type === "monster" ? `${c.level || "?"} 星 · ${c.atk ?? "?"}/${c.def ?? "?"}` : c.subtype || "";
              row.innerHTML = `<span class="ds-row-name">${c.name}</span><span class="ds-row-info">${info}</span><span class="ds-row-n">×${e.n}</span>`;
              row.onmouseenter = () => fillCardDetail(cardBox, c);
              row.onclick = () => {
                pinned = pinned === c.id ? null : c.id;
                groupsEl.querySelectorAll(".ds-row").forEach((r) => r.classList.toggle("picked", r.dataset.id === pinned));
                fillCardDetail(cardBox, c);
              };
              ge.appendChild(row);
            }
            groupsEl.appendChild(ge);
          }
          groupsEl.onmouseleave = () => {
            if (pinned && CARD_BY_ID[pinned]) fillCardDetail(cardBox, CARD_BY_ID[pinned]);
          };
          detailEl.appendChild(groupsEl);
          const first = v.groups.find((g) => g.items.length);
          fillCardDetail(cardBox, first ? first.items[0].card : null);
        };
        const refresh = () => {
          tabs.forEach((t) => t.classList.toggle("picked", t.dataset.role === role));
          $("ds-tab-me").textContent = deckName(sel.me);
          $("ds-tab-ai").textContent = deckName(sel.ai);
          listEl.querySelectorAll(".ds-item").forEach((it) => it.classList.toggle("picked", it.dataset.key === sel[role]));
          const cur = listEl.querySelector(".ds-item.picked");
          if (cur) cur.scrollIntoView({ block: "nearest" });
          renderDetail(sel[role]);
        };
        tabs.forEach((t) => {
          t.onclick = () => {
            role = t.dataset.role;
            pinned = null;
            refresh();
          };
        });
        refresh();
        // ---------- 对手模式（内置 AI / 大模型）与 LLM 配置面板 ----------
        const LLM = YGO_LLM;
        const cfgPanel = $("llm-cfg");
        const noteEl = $("llm-note");
        const refreshNote = () => {
          const ready = LLM.cfgReady(LLM.loadCfg());
          noteEl.className =
            "cfg-note" + (S.opponentMode === "llm" && !ready ? " warn" : "");
          noteEl.textContent =
            S.opponentMode === "llm"
              ? ready
                ? "密钥仅存本地 localStorage；决策失败会自动回退内置 AI。"
                : "注意：尚未配置 Base URL / 模型，开始对局后将全程使用内置 AI。"
              : "";
        };
        const refreshOppUI = () => {
          $("opp-ai").classList.toggle("picked", S.opponentMode === "ai");
          $("opp-llm").classList.toggle("picked", S.opponentMode === "llm");
          cfgPanel.style.display = S.opponentMode === "llm" ? "" : "none";
          refreshNote();
        };
        const presetSel = $("llm-preset");
        LLM.PRESETS.forEach((p, i) => {
          const o = document.createElement("option");
          o.value = String(i);
          o.textContent = p.name;
          presetSel.appendChild(o);
        });
        const fillCfgForm = () => {
          const cfg = LLM.loadCfg();
          presetSel.value = String(
            Math.max(0, LLM.PRESETS.findIndex((p) => p.name === cfg.preset)),
          );
          $("llm-base").value = cfg.baseUrl || "";
          $("llm-model").value = cfg.model || "";
          $("llm-key").value = cfg.apiKey || "";
          $("llm-callmode").value = cfg.callMode || "proxy";
          $("llm-temp").value = cfg.temperature ?? 0.3;
          $("llm-thinking").value = cfg.thinking || "low";
        };
        presetSel.onchange = () => {
          const p = LLM.PRESETS[Number(presetSel.value)];
          if (p && p.name !== "自定义") {
            $("llm-base").value = p.baseUrl;
            $("llm-model").value = p.model;
          }
        };
        const collectCfg = () => ({
          preset: LLM.PRESETS[Number(presetSel.value)].name,
          baseUrl: $("llm-base").value.trim(),
          model: $("llm-model").value.trim(),
          apiKey: $("llm-key").value.trim(),
          callMode: $("llm-callmode").value,
          temperature: parseFloat($("llm-temp").value) || 0.3,
          thinking: $("llm-thinking").value,
        });
        $("opp-ai").onclick = () => {
          saveOppMode("ai");
          refreshOppUI();
        };
        $("opp-llm").onclick = () => {
          saveOppMode("llm");
          refreshOppUI();
        };
        $("llm-save").onclick = () => {
          LLM.saveCfg(collectCfg());
          toast("大模型配置已保存");
          refreshNote();
        };
        $("llm-test").onclick = async () => {
          toast("测试中…");
          try {
            const t = await LLM.testConnection(collectCfg());
            toast("连接成功：" + t);
          } catch (e) {
            toast("连接失败：" + (e.message || e));
          }
        };
        fillCfgForm();
        refreshOppUI();
        const close = () => {
          delete mask.dataset.gameover;
          delete mask.dataset.hold;
          mask.classList.remove("show");
          modal.classList.remove("ds-wide");
          modal.innerHTML = "";
        };
        $("deck-start").onclick = () => {
          close();
          S.deckChoice = sel.me;
          S.aiDeckChoice = sel.ai;
          if (S.onAgain) S.onAgain();
        };
        const cancel = $("deck-cancel");
        if (S.duel) {
          cancel.onclick = () => {
            close();
            render(); // 对局中取消：恢复被搁置的待决弹窗
          };
        } else {
          cancel.style.display = "none"; // 首次开局必须选完卡组才能进入
        }
      }

/* 新开局前的 HUD 复位（原 newGame 前半段） */
function resetHud() {
  logBuf = [];
  $("log-body").innerHTML = "";
  $("llm-think").classList.remove("show");
  winnerShown = false;
  prevLp = { me: S.startLP || 8000, ai: S.startLP || 8000 };
  lastChainLen = 0;
  showPreview(null);
  const mask = $("modal-mask");
  delete mask.dataset.gameover;
  delete mask.dataset.hold;
  mask.classList.remove("show");
  $("modal").classList.remove("ds-wide");
  $("modal").innerHTML = "";
  $("log-panel").classList.remove("show");
  closeMenu();
  exitMode();
}

export { render, openMenu, closeMenu, pushLog, toast, openListModal, showHelp, showGameOver, openDeckSelect, enterAttackMode, startTribute, exitMode, toggleTribute, resetHud };
