// 召唤无效回归测试：神之宣告在 summon_attempt 窗口无效 AI 的召唤。
// 正确行为：支付一半 LP -> 怪兽不入场、直接进墓地 -> summon 事件不再发出。
// 用法： node run/test-summon-negate.mjs
// 退出码：0=通过，1=BUG
import { Duel } from "../games/YuGiOh/engine/duel.mjs";

const logs = [];
const duel = new Duel(
  {
    playerDeck: Array(40).fill("solemnjudgment"),
    aiDeck: Array(40).fill("celtic"),
    playerExtra: [], aiExtra: [],
    aiDelay: 0, pace: 0, promptDelay: 0,
  },
  { onLog: (m) => logs.push(m), onState: () => {}, onToast: () => {}, onGameOver: () => {} },
);
duel.start();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let chained = false;

setTimeout(async () => {
  try {
    await duel.setSpellTrap(0); // 回合1盖神之宣告
    await duel.endTurn();

    const t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      const s = duel.state;
      if (s.winner) break;
      const pend = s.pending;
      if (pend) {
        if (pend.kind === "chain" && !chained) {
          const sj = pend.options.find((o) => o.card && o.card.cid === "solemnjudgment");
          if (sj) {
            chained = true;
            duel.answer(sj);
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
      if (s.turnPlayer === "me" && s.turn >= 3) break;
      if (s.turnPlayer === "me") await duel.endTurn();
      await sleep(30);
    }

    const aiZoneEmpty = duel.state.ai.monsterZone.every((m) => !m);
    const celticInGrave = duel.state.ai.graveyard.some((c) => c.cid === "celtic" && c.location === "grave");
    const negateLogged = logs.some((l) => l.includes("的召唤被无效"));
    const summonLogged = logs.some((l) => l.startsWith("AI 通常召唤"));
    console.log("LP:", duel.state.me.lp, "| AI 场上为空:", aiZoneEmpty, "| 精灵剑士入墓:", celticInGrave);
    console.log("无效日志:", negateLogged, "| 召唤尝试日志:", summonLogged, "| 已连锁:", chained);
    let failed = false;
    if (!chained) { failed = true; console.log("    BUG：连锁窗口未提供神之宣告"); }
    if (duel.state.me.lp !== 4000) { failed = true; console.log("    BUG：未支付一半 LP"); }
    if (!aiZoneEmpty || !celticInGrave) { failed = true; console.log("    BUG：召唤未被无效（怪兽入场或未送墓）"); }
    if (!negateLogged || !summonLogged) { failed = true; console.log("    BUG：日志缺失"); }
    console.log(failed ? "RESULT: BUG" : "RESULT: OK —— 召唤被正确无效");
    process.exit(failed ? 1 : 0);
  } catch (e) {
    console.error(e);
    process.exit(3);
  }
}, 300);
