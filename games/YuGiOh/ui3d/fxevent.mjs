/*
 * 游戏王 3D UI · 事件表现层（引擎 onEvent 消费入口）
 *  契约：fxEvent(ev) 返回 Promise（或 null），引擎 emit 会 await 它来控制动画节奏——不可破坏。
 *  串行通知队列 + 3D/横幅特效分发。
 */
import { S, PACE_SCALE } from "./store.mjs";
import { IC } from "./labels.mjs";
import { fxTurnBanner, fxPhaseBanner, fxLpFloat } from "./domfx.mjs";
import { sfx } from "./sfx.mjs";
import { fxGlow3D, fxSummon3D, fxAttack3D, fxImpact3D, fxBurst3D, tween3D, shakeBoard, cardMeshes, projectLp3D } from "./scene.mjs";
const $ = (id) => document.getElementById(id);

      /* ===================== 事件通知队列（串行） =====================
         引擎每 emit 一个事件，fxEvent 调 notify() 入队并 await 播完，
         因此召唤/发动/攻击等反馈永远一条一条出现，不再同时堆叠。 */
      const NOTIFY_HOLD = {
        summon: 950,
        activate: 1150,
        attack: 850,
        damage: 800,
        destroy: 900,
        grave: 780,
        draw: 520,
        info: 680,
      };
      const NOTIFY_CAP = 4; // 洪峰保护：队列上限，过旧通知直接放行
      const notifyQueue = [];
      let notifyBusy = false;
      let notifyEl = null;
      function actorText(actor) {
        return actor === "me" ? "你" : "AI";
      }
      function notify(text, kind = "info", opts = {}) {
        return new Promise((resolve) => {
          notifyQueue.push({ text, kind, opts, resolve });
          while (notifyQueue.length > NOTIFY_CAP) notifyQueue.shift().resolve();
          pumpNotify();
        });
      }
      function pumpNotify() {
        if (notifyBusy) return;
        notifyBusy = true;
        (async () => {
          while (notifyQueue.length) {
            const item = notifyQueue.shift();
            await showNotify(item);
            item.resolve();
          }
          notifyBusy = false;
        })();
      }
      function showNotify({ text, kind, opts }) {
        return new Promise((resolve) => {
          if (!notifyEl) {
            notifyEl = $("event-notify");
          }
          const scale = PACE_SCALE[S.paceMode] || 1;
          const hold = (NOTIFY_HOLD[kind] ?? 720) * scale;
          notifyEl.className = "event-notify k-" + kind + (opts.big ? " big" : "");
          notifyEl.querySelector(".en-ic").innerHTML =
            opts.icon ||
            {
              summon: IC.setCard,
              activate: IC.spark,
              attack: IC.sword,
              damage: IC.sword,
              destroy: IC.ban,
              grave: IC.ban,
              draw: IC.draw,
              info: IC.spark,
            }[kind] ||
            "";
          notifyEl.querySelector(".en-tx").textContent = text;
          void notifyEl.offsetWidth; // 重启入场过渡
          notifyEl.classList.add("show");
          setTimeout(() => {
            notifyEl.classList.remove("show");
            setTimeout(resolve, 170); // 等退场过渡结束再放下一条
          }, 200 + hold);
        });
      }
      function fxActBanner(card, actor) {
        const name = card ? card.name : "";
        const extra =
          card && card.cid === "kuriboh" ? "（该次战斗伤害无效）" : "";
        return notify(
          `${actorText(actor)}发动「${name}」${extra}`,
          "activate",
          { big: true },
        );
      }
      function fxPause(ms) {
        return new Promise((r) => setTimeout(r, ms));
      }
      function fxEvent(ev) {
        if (!ev || !ev.kind) return null;
        switch (ev.kind) {
          case "turn_start":
            fxTurnBanner(ev.player, ev.turn);
            sfx("turn");
            return fxPause(600);
          case "phase_start":
            if (ev.phase === "battle" || ev.phase === "main2") {
              fxPhaseBanner(ev.phase, ev.player);
              return fxPause(500);
            }
            return null;
          case "draw_card":
            sfx("draw");
            // 只提示张数动作，不透露抽到的卡（对方手牌信息保密）
            return notify(
              ev.player === "me" ? "你抽到了一张卡" : "AI 抽了一张卡",
              "draw",
            );
          case "summon": {
            const who = actorText(ev.actor);
            let text;
            if (ev.hidden) {
              text = `${who}覆盖了1只怪兽`;
            } else {
              const kindName =
                {
                  normal: "通常召唤",
                  tribute: "祭品召唤",
                  special: "特殊召唤",
                  fusion: "融合召唤",
                }[ev.summonKind] || "召唤";
              text = `${who}${who === "AI" ? " " : ""}${kindName}「${ev.monster ? ev.monster.name : "?"}」`;
              fxSummon3D(ev.monster);
              sfx("summon");
            }
            return Promise.all([fxPause(ev.hidden ? 0 : 300), notify(text, "summon")]);
          }
          case "activate":
            if (ev.source === "auto") {
              fxGlow3D(ev.card, "#e6b24a");
              return null;
            }
            fxGlow3D(ev.card, "#e6b24a");
            sfx("activate");
            return Promise.all([
              fxActBanner(ev.card, ev.actor),
              fxPause(320),
            ]);
          case "attack_declare": {
            fxAttack3D(ev.attacker, ev.target);
            sfx("attack");
            const text = ev.target
              ? `${actorText(ev.actor)}的「${ev.attacker ? ev.attacker.name : "?"}」攻击「${ev.target.name}」`
              : `${actorText(ev.actor)}的「${ev.attacker ? ev.attacker.name : "?"}」直接攻击！`;
            return Promise.all([fxPause(340), notify(text, "attack")]);
          }
          case "damage_calc": {
            fxImpact3D(ev);
            const text =
              (ev.direct ? "直接攻击！造成 " : "造成 ") +
              (ev.damage || 0) +
              " 点战斗伤害";
            return Promise.all([fxPause(290), notify(text, "damage")]);
          }
          case "destroyed_by_battle":
            fxBurst3D(ev.card, "#ffd24a");
            return Promise.all([
              fxPause(240),
              notify(`「${ev.card.name}」被战斗破坏`, "destroy"),
            ]);
          case "sent_to_grave":
            if (ev.from === "field") {
              if (ev.reason === "effect" || ev.reason === "negate") {
                fxBurst3D(ev.card, "#ff6b4a");
                return Promise.all([
                  fxPause(240),
                  notify(`「${ev.card.name}」被效果破坏`, "destroy"),
                ]);
              } else if (ev.reason === "tribute") {
                fxGlow3D(ev.card, "#c9a86a");
                return Promise.all([
                  fxPause(200),
                  notify(`「${ev.card.name}」成为祭品`, "grave"),
                ]);
              } else if (ev.reason === "fusion") {
                fxGlow3D(ev.card, "#c9a86a");
                return Promise.all([
                  fxPause(200),
                  notify(`「${ev.card.name}」作为融合素材送入墓地`, "grave"),
                ]);
              }
            }
            return null;
          case "banish":
            return notify(`「${ev.card.name}」被除外`, "destroy");
          case "return_to_hand":
            return notify(`「${ev.card.name}」回到手牌`, "grave");
          case "control_change":
            return notify(
              `「${ev.monster.name}」控制权转移给${actorText(ev.to)}`,
              "info",
            );
          case "flip":
            if (ev.monster) {
              const g = cardMeshes.get(ev.monster.uid);
              if (g) tween3D(g, { rotY: Math.PI * 2 }, 380, "easeInOut", null);
              sfx("flip");
              const who = ev.by === "flipSummon" ? actorText(ev.owner) : null;
              return Promise.all([
                fxPause(240),
                who
                  ? notify(`${who}翻转召唤「${ev.monster.name}」`, "summon")
                  : Promise.resolve(),
              ]);
            }
            break;
          case "position_change":
            return notify(
              `「${ev.monster.name}」切换为${ev.to === "atk" ? "攻击" : "守备"}表示`,
              "info",
            );
          case "lp_change":
            // 效果伤害浮字（战斗伤害走 damage_calc 的 fxImpact3D 大字，不在此重复）
            fxLpFloat(ev.player, ev.delta, projectLp3D(ev.player));
            if (ev.delta < 0) shakeBoard();
            break;
        }
        return null;
      }

export { fxEvent };
