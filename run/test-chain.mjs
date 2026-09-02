// 连锁逆序结算回归测试：同一响应窗口内先后入链的两个效果，必须后入链先结算（LIFO）。
// 场景：玩家盖两张陷阱（合成触发器订阅 "activate"），回合3发动盾与剑打开响应窗，
//       先后连锁 A、B -> 结算顺序应为 B -> A（同窗口连锁语义：后续链匹配 activate 语境）。
// 用法： node run/test-chain.mjs
// 退出码：0=通过，1=BUG
import { Duel } from "../games/YuGiOh/engine/duel.mjs";

const logs = [];
const duel = new Duel(
  {
    playerDeck: [...Array(20).fill("torrential"), ...Array(19).fill("traphole"), "shieldsword"],
    aiDeck: Array(40).fill("celtic"),
    playerExtra: [], aiExtra: [],
    aiDelay: 0, pace: 0, promptDelay: 0,
  },
  { onLog: (m) => logs.push(m), onState: () => {}, onToast: () => {}, onGameOver: () => {} },
);
duel.start();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = []; // 结算顺序
const chainOrder = []; // 入链顺序

setTimeout(async () => {
  try {
    await sleep(250);
    const me = duel.state.me;
    // 整理手牌：盾与剑 + 两张陷阱
    const pool = [...me.hand, ...me.deck];
    const take = (cid) => {
      const c = pool.find((x) => x.cid === cid);
      if (!c) throw new Error("卡池中无 " + cid);
      me.hand = me.hand.filter((x) => x !== c);
      me.deck = me.deck.filter((x) => x !== c);
      c.location = "hand";
      c.controller = "me";
      me.hand.push(c);
      return c;
    };
    const shield = take("shieldsword");
    const trapA = take("torrential");
    const trapB = take("traphole");
    await duel.setSpellTrap(me.hand.indexOf(trapA));
    await duel.setSpellTrap(me.hand.indexOf(trapB));
    if (me.spellZone[0] !== trapA || me.spellZone[1] !== trapB) throw new Error("盖伏位置异常");
    // 合成触发器：订阅 activate（引擎同窗口连锁语义：后续链匹配上一环的 activate 语境）
    for (const [t, mark] of [[trapA, "A"], [trapB, "B"]])
      t.effect = { triggers: [{ event: "activate", resolve: async () => { marks.push(mark); } }] };
    await duel.endTurn();

    // 等回到我方回合，发动盾与剑 -> 打开响应窗 -> 连锁 A、B
    const waitUntil = async (cond, ms) => {
      const t0 = Date.now();
      while (!cond()) {
        if (Date.now() - t0 > ms) throw new Error("等待超时");
        await sleep(20);
      }
    };
    await waitUntil(() => duel.state.turnPlayer === "me" && duel.state.turn === 3 && duel.state.phase === "main1" && !duel.state.pending, 10000);
    const activated = duel.activateHandSpell(me.hand.indexOf(shield)); // 盾与剑
    let chained = 0;
    const t0 = Date.now();
    while (chained < 2 && Date.now() - t0 < 8000) {
      const pend = duel.state.pending;
      if (pend && pend.kind === "chain" && pend.options.length) {
        chained++;
        chainOrder.push(pend.options[0].card === trapA ? "A" : "B");
        duel.answer(pend.options[0]);
      }
      await sleep(15);
    }
    await activated;
    await waitUntil(() => duel.state.chain.length === 0 && marks.length === 2, 5000);

    console.log("入链顺序:", chainOrder.join(""), "| 结算顺序:", marks.join(""));
    let failed = false;
    if (chainOrder.join("") !== "AB") { failed = true; console.log("    BUG：未按预期两次入链（chained=" + chained + "）"); }
    if (marks.join("") !== "BA") { failed = true; console.log("    BUG：连锁未按逆序（LIFO）结算"); }
    console.log(failed ? "RESULT: BUG" : "RESULT: OK —— 同窗口连锁逆序结算正确");
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}, 300);
