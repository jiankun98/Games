// 切割之刃（宝物）：2 大陆解锁，攻击附加目标最大生命百分比的切割伤害（Boss 减半）
export const TREASURE_CFG = {
  id: "treasure",
  name: "切割之刃",
  icon: "🗡",
  desc: "神兵利刃，攻击附带切割：按怪物最大生命百分比附加伤害",
  maxLevel: 20,
  unlock: (state) => state.continent >= 2,
  unlockDesc: "到达 2 大陆（沃玛大陆）解锁",
  cost: (lv) => ({
    gold: 2000 * (lv + 1),
    mats: { mat_qiege: 2 + lv }
  }),
  statsAt: (lv) => (lv <= 0 ? {} : {
    cutPct: 0.5 * lv,       // 每级 +0.5% 切割
    atkPct: 2 * lv,
    hpPct: 1.5 * lv
  })
};
