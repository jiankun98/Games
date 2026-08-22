/* 横切系统：上市 / 增发 / 回购 / 集团 / 主动清算
 * 由引擎调用（非 handler）：E 为引擎实例
 */
import { IND_HANDLERS } from "./registry.js";
import { FORMULA as F } from "../data.js";
import { ratingOf } from "./base.js";

/* 是否满足上市条件：A 级 + 估值 ≥ 10 亿 */
export function canList(ind, E) {
  return ratingOf(ind.profit || 0) >= F.ipoRating && E.handlerValue(ind) >= F.ipoThreshold && !ind.st.listed;
}

export function doList(ind, E) {
  const v = E.handlerValue(ind);
  ind.st.listed = { mcap: v, hist: [v], groupId: null };
  const inject = Math.round(v * F.ipoInject);
  ind.st.treasury += inject;
  E._record(`📈 ${ind.name} 成功上市！IPO 融资 ${E._fmt(inject)} 进公司池`, inject, "income");
  return { ok: true, mcap: v, inject };
}

/* 上市后每小时市值波动 ±1% */
export function tickListed(ind, E) {
  const st = ind.st;
  if (!st.listed) return;
  const chg = (E.rng() * 2 - 1) * 0.01;
  st.listed.mcap = Math.max(1, st.listed.mcap * (1 + chg));
  st.listed.hist.push(st.listed.mcap);
  if (st.listed.hist.length > 60) st.listed.hist.splice(0, st.listed.hist.length - 60);
}

/* 增发：获市值 10% 现金，市值 ×0.92 */
export function doIssue(ind, E) {
  const st = ind.st;
  if (!st.listed) return { ok: false, msg: "未上市" };
  const cash = Math.round(st.listed.mcap * F.issuePct);
  st.treasury += cash;
  st.listed.mcap = Math.round(st.listed.mcap * F.issueMcapMul);
  E._record(`💰 ${ind.name}：增发新股，融资 ${E._fmt(cash)}（市值 -8%）`, cash, "income");
  return { ok: true, cash };
}

/* 回购退市：支付市值 90% */
export function doBuyback(ind, E) {
  const st = ind.st;
  if (!st.listed) return { ok: false, msg: "未上市" };
  const cost = Math.round(st.listed.mcap * F.buybackPct);
  if (st.treasury < cost) return { ok: false, msg: "公司池不足支付回购款" };
  st.treasury -= cost;
  st.listed = null;
  E._record(`🔁 ${ind.name} 回购退市，支付 ${E._fmt(cost)}`, -cost, "cost");
  return { ok: true, cost };
}

/* 组集团：≥3 家上市公司（去重 + 排他：每家公司只能属于一个集团） */
export function formGroup(indList, E, name) {
  const uniq = [];
  const seen = new Set();
  for (const ind of indList) {
    if (!ind || !ind.st || !ind.st.listed) continue;
    if (seen.has(ind.uid)) continue;                 // 去重
    if (ind.st.listed.groupId != null) continue;     // 已在其他集团
    seen.add(ind.uid);
    uniq.push(ind);
  }
  if (uniq.length < F.groupCount) return { ok: false, msg: `需至少 ${F.groupCount} 家未入集团的上市公司` };
  const gid = E.groupSeq++;
  E.groups.push({ id: gid, name: name || "商业集团", members: uniq.map((i) => i.uid) });
  for (const ind of uniq) ind.st.listed.groupId = gid;
  const total = uniq.reduce((a, i) => a + i.st.listed.mcap, 0);
  E._record(`🏢 组建集团「${name || "商业集团"}」！集团市值 ${E._fmt(total * F.groupMcapMul)}`, 0, "good");
  return { ok: true, gid, mcap: total * F.groupMcapMul };
}

/* 拍卖到账时长：按拍卖款价值 1~5h（等待按价值提高，上限 F.auctionHours） */
export function auctionHoursOf(amount) {
  if (amount >= 1e10) return 5;   // ≥100 亿：5h
  if (amount >= 1e9) return 4;    // ≥10 亿：4h
  if (amount >= 1e8) return 3;    // ≥1 亿：3h
  if (amount >= 1e7) return 2;    // ≥1000 万：2h
  return 1;                       // <1000 万：1h
}

/* 主动清算：遣散赔偿（池扣，不足 → 声誉 debuff）→ 剩余池返还主账户 → 固定资产 40% 拍卖（按价值 1~5h 到账） → 移除公司 */
export function doLiquidate(ind, E) {
  const handler = IND_HANDLERS[ind.typeId];
  const pool = ind.st.treasury || 0;
  // 1. 遣散赔偿（时薪 × 5，仅限有雇员/团队模型的公司）
  let comp = 0;
  if (handler.liquidateCompensation) comp = handler.liquidateCompensation(ind, E) || 0;
  let remaining = pool;
  let short = false;
  if (comp > 0) {
    if (remaining >= comp) remaining -= comp;
    else { remaining = 0; short = true; }
  }
  if (short) {
    E.reputationUntil = E.t + F.reputationDur;
    E._record(`⚠️ ${ind.name} 清算时遣散费不足，声誉受损：全公司开设费 +10%（168 小时）`, 0, "bad");
  }
  // 2. 剩余公司池全额返还主账户（不再随公司对象蒸发）
  if (remaining > 0) {
    E.cash += remaining;
    E._record(`💵 ${ind.name}：公司池余额 ${E._fmt(remaining)} 返还主账户`, remaining, "income");
  }
  // 3. 固定资产（估值 - 池）按 40% 拍卖，按价值 1~5 小时到账
  const total = E.handlerValue(ind);
  const fixed = Math.max(0, total - pool);
  const auction = Math.round(fixed * F.liquidateAssetRate);
  const hours = auctionHoursOf(auction);
  E.pendingAuctions.push({ dueAt: E.t + hours * 3600, amount: auction, name: ind.name });
  // 4. 移除公司（并清理集团成员）
  E.industries = E.industries.filter((x) => x.uid !== ind.uid);
  if (ind.st.listed && ind.st.listed.groupId) {
    const g = E.groups.find((g) => g.id === ind.st.listed.groupId);
    if (g) {
      g.members = g.members.filter((u) => u !== ind.uid);
      if (g.members.length < F.groupCount) E.groups = E.groups.filter((x) => x.id !== g.id);
    }
  }
  E._record(`⚰️ ${ind.name} 已主动清算：固定资产拍卖 ${E._fmt(auction)} 将于 ${hours} 小时后到账`, 0, "event");
  return { ok: true, auction, comp, short, refund: remaining };
}
