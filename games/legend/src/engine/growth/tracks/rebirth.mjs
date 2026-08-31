// 转生：80 级开启，消耗修为丹+金币；每级全属性 +8%，是大陆推进的硬门槛
export const REBIRTH_CFG = {
  id: "rebirth",
  name: "转生",
  icon: "☯",
  desc: "转世重修，全属性大幅提升，解锁高阶大陆",
  maxLevel: 10,
  unlock: (state) => state.level >= 80,
  unlockDesc: "等级达到 80 级解锁",
  cost: (lv) => ({
    gold: Math.round(10000 * Math.pow(lv + 1, 2.2)),
    mats: { mat_xiuwei: 5 + lv * 4 }
  }),
  statsAt: (lv) => (lv <= 0 ? {} : {
    atkPct: 8 * lv, hpPct: 8 * lv, defPct: 8 * lv, mdefPct: 8 * lv
  })
};
