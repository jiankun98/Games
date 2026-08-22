/* 产业处理器基类与通用工具
 * Handler 接口约定（各产业文件 export default）：
 *   id: string
 *   defaults(ind, type) -> st         初始状态（含 treasury/stalled）
 *   tickHour(ind, E)                   每小时推进（收支直接操作 ind.st.treasury）
 *   incomePerHour(ind, E) -> number    当前每小时净收益（展示用，税后近似）
 *   value(ind, E) -> number            公司估值（固定资产 + 池余额 + 在建/在运营项目）
 *   snapshot(ind, E) -> object         UI 视图（引擎会合并通用字段）
 *   offline(ind, hours, E) -> object   离线近似：{income, cost}（引擎统一计税入池），可推进 st
 *   actions: { name: (ind, E, payload) => {ok, msg} }
 */
import { RATING_NAMES, RATING_THRESHOLDS } from "../data.js";

/* 累计净利润 -> 评级索引 0(E)..7(SSS) */
export function ratingOf(profit) {
  let r = 0;
  for (let i = 0; i < RATING_THRESHOLDS.length; i++) if (profit >= RATING_THRESHOLDS[i]) r = i + 1;
  return Math.min(r, 7);
}

/* 评级徽章色（UI 用） */
export function ratingColor(r) {
  const name = RATING_NAMES[r] || "E";
  const map = {
    E: "#9AA3AF", D: "#5BB98C", C: "#5B8DEF", B: "#A06BE0",
    A: "#E0A93C", S: "#E07B3C", SS: "#E05B5B", SSS: "#B45309"
  };
  return map[name];
}

/* 公司池默认状态（8 家新公司统一） */
export function treasuryState() {
  return { treasury: 0, stalled: false };
}

/* 从公司池扣款：余额不足时不扣款、原额保留并返回 false（由调用方取消操作，绝不销毁资金） */
export function pay(ind, amount) {
  const st = ind.st;
  if (st.treasury >= amount) {
    st.treasury -= amount;
    return true;
  }
  return false;
}

/* ---------- 机队基类（快递 / 租车共用） ----------
 * fleet 项：{ fleetId, status: "running"|"repairing", hours, repairLeft, repairCost }
 * 引擎每小时结算：running 项产金；里程满 -> down（停机零收入）；维修 action 恢复
 */
export function fleetDefaults() {
  return { ...treasuryState(), fleet: [] };
}

export function fleetTick(ind, E, type, key = "fleet") {
  const st = ind.st;
  const list = st[key];
  for (const f of list) {
    if (f.status === "repairing") {
      f.repairLeft = (f.repairLeft || 0) - 1;
      if (f.repairLeft <= 0) { f.status = "running"; f.hours = 0; }
      continue;
    }
    if (f.status !== "running") continue;
    const spec = type[key + "Spec"][f.fleetId];
    if (!spec) continue;
    // 产金（计入公司池）
    st.treasury += spec.incomePerHour;
    f.hours = (f.hours || 0) + 1;
    if (f.hours >= spec.maxHours) {
      f.status = "down";           // 满里程停机，零收入
      E._record(`🛠️ ${ind.name}：「${spec.name}」里程满，停机待维修`, 0, "event");
    }
  }
}

export function fleetBuy(ind, E, type, spec, key = "fleet") {
  const st = ind.st;
  const list = st[key];
  // 槽位区分：飞机（spec.kind==="plane"）占机位 planes，其余占车位（快递 vehicles / 租车 garage）
  const isPlane = spec.kind === "plane";
  const capKey = isPlane ? "planes" : (st.garage != null ? "garage" : "vehicles");
  const capLabel = isPlane ? "机位" : (st.garage != null ? "车库" : "车位");
  const used = list.filter((f) => {
    const s2 = type[key + "Spec"][f.fleetId] || {};
    return isPlane ? s2.kind === "plane" : s2.kind !== "plane";
  }).length;
  if (used >= (st[capKey] || 0)) return { ok: false, msg: capLabel + "已满，请先扩展" };
  if (!pay(ind, spec.cost)) return { ok: false, msg: "公司池余额不足" };
  // 实例唯一 id：同款可重复购买，维修按实例定位
  st.fseq = (Number.isFinite(st.fseq) ? st.fseq : 0) + 1;
  list.push({ fid: "f" + st.fseq, fleetId: spec.id, status: "running", hours: 0 });
  ind.invested += spec.cost;
  E._record(`🚚 ${ind.name}：购入「${spec.name}」`, -spec.cost, "expand");
  return { ok: true, cost: spec.cost };
}

export function fleetRepair(ind, E, type, fid, key = "fleet") {
  const st = ind.st;
  // 优先按实例 id 定位（同款多辆时精确到辆），兼容旧档按 fleetId
  let f = (st[key] || []).find((x) => x.fid === fid);
  if (!f && fid) f = (st[key] || []).find((x) => x.fleetId === fid);
  if (!f || f.status !== "down") return { ok: false, msg: "该载具不需要维修" };
  const spec = type[key + "Spec"][f.fleetId];
  if (!pay(ind, spec.repairCost)) return { ok: false, msg: "公司池余额不足" };
  f.status = "repairing"; f.repairLeft = spec.repairHours;
  ind.invested += spec.repairCost;
  E._record(`🔧 ${ind.name}：「${spec.name}」开始维修（${spec.repairHours} 小时）`, -spec.repairCost, "cost");
  return { ok: true, cost: spec.repairCost };
}

export function fleetValue(ind, type, key = "fleet") {
  let v = 0;
  for (const f of ind.st[key] || []) {
    const spec = type[key + "Spec"][f.fleetId];
    if (spec) v += spec.cost * 0.6;   // 账面 60%
  }
  return v + ind.st.treasury;
}

export function fleetSnapshot(ind, E, type, key = "fleet") {
  const st = ind.st;
  const list = (st[key] || []).map((f) => {
    const spec = type[key + "Spec"][f.fleetId];
    return {
      fid: f.fid || f.fleetId, fleetId: f.fleetId, name: spec.name, kind: spec.kind || "vehicle",
      incomePerHour: spec.incomePerHour,
      status: f.status, hours: f.hours, maxHours: spec.maxHours,
      repairLeft: f.repairLeft || 0, repairHours: spec.repairHours, repairCost: spec.repairCost
    };
  });
  return { fleet: list };
}

export function fleetOffline(ind, hours, E, type, key = "fleet") {
  let income = 0;
  for (const f of ind.st[key] || []) {
    if (f.status === "repairing") {
      // 离线推进维修计时（维修中载具不产金）
      const done = Math.min(hours, f.repairLeft || 0);
      f.repairLeft -= done;
      if (f.repairLeft <= 0) { f.status = "running"; f.hours = 0; }
      continue;
    }
    if (f.status !== "running") continue;
    const spec = type[key + "Spec"][f.fleetId];
    if (!spec) continue;
    const run = Math.min(hours, spec.maxHours - (f.hours || 0));
    if (run > 0) income += spec.incomePerHour * run;
    f.hours = (f.hours || 0) + Math.max(0, run);
  }
  return { income, cost: 0 };
}
