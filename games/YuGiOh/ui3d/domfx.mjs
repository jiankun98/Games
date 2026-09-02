/*
 * 游戏王 3D UI · DOM 特效原语（横幅/闪屏/LP 浮字）
 */
import { animate } from "animejs";
import { PHASE_TIPS } from "./labels.mjs";
const $ = (id) => document.getElementById(id);

      function fxEl(inner, x, y, cls, opts = {}) {
        const el = document.createElement("div");
        el.className = "fx " + cls;
        if (x != null && y != null) {
          el.style.left = x + "px";
          el.style.top = y + "px";
        }
        el.innerHTML = inner;
        document.body.appendChild(el);
        // anime 统一驱动：模糊→清晰滑入放大 → 停留 → 上浮淡出移除
        const hold = opts.hold != null ? opts.hold : 1100;
        const isBanner = cls.includes("banner");
        animate(el, {
          opacity: [0, 1],
          y: [14, 0],
          scale: [0.92, 1],
          filter: isBanner ? ["blur(8px)", "blur(0px)"] : undefined,
          duration: opts.dur || 300,
          ease: "outCubic",
          onComplete: () => {
            animate(el, {
              opacity: 0,
              y: -14,
              duration: 420,
              delay: hold,
              ease: "inQuad",
              onComplete: () => el.remove(),
            });
          },
        });
        return el;
      }
      function fxTurnBanner(player, turn) {
        const me = player === "me";
        const tip = me ? PHASE_TIPS.main1[1] : "AI 行动中…";
        fxEl(
          `<div class="turn-banner-inner ${me ? "me" : "ai"}"><b>${me ? "你的回合" : "AI 的回合"}</b><span>第 ${turn} 回合 · ${tip}</span></div>`,
          null,
          null,
          "fx-turn-banner",
          { dur: 340, hold: 950 },
        );
      }
      function fxPhaseBanner(phase, player) {
        const t = PHASE_TIPS[phase];
        if (!t) return;
        const me = player === "me";
        fxEl(
          `<div class="fx-phase-inner ${me ? "me" : "ai"}"><b>${t[0]}</b>${t[1] ? `<span>${t[1]}</span>` : ""}</div>`,
          null,
          null,
          "fx-phase-banner",
          { dur: 300, hold: 800 },
        );
      }
      function fxLpFloat(player, delta) {
        if (delta >= 0) return;
        const bar = $(`lp-${player}-bar`);
        const r = bar.getBoundingClientRect();
        fxEl(
          `<b class="fx-dmg-txt small">−${-delta}</b>`,
          r.x + r.width / 2,
          r.y - 14,
          "fx-dmg",
        );
      }
      function flashScreen(color) {
        const f = $("screen-flash");
        f.style.background = color;
        animate(f, { opacity: [0, 0.55, 0], duration: 420, ease: "linear" });
      }

export { fxEl, fxTurnBanner, fxPhaseBanner, fxLpFloat, flashScreen };
