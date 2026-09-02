/*
 * 游戏王 3D UI · DOM/HUD 层
 *  状态栏渲染、回合条、连锁横幅、卡牌菜单、模式条、引导 chip、交互弹窗、日志/Toast、帮助/结算/开局面板。
 *  局部可变状态（logBuf/prevLp/winnerShown/lastChainLen/toastTimer）为本模块私有；共享状态读 store.S。
 */
import { animate } from "animejs";
import { S, saveOppMode } from "./store.mjs";
import { IC, ATTR_EM, RACE_EM, DECK_LABELS, DECK_EMOJIS, PHASE_TIPS, PHASE_NAMES } from "./labels.mjs";
import { sfx } from "./sfx.mjs";
import { flashScreen } from "./domfx.mjs";
import { chipEls, projectMesh, artUrl, setZoneHighlight3D } from "./scene.mjs";
import { availableActions, handPlacementZones } from "./actions.mjs";
import { DECK_PRESETS } from "../cards.mjs";
import { YGO_LLM } from "../llm-player.mjs";
const $ = (id) => document.getElementById(id);

let toastTimer = null;
let logBuf = [];
let prevLp = { me: 8000, ai: 8000 };
let winnerShown = false;
let lastChainLen = 0;

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
            ? RACE_EM[card.race] || "★"
            : card.type === "spell"
              ? "✨"
              : "🪤";
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
          attr.textContent = ATTR_EM[card.attribute] || "";
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
      function render() {
        const s = S.duel && S.duel.state;
        if (!s) return;
        updateLP("me", s.me.lp);
        updateLP("ai", s.ai.lp);
        // 当前行动方 LP 行呼吸光晕
        const meTurn = s.turnPlayer === "me" && !s.winner;
        $("lp-row-me").classList.toggle("active", meTurn);
        $("lp-row-ai").classList.toggle("active", !meTurn && !s.winner);
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
        fill.style.width = Math.max(0, (val / 8000) * 100) + "%";
        if (val < prevLp[who]) {
          animate($(`lp-${who}-bar`), {
            boxShadow: [
              "0 0 0px rgba(229,72,77,0)",
              "0 0 18px rgba(229,72,77,0.9)",
              "0 0 0px rgba(229,72,77,0)",
            ],
            duration: 460,
            ease: "linear",
          });
          if (who === "me") flashScreen("rgba(229,72,77,0.25)");
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
        $("turn-bar").className = "turn-bar" + (mine ? "" : " ai");
        const mainBtn = $("tb-main"),
          altBtn = $("tb-alt"),
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
          set(altBtn, "", false, "", false);
          set(endBtn, END, true, "end", true);
        } else if (s.phase === "battle") {
          set(mainBtn, IC.gear + " 主阶段 2<i class='kbd'>B</i>", true, "primary", true);
          set(altBtn, "", false, "", false);
          set(endBtn, END, true, "end", true);
        } else if (s.phase === "main2") {
          set(mainBtn, IC.flag + " 结束回合<i class='kbd'>P</i>", true, "primary", true);
          set(altBtn, "", false, "", false);
          set(endBtn, "", false, "", true);
        } else {
          set(mainBtn, "—", true, "", false);
          set(altBtn, "", false, "", false);
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
            `<b>⚡ 连锁 ${n}</b>` +
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
        if (S.mode && (S.mode === "attack" || S.mode === "tribute")) return;
        closeMenu();
        S.menuOpen = true;
        const mask = document.createElement("div");
        mask.className = "backdrop";
        mask.onclick = () => closeMenu();
        document.body.appendChild(mask);
        const menu = document.createElement("div");
        menu.className = "card-menu";
        menu.id = "card-menu";
        const isOppFacedown = info && info.who === "ai" && card.faceDown;
        const preview = cardEl(card, {
          stats: card.type === "monster" ? S.duel.stats(card) : null,
          back: isOppFacedown,
        });
        preview.classList.add("menu-card");
        menu.appendChild(preview);
        const body = document.createElement("div");
        body.className = "menu-body";
        const meta = document.createElement("div");
        meta.className = "meta";
        if (isOppFacedown) meta.innerHTML = `<b>里侧卡牌</b><br>信息未知`;
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
        // 合法放置区高亮：手牌召唤/覆盖时点亮可用格（关菜单/切模式时熄灭）
        setZoneHighlight3D(
          info && info.kind === "hand" ? handPlacementZones(S.duel, card) : null,
        );
        if (acts.length)
          acts.forEach((a) => {
            const b = document.createElement("div");
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
      /* ===================== 攻击/祭品模式 ===================== */
      function enterAttackMode(zoneIdx) {
        closeMenu();
        S.mode = "attack";
        S.attackZone = zoneIdx;
        render();
        renderModeBar();
      }
      function startTribute(handIdx) {
        closeMenu();
        S.mode = "tribute";
        S.tributeHandIdx = handIdx;
        S.tributePool = [];
        render();
        renderModeBar();
      }
      function exitMode() {
        S.mode = null;
        S.attackZone = null;
        S.tributeHandIdx = null;
        S.tributePool = [];
        setZoneHighlight3D(null);
        render();
        renderModeBar();
      }
      function toggleTribute(idx) {
        if (S.tributePool.includes(idx))
          S.tributePool = S.tributePool.filter((x) => x !== idx);
        else S.tributePool.push(idx);
        render();
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
            b.textContent = "💥 直接攻击";
            b.onclick = () => {
              S.duel.declareAttack(S.attackZone, null);
              exitMode();
            };
            overlay.appendChild(b);
          } else {
            const hint = document.createElement("div");
            hint.className = "atk-hint";
            hint.textContent = "🖱 点击对方怪兽（红色高亮）选择攻击目标";
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
          ok.textContent = "确认召唤";
          ok.disabled = S.tributePool.length !== need;
          ok.onclick = () => {
            if (S.tributePool.length === need) {
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
        }
      }

      /* ===================== 卡牌引导 chip（战斗攻击 / 祭品已选） ===================== */
      function renderChips() {
        const want = new Map(); // key -> { cls, text, fn }
        const s = S.duel && S.duel.state;
        if (s) {
          // 战斗阶段（未进入攻击选择模式）：可攻击显示 ⚔ 攻击，不可攻击显示原因
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
        const oppHidden = !!(card.faceDown && info && info.who === "ai");
        const key = card.uid + ":" + (info && info.who) + ":" + (oppHidden ? 1 : 0);
        if (key === previewKey) return;
        previewKey = key;
        el.innerHTML = "";
        el.appendChild(
          cardEl(card, {
            back: oppHidden,
            stats: !oppHidden && card.type === "monster" ? S.duel.stats(card) : null,
          }),
        );
        const meta = document.createElement("div");
        meta.className = "pv-meta";
        if (oppHidden) meta.innerHTML = `<b>里侧卡牌</b>信息未知`;
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
          if (!mask.dataset.gameover) {
            mask.classList.remove("show");
            modal.innerHTML = "";
          }
          return;
        }
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
          <p><b>操作</b>：点击 3D 卡牌弹出操作菜单（召唤/覆盖/发动/攻击等）；点击卡组/墓地堆可查看。</p>
          <p><b>召唤</b>：通常召唤每回合1次；5-6星需1祭品、7星以上需2祭品；覆盖=里侧守备；翻转召唤翻开里侧。</p>
          <p><b>战斗</b>：ATK对ATK比攻差伤害；ATK对守备比攻守，不足部分反伤。含贯穿、直接攻击、攻击响应陷阱。</p>
          <p><b>魔陷</b>：魔法可当回合从手牌发动；陷阱须先覆盖且当回合不可发动。装备给己方怪兽，场地全场生效。</p>
          <p><b>连锁</b>：咒文速度 通常魔法/起动1、陷阱2、反击陷阱3，LIFO结算。伤害步骤可丢弃栗子球免伤。</p>
          <p><b>大模型对手</b>：新对局里把"对手"切到 🤖 大模型，可选供应商并填入密钥（仅存本地）。大模型会在枚举出的合法动作中思考决策，理由写入日志；失败/超时自动回退内置 AI。代理模式需先运行 node run/game.js。</p>
          <p><b>胜负</b>：LP归0 或 抽卡时卡组为0 即败。右上角 ▶ 调节奏、🔊 开关音效。</p>
        </div><div class="btns"><button class="btn ghost" id="help-close">关闭</button></div>`;
        $("help-close").onclick = () => {
          delete mask.dataset.gameover;
          mask.classList.remove("show");
        };
      }
      function showGameOver(winner) {
        winnerShown = true;
        const mask = $("modal-mask");
        const modal = $("modal");
        mask.dataset.gameover = "1";
        mask.classList.add("show");
        const win = winner === "me",
          draw = winner === "draw";
        modal.innerHTML = `<div class="gameover"><h2 class="${draw ? "draw" : win ? "win" : "lose"}">${draw ? "平局" : win ? "胜利！" : "败北…"}</h2><p class="go-sub">${draw ? "双方同归于尽" : win ? "你击败了 AI" : "AI 取得了胜利"}</p><div class="btns"><button class="btn" id="again">再来一局</button></div></div>`;
        $("again").onclick = () => {
          delete mask.dataset.gameover;
          mask.classList.remove("show");
          if (S.onAgain) S.onAgain();
        };
      }
      function openDeckSelect() {
        const mask = $("modal-mask");
        const modal = $("modal");
        mask.dataset.gameover = "";
        mask.classList.add("show");
        const presets = Object.keys(DECK_PRESETS);
        let selMe = S.deckChoice,
          selAi = S.aiDeckChoice;
        modal.innerHTML = `<h3>选择卡组</h3>
          <div class="pick-label">你的卡组</div><div class="pick-row" id="pick-me"></div>
          <div class="pick-label">AI 的卡组</div><div class="pick-row" id="pick-ai"></div>
          <div class="pick-label">对手</div>
          <div class="opp-row">
            <button type="button" class="opp-opt" id="opp-ai">⚙ 内置 AI</button>
            <button type="button" class="opp-opt" id="opp-llm">🤖 大模型</button>
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
        const buildRow = (elId, cur, onPick) => {
          const row = $(elId);
          for (const name of presets) {
            const w = document.createElement("div");
            w.className = "opt" + (name === cur ? " picked" : "");
            const card = document.createElement("div");
            card.className = "deck-tile";
            const em = document.createElement("div");
            em.className = "dt-em";
            em.textContent = DECK_EMOJIS[name] || "🃏";
            card.appendChild(em);
            w.appendChild(card);
            const lab = document.createElement("div");
            lab.className = "opt-label";
            lab.textContent = DECK_LABELS[name] || name;
            w.appendChild(lab);
            w.onclick = () => onPick(name, row);
            row.appendChild(w);
          }
        };
        buildRow("pick-me", selMe, (name, row) => {
          selMe = name;
          row
            .querySelectorAll(".opt")
            .forEach((o) => o.classList.remove("picked"));
          row
            .querySelectorAll(".opt")
            [presets.indexOf(name)].classList.add("picked");
        });
        buildRow("pick-ai", selAi, (name, row) => {
          selAi = name;
          row
            .querySelectorAll(".opt")
            .forEach((o) => o.classList.remove("picked"));
          row
            .querySelectorAll(".opt")
            [presets.indexOf(name)].classList.add("picked");
        });
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
                : "⚠ 尚未配置 Base URL / 模型，开始对局后将全程使用内置 AI。"
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
        $("deck-start").onclick = () => {
          delete mask.dataset.gameover;
          mask.classList.remove("show");
          S.deckChoice = selMe;
          S.aiDeckChoice = selAi;
          if (S.onAgain) S.onAgain();
        };
        $("deck-cancel").onclick = () => {
          delete mask.dataset.gameover;
          mask.classList.remove("show");
        };
      }

/* 新开局前的 HUD 复位（原 newGame 前半段） */
function resetHud() {
  logBuf = [];
  $("log-body").innerHTML = "";
  $("llm-think").classList.remove("show");
  winnerShown = false;
  prevLp = { me: 8000, ai: 8000 };
  lastChainLen = 0;
  showPreview(null);
  const mask = $("modal-mask");
  delete mask.dataset.gameover;
  mask.classList.remove("show");
  $("modal").innerHTML = "";
  $("log-panel").classList.remove("show");
  closeMenu();
  exitMode();
}

export { render, openMenu, closeMenu, pushLog, toast, openListModal, showHelp, showGameOver, openDeckSelect, enterAttackMode, startTribute, exitMode, toggleTribute, resetHud };
