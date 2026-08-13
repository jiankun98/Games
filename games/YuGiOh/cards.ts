/*
 * 游戏王·卡牌数据与处理器（事件驱动版，TypeScript）
 *  每张卡的 effect.triggers 声明：{ event, auto, condition?, cost?, acquireTargets?, resolve? }
 *  永续/场地/装备另声明 effect.continuous: (self, mon, g) => { atkDelta, defDelta }
 *  所有特殊处理都在此文件内，通过 g 原语操作；引擎不认识任何具体卡。
 */

// 工具：构造"选 N 个场上怪兽"的目标获取
function pickMonsters(g: GameApi, msg: string, filter: (m: Card) => boolean, count: number): Promise<(string | null)[] | null> {
  const opts = g.allMonsters().filter(filter).map((m) => ({ value: m.uid, label: m.name, card: m }));
  if (!opts.length) return Promise.resolve(null);
  return g.askTargets(msg, opts, count);
}

// 齿轮检索（绿/红/黄互搜）
function _gadgetSearch(cid: string, label: string): Trigger["acquireTargets"] {
  return async (self: Card, ev: GameEvent, g: GameApi) => {
    const p = g.playerOf(self);
    const opts = g.deck(p).filter((c) => c.cid === cid).slice(0, 6).map((c) => ({ value: c.uid, label: c.name, card: c }));
    if (!opts.length) return null;
    return g.askTargets(`将卡组1只「${label}」加入手卡`, opts, 1);
  };
}
function _gadgetResolve(): Trigger["resolve"] {
  return async (self: Card, ev: GameEvent, g: GameApi, t: (string | null)[]) => {
    if (t && t[0]) { const p = g.playerOf(self); const c = g.deck(p).find((x) => x.uid === t[0]); if (c) await g.addToHand(c, p); }
  };
}

