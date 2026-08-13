"use strict";
// 魔法筒回归测试：发动一次后不应再被连锁/再次反射伤害。
// 场景：玩家盖魔法筒 -> AI 每回合召唤精灵剑士直接攻击。
// 正确行为：魔法筒只发动一次（AI 受 1500 伤害），之后 AI 攻击正常对玩家造成伤害。
// 用法： node run/test-cylinder.js
// 退出码：0=通过，1=BUG，2=不确定
global.window = global;
require("../games/YuGiOh/cards.js");
require("../games/YuGiOh/ai-player.js");
require("../games/YuGiOh/index.js");

const logs = [];
const duel = new window.Duel(
  {
    playerDeck: Array(40).fill("magiccylinder"),
    aiDeck: Array(40).fill("celtic"),
    playerExtra: [], aiExtra: [],
    aiDelay: 0, pace: 0, promptDelay: 0,
  },
  { onLog: (m) => logs.push(m), onState: () => {}, onToast: () => {}, onGameOver: () => {} },
);
duel.start();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let activations = 0;
let activationTurns = [];
let setDone = false;

setTimeout(async () => {
  try {
    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const s = duel.state;
      if (s.winner)
        break;
      const pend = s.pending;
      if (pend) {
        if (pend.kind === "chain") {
          const mc = pend.options.find((o) => o.card && o.card.cid === "magiccylinder");
          if (mc) {
            activations++;
            activationTurns.push(s.turn);
            duel.answer(mc);
          } else {
            duel.answer({ pass: true });
          }
        } else if (pend.kind === "select") {
          duel.answer(pend.options[0].value);
        } else {
          duel.answer({ pass: true });
        }
        await sleep(20);
        continue;
      }
      if (s.turnPlayer === "me") {
        if (!setDone) {
          await duel.setSpellTrap(0); // 盖1张魔法筒
          setDone = true;
        } else if (s.turn >= 6) {
          break; // 跑完我方第3回合（AI 已行动 2 次以上）
        } else {
          await duel.endTurn();
        }
      }
      await sleep(30);
    }
    console.log("魔法筒发动次数:", activations, "| 发动回合:", activationTurns.join(","));
    const aiDmg = logs.filter((l) => l.startsWith("AI 受"));
    const meDmg = logs.filter((l) => l.includes("玩家 受"));
    console.log("AI 伤害日志:", aiDmg.join(" | ") || "(无)");
    console.log("玩家伤害日志:", meDmg.join(" | ") || "(无)");
    console.log("AI LP:", duel.state.ai.lp, "| 玩家 LP:", duel.state.me.lp);
    if (activations > 1) {
      console.log("RESULT: BUG —— 魔法筒被反复发动（每次 AI 攻击都触发）");
      process.exit(1);
    }
    if (activations === 1 && aiDmg.length === 1 && meDmg.length >= 1) {
      console.log("RESULT: OK —— 魔法筒只生效一次，之后 AI 伤害正常打给玩家");
      process.exit(0);
    }
    console.log("RESULT: UNCLEAR");
    process.exit(2);
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}, 300);
