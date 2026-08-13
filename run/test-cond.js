"use strict";
// 手动发动 condition 前置校验回归测试：
//  1) 黑魔术的幕帘：手牌无黑魔术师 -> 拒绝发动（卡留手、LP 不变）
//  2) 黑魔术的幕帘：手牌有黑魔术师 -> 正常发动（LP 减半、黑魔术师特召）
//  3) 青眼贤士（场上）：手牌无青眼白龙 -> 拒绝发动效果（不被祭品）
// 用法： node run/test-cond.js
// 退出码：0=通过，1=BUG
global.window = global;
require("../games/YuGiOh/cards.js");
require("../games/YuGiOh/ai-player.js");
require("../games/YuGiOh/index.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const logs = [];
const toasts = [];

function newDuel(deckIds) {
  return new window.Duel(
    { playerDeck: deckIds, aiDeck: Array(40).fill("celtic"), playerExtra: [], aiExtra: [], aiDelay: 0, pace: 0, promptDelay: 0 },
    { onLog: (m) => logs.push(m), onState: () => {}, onToast: (m) => toasts.push(m), onGameOver: () => {} },
  );
}
function setHand(duel, cids) {
  const me = duel.state.me;
  const pool = [...me.hand, ...me.deck];
  const cards = cids.map((cid) => {
    const c = pool.find((x) => x.cid === cid);
    if (!c) throw new Error("卡池中无 " + cid);
    c.location = "hand"; c.controller = "me";
    return c;
  });
  me.hand = cards;
  me.deck = me.deck.filter((c) => !cards.includes(c));
  return cards;
}

setTimeout(async () => {
  try {
    let failed = false;

    // 用例1：手牌无黑魔术师 -> 应拒绝发动
    {
      const duel = newDuel(Array(40).fill("curtain"));
      duel.start();
      await sleep(250);
      const [curtain] = setHand(duel, ["curtain"]);
      await duel.activateHandSpell(0);
      const fired = logs.includes("玩家 发动 黑魔术的幕帘。");
      const lp = duel.state.me.lp;
      const stillInHand = duel.state.me.hand.includes(curtain);
      const zoneEmpty = duel.state.me.spellZone.every((c) => !c);
      console.log(`[1] 无黑魔导: fired=${fired} lp=${lp} stillInHand=${stillInHand} zoneEmpty=${zoneEmpty}`);
      if (fired || lp !== 8000 || !stillInHand || !zoneEmpty) { failed = true; console.log("    BUG：条件不满足仍发动"); }
      if (!duel.manualCondOk(curtain)) console.log("[1] manualCondOk=false ✓");
      else { failed = true; console.log("    BUG：manualCondOk 应为 false"); }
    }

    // 用例2：手牌有黑魔术师 -> 应正常发动
    {
      const duel = newDuel(["curtain", "darkmagician", ...Array(38).fill("celtic")]);
      duel.start();
      await sleep(250);
      const [curtain] = setHand(duel, ["curtain", "darkmagician"]);
      const condBefore = duel.manualCondOk(curtain);
      await duel.activateHandSpell(0);
      const fired = logs.includes("玩家 发动 黑魔术的幕帘。");
      const lp = duel.state.me.lp;
      const dmOnField = duel.state.me.monsterZone.some((m) => m && m.cid === "darkmagician");
      console.log(`[2] 有黑魔导: condBefore=${condBefore} fired=${fired} lp=${lp} dmOnField=${dmOnField}`);
      if (!condBefore || !fired || lp !== 4000 || !dmOnField) { failed = true; console.log("    BUG：应正常发动"); }
    }

    // 用例3：青眼贤士在场上、手牌无青眼白龙 -> 应拒绝发动效果（不被祭品）
    {
      const duel = newDuel(["kaibaman", ...Array(39).fill("celtic")]);
      duel.start();
      await sleep(250);
      const [kaiba] = setHand(duel, ["kaibaman"]);
      const me = duel.state.me;
      me.monsterZone[0] = kaiba;
      kaiba.location = "monster";
      kaiba.faceDown = false;
      kaiba.position = "atk";
      await duel.activateMonsterEffect(0);
      const stillOnField = me.monsterZone[0] === kaiba;
      console.log(`[3] 青眼贤士无青眼: stillOnField=${stillOnField}`);
      if (!stillOnField) { failed = true; console.log("    BUG：条件不满足仍祭品"); }
    }

    console.log(failed ? "RESULT: BUG" : "RESULT: OK —— 全部通过");
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}, 300);
