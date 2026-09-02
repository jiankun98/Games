// 控制权归还回归测试：心变获得对方怪兽控制权后，必须在回合结束归还。
// 用法： node run/test-control.mjs
// 退出码：0=通过，1=BUG
import { Duel } from "../games/YuGiOh/engine/duel.mjs";

const logs = [];
const duel = new Duel(
  {
    playerDeck: [...Array(39).fill("changeofheart"), "celtic"],
    aiDeck: Array(40).fill("mysticalelf"),
    playerExtra: [], aiExtra: [],
    aiDelay: 0, pace: 0, promptDelay: 0,
  },
  { onLog: (m) => logs.push(m), onState: () => {}, onToast: () => {}, onGameOver: () => {} },
);
duel.start();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitUntil = async (cond, ms) => {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error("等待超时");
    await sleep(20);
  }
};

setTimeout(async () => {
  try {
    await sleep(250);
    const me = duel.state.me;
    // 把一只精灵剑士布置到 AI 场上（心变的对象）
    const pool = [...me.hand, ...me.deck];
    const celtic = pool.find((c) => c.cid === "celtic");
    if (!celtic) throw new Error("卡池中无 celtic");
    me.hand = me.hand.filter((c) => c !== celtic);
    me.deck = me.deck.filter((c) => c !== celtic);
    celtic.location = "monster";
    celtic.controller = "ai";
    celtic.faceDown = false;
    celtic.position = "atk";
    duel.state.ai.monsterZone[0] = celtic;

    // 发动心变（会在目标选择处挂起）
    const activated = duel.activateHandSpell(0);
    await waitUntil(() => duel.state.pending && duel.state.pending.kind === "select", 5000);
    duel.answer(duel.state.pending.options[0].value);
    await activated;

    const stolenOk = me.monsterZone.includes(celtic)
      && celtic.controller === "me"
      && celtic.tempControlUntil === "turn_end"
      && celtic.controlOriginalController === "ai";
    console.log("心变后：在我方场上:", me.monsterZone.includes(celtic), "| controller:", celtic.controller,
      "| 归还标记:", celtic.tempControlUntil);

    // 结束回合：心变类临时控制权应在 _endTurn 归还
    await duel.endTurn();
    await waitUntil(() => duel.state.turn === 2 && duel.state.turnPlayer === "ai", 8000);
    await sleep(100); // 让 AI 主阶段跑起来（AI 没有夺取控制权的手段，精灵剑士不会被移动）

    const returned = duel.state.ai.monsterZone.includes(celtic)
      && celtic.controller === "ai"
      && celtic.tempControlUntil === null
      && celtic.controlOriginalController === null;
    console.log("回合结束：回到 AI 场上:", duel.state.ai.monsterZone.includes(celtic), "| controller:", celtic.controller,
      "| 归还标记已清:", celtic.tempControlUntil === null);

    let failed = false;
    if (!stolenOk) { failed = true; console.log("    BUG：心变未正确夺取控制权"); }
    if (!returned) { failed = true; console.log("    BUG：控制权未在回合结束归还"); }
    console.log(failed ? "RESULT: BUG" : "RESULT: OK —— 控制权夺取与归还正确");
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}, 300);
