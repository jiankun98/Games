// 光之护封剑回归测试：玩家发动后，AI 是否被封锁攻击。
// 用法： node run/test-swords.mjs
// 退出码：0=通过（AI 被封锁），1=BUG（AI 无视封锁发动攻击），2=结果不明确
import { Duel } from "../games/YuGiOh/engine/duel.mjs";

const logs = [];
const duel = new Duel(
  {
    playerDeck: Array(40).fill("swords"),
    aiDeck: Array(40).fill("celtic"),
    playerExtra: [], aiExtra: [],
    aiDelay: 0, pace: 0, promptDelay: 0,
  },
  { onLog: (m) => logs.push(m), onState: () => {}, onToast: () => {}, onGameOver: () => {} },
);
duel.start();

const waitUntil = async (cond, ms) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("等待超时");
    await new Promise((r) => setTimeout(r, 50));
  }
};

setTimeout(async () => {
  try {
    const handIdx = duel.state.me.hand.findIndex((c) => c.cid === "swords");
    console.log("handIdx:", handIdx, "| phase:", duel.state.phase);
    await duel.activateHandSpell(handIdx);
    console.log("attackLockTurns(me):", duel.state.me.attackLockTurns);
    console.log("spellZone[0]:", duel.state.me.spellZone[0] && duel.state.me.spellZone[0].cid);
    await duel.endTurn(); // AI 回合完整跑完
    // _endTurn 内部 fire-and-forget 启动下一回合，轮询等待 AI 回合结束交还
    await waitUntil(() => duel.state.turnPlayer === "me" || duel.state.winner, 8000);
    console.log("after AI turn:", "turn", duel.state.turn, "| turnPlayer", duel.state.turnPlayer, "| winner", duel.state.winner);
    const lockLogs = logs.filter((l) => l.includes("光之护封剑"));
    const aiAttacks = logs.filter((l) => l.includes("AI 的") && l.includes("发动攻击"));
    console.log("LOCK LOGS:", lockLogs.join(" | ") || "(无)");
    console.log("AI ATTACK LOGS:", aiAttacks.join(" | ") || "(无)");
    if (aiAttacks.length > 0) {
      console.log("RESULT: BUG —— AI 无视光之护封剑发动了攻击");
      process.exit(1);
    }
    if (logs.some((l) => l.includes("受光之护封剑影响"))) {
      console.log("RESULT: OK —— AI 被封锁，跳过战斗阶段");
    } else {
      console.log("RESULT: UNCLEAR —— AI 未攻击但也没有封锁日志");
      process.exit(2);
    }

    // 用例2：光之护封剑被破坏 → 攻击封锁应立即解除
    const sw = duel.state.me.spellZone.find((c) => c && c.cid === "swords");
    if (sw) await duel._destroy(sw, "effect");
    console.log("destroy 后 attackLockTurns(me):", duel.state.me.attackLockTurns);
    if (duel.state.me.attackLockTurns !== 0) {
      console.log("RESULT: BUG —— 剑被破坏后封锁未解除");
      process.exit(1);
    }
    console.log("RESULT: OK —— 剑被破坏后封锁正确解除");
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}, 300);
