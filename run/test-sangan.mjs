// 送墓触发器回归测试：三眼怪从场上送墓时，触发"卡组1只攻≤1500怪兽加入手卡"。
// 用法： node run/test-sangan.mjs
// 退出码：0=通过，1=BUG
import { Duel } from "../games/YuGiOh/engine/duel.mjs";

const logs = [];
const duel = new Duel(
  {
    playerDeck: ["sangan", ...Array(39).fill("celtic")],
    aiDeck: Array(40).fill("celtic"),
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
    // 把三眼怪整理到手牌，再手动布置到场上
    const pool = [...me.hand, ...me.deck];
    const sangan = pool.find((c) => c.cid === "sangan");
    if (!sangan) throw new Error("卡池中无 sangan");
    me.hand = me.hand.filter((c) => c !== sangan);
    me.deck = me.deck.filter((c) => c !== sangan);
    sangan.location = "monster";
    sangan.controller = "me";
    sangan.faceDown = false;
    sangan.position = "atk";
    me.monsterZone[0] = sangan;
    duel.emitView();

    // 破坏（不 await：效果链会在目标选择处挂起等待应答）
    const done = duel._destroy(sangan, "effect");
    await waitUntil(() => duel.state.pending && duel.state.pending.kind === "select", 5000);
    const picked = duel.state.pending.options[0].value;
    duel.answer(picked);
    await done;

    const chosen = me.hand.find((c) => c.uid === picked);
    const stillInDeck = me.deck.some((c) => c.uid === picked);
    const sanganInGrave = me.graveyard.includes(sangan) && sangan.location === "grave";
    console.log("三眼怪入墓:", sanganInGrave, "| 检索卡加入手卡:", !!chosen, "| 仍在卡组:", stillInDeck);
    let failed = false;
    if (!sanganInGrave) { failed = true; console.log("    BUG：三眼怪未进墓地"); }
    if (!chosen) { failed = true; console.log("    BUG：检索卡未加入手卡"); }
    if (stillInDeck) { failed = true; console.log("    BUG：检索卡仍在卡组"); }
    console.log(failed ? "RESULT: BUG" : "RESULT: OK —— 送墓触发器与检索正确");
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}, 300);
