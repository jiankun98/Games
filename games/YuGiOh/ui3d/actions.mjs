/*
 * 游戏王 3D UI · 卡牌可用操作枚举（纯逻辑，2D 页迁移时可直接复用）
 *  ctx = { duel, ic, closeMenu, startTribute, enterAttackMode }
 */
      export function availableActions(ctx, card, info) {
        const s = ctx.duel.state;
        const acts = [];
        const myTurn = s.turnPlayer === "me" && !s.pending && !s.resolving;
        const inMain = s.phase === "main1" || s.phase === "main2";
        // 归属校验：只能操作自己的手牌（防止点击 AI 手牌触发错位召唤）
        if (info && info.kind === "hand" && info.who === "me" && myTurn && inMain) {
          const handIdx = info.idx;
          if (card.type === "monster") {
            if (card.level < 5) {
              // 召唤/覆盖直接落第一个空格（zone=null 由引擎自动选位）；拖拽仍可指定落点与表示形式
              acts.push({
                icon: ctx.ic.sword,
                label: "通常召唤（攻击）",
                primary: true,
                fn: () => {
                  ctx.duel.normalSummon(handIdx, null, "atk");
                  ctx.closeMenu();
                },
              });
              acts.push({
                icon: ctx.ic.shield,
                label: "守备表示召唤",
                fn: () => {
                  ctx.duel.normalSummon(handIdx, null, "def");
                  ctx.closeMenu();
                },
              });
              acts.push({
                icon: ctx.ic.setCard,
                label: "覆盖（里侧守备）",
                fn: () => {
                  ctx.duel.setMonster(handIdx, null);
                  ctx.closeMenu();
                },
              });
            } else {
              acts.push({
                icon: ctx.ic.sword,
                label: `祭品召唤（需${card.level >= 7 ? 2 : 1}祭品）`,
                primary: true,
                fn: () => {
                  ctx.startTribute(handIdx);
                },
              });
            }
            if (ctx.duel.manualCondOk(card))
              acts.push({
                icon: ctx.ic.spark,
                label: "发动效果",
                fn: () => {
                  ctx.duel.activateHandMonsterEffect(handIdx);
                  ctx.closeMenu();
                },
              });
          } else if (card.type === "spell") {
            const canFire = ctx.duel.manualCondOk(card);
            if (canFire)
              acts.push({
                icon: ctx.ic.spark,
                label: "发动",
                primary: true,
                fn: () => {
                  ctx.duel.activateHandSpell(handIdx);
                  ctx.closeMenu();
                },
              });
            acts.push({
              icon: ctx.ic.setCard,
              label: "覆盖",
              primary: !canFire,
              fn: () => {
                ctx.duel.setSpellTrap(handIdx, null);
                ctx.closeMenu();
              },
            });
          } else if (card.type === "trap") {
            acts.push({
              icon: ctx.ic.setCard,
              label: "覆盖",
              primary: true,
              fn: () => {
                ctx.duel.setSpellTrap(handIdx, null);
                ctx.closeMenu();
              },
            });
          }
        }
        if (info && info.kind === "monster" && info.who === "me" && myTurn) {
          const idx = info.idx;
          if (card.faceDown) {
            if (inMain)
              acts.push({
                icon: ctx.ic.flip,
                label: "翻转召唤",
                primary: true,
                fn: () => {
                  ctx.duel.flipSummon(idx);
                  ctx.closeMenu();
                },
              });
          } else {
            if (
              s.phase === "battle" &&
              card.position === "atk" &&
              !s.me.attacked[idx] &&
              s.turn > 1
            )
              acts.push({
                icon: ctx.ic.sword,
                label: "攻击",
                primary: true,
                fn: () => {
                  ctx.enterAttackMode(idx);
                },
              });
            if (inMain) {
              acts.push({
                icon: ctx.ic.flip,
                label: "切换表示形式",
                fn: () => {
                  ctx.duel.changePosition(idx);
                  ctx.closeMenu();
                },
              });
              if (ctx.duel.manualCondOk(card))
                acts.push({
                  icon: ctx.ic.spark,
                  label: "发动效果",
                  fn: () => {
                    ctx.duel.activateMonsterEffect(idx);
                    ctx.closeMenu();
                  },
                });
            }
          }
        }
        if (
          info &&
          info.kind === "st" &&
          info.who === "me" &&
          card.faceDown &&
          myTurn &&
          inMain &&
          card.turnSet < s.turn
        )
          acts.push({
            icon: ctx.ic.spark,
            label: "发动",
            primary: true,
            fn: () => {
              ctx.duel.activateSetTrap(info.idx);
              ctx.closeMenu();
            },
          });
        return acts;
      }

/*
 * 手牌卡的合法放置区查询（供 3D 场地点亮可用格）。
 * 返回 { kind: "monster"|"st", idxs: [空位下标], tribute: 需求祭品数 }，不可放置返回 null。
 * 规则与引擎 normalSummon/setMonster/setSpellTrap 的前置校验保持一致。
 */
export function handPlacementZones(duel, card) {
  const s = duel && duel.state;
  if (!s || !card) return null;
  if (s.turnPlayer !== "me" || s.pending || s.resolving) return null;
  if (!(s.phase === "main1" || s.phase === "main2")) return null;
  if (card.type === "monster") {
    if (s.me.normalSummonUsed) return null;
    const idxs = duel.freeMonsterZones(s.me);
    if (!idxs.length) return null;
    const lv = card.level || 0;
    return { kind: "monster", idxs, tribute: lv >= 7 ? 2 : lv >= 5 ? 1 : 0 };
  }
  if (card.type === "spell" || card.type === "trap") {
    const idxs = duel.freeSTZones(s.me);
    if (!idxs.length) return null;
    return { kind: "st", idxs, tribute: 0 };
  }
  return null;
}
