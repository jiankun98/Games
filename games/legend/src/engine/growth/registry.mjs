// 养成线注册表：所有 GrowthTrack 在此登记（引擎与 UI 均通过它访问）
import { GrowthTrack } from "./base.mjs";
import { REBIRTH_CFG } from "./tracks/rebirth.mjs";
import { TREASURE_CFG } from "./tracks/treasure.mjs";

const TRACK_CFGS = [
  REBIRTH_CFG,   // 转生（P0）
  TREASURE_CFG   // 切割之刃（P0）
  // M4/M5 在此追加：羽翼/官爵/经脉/坐骑/称号/魂环/圣装/五行/觉醒/时装/天书/兵器谱/修真
];

const tracks = TRACK_CFGS.map((cfg) => new GrowthTrack(cfg));
const trackMap = new Map(tracks.map((t) => [t.id, t]));

export function allTracks() {
  return tracks;
}
export function trackById(id) {
  return trackMap.get(id) || null;
}
// 所有养成线属性合计（flat + pct 分开累计）
export function trackStats(state) {
  const flat = {}, pct = {};
  for (const t of tracks) {
    const s = t.stats(state) || {};
    for (const [k, v] of Object.entries(s)) {
      if (k.endsWith("Pct")) pct[k] = (pct[k] || 0) + v;
      else flat[k] = (flat[k] || 0) + v;
    }
  }
  return { flat, pct };
}
export function trackSnapshots(state, core) {
  return tracks.map((t) => t.snapshot(state, core));
}
