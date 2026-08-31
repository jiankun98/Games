// 统一养成线基类：等级 + 材料消耗 + 属性加成 + 解锁条件 + 可选成功率/祝福值保底
//  15+ 养成线共用此框架（转生/切割之刃/羽翼/官爵/经脉/坐骑/称号/魂环/圣装/五行/觉醒/时装/天书/兵器谱/修真）
//  配置项：
//    id/name/icon/maxLevel/unlock(state,core)/unlockDesc
//    cost(level) -> { gold?, ingot?, mats?: {matId: qty} }
//    statsAt(level) -> { atk?, hp?, ... 平铺属性; atkPct?/hpPct?/defPct? 百分比; cutPct? 切割 }
//    rate?(level) 成功率（缺省 = 1 必成）；blessingMax?(level) 祝福值上限（满必成）

export class GrowthTrack {
  constructor(cfg) {
    this.cfg = cfg;
  }

  get id() { return this.cfg.id; }
  get name() { return this.cfg.name; }
  get icon() { return this.cfg.icon || "✨"; }
  get desc() { return this.cfg.desc || ""; }

  // 存档侧数据（缺省容错：旧档无此线时视为 0 级 0 祝福）
  data(state) {
    return state.growth[this.id] || { level: 0, blessing: 0 };
  }
  level(state) {
    return this.data(state).level;
  }
  maxLevel() {
    return typeof this.cfg.maxLevel === "function" ? this.cfg.maxLevel : (this.cfg.maxLevel || 999);
  }
  isUnlock(state, core) {
    return this.cfg.unlock ? this.cfg.unlock(state, core) : true;
  }
  unlockDesc() {
    return this.cfg.unlockDesc || "";
  }
  cost(level) {
    return this.cfg.cost ? this.cfg.cost(level) : {};
  }
  statsAt(level) {
    return this.cfg.statsAt ? this.cfg.statsAt(level) : {};
  }
  // 该养成线当前贡献的属性
  stats(state) {
    return this.statsAt(this.level(state));
  }

  // 升级：core 提供材料校验/扣减（consumeMats/spendGold/spendIngot）
  tryUpgrade(state, core) {
    if (!this.isUnlock(state, core)) {
      return { ok: false, msg: this.unlockDesc() || "尚未解锁" };
    }
    const lv = this.level(state);
    if (lv >= this.maxLevel()) return { ok: false, msg: "已达最高阶" };
    const cost = this.cost(lv);
    const afford = core.canAfford(cost);
    if (!afford.ok) return { ok: false, msg: afford.msg };

    // 成功率与祝福值保底
    const rate = this.cfg.rate ? this.cfg.rate(lv) : 1;
    const d = this.data(state);
    const bMax = this.cfg.blessingMax ? this.cfg.blessingMax(lv) : 0;
    const blessed = bMax > 0 && d.blessing >= bMax;
    const success = rate >= 1 || blessed || core.rng() < rate;

    core.pay(cost);
    if (success) {
      state.growth[this.id] = { level: lv + 1, blessing: 0 };
      core.emit("growth", { track: this.id, level: lv + 1, name: this.name });
      return { ok: true, msg: `${this.name}升至 ${lv + 1} 阶`, success: true };
    }
    state.growth[this.id] = { level: lv, blessing: (d.blessing || 0) + 1 };
    core.emit("growthFail", { track: this.id, blessing: state.growth[this.id].blessing, bMax });
    return { ok: true, msg: `${this.name}升阶失败，祝福值 +1（${state.growth[this.id].blessing}/${bMax}）`, success: false };
  }

  // UI 快照
  snapshot(state, core) {
    const lv = this.level(state);
    const cost = this.cost(Math.min(lv, this.maxLevel() - 1));
    return {
      id: this.id, name: this.name, icon: this.icon, desc: this.desc,
      level: lv, maxLevel: this.maxLevel(),
      unlock: this.isUnlock(state, core),
      unlockDesc: this.unlockDesc(),
      cost: lv >= this.maxLevel() ? null : cost,
      stats: this.statsAt(Math.min(lv + 1, this.maxLevel())),
      blessing: this.data(state).blessing || 0,
      blessingMax: this.cfg.blessingMax ? this.cfg.blessingMax(lv) : 0,
      rate: this.cfg.rate ? this.cfg.rate(lv) : 1
    };
  }
}