const CARDS: CardDef[] = [
  /* ========================= 通常怪兽 ========================= */
  { id: "blueyes", name: "青眼白龙", type: "monster", level: 8, attribute: "光", race: "龙族", atk: 3000, def: 2500, text: "以高攻击力著称的传说之龙。" },
  { id: "darkmagician", name: "黑魔术师", type: "monster", level: 7, attribute: "暗", race: "魔法师族", atk: 2500, def: 2100, text: "魔术师的终极王牌。" },
  { id: "summonedskull", name: "暗黑之恶魔", type: "monster", level: 6, attribute: "暗", race: "恶魔族", atk: 2500, def: 1200, text: "召唤雷电的恶魔。" },
  { id: "gaia", name: "暗黑骑士盖亚", type: "monster", level: 7, attribute: "地", race: "战士族", atk: 2300, def: 2100, text: "骑乘骏马的疾风骑士。" },
  { id: "celtic", name: "精灵剑士", type: "monster", level: 4, attribute: "地", race: "战士族", atk: 1400, def: 1200, text: "精灵族的剑士。" },
  { id: "gemini", name: "双子妖精", type: "monster", level: 4, attribute: "地", race: "魔法师族", atk: 1900, def: 900, text: "心灵相通的双子妖精。" },
  { id: "stone", name: "岩石巨兵", type: "monster", level: 3, attribute: "地", race: "岩石族", atk: 1300, def: 2000, text: "坚如磐石的巨兵。" },
  { id: "silverfang", name: "银牙之狼", type: "monster", level: 3, attribute: "地", race: "兽族", atk: 1200, def: 800, text: "银色獠牙的狼王。" },
  { id: "mysticalelf", name: "神秘之精灵", type: "monster", level: 4, attribute: "光", race: "魔法师族", atk: 800, def: 2000, text: "以祈祷守护同伴的精灵。" },
  { id: "axe", name: "斧突袭者", type: "monster", level: 4, attribute: "地", race: "战士族", atk: 1700, def: 1150, text: "挥舞巨斧的战士。" },
  { id: "battleox", name: "米诺陶洛斯", type: "monster", level: 4, attribute: "地", race: "兽战士族", atk: 1700, def: 1000, text: "牛头战士。" },
  { id: "lajinn", name: "灯之魔人", type: "monster", level: 4, attribute: "暗", race: "恶魔族", atk: 1800, def: 1000, text: "寄宿于神灯的魔人。" },

  /* ========================= 效果怪兽 ========================= */
  { id: "maneater", name: "食人虫", type: "monster", level: 2, attribute: "地", race: "昆虫族", atk: 450, def: 600, text: "翻转：破坏场上1只怪兽。", effect: {
    triggers: [{ event: "flip", auto: true,
      condition: (self, ev) => ev.monster === self,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "食人虫：选择1只怪兽破坏", (m) => m !== self, 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.destroy(m); } } }] } },
  { id: "oldvindictive", name: "报复之老魔术师", type: "monster", level: 2, attribute: "暗", race: "魔法师族", atk: 450, def: 600, text: "翻转：破坏对方场上1只怪兽。", effect: {
    triggers: [{ event: "flip", auto: true,
      condition: (self, ev) => ev.monster === self,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "报复之老魔术师：选择对方1只怪兽破坏", (m) => g.controller(m) !== self.controller, 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.destroy(m); } } }] } },
  { id: "magicianoffaith", name: "信仰之魔术师", type: "monster", level: 1, attribute: "光", race: "魔法师族", atk: 300, def: 400, text: "翻转：将自己墓地1张魔法卡加入手卡。", effect: {
    triggers: [{ event: "flip", auto: true,
      condition: (self, ev) => ev.monster === self,
      acquireTargets: async (self, ev, g) => {
        const p = g.playerOf(self);
        const opts = g.graveyard(p).filter((c) => c.type === "spell").map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("信仰之魔术师：将墓地1张魔法加入手卡", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const p = g.playerOf(self); const c = g.graveyard(p).find((x) => x.uid === t[0]); if (c) await g.recoverToHand(c, p); } } }] } },
  { id: "penguin", name: "企鹅士兵", type: "monster", level: 2, attribute: "水", race: "水族", atk: 750, def: 500, text: "翻转：最多将场上2只怪兽弹回持有者手卡。", effect: {
    triggers: [{ event: "flip", auto: true,
      condition: (self, ev) => ev.monster === self,
      acquireTargets: async (self, ev, g) => {
        const picked: string[] = [];
        for (let i = 0; i < 2; i++) {
          const opts: TargetOption[] = g.allMonsters().filter((m) => m !== self && !picked.includes(m.uid)).map((m) => ({ value: m.uid, label: m.name, card: m }));
          if (!opts.length) break;
          opts.push({ value: null, label: "完成", card: null });
          const r = await g.askTargets(`企鹅士兵：选择要弹回的怪兽（${i + 1}/2，可完成）`, opts, 1);
          if (r[0] === null) break;
          picked.push(r[0] as string);
        }
        return picked.length ? picked : null;
      },
      resolve: async (self, ev, g, t) => { if (t) for (const uid of t) { const m = g.findCard(uid); if (m) await g.bounce(m); } } }] } },
  { id: "yomiship", name: "死者之船", type: "monster", level: 3, attribute: "水", race: "水族", atk: 900, def: 500, text: "此卡被战斗破坏送墓时：破坏破坏它的怪兽。", effect: {
    triggers: [{ event: "destroyed_by_battle", auto: true,
      condition: (self, ev) => ev.card === self,
      resolve: async (self, ev, g) => { if (ev.attacker && g.isValid(ev.attacker)) await g.destroy(ev.attacker); } }] } },
  { id: "giantgerm", name: "巨大病毒", type: "monster", level: 2, attribute: "暗", race: "恶魔族", atk: 1000, def: 100, text: "此卡被战斗破坏送墓时：对方受500伤害，并从卡组特召最多2只「巨大病毒」。", effect: {
    triggers: [{ event: "destroyed_by_battle", auto: true,
      condition: (self, ev) => ev.card === self,
      resolve: async (self, ev, g) => {
        const p = g.playerOf(self);
        await g.damage(g.opponent(p), 500, "effect");
        const copies = g.deck(p).filter((c) => c.cid === "giantgerm").slice(0, 2);
        for (const c of copies) { await g.specialSummon(c, p, "atk", "deck"); }
      } }] } },
  { id: "witch", name: "黑森林的魔女", type: "monster", level: 4, attribute: "暗", race: "魔法师族", atk: 1100, def: 1200, text: "此卡从场上送墓时：将卡组中1只守备力1500以下的怪兽加入手卡。", effect: {
    triggers: [{ event: "sent_to_grave", auto: true,
      condition: (self, ev) => ev.card === self && ev.from === "field",
      acquireTargets: async (self, ev, g) => {
        const p = g.playerOf(self);
        const opts = g.deck(p).filter((c) => c.type === "monster" && (c.def || 0) <= 1500).slice(0, 12).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("黑森林的魔女：将卡组1只守备力1500以下怪兽加入手卡", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const p = g.playerOf(self); const c = g.deck(p).find((x) => x.uid === t[0]); if (c) await g.addToHand(c, p); } } }] } },
  { id: "sangan", name: "三眼怪", type: "monster", level: 3, attribute: "暗", race: "恶魔族", atk: 1000, def: 600, text: "此卡从场上送墓时：将卡组中1只攻击力1500以下的怪兽加入手卡。", effect: {
    triggers: [{ event: "sent_to_grave", auto: true,
      condition: (self, ev) => ev.card === self && ev.from === "field",
      acquireTargets: async (self, ev, g) => {
        const p = g.playerOf(self);
        const opts = g.deck(p).filter((c) => c.type === "monster" && (c.atk || 0) <= 1500).slice(0, 12).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("三眼怪：将卡组1只攻击力1500以下怪兽加入手卡", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const p = g.playerOf(self); const c = g.deck(p).find((x) => x.uid === t[0]); if (c) await g.addToHand(c, p); } } }] } },
  { id: "exiled", name: "流放之战士", type: "monster", level: 4, attribute: "地", race: "战士族", atk: 1000, def: 1000, text: "起动：解放此卡；破坏场上1只怪兽。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "流放之战士：选择1只怪兽破坏", (m) => m !== self, 1),
      cost: async (self, ev, g) => { await g.tribute(self); },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.destroy(m); } } }] } },
  { id: "cannonsoldier", name: "加农炮兵", type: "monster", level: 4, attribute: "暗", race: "机械族", atk: 1400, def: 1300, text: "起动：解放自己场上1只怪兽；给与对方500伤害。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "加农炮兵：选择1只己方怪兽解放", (m) => g.controller(m) === self.controller && m !== self, 1),
      resolve: async (self, ev, g, t) => {
        if (!t || !t[0]) return;
        const m = g.findCard(t[0]); if (!m) return;
        await g.tribute(m);
        await g.damage(g.opponent(self.controller), 500, "effect");
      } }] } },
  { id: "goblin", name: "哥布林突击部队", type: "monster", level: 4, attribute: "地", race: "兽战士族", atk: 2300, def: 0, text: "此卡攻击的场合，战斗阶段结束时变成守备表示。", effect: {
    triggers: [{ event: "damage_step_end", auto: true,
      condition: (self, ev) => ev.attacker === self && self.position === "atk",
      resolve: async (self, ev, g) => { await g.changePosition(self, "def"); } }] } },
  { id: "speardragon", name: "长枪龙", type: "monster", level: 4, attribute: "风", race: "龙族", atk: 1900, def: 0, text: "贯穿；此卡攻击的场合，伤害步骤后变成守备表示。", effect: {
    triggers: [
      { event: "damage_calc", auto: true,
        condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
        resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target!).def; } },
      { event: "damage_step_end", auto: true,
        condition: (self, ev) => ev.attacker === self && self.position === "atk",
        resolve: async (self, ev, g) => { await g.changePosition(self, "def"); } }
    ] } },
  { id: "kuriboh", name: "栗子球", type: "monster", level: 1, attribute: "暗", race: "恶魔族", atk: 300, def: 200, text: "伤害计算时：将手卡中此卡丢弃，使该次战斗对自己造成的战斗伤害为0。", effect: { speed: 2,
    triggers: [{ event: "damage_calc", auto: false,
      condition: (self, ev) => ev.damageTo === self.controller && self.location === "hand" && (ev.damage || 0) > 0,
      cost: async (self, ev, g) => { await g.discardCard(self); },
      resolve: async (self, ev, g) => { g.negateBattleDamage(); } }] } },
  { id: "sinisterserpent", name: "阴险之蛇", type: "monster", level: 1, attribute: "水", race: "爬虫类族", atk: 300, def: 200, text: "自己的准备阶段，若此卡在墓地：可将此卡加入手卡。", effect: {
    triggers: [{ event: "phase_start", auto: true,
      condition: (self, ev, g) => ev.phase === "standby" && self.location === "grave" && g.playerOf(self) === ev.player,
      resolve: async (self, ev, g) => { await g.recoverToHand(self, g.playerOf(self)); } }] } },

  /* ========================= 魔法 ========================= */
  { id: "raigeki", name: "雷击", type: "spell", subtype: "通常", text: "对方场上的全部怪兽破坏。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { for (const m of [...g.monsters(g.opponent(g.activator!))]) await g.destroy(m); } }] } },
  { id: "darkhole", name: "黑洞", type: "spell", subtype: "通常", text: "场上全部怪兽破坏。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { for (const m of [...g.allMonsters()]) await g.destroy(m); } }] } },
  { id: "mst", name: "旋风", type: "spell", subtype: "通常", text: "以场上1张魔法/陷阱卡为对象并破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => {
        const opts = [...g.spells("me"), ...g.spells("ai"), g.field("me"), g.field("ai")].filter((c): c is Card => !!c).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("旋风：选择1张魔陷卡破坏", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const c = g.findCard(t[0]); if (c) await g.destroyST(c); } } }] } },
  { id: "heavystorm", name: "大风暴", type: "spell", subtype: "通常", text: "场上的全部魔法/陷阱卡破坏。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
      const all = [...g.spells("me"), ...g.spells("ai"), g.field("me"), g.field("ai")].filter((c): c is Card => !!c);
      for (const c of [...all]) await g.destroyST(c);
    } }] } },
  { id: "monsterreborn", name: "死者苏生", type: "spell", subtype: "通常", text: "以自己或对方墓地1只怪兽为对象并特殊召唤到己方场上。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => {
        const opts = [...g.graveyard("me"), ...g.graveyard("ai")].filter((c) => c.type === "monster").map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("死者苏生：选择墓地1只怪兽特殊召唤", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const c = g.findCard(t[0]); if (c) await g.specialSummon(c, g.activator!, "atk", "grave"); } } }] } },
  { id: "potofgreed", name: "贪欲之壶", type: "spell", subtype: "通常", text: "从卡组抽2张。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.draw(g.activator!, 2); } }] } },
  { id: "gracefulcharity", name: "天使之施", type: "spell", subtype: "通常", text: "从卡组抽3张，再丢弃2张手卡。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.draw(g.activator!, 3); await g.discard(g.activator!, 2); } }] } },
  { id: "changeofheart", name: "心变", type: "spell", subtype: "通常", text: "以对方场上1只怪兽为对象，直到结束阶段获得其控制权。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "心变：选择对方1只怪兽获得控制权", (m) => g.controller(m) !== g.activator, 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.changeControl(m, g.activator!, "turn_end"); } } }] } },
  { id: "shieldsword", name: "盾与剑", type: "spell", subtype: "通常", text: "直到回合结束，场上全部怪兽的原本攻守互换。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { g.swapAtkDefThisTurn(); } }] } },
  { id: "fissure", name: "地裂", type: "spell", subtype: "通常", text: "破坏对方场上攻击力最低的1只表侧表示怪兽。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
      const ms = g.monsters(g.opponent(g.activator!)).filter((m) => !m.faceDown);
      if (!ms.length) return;
      let low = ms[0]; for (const m of ms) if (g.stats(m).atk < g.stats(low).atk) low = m;
      await g.destroy(low);
    } }] } },
  { id: "smashing", name: "粉碎", type: "spell", subtype: "通常", text: "破坏对方场上守备力最高的1只表侧表示怪兽。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
      const ms = g.monsters(g.opponent(g.activator!)).filter((m) => !m.faceDown);
      if (!ms.length) return;
      let hi = ms[0]; for (const m of ms) if (g.stats(m).def > g.stats(hi).def) hi = m;
      await g.destroy(hi);
    } }] } },
  { id: "swords", name: "光之护封剑", type: "spell", subtype: "永续", text: "发动时对方全部怪兽变成表侧表示；对方在3回合内不能攻击。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
      for (const m of g.monsters(g.opponent(g.activator!))) await g.flipUp(m);
      g.setAttackLock(g.activator!, 3);
    } }] } },
  { id: "axeofdespair", name: "恶魔之斧", type: "spell", subtype: "装备", text: "装备怪兽攻击力上升1000。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "恶魔之斧：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.equip(self, m); } } }],
    continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 1000, defDelta: 0 } : { atkDelta: 0, defDelta: 0 } } },
  { id: "blackpendant", name: "黑项链", type: "spell", subtype: "装备", text: "装备怪兽攻击力上升500。此卡从场上送墓时，给与对方500伤害。", effect: {
    triggers: [
      { event: "manual", auto: false,
        acquireTargets: async (self, ev, g) => pickMonsters(g, "黑项链：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
        resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.equip(self, m); } } },
      { event: "sent_to_grave", auto: true,
        condition: (self, ev) => ev.card === self && ev.from === "field",
        resolve: async (self, ev, g) => { await g.damage(g.opponent(g.playerOf(self)), 500, "effect"); } }
    ],
    continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 500, defDelta: 0 } : { atkDelta: 0, defDelta: 0 } } },
  { id: "magepower", name: "魔法之力", type: "spell", subtype: "装备", text: "装备怪兽攻守上升自己场上魔法/陷阱卡数量×500。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "魔法之力：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.equip(self, m); } } }],
    continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 500 * g.countST(g.playerOf(self)), defDelta: 500 * g.countST(g.playerOf(self)) } : { atkDelta: 0, defDelta: 0 } } },
  { id: "united", name: "团结之力", type: "spell", subtype: "装备", text: "装备怪兽攻守上升自己场上怪兽数量×800。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "团结之力：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.equip(self, m); } } }],
    continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 800 * g.monsters(g.playerOf(self)).length, defDelta: 800 * g.monsters(g.playerOf(self)).length } : { atkDelta: 0, defDelta: 0 } } },
  { id: "yami", name: "暗", type: "spell", subtype: "场地", text: "场上恶魔族/魔法师族怪兽攻守上升200。", effect: { races: ["恶魔族", "魔法师族"],
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
    continuous: (self, mon, g) => self.effect!.races!.includes(mon.race!) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },
  { id: "mountain", name: "山", type: "spell", subtype: "场地", text: "场上龙族/鸟兽族/雷族怪兽攻守上升200。", effect: { races: ["龙族", "鸟兽族", "雷族"],
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
    continuous: (self, mon, g) => self.effect!.races!.includes(mon.race!) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },
  { id: "forest", name: "森", type: "spell", subtype: "场地", text: "场上昆虫族/兽族/兽战士族/植物族怪兽攻守上升200。", effect: { races: ["昆虫族", "兽族", "兽战士族", "植物族"],
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
    continuous: (self, mon, g) => self.effect!.races!.includes(mon.race!) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },

  /* ========================= 陷阱 ========================= */
  { id: "traphole", name: "落穴", type: "trap", subtype: "通常", text: "对方对攻击力1000以上的怪兽进行召唤/反转召唤/特殊召唤时，那只怪兽破坏。", effect: {
    triggers: [{ event: "summon", auto: false,
      condition: (self, ev, g) => ev.actor !== g.playerOf(self) && !ev.hidden && ev.summonKind !== "set" && g.stats(ev.monster!).atk >= 1000 && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { await g.destroy(ev.monster!); } }] } },
  { id: "mirrorforce", name: "神圣防护罩-反射镜力-", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，对方场上的攻击表示怪兽全部破坏。", effect: {
    triggers: [{ event: "attack_declare", auto: false,
      condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { for (const m of g.monsters(ev.attackerOwner!).filter((m) => m.position === "atk" && !m.faceDown)) await g.destroy(m); } }] } },
  { id: "sakuretsu", name: "炸裂装甲", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，那只怪兽破坏。", effect: {
    triggers: [{ event: "attack_declare", auto: false,
      condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { await g.destroy(ev.attacker!); } }] } },
  { id: "magiccylinder", name: "魔法筒", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，使攻击无效并给与对方其攻击力数值的伤害。", effect: {
    triggers: [{ event: "attack_declare", auto: false,
      condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { g.negateAttack(); await g.damage(ev.attackerOwner!, g.stats(ev.attacker!).atk, "effect"); } }] } },
  { id: "negateattack", name: "攻击无力化", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，使攻击无效，战斗阶段结束。", effect: {
    triggers: [{ event: "attack_declare", auto: false,
      condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { g.negateAttack(true); } }] } },
  { id: "dimensionalprison", name: "次元幽闭", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，那只怪兽除外。", effect: {
    triggers: [{ event: "attack_declare", auto: false,
      condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { g.negateAttack(); await g.banish(ev.attacker!); } }] } },
  { id: "waboku", name: "鸥之护符", type: "trap", subtype: "通常", text: "此回合，自己受到的战斗伤害为0。", effect: {
    triggers: [{ event: "attack_declare", auto: false,
      condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { g.setNoBattleDamage(g.playerOf(self)); } }] } },
  { id: "callofhaunted", name: "活死人的呼唤", type: "trap", subtype: "永续", text: "以自己墓地1只怪兽为对象特殊召唤。此卡离场时那只怪兽破坏，那只怪兽被破坏时此卡破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => self.turnSet < g.turn,
      acquireTargets: async (self, ev, g) => {
        const p = g.playerOf(self);
        const opts = g.graveyard(p).filter((c) => c.type === "monster").map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("活死人的呼唤：选择墓地1只怪兽特殊召唤", opts, 1);
      },
      resolve: async (self, ev, g, t) => {
        if (!t || !t[0]) return;
        const p = g.playerOf(self);
        const c = g.graveyard(p).find((x) => x.uid === t[0]); if (!c) return;
        await g.specialSummon(c, p, "atk", "grave");
        g.linkCards(self, c); // 互绑：任一离场则破坏另一个
      } }] } },
  { id: "torrential", name: "激流葬", type: "trap", subtype: "通常", text: "怪兽被召唤/反转召唤/特殊召唤时，场上全部怪兽破坏。", effect: {
    triggers: [{ event: "summon", auto: false,
      condition: (self, ev, g) => self.turnSet < g.turn,
      resolve: async (self, ev, g) => { for (const m of [...g.allMonsters()]) await g.destroy(m); } }] } },
  { id: "ringofdestruction", name: "破坏轮", type: "trap", subtype: "通常", text: "以场上1只表侧表示怪兽为对象破坏，双方受到其攻击力数值的伤害。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => self.turnSet < g.turn,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "破坏轮：选择1只表侧表示怪兽", (m) => !m.faceDown, 1),
      resolve: async (self, ev, g, t) => {
        if (!t || !t[0]) return;
        const m = g.findCard(t[0]); if (!m) return;
        const atk = g.stats(m).atk;
        await g.destroy(m);
        await g.damage("me", atk, "effect"); await g.damage("ai", atk, "effect");
      } }] } },
  { id: "dusttornado", name: "砂尘龙卷", type: "trap", subtype: "通常", text: "破坏对方场上1张魔法/陷阱卡。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => self.turnSet < g.turn,
      acquireTargets: async (self, ev, g) => {
        const opts = [...g.spells(g.opponent(g.playerOf(self))), g.field(g.opponent(g.playerOf(self)))].filter((c): c is Card => !!c).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("砂尘龙卷：选择对方1张魔陷卡破坏", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const c = g.findCard(t[0]); if (c) await g.destroyST(c); } } }] } },
  { id: "seventools", name: "王宫的敕命·七支刀", type: "trap", subtype: "反击", text: "反击陷阱：陷阱卡发动时可以发动。使其发动无效并破坏，支付1000基本分。", effect: {
    triggers: [{ event: "activate", auto: false,
      condition: (self, ev, g) => ev.card?.type === "trap" && ev.actor !== g.playerOf(self) && self.turnSet < g.turn,
      cost: async (self, ev, g) => { g.payLp(g.playerOf(self), 1000); },
      resolve: async (self, ev, g) => { g.negate(ev.link!); } }],
    speed: 3 } },
  { id: "magicjammer", name: "魔法干扰", type: "trap", subtype: "反击", text: "反击陷阱：魔法卡发动时可以发动。使其发动无效并破坏，丢弃1张手卡。", effect: {
    triggers: [{ event: "activate", auto: false,
      condition: (self, ev, g) => ev.card?.type === "spell" && ev.actor !== g.playerOf(self) && self.turnSet < g.turn,
      cost: async (self, ev, g) => { await g.discard(g.playerOf(self), 1); },
      resolve: async (self, ev, g) => { g.negate(ev.link!); } }],
    speed: 3 } },
  { id: "bottomless", name: "奈落的落穴", type: "trap", subtype: "通常", text: "对方对攻击力1500以上的怪兽进行召唤/特殊召唤时，那只怪兽破坏并除外。", effect: {
    triggers: [{ event: "summon", auto: false,
      condition: (self, ev, g) => ev.actor !== g.playerOf(self) && !ev.hidden && g.stats(ev.monster!).atk >= 1500 && self.turnSet < g.turn,
      resolve: async (self, ev, g) => { await g.banish(ev.monster!); } }] } },

  /* ========================= 元素英雄（游城十代） ========================= */
  { id: "ehero_avian", name: "元素英雄 羽翼侠", type: "monster", level: 4, attribute: "风", race: "鸟兽族", atk: 1000, def: 1000, password: "21844576", text: "操纵风翼的元素英雄。" },
  { id: "ehero_burstinatrix", name: "元素英雄 爆裂女郎", type: "monster", level: 4, attribute: "炎", race: "战士族", atk: 1200, def: 800, password: "58932615", text: "操纵火焰的元素英雄。" },
  { id: "ehero_clayman", name: "元素英雄 黏土侠", type: "monster", level: 4, attribute: "地", race: "岩石族", atk: 800, def: 2000, password: "84327329", text: "拥有坚固身体的元素英雄。" },
  { id: "ehero_sparkman", name: "元素英雄 电光侠", type: "monster", level: 4, attribute: "光", race: "战士族", atk: 1600, def: 1400, password: "20721928", text: "操纵雷电的元素英雄。" },
  { id: "ehero_bubbleman", name: "元素英雄 泡泡人", type: "monster", level: 4, attribute: "水", race: "战士族", atk: 800, def: 1200, password: "79979666", text: "此卡召唤·特殊召唤成功时，若自己手卡为0张，从卡组抽2张。", effect: {
    triggers: [{ event: "summon", auto: true,
      condition: (self, ev, g) => ev.monster === self && g.hand(g.playerOf(self)).length === 0,
      resolve: async (self, ev, g) => { await g.draw(g.playerOf(self), 2); } }] } },
  { id: "ehero_wildheart", name: "元素英雄 荒野侠", type: "monster", level: 4, attribute: "地", race: "兽战士族", atk: 1500, def: 1600, password: "86188410", trapImmune: true, text: "只要此卡在场上表侧表示存在，不受陷阱卡影响。" },
  { id: "ehero_bladedge", name: "元素英雄 刃锋侠", type: "monster", level: 7, attribute: "地", race: "兽战士族", atk: 2600, def: 1800, password: "59793705", text: "锋利刀刃的元素英雄。向守备表示怪兽攻击时给与贯穿伤害。", effect: {
    triggers: [{ event: "damage_calc", auto: true,
      condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
      resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target!).def; } }] } },
  { id: "ehero_stratos", name: "元素英雄 天空侠", type: "monster", level: 4, attribute: "风", race: "战士族", atk: 1800, def: 300, password: "40044918", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「元素英雄」怪兽加入手卡。", effect: {
    triggers: [{ event: "summon", auto: true,
      condition: (self, ev) => ev.monster === self,
      acquireTargets: async (self, ev, g) => {
        const p = g.playerOf(self);
        const opts = g.deck(p).filter((c) => c.cid && c.cid.startsWith("ehero_") && !c.fusion && c.cid !== "ehero_stratos").slice(0, 12).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("天空侠：将卡组1只「元素英雄」加入手卡", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const p = g.playerOf(self); const c = g.deck(p).find((x) => x.uid === t[0]); if (c) await g.addToHand(c, p); } } }] } },

  /* ---------- 融合怪兽（额外卡组） ---------- */
  { id: "ehero_flamewingman", name: "元素英雄 火焰翼人", type: "monster", level: 6, attribute: "风", race: "鸟兽族", atk: 2100, def: 1200, password: "35809262", fusion: { materials: ["ehero_avian", "ehero_burstinatrix"] }, text: "融合：羽翼侠+爆裂女郎。此卡战斗破坏怪兽送墓时，给与对方那只怪兽攻击力数值的伤害。", effect: {
    triggers: [{ event: "destroyed_by_battle", auto: true,
      condition: (self, ev) => ev.attacker === self,
      resolve: async (self, ev, g) => { await g.damage(g.opponent(g.playerOf(self)), g.stats(ev.card!).atk || 0, "effect"); } }] } },
  { id: "ehero_thundergiant", name: "元素英雄 雷霆巨人", type: "monster", level: 6, attribute: "光", race: "战士族", atk: 2400, def: 1500, password: "61204971", fusion: { materials: ["ehero_sparkman", "ehero_clayman"] }, text: "融合：电光侠+黏土侠。丢弃1张手卡，以1只攻击力在此卡以下的怪兽为对象破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => {
        const opts = g.allMonsters().filter((m) => m !== self && g.stats(m).atk <= g.stats(self).atk).map((m) => ({ value: m.uid, label: m.name, card: m }));
        if (!opts.length) return null;
        return g.askTargets("雷霆巨人：选择1只怪兽破坏", opts, 1);
      },
      cost: async (self, ev, g) => { await g.discard(g.playerOf(self), 1); },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.destroy(m); } } }] } },
  { id: "ehero_wildedge", name: "元素英雄 荒野大侠", type: "monster", level: 8, attribute: "地", race: "兽战士族", atk: 2600, def: 2300, password: "10526791", fusion: { materials: ["ehero_wildheart", "ehero_bladedge"] }, text: "融合：荒野侠+刃锋侠。向守备表示怪兽攻击时给与贯穿伤害。", effect: {
    triggers: [{ event: "damage_calc", auto: true,
      condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
      resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target!).def; } }] } },

  /* ========================= 机械族 ========================= */
  { id: "cyberdragon", name: "电子龙", type: "monster", level: 5, attribute: "光", race: "机械族", atk: 2100, def: 1600, password: "70095154", text: "对方场上有怪兽存在，自己场上没有怪兽的场合，此卡可从手牌特殊召唤。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.monsters(g.playerOf(self)).length === 0 && g.monsters(g.opponent(g.playerOf(self))).length > 0 && self.location === "hand",
      resolve: async (self, ev, g) => { await g.specialSummon(self, g.playerOf(self), "atk", "hand"); } }] } },
  { id: "jinzo", name: "人造人-念力震慑者", type: "monster", level: 6, attribute: "暗", race: "机械族", atk: 2400, def: 1500, password: "77585513", trapNegate: true, text: "只要此卡在场上表侧表示存在，场上的陷阱卡发动与效果无效。" },
  { id: "ancientgeargolem", name: "古代的机械巨人", type: "monster", level: 8, attribute: "地", race: "机械族", atk: 3000, def: 3000, password: "83104731", text: "向守备表示怪兽攻击时给与贯穿伤害。", effect: {
    triggers: [{ event: "damage_calc", auto: true,
      condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
      resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target!).def; } }] } },
  { id: "greengadget", name: "绿齿轮", type: "monster", level: 4, attribute: "地", race: "机械族", atk: 1400, def: 600, password: "41172955", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「红齿轮」加入手卡。", effect: {
    triggers: [{ event: "summon", auto: true, condition: (self, ev) => ev.monster === self, acquireTargets: _gadgetSearch("redgadget", "红齿轮"), resolve: _gadgetResolve() }] } },
  { id: "redgadget", name: "红齿轮", type: "monster", level: 4, attribute: "地", race: "机械族", atk: 1300, def: 1500, password: "86445415", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「黄齿轮」加入手卡。", effect: {
    triggers: [{ event: "summon", auto: true, condition: (self, ev) => ev.monster === self, acquireTargets: _gadgetSearch("yellowgadget", "黄齿轮"), resolve: _gadgetResolve() }] } },
  { id: "yellowgadget", name: "黄齿轮", type: "monster", level: 4, attribute: "地", race: "机械族", atk: 1300, def: 1200, password: "13839120", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「绿齿轮」加入手卡。", effect: {
    triggers: [{ event: "summon", auto: true, condition: (self, ev) => ev.monster === self, acquireTargets: _gadgetSearch("greengadget", "绿齿轮"), resolve: _gadgetResolve() }] } },
  { id: "reflectbounder", name: "反射盾士", type: "monster", level: 4, attribute: "光", race: "机械族", atk: 1700, def: 1000, password: "02851070", text: "对方怪兽对此表侧攻击表示的卡攻击宣言时，给与对方此卡攻击力数值的伤害。", effect: {
    triggers: [{ event: "attack_declare", auto: true,
      condition: (self, ev, g) => ev.target === self && self.position === "atk" && ev.attackerOwner !== g.playerOf(self),
      resolve: async (self, ev, g) => { await g.damage(ev.attackerOwner!, g.stats(self).atk, "effect"); } }] } },
  { id: "mechanicalchaser", name: "机械猎手", type: "monster", level: 4, attribute: "暗", race: "机械族", atk: 1850, def: 800, password: "07359741", text: "以机械部件构成的猎手。" },
  { id: "xheadcannon", name: "X-首领加农", type: "monster", level: 4, attribute: "光", race: "机械族", atk: 1800, def: 1500, password: "62651957", text: "搭载强力加农炮的机械怪兽。" },

  /* ========================= 经典魔法/陷阱 ========================= */
  { id: "polymerization", name: "融合", type: "spell", subtype: "通常", password: "24094653", text: "将自己场上或手牌的怪兽作为融合素材，融合召唤1只融合怪兽。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.extra(g.activator!).some((f) => f.fusion && f.fusion.materials.every((cid) => g.hasMaterial(g.activator!, cid))),
      acquireTargets: async (self, ev, g) => {
        const opts = g.extra(g.activator!).filter((f) => f.fusion && f.fusion.materials.every((cid) => g.hasMaterial(g.activator!, cid))).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("融合：选择要融合召唤的怪兽", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const f = g.findCard(t[0]); if (f) await g.fusionSummon(f, g.activator!); } } }] } },
  { id: "harpiesfeatherduster", name: "鹰身女妖的羽毛扫", type: "spell", subtype: "通常", password: "18144507", text: "对方场上的魔法·陷阱卡全部破坏。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
      const opp = g.opponent(g.activator!);
      const all = [...g.spells(opp), g.field(opp)].filter((c): c is Card => !!c);
      for (const c of [...all]) await g.destroyST(c);
    } }] } },
  { id: "prematureburial", name: "过早的埋葬", type: "spell", subtype: "装备", password: "70828912", text: "支付800基本分，以自己墓地1只怪兽为对象特殊召唤并装备。此卡离场时那只怪兽破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      cost: async (self, ev, g) => { g.payLp(g.activator!, 800); },
      acquireTargets: async (self, ev, g) => {
        const opts = g.graveyard(g.activator!).filter((c) => c.type === "monster").map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("过早的埋葬：选择墓地1只怪兽特殊召唤", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const c = g.findCard(t[0]); if (c) { await g.specialSummon(c, g.activator!, "atk", "grave"); g.linkCards(self, c); } } } }] } },
  { id: "gianttrunade", name: "大旋风", type: "spell", subtype: "通常", password: "42703248", text: "场上的魔法·陷阱卡全部回到持有者手卡。", effect: {
    triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
      const all = [...g.spells("me"), ...g.spells("ai"), g.field("me"), g.field("ai")].filter((c): c is Card => !!c);
      for (const c of [...all]) await g.bounce(c);
    } }] } },
  { id: "noblemanofcrossout", name: "抹杀之使徒", type: "spell", subtype: "通常", password: "71044499", text: "以场上1只里侧表示怪兽为对象破坏并除外，双方把同卡名的卡从卡组除外。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => {
        const opts = g.allMonsters().filter((m) => m.faceDown).map((m) => ({ value: m.uid, label: m.name, card: m }));
        if (!opts.length) return null;
        return g.askTargets("抹杀之使徒：选择1只里侧怪兽", opts, 1);
      },
      resolve: async (self, ev, g, t) => {
        if (!t || !t[0]) return;
        const m = g.findCard(t[0]); if (!m) return;
        const cid = m.cid;
        await g.banish(m);
        for (const key of ["me", "ai"] as PlayerKey[]) for (const c of [...g.deck(key)].filter((c) => c.cid === cid)) await g.banishFromDeck(c, key);
      } }] } },
  { id: "magicalstoneexcavation", name: "魔法石采掘", type: "spell", subtype: "通常", password: "98494543", text: "丢弃2张手卡，以自己墓地1张魔法卡为对象加入手卡。", effect: {
    triggers: [{ event: "manual", auto: false,
      cost: async (self, ev, g) => { await g.discard(g.activator!, 2); },
      acquireTargets: async (self, ev, g) => {
        const opts = g.graveyard(g.activator!).filter((c) => c.type === "spell").map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("魔法石采掘：将墓地1张魔法加入手卡", opts, 1);
      },
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const c = g.findCard(t[0]); if (c) await g.addToHand(c, g.activator!); } } }] } },
  { id: "solemnjudgment", name: "神之宣告", type: "trap", subtype: "反击", password: "41420027", text: "反击陷阱：怪兽召唤·反转召唤·特殊召唤或魔法·陷阱卡发动时可以发动并使其无效，支付一半基本分。", effect: {
    triggers: [
      { event: "summon_attempt", auto: false, speed: 3,
        condition: (self, ev, g) => ["normal", "tribute", "special", "set", "fusion"].includes(ev.summonKind!) && ev.actor !== g.playerOf(self) && self.turnSet < g.turn,
        cost: async (self, ev, g) => { g.payLp(g.playerOf(self), Math.floor(g.lp(g.playerOf(self)) / 2)); },
        resolve: async (self, ev, g) => { await g.negateSummon(ev.monster!); } },
      { event: "activate", auto: false, speed: 3,
        condition: (self, ev, g) => ev.actor !== g.playerOf(self) && (ev.card?.type === "spell" || ev.card?.type === "trap") && self.turnSet < g.turn,
        cost: async (self, ev, g) => { g.payLp(g.playerOf(self), Math.floor(g.lp(g.playerOf(self)) / 2)); },
        resolve: async (self, ev, g) => { g.negate(ev.link!); } }
    ],
    speed: 3 } },
  { id: "trapstun", name: "陷阱无力化", type: "trap", subtype: "通常", password: "59616123", text: "此回合，陷阱卡的效果无效。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => self.turnSet < g.turn,
      resolve: async (self, ev, g) => { g.setTrapStunThisTurn(); } }] } },

  /* ========================= 青眼白龙（海马濑人） ========================= */
  { id: "blueyes_ultimate", name: "青眼究极龙", type: "monster", level: 12, attribute: "光", race: "龙族", atk: 4500, def: 3800, password: "23995346", fusion: { materials: ["blueyes", "blueyes", "blueyes"] }, text: "融合：青眼白龙×3。以三头龙之姿君临的传说之龙。" },
  { id: "lordofdragons", name: "龙之支配者", type: "monster", level: 4, attribute: "暗", race: "魔法师族", atk: 1200, def: 1100, password: "17985575", text: "支配龙族的魔法师。场上有此卡时，可发动「唤龙笛」召唤手牌的龙族怪兽。" },
  { id: "kaibaman", name: "青眼贤士", type: "monster", level: 3, attribute: "光", race: "战士族", atk: 200, def: 700, password: "34627841", text: "解放此卡：从手牌特殊召唤1只「青眼白龙」。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => self.location === "monster" && g.hand(g.activator!).some((c) => c.cid === "blueyes"),
      cost: async (self, ev, g) => { await g.tribute(self); },
      resolve: async (self, ev, g) => { const c = g.hand(g.activator!).find((x) => x.cid === "blueyes"); if (c) await g.specialSummon(c, g.activator!, "atk", "hand"); } }] } },
  { id: "flute", name: "唤龙笛", type: "spell", subtype: "通常", password: "43973174", text: "场上有「龙之支配者」时，从手牌将最多2只龙族怪兽特殊召唤。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "lordofdragons") && g.hand(g.activator!).some((c) => c.type === "monster" && c.race === "龙族"),
      resolve: async (self, ev, g) => {
        const p = g.activator!;
        const summoned: string[] = [];
        for (let i = 0; i < 2; i++) {
          const opts: TargetOption[] = g.hand(p).filter((c) => c.type === "monster" && c.race === "龙族" && !summoned.includes(c.uid)).map((c) => ({ value: c.uid, label: c.name, card: c }));
          if (!opts.length) break;
          opts.push({ value: null, label: "完成", card: null });
          const r = await g.askTargets(`唤龙笛：特殊召唤龙族怪兽（${i + 1}/2，可完成）`, opts, 1);
          if (r[0] === null) break;
          const c = g.findCard(r[0]);
          if (c) { await g.specialSummon(c, p, "atk", "hand"); summoned.push(c.uid); }
        }
      } }] } },
  { id: "burststream", name: "白龙疾风弹", type: "spell", subtype: "通常", password: "02455462", text: "场上有「青眼白龙」时，对方场上的全部怪兽破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "blueyes" && g.controller(m) === g.activator),
      resolve: async (self, ev, g) => { for (const m of [...g.monsters(g.opponent(g.activator!))]) await g.destroy(m); } }] } },
  { id: "stamping", name: "粉碎爆裂", type: "spell", subtype: "通常", password: "81385346", text: "场上有「青眼白龙」时，对方场上的魔法·陷阱卡全部破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "blueyes" && g.controller(m) === g.activator),
      resolve: async (self, ev, g) => { const opp = g.opponent(g.activator!); const all = [...g.spells(opp), g.field(opp)].filter((c): c is Card => !!c); for (const c of [...all]) await g.destroyST(c); } }] } },

  /* ========================= 黑魔术师（武藤游戏） ========================= */
  { id: "darkmagiciangirl", name: "黑魔术少女", type: "monster", level: 6, attribute: "暗", race: "魔法师族", atk: 2000, def: 1700, password: "38033121", text: "双方墓地每有1只「黑魔术师」，此卡攻击力上升300。", effect: {
    continuous: (self, mon, g) => self === mon ? { atkDelta: 300 * (g.graveyard("me").filter((c) => c.cid === "darkmagician").length + g.graveyard("ai").filter((c) => c.cid === "darkmagician").length), defDelta: 0 } : { atkDelta: 0, defDelta: 0 } } },
  { id: "skilledwhitemagician", name: "熟练的白魔术师", type: "monster", level: 4, attribute: "光", race: "魔法师族", atk: 1700, def: 1900, password: "46363441", text: "精研魔法的年轻魔术师。" },
  { id: "thousandknives", name: "千把刀", type: "spell", subtype: "通常", password: "63391643", text: "场上有「黑魔术师」时，以对方场上1只怪兽为对象破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "darkmagician" && g.controller(m) === g.activator) && g.monsters(g.opponent(g.activator!)).length > 0,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "千把刀：选择对方1只怪兽破坏", (m) => g.controller(m) === g.opponent(g.activator!), 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.destroy(m); } } }] } },
  { id: "darkmagicattack", name: "黑·魔·导", type: "spell", subtype: "通常", password: "02314238", text: "场上有「黑魔术师」时，对方场上的魔法·陷阱卡全部破坏。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "darkmagician" && g.controller(m) === g.activator),
      resolve: async (self, ev, g) => { const opp = g.opponent(g.activator!); const all = [...g.spells(opp), g.field(opp)].filter((c): c is Card => !!c); for (const c of [...all]) await g.destroyST(c); } }] } },
  { id: "curtain", name: "黑魔术的幕帘", type: "spell", subtype: "通常", password: "99789342", text: "支付一半基本分：从手牌特殊召唤1只「黑魔术师」。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.hand(g.activator!).some((c) => c.cid === "darkmagician") && g.lp(g.activator!) > 1,
      cost: async (self, ev, g) => { g.payLp(g.activator!, Math.floor(g.lp(g.activator!) / 2)); },
      resolve: async (self, ev, g) => { const c = g.hand(g.activator!).find((x) => x.cid === "darkmagician"); if (c) await g.specialSummon(c, g.activator!, "atk", "hand"); } }] } },
  { id: "magiciancircle", name: "魔术师之阵", type: "trap", subtype: "通常", password: "00050755", text: "对方怪兽攻击宣言时：从卡组特殊召唤1只攻击力2000以下的魔法师族怪兽。", effect: {
    triggers: [{ event: "attack_declare", auto: false,
      condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn && g.deck(g.playerOf(self)).some((c) => c.type === "monster" && c.race === "魔法师族" && (c.atk || 0) <= 2000),
      resolve: async (self, ev, g) => {
        const p = g.playerOf(self);
        const c = g.deck(p).find((x) => x.type === "monster" && x.race === "魔法师族" && (x.atk || 0) <= 2000);
        if (c) await g.specialSummon(c, p, "def", "deck");
      } }] } },

  /* ========================= 真红眼黑龙（城之内克也） ========================= */
  { id: "redeyes", name: "真红眼黑龙", type: "monster", level: 7, attribute: "暗", race: "龙族", atk: 2400, def: 2000, password: "74677422", text: "拥有黑红色之眼的传说之龙。" },
  { id: "meteor", name: "流星之龙", type: "monster", level: 6, attribute: "地", race: "龙族", atk: 1800, def: 2000, password: "64271667", text: "自宇宙陨落的大地之龙。" },
  { id: "meteorb", name: "流星黑龙", type: "monster", level: 8, attribute: "炎", race: "龙族", atk: 3500, def: 2000, password: "90660762", fusion: { materials: ["redeyes", "meteor"] }, text: "融合：真红眼黑龙+流星之龙。燃烧的黑炎流星。" },
  { id: "infernofire", name: "黑炎弹", type: "spell", subtype: "通常", password: "69750536", text: "场上有「真红眼黑龙」时，给与对方2400伤害。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "redeyes" && g.controller(m) === g.activator),
      resolve: async (self, ev, g) => { await g.damage(g.opponent(g.activator!), 2400, "effect"); } }] } },
  { id: "metalmorph", name: "金属化·魔法反射装甲", type: "spell", subtype: "装备", password: "68540058", text: "装备怪兽攻击力·守备力上升400。", effect: {
    triggers: [{ event: "manual", auto: false,
      acquireTargets: async (self, ev, g) => pickMonsters(g, "金属化：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
      resolve: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.equip(self, m); } } }],
    continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 400, defDelta: 400 } : { atkDelta: 0, defDelta: 0 } } },

  /* ========================= 神鹰女郎（孔雀舞） ========================= */
  { id: "harpylady", name: "神鹰女郎", type: "monster", level: 4, attribute: "风", race: "鸟兽族", atk: 1300, def: 1400, password: "76812113", text: "拥有羽毛之翼的狩猎者。" },
  { id: "harpiesisters", name: "神鹰女郎三姐妹", type: "monster", level: 5, attribute: "风", race: "鸟兽族", atk: 1950, def: 2100, password: "12206212", text: "三体合一的神鹰女郎。" },
  { id: "elegantegotist", name: "万华镜-华丽的分身", type: "spell", subtype: "通常", password: "90219263", text: "场上有「神鹰女郎」时，从手牌或卡组特殊召唤1只神鹰系怪兽。", effect: {
    triggers: [{ event: "manual", auto: false,
      condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "harpylady" && g.controller(m) === g.activator),
      acquireTargets: async (self, ev, g) => {
        const p = g.activator!;
        const opts = [...g.hand(p), ...g.deck(p)].filter((c) => c.cid === "harpylady" || c.cid === "harpiesisters").slice(0, 9).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length) return null;
        return g.askTargets("万华镜：选择1只神鹰系怪兽特殊召唤", opts, 1);
      },
      resolve: async (self, ev, g, t) => {
        if (!t || !t[0]) return;
        const c = g.findCard(t[0]); if (!c) return;
        const from = g.hand(g.activator!).includes(c) ? "hand" : "deck";
        await g.specialSummon(c, g.activator!, "atk", from);
      } }] } },
  { id: "harpiespet", name: "神鹰的宠物龙", type: "monster", level: 7, attribute: "风", race: "龙族", atk: 2000, def: 2500, password: "52040216", text: "场上每有1只「神鹰女郎」，此卡攻击力·守备力上升300。", effect: {
    continuous: (self, mon, g) => self === mon ? { atkDelta: 300 * g.allMonsters().filter((m) => m.cid === "harpylady" && !m.faceDown).length, defDelta: 300 * g.allMonsters().filter((m) => m.cid === "harpylady" && !m.faceDown).length } : { atkDelta: 0, defDelta: 0 } } },

  /* ========================= 磁石战士（武藤游戏） ========================= */
  { id: "magnet_alpha", name: "磁石战士α", type: "monster", level: 4, attribute: "地", race: "岩石族", atk: 1400, def: 1700, password: "99785935", text: "以磁力合体的磁石战士。" },
  { id: "magnet_beta", name: "磁石战士β", type: "monster", level: 4, attribute: "地", race: "岩石族", atk: 1700, def: 1600, password: "39256679", text: "以磁力合体的磁石战士。" },
  { id: "magnet_gamma", name: "磁石战士γ", type: "monster", level: 4, attribute: "地", race: "岩石族", atk: 1500, def: 1800, password: "11549357", text: "以磁力合体的磁石战士。" },
  { id: "valkyrion", name: "磁石战士 电磁武神", type: "monster", level: 8, attribute: "地", race: "岩石族", atk: 3500, def: 3850, password: "75347539", text: "解放自己场上的磁石战士α·β·γ各1只，可从手牌特殊召唤。此卡被战斗破坏送墓时，从墓地特殊召唤三只磁石战士。", effect: {
    triggers: [
      { event: "manual", auto: false,
        condition: (self, ev, g) => self.location === "hand" && g.monsters(g.playerOf(self)).filter((m) => ["magnet_alpha", "magnet_beta", "magnet_gamma"].includes(m.cid)).length >= 3,
        cost: async (self, ev, g) => {
          const p = g.playerOf(self);
          for (const cid of ["magnet_alpha", "magnet_beta", "magnet_gamma"]) {
            const m = g.monsters(p).find((x) => x.cid === cid);
            if (m) await g.tribute(m);
          }
        },
        resolve: async (self, ev, g) => { await g.specialSummon(self, g.playerOf(self), "atk", "hand"); } },
      { event: "destroyed_by_battle", auto: true,
        condition: (self, ev) => ev.card === self,
        resolve: async (self, ev, g) => {
          const p = g.playerOf(self);
          for (const cid of ["magnet_alpha", "magnet_beta", "magnet_gamma"]) {
            const c = g.graveyard(p).find((x) => x.cid === cid);
            if (c) await g.specialSummon(c, p, "atk", "grave");
          }
        } }]
  } },
];

const CARD_BY_ID: Record<string, CardDef> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

// 卡组预设：经典 / 元素英雄(游城十代) / 机械族
const DECK_PRESETS: Record<string, { main: string[]; extra: string[] }> = {
  classic: {
    main: [
      "blueyes", "darkmagician", "summonedskull", "gaia",
      "celtic", "celtic", "gemini", "gemini", "axe", "axe", "battleox", "battleox",
      "lajinn", "stone", "stone", "silverfang", "mysticalelf", "mysticalelf",
      "maneater", "maneater", "oldvindictive", "magicianoffaith", "penguin",
      "yomiship", "giantgerm", "witch", "sangan", "exiled", "cannonsoldier",
      "goblin", "goblin", "speardragon", "kuriboh", "kuriboh", "sinisterserpent",
      "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "gracefulcharity",
      "changeofheart", "shieldsword", "fissure", "smashing", "axeofdespair", "axeofdespair",
      "blackpendant", "magepower", "united", "yami", "mountain", "forest",
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
      "negateattack", "dimensionalprison", "waboku", "waboku", "callofhaunted",
      "torrential", "ringofdestruction", "dusttornado", "seventools", "magicjammer", "bottomless",
      "swords", "heavystorm",
    ],
    extra: [],
  },
  hero: {
    main: [
      "ehero_avian", "ehero_avian", "ehero_burstinatrix", "ehero_burstinatrix",
      "ehero_clayman", "ehero_clayman", "ehero_sparkman", "ehero_sparkman",
      "ehero_bubbleman", "ehero_bubbleman", "ehero_wildheart", "ehero_wildheart",
      "ehero_bladedge", "ehero_stratos", "ehero_stratos",
      "polymerization", "polymerization", "polymerization",
      "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "gracefulcharity",
      "harpiesfeatherduster", "gianttrunade", "prematureburial", "axeofdespair", "magepower",
      "changeofheart", "shieldsword", "fissure", "smashing",
      "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack",
      "waboku", "callofhaunted", "torrential", "bottomless", "solemnjudgment", "trapstun",
      "swords",
    ],
    extra: ["ehero_flamewingman", "ehero_flamewingman", "ehero_flamewingman", "ehero_thundergiant", "ehero_thundergiant", "ehero_wildedge"],
  },
  machine: {
    main: [
      "cyberdragon", "cyberdragon", "cyberdragon", "jinzo", "jinzo",
      "ancientgeargolem", "ancientgeargolem",
      "greengadget", "greengadget", "redgadget", "redgadget", "yellowgadget", "yellowgadget",
      "mechanicalchaser", "mechanicalchaser", "xheadcannon", "xheadcannon",
      "reflectbounder", "reflectbounder", "goblin", "goblin", "cannonsoldier",
      "witch", "sangan", "kuriboh",
      "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "gracefulcharity",
      "harpiesfeatherduster", "gianttrunade", "prematureburial", "axeofdespair", "axeofdespair", "magepower", "united",
      "smashing", "fissure", "changeofheart",
      "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "torrential", "bottomless",
      "solemnjudgment", "ringofdestruction", "dusttornado", "trapstun", "swords",
    ],
    extra: [],
  },
  /* ---------- 青眼白龙（海马濑人） ---------- */
  blueeyes: {
    main: [
      "blueyes", "blueyes", "blueyes", "kaibaman", "kaibaman", "kaibaman",
      "lordofdragons", "lordofdragons", "flute", "flute",
      "burststream", "burststream", "stamping",
      "gemini", "gemini", "lajinn", "lajinn", "celtic", "battleox",
      "polymerization", "polymerization", "potofgreed", "potofgreed", "gracefulcharity",
      "monsterreborn", "raigeki", "darkhole", "mst", "changeofheart", "swords",
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
      "negateattack", "waboku", "waboku", "torrential", "bottomless", "callofhaunted",
    ],
    extra: ["blueyes_ultimate", "blueyes_ultimate"],
  },
  /* ---------- 黑魔术师（武藤游戏） ---------- */
  darkmagician: {
    main: [
      "darkmagician", "darkmagician", "darkmagician",
      "darkmagiciangirl", "darkmagiciangirl", "skilledwhitemagician", "skilledwhitemagician",
      "gemini", "gemini", "mysticalelf", "mysticalelf", "celtic",
      "thousandknives", "thousandknives", "darkmagicattack", "curtain", "curtain",
      "magiciancircle", "magiciancircle",
      "potofgreed", "potofgreed", "gracefulcharity", "monsterreborn",
      "raigeki", "darkhole", "mst", "changeofheart", "swords",
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "magiccylinder",
      "negateattack", "waboku", "waboku", "torrential", "bottomless", "callofhaunted",
    ],
    extra: [],
  },
  /* ---------- 真红眼黑龙（城之内克也） ---------- */
  redeyes: {
    main: [
      "redeyes", "redeyes", "redeyes", "meteor", "meteor",
      "battleox", "battleox", "goblin", "goblin", "gemini", "lajinn", "celtic", "speardragon",
      "polymerization", "polymerization", "infernofire", "infernofire", "metalmorph", "metalmorph",
      "potofgreed", "potofgreed", "gracefulcharity", "monsterreborn",
      "raigeki", "darkhole", "mst", "changeofheart", "swords",
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
      "negateattack", "waboku", "waboku", "torrential", "bottomless", "callofhaunted",
    ],
    extra: ["meteorb", "meteorb"],
  },
  /* ---------- 神鹰女郎（孔雀舞） ---------- */
  harpie: {
    main: [
      "harpylady", "harpylady", "harpylady", "harpiesisters", "harpiesisters",
      "harpiespet", "harpiespet", "elegantegotist", "elegantegotist",
      "harpiesfeatherduster", "harpiesfeatherduster",
      "celtic", "celtic", "battleox", "lajinn", "gemini",
      "potofgreed", "potofgreed", "gracefulcharity", "monsterreborn",
      "raigeki", "darkhole", "mst", "changeofheart", "swords", "magepower", "fissure",
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
      "negateattack", "waboku", "waboku", "torrential", "bottomless", "callofhaunted", "dusttornado",
    ],
    extra: [],
  },
  /* ---------- 磁石战士（武藤游戏） ---------- */
  magnet: {
    main: [
      "magnet_alpha", "magnet_alpha", "magnet_alpha",
      "magnet_beta", "magnet_beta", "magnet_beta",
      "magnet_gamma", "magnet_gamma", "magnet_gamma",
      "valkyrion", "valkyrion", "valkyrion",
      "stone", "stone", "goblin", "goblin", "battleox", "gemini",
      "potofgreed", "potofgreed", "gracefulcharity", "monsterreborn",
      "raigeki", "darkhole", "mst", "changeofheart", "swords", "fissure",
      "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
      "negateattack", "waboku", "waboku", "torrential", "bottomless", "callofhaunted",
    ],
    extra: [],
  },
};

function buildDeck(preset: string): string[] {
  const def = DECK_PRESETS[preset || "classic"];
  const counts: Record<string, number> = {};
  for (const id of def.main) if (window.YGO_CARD_BY_ID[id]) counts[id] = (counts[id] || 0) + 1;
  const deck: string[] = [];
  for (const id of Object.keys(counts)) for (let i = 0; i < counts[id]; i++) deck.push(id);
  return deck.slice(0, 40);
}
function buildExtra(preset: string): string[] {
  const def = DECK_PRESETS[preset || "classic"];
  return (def.extra || []).filter((id) => window.YGO_CARD_BY_ID[id]);
}

// 卡密（ygoprodeck 官方密码，8 位）—— 现有卡补齐
const PASSWORDS: Record<string, string> = {
  blueyes:"89631139", darkmagician:"46986414", summonedskull:"70781052", gaia:"06368038",
  celtic:"91152256", gemini:"69140098", stone:"13039848", silverfang:"90357090",
  mysticalelf:"15025844", axe:"48305365", battleox:"05053103", lajinn:"97590747",
  maneater:"54652250", oldvindictive:"45141844", magicianoffaith:"31560081", penguin:"93920745",
  yomiship:"51534754", giantgerm:"95178994", witch:"78010363", sangan:"26202165",
  exiled:"74131780", cannonsoldier:"11384280", goblin:"78658564", speardragon:"31553716",
  kuriboh:"40640057", sinisterserpent:"08131171",
  raigeki:"12580477", darkhole:"53129443", mst:"05318639", heavystorm:"19613556",
  monsterreborn:"83764718", potofgreed:"55144522", gracefulcharity:"79571449", changeofheart:"04031928",
  shieldsword:"52097679", fissure:"66788016", smashing:"97169186", swords:"72302403",
  axeofdespair:"40619825", blackpendant:"65169794", magepower:"83746708", united:"56747793",
  yami:"59197169", mountain:"50913601", forest:"87430998",
  traphole:"04206964", mirrorforce:"44095762", sakuretsu:"56120475", magiccylinder:"62279055",
  negateattack:"14315573", dimensionalprison:"70342110", waboku:"12607053", callofhaunted:"97077563",
  torrential:"53582587", ringofdestruction:"83555666", dusttornado:"60082869", seventools:"03819470",
  magicjammer:"77414722", bottomless:"29401950",
};
CARDS.forEach((c) => { if (!c.password && PASSWORDS[c.id]) c.password = PASSWORDS[c.id]; });

window.YGO_CARDS = CARDS;
window.YGO_CARD_BY_ID = CARD_BY_ID;
window.YGO_BUILD_DECK = buildDeck;
window.YGO_BUILD_EXTRA = buildExtra;
window.YGO_DECK_PRESETS = Object.keys(DECK_PRESETS);
