"use strict";
/*
 * 游戏王·卡牌数据与处理器（事件驱动版，TypeScript）
 *  每张卡的 effect.triggers 声明：{ event, auto, condition?, cost?, acquireTargets?, resolve? }
 *  永续/场地/装备另声明 effect.continuous: (self, mon, g) => { atkDelta, defDelta }
 *  所有特殊处理都在此文件内，通过 g 原语操作；引擎不认识任何具体卡。
 */
// 工具：构造"选 N 个场上怪兽"的目标获取
function pickMonsters(g, msg, filter, count) {
    const opts = g.allMonsters().filter(filter).map((m) => ({ value: m.uid, label: m.name, card: m }));
    if (!opts.length)
        return Promise.resolve(null);
    return g.askTargets(msg, opts, count);
}
// 齿轮检索（绿/红/黄互搜）
function _gadgetSearch(cid, label) {
    return async (self, ev, g) => {
        const p = g.playerOf(self);
        const opts = g.deck(p).filter((c) => c.cid === cid).slice(0, 6).map((c) => ({ value: c.uid, label: c.name, card: c }));
        if (!opts.length)
            return null;
        return g.askTargets(`将卡组1只「${label}」加入手卡`, opts, 1);
    };
}
function _gadgetResolve() {
    return async (self, ev, g, t) => {
        if (t && t[0]) {
            const p = g.playerOf(self);
            const c = g.deck(p).find((x) => x.uid === t[0]);
            if (c)
                await g.addToHand(c, p);
        }
    };
}
const CARDS = [
    /* ========================= 通常怪兽 ========================= */
    { id: "blueyes", password: "89631139", name: "青眼白龙", type: "monster", level: 8, attribute: "光", race: "龙族", atk: 3000, def: 2500, text: "以高攻击力著称的传说之龙。" },
    { id: "darkmagician", password: "46986414", name: "黑魔术师", type: "monster", level: 7, attribute: "暗", race: "魔法师族", atk: 2500, def: 2100, text: "魔术师的终极王牌。" },
    { id: "summonedskull", password: "70781052", name: "暗黑之恶魔", type: "monster", level: 6, attribute: "暗", race: "恶魔族", atk: 2500, def: 1200, text: "召唤雷电的恶魔。" },
    { id: "gaia", password: "06368038", name: "暗黑骑士盖亚", type: "monster", level: 7, attribute: "地", race: "战士族", atk: 2300, def: 2100, text: "骑乘骏马的疾风骑士。" },
    { id: "celtic", password: "91152256", name: "精灵剑士", type: "monster", level: 4, attribute: "地", race: "战士族", atk: 1400, def: 1200, text: "精灵族的剑士。" },
    { id: "gemini", password: "69140098", name: "双子妖精", type: "monster", level: 4, attribute: "地", race: "魔法师族", atk: 1900, def: 900, text: "心灵相通的双子妖精。" },
    { id: "stone", password: "13039848", name: "岩石巨兵", type: "monster", level: 3, attribute: "地", race: "岩石族", atk: 1300, def: 2000, text: "坚如磐石的巨兵。" },
    { id: "silverfang", password: "90357090", name: "银牙之狼", type: "monster", level: 3, attribute: "地", race: "兽族", atk: 1200, def: 800, text: "银色獠牙的狼王。" },
    { id: "mysticalelf", password: "15025844", name: "神秘之精灵", type: "monster", level: 4, attribute: "光", race: "魔法师族", atk: 800, def: 2000, text: "以祈祷守护同伴的精灵。" },
    { id: "axe", password: "48305365", name: "斧突袭者", type: "monster", level: 4, attribute: "地", race: "战士族", atk: 1700, def: 1150, text: "挥舞巨斧的战士。" },
    { id: "battleox", password: "05053103", name: "米诺陶洛斯", type: "monster", level: 4, attribute: "地", race: "兽战士族", atk: 1700, def: 1000, text: "牛头战士。" },
    { id: "lajinn", password: "97590747", name: "灯之魔人", type: "monster", level: 4, attribute: "暗", race: "恶魔族", atk: 1800, def: 1000, text: "寄宿于神灯的魔人。" },
    /* ========================= 效果怪兽 ========================= */
    { id: "maneater", password: "54652250", name: "食人虫", type: "monster", level: 2, attribute: "地", race: "昆虫族", atk: 450, def: 600, text: "翻转：破坏场上1只怪兽。", effect: {
            triggers: [{ event: "flip", auto: true,
                    condition: (self, ev) => ev.monster === self,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "食人虫：选择1只怪兽破坏", (m) => m !== self, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.destroy(m);
                    } } }]
        } },
    { id: "oldvindictive", password: "45141844", name: "报复之老魔术师", type: "monster", level: 2, attribute: "暗", race: "魔法师族", atk: 450, def: 600, text: "翻转：破坏对方场上1只怪兽。", effect: {
            triggers: [{ event: "flip", auto: true,
                    condition: (self, ev) => ev.monster === self,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "报复之老魔术师：选择对方1只怪兽破坏", (m) => g.controller(m) !== self.controller, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.destroy(m);
                    } } }]
        } },
    { id: "magicianoffaith", password: "31560081", name: "信仰之魔术师", type: "monster", level: 1, attribute: "光", race: "魔法师族", atk: 300, def: 400, text: "翻转：将自己墓地1张魔法卡加入手卡。", effect: {
            triggers: [{ event: "flip", auto: true,
                    condition: (self, ev) => ev.monster === self,
                    acquireTargets: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        const opts = g.graveyard(p).filter((c) => c.type === "spell").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("信仰之魔术师：将墓地1张魔法加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const p = g.playerOf(self);
                        const c = g.graveyard(p).find((x) => x.uid === t[0]);
                        if (c)
                            await g.recoverToHand(c, p);
                    } } }]
        } },
    { id: "penguin", password: "93920745", name: "企鹅士兵", type: "monster", level: 2, attribute: "水", race: "水族", atk: 750, def: 500, text: "翻转：最多将场上2只怪兽弹回持有者手卡。", effect: {
            triggers: [{ event: "flip", auto: true,
                    condition: (self, ev) => ev.monster === self,
                    acquireTargets: async (self, ev, g) => {
                        const picked = [];
                        for (let i = 0; i < 2; i++) {
                            const opts = g.allMonsters().filter((m) => m !== self && !picked.includes(m.uid)).map((m) => ({ value: m.uid, label: m.name, card: m }));
                            if (!opts.length)
                                break;
                            opts.push({ value: null, label: "完成", card: null });
                            const r = await g.askTargets(`企鹅士兵：选择要弹回的怪兽（${i + 1}/2，可完成）`, opts, 1);
                            if (r[0] === null)
                                break;
                            picked.push(r[0]);
                        }
                        return picked.length ? picked : null;
                    },
                    resolve: async (self, ev, g, t) => { if (t)
                        for (const uid of t) {
                            const m = g.findCard(uid);
                            if (m)
                                await g.bounce(m);
                        } } }]
        } },
    { id: "yomiship", password: "51534754", name: "死者之船", type: "monster", level: 3, attribute: "水", race: "水族", atk: 900, def: 500, text: "此卡被战斗破坏送墓时：破坏破坏它的怪兽。", effect: {
            triggers: [{ event: "destroyed_by_battle", auto: true,
                    condition: (self, ev) => ev.card === self,
                    resolve: async (self, ev, g) => { if (ev.attacker && g.isValid(ev.attacker))
                        await g.destroy(ev.attacker); } }]
        } },
    { id: "giantgerm", password: "95178994", name: "巨大病毒", type: "monster", level: 2, attribute: "暗", race: "恶魔族", atk: 1000, def: 100, text: "此卡被战斗破坏送墓时：对方受500伤害，并从卡组特召最多2只「巨大病毒」。", effect: {
            triggers: [{ event: "destroyed_by_battle", auto: true,
                    condition: (self, ev) => ev.card === self,
                    resolve: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        await g.damage(g.opponent(p), 500, "effect");
                        const copies = g.deck(p).filter((c) => c.cid === "giantgerm").slice(0, 2);
                        for (const c of copies) {
                            await g.specialSummon(c, p, "atk", "deck");
                        }
                    } }]
        } },
    { id: "witch", password: "78010363", name: "黑森林的魔女", type: "monster", level: 4, attribute: "暗", race: "魔法师族", atk: 1100, def: 1200, text: "此卡从场上送墓时：将卡组中1只守备力1500以下的怪兽加入手卡。", effect: {
            triggers: [{ event: "sent_to_grave", auto: true,
                    condition: (self, ev) => ev.card === self && ev.from === "field",
                    acquireTargets: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        const opts = g.deck(p).filter((c) => c.type === "monster" && (c.def || 0) <= 1500).slice(0, 12).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("黑森林的魔女：将卡组1只守备力1500以下怪兽加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const p = g.playerOf(self);
                        const c = g.deck(p).find((x) => x.uid === t[0]);
                        if (c)
                            await g.addToHand(c, p);
                    } } }]
        } },
    { id: "sangan", password: "26202165", name: "三眼怪", type: "monster", level: 3, attribute: "暗", race: "恶魔族", atk: 1000, def: 600, text: "此卡从场上送墓时：将卡组中1只攻击力1500以下的怪兽加入手卡。", effect: {
            triggers: [{ event: "sent_to_grave", auto: true,
                    condition: (self, ev) => ev.card === self && ev.from === "field",
                    acquireTargets: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        const opts = g.deck(p).filter((c) => c.type === "monster" && (c.atk || 0) <= 1500).slice(0, 12).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("三眼怪：将卡组1只攻击力1500以下怪兽加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const p = g.playerOf(self);
                        const c = g.deck(p).find((x) => x.uid === t[0]);
                        if (c)
                            await g.addToHand(c, p);
                    } } }]
        } },
    { id: "exiled", password: "74131780", name: "流放之战士", type: "monster", level: 4, attribute: "地", race: "战士族", atk: 1000, def: 1000, text: "起动：解放此卡；破坏场上1只怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "流放之战士：选择1只怪兽破坏", (m) => m !== self, 1),
                    cost: async (self, ev, g) => { await g.tribute(self); },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.destroy(m);
                    } } }]
        } },
    { id: "cannonsoldier", password: "11384280", name: "加农炮兵", type: "monster", level: 4, attribute: "暗", race: "机械族", atk: 1400, def: 1300, text: "起动：解放自己场上1只怪兽；给与对方500伤害。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "加农炮兵：选择1只己方怪兽解放", (m) => g.controller(m) === self.controller && m !== self, 1),
                    resolve: async (self, ev, g, t) => {
                        if (!t || !t[0])
                            return;
                        const m = g.findCard(t[0]);
                        if (!m)
                            return;
                        await g.tribute(m);
                        await g.damage(g.opponent(self.controller), 500, "effect");
                    } }]
        } },
    { id: "goblin", password: "78658564", name: "哥布林突击部队", type: "monster", level: 4, attribute: "地", race: "兽战士族", atk: 2300, def: 0, text: "此卡攻击的场合，战斗阶段结束时变成守备表示。", effect: {
            triggers: [{ event: "damage_step_end", auto: true,
                    condition: (self, ev) => ev.attacker === self && self.position === "atk",
                    resolve: async (self, ev, g) => { await g.changePosition(self, "def"); } }]
        } },
    { id: "speardragon", password: "31553716", name: "长枪龙", type: "monster", level: 4, attribute: "风", race: "龙族", atk: 1900, def: 0, text: "贯穿；此卡攻击的场合，伤害步骤后变成守备表示。", effect: {
            triggers: [
                { event: "damage_calc", auto: true,
                    condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
                    resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target).def; } },
                { event: "damage_step_end", auto: true,
                    condition: (self, ev) => ev.attacker === self && self.position === "atk",
                    resolve: async (self, ev, g) => { await g.changePosition(self, "def"); } }
            ]
        } },
    { id: "kuriboh", password: "40640057", name: "栗子球", type: "monster", level: 1, attribute: "暗", race: "恶魔族", atk: 300, def: 200, text: "伤害计算时：将手卡中此卡丢弃，使该次战斗对自己造成的战斗伤害为0。", effect: { speed: 2,
            triggers: [{ event: "damage_calc", auto: false,
                    condition: (self, ev) => ev.damageTo === self.controller && self.location === "hand" && (ev.damage || 0) > 0,
                    cost: async (self, ev, g) => { await g.discardCard(self); },
                    resolve: async (self, ev, g) => { g.negateBattleDamage(); } }] } },
    { id: "sinisterserpent", password: "08131171", name: "阴险之蛇", type: "monster", level: 1, attribute: "水", race: "爬虫类族", atk: 300, def: 200, text: "自己的准备阶段，若此卡在墓地：可将此卡加入手卡。", effect: {
            triggers: [{ event: "phase_start", auto: true,
                    condition: (self, ev, g) => ev.phase === "standby" && self.location === "grave" && g.playerOf(self) === ev.player,
                    resolve: async (self, ev, g) => { await g.recoverToHand(self, g.playerOf(self)); } }]
        } },
    /* ========================= 魔法 ========================= */
    { id: "raigeki", password: "12580477", name: "雷击", type: "spell", subtype: "通常", text: "对方场上的全部怪兽破坏。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { for (const m of [...g.monsters(g.opponent(g.activator))])
                        await g.destroy(m); } }]
        } },
    { id: "darkhole", password: "53129443", name: "黑洞", type: "spell", subtype: "通常", text: "场上全部怪兽破坏。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { for (const m of [...g.allMonsters()])
                        await g.destroy(m); } }]
        } },
    { id: "mst", password: "05318639", name: "旋风", type: "spell", subtype: "通常", text: "以场上1张魔法/陷阱卡为对象并破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => {
                        const opts = [...g.spells("me"), ...g.spells("ai"), g.field("me"), g.field("ai")].filter((c) => !!c).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("旋风：选择1张魔陷卡破坏", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.findCard(t[0]);
                        if (c)
                            await g.destroyST(c);
                    } } }]
        } },
    { id: "heavystorm", password: "19613556", name: "大风暴", type: "spell", subtype: "通常", text: "场上的全部魔法/陷阱卡破坏。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
                        const all = [...g.spells("me"), ...g.spells("ai"), g.field("me"), g.field("ai")].filter((c) => !!c);
                        for (const c of [...all])
                            await g.destroyST(c);
                    } }]
        } },
    { id: "monsterreborn", password: "83764719", name: "死者苏生", type: "spell", subtype: "通常", text: "以自己或对方墓地1只怪兽为对象并特殊召唤到己方场上。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => {
                        const opts = [...g.graveyard("me"), ...g.graveyard("ai")].filter((c) => c.type === "monster").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("死者苏生：选择墓地1只怪兽特殊召唤", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.findCard(t[0]);
                        if (c)
                            await g.specialSummon(c, g.activator, "atk", "grave");
                    } } }]
        } },
    { id: "potofgreed", password: "55144522", name: "贪欲之壶", type: "spell", subtype: "通常", text: "从卡组抽2张。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.draw(g.activator, 2); } }]
        } },
    { id: "gracefulcharity", password: "79571449", name: "天使之施", type: "spell", subtype: "通常", text: "从卡组抽3张，再丢弃2张手卡。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.draw(g.activator, 3); await g.discard(g.activator, 2); } }]
        } },
    { id: "changeofheart", password: "04031928", name: "心变", type: "spell", subtype: "通常", text: "以对方场上1只怪兽为对象，直到结束阶段获得其控制权。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "心变：选择对方1只怪兽获得控制权", (m) => g.controller(m) !== g.activator, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.changeControl(m, g.activator, "turn_end");
                    } } }]
        } },
    { id: "shieldsword", password: "52097679", name: "盾与剑", type: "spell", subtype: "通常", text: "直到回合结束，场上全部怪兽的原本攻守互换。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { g.swapAtkDefThisTurn(); } }]
        } },
    { id: "fissure", password: "66788016", name: "地裂", type: "spell", subtype: "通常", text: "破坏对方场上攻击力最低的1只表侧表示怪兽。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
                        const ms = g.monsters(g.opponent(g.activator)).filter((m) => !m.faceDown);
                        if (!ms.length)
                            return;
                        let low = ms[0];
                        for (const m of ms)
                            if (g.stats(m).atk < g.stats(low).atk)
                                low = m;
                        await g.destroy(low);
                    } }]
        } },
    { id: "smashing", password: "97169186", name: "粉碎", type: "spell", subtype: "通常", text: "破坏对方场上守备力最高的1只表侧表示怪兽。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
                        const ms = g.monsters(g.opponent(g.activator)).filter((m) => !m.faceDown);
                        if (!ms.length)
                            return;
                        let hi = ms[0];
                        for (const m of ms)
                            if (g.stats(m).def > g.stats(hi).def)
                                hi = m;
                        await g.destroy(hi);
                    } }]
        } },
    { id: "swords", password: "72302403", name: "光之护封剑", type: "spell", subtype: "永续", text: "发动时对方全部怪兽变成表侧表示；对方在3回合内不能攻击。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
                        for (const m of g.monsters(g.opponent(g.activator)))
                            await g.flipUp(m);
                        g.setAttackLock(g.activator, 3);
                    } }]
        } },
    { id: "axeofdespair", password: "40619825", name: "恶魔之斧", type: "spell", subtype: "装备", text: "装备怪兽攻击力上升1000。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "恶魔之斧：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.equip(self, m);
                    } } }],
            continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 1000, defDelta: 0 } : { atkDelta: 0, defDelta: 0 }
        } },
    { id: "blackpendant", password: "65169794", name: "黑项链", type: "spell", subtype: "装备", text: "装备怪兽攻击力上升500。此卡从场上送墓时，给与对方500伤害。", effect: {
            triggers: [
                { event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "黑项链：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.equip(self, m);
                    } } },
                { event: "sent_to_grave", auto: true,
                    condition: (self, ev) => ev.card === self && ev.from === "field",
                    resolve: async (self, ev, g) => { await g.damage(g.opponent(g.playerOf(self)), 500, "effect"); } }
            ],
            continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 500, defDelta: 0 } : { atkDelta: 0, defDelta: 0 }
        } },
    { id: "magepower", password: "83746708", name: "魔法之力", type: "spell", subtype: "装备", text: "装备怪兽攻守上升自己场上魔法/陷阱卡数量×500。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "魔法之力：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.equip(self, m);
                    } } }],
            continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 500 * g.countST(g.playerOf(self)), defDelta: 500 * g.countST(g.playerOf(self)) } : { atkDelta: 0, defDelta: 0 }
        } },
    { id: "united", password: "56747793", name: "团结之力", type: "spell", subtype: "装备", text: "装备怪兽攻守上升自己场上怪兽数量×800。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "团结之力：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.equip(self, m);
                    } } }],
            continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 800 * g.monsters(g.playerOf(self)).length, defDelta: 800 * g.monsters(g.playerOf(self)).length } : { atkDelta: 0, defDelta: 0 }
        } },
    { id: "yami", password: "59197169", name: "暗", type: "spell", subtype: "场地", text: "场上恶魔族/魔法师族怪兽攻守上升200。", effect: { races: ["恶魔族", "魔法师族"],
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
            continuous: (self, mon, g) => self.effect.races.includes(mon.race) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },
    { id: "mountain", password: "50913601", name: "山", type: "spell", subtype: "场地", text: "场上龙族/鸟兽族/雷族怪兽攻守上升200。", effect: { races: ["龙族", "鸟兽族", "雷族"],
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
            continuous: (self, mon, g) => self.effect.races.includes(mon.race) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },
    { id: "forest", password: "87430998", name: "森", type: "spell", subtype: "场地", text: "场上昆虫族/兽族/兽战士族/植物族怪兽攻守上升200。", effect: { races: ["昆虫族", "兽族", "兽战士族", "植物族"],
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
            continuous: (self, mon, g) => self.effect.races.includes(mon.race) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },
    /* ========================= 陷阱 ========================= */
    { id: "traphole", password: "04206964", name: "落穴", type: "trap", subtype: "通常", text: "对方对攻击力1000以上的怪兽进行召唤/反转召唤/特殊召唤时，那只怪兽破坏。", effect: {
            triggers: [{ event: "summon", auto: false,
                    condition: (self, ev, g) => ev.actor !== g.playerOf(self) && !ev.hidden && ev.summonKind !== "set" && g.stats(ev.monster).atk >= 1000 && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { await g.destroy(ev.monster); } }]
        } },
    { id: "mirrorforce", password: "44095762", name: "神圣防护罩-反射镜力-", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，对方场上的攻击表示怪兽全部破坏。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { for (const m of g.monsters(ev.attackerOwner).filter((m) => m.position === "atk" && !m.faceDown))
                        await g.destroy(m); } }]
        } },
    { id: "sakuretsu", password: "56120475", name: "炸裂装甲", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，那只怪兽破坏。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { await g.destroy(ev.attacker); } }]
        } },
    { id: "magiccylinder", password: "62279055", name: "魔法筒", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，使攻击无效并给与对方其攻击力数值的伤害。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { g.negateAttack(); await g.damage(ev.attackerOwner, g.stats(ev.attacker).atk, "effect"); } }]
        } },
    { id: "negateattack", password: "14315573", name: "攻击无力化", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，使攻击无效，战斗阶段结束。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { g.negateAttack(true); } }]
        } },
    { id: "dimensionalprison", password: "70342110", name: "次元幽闭", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，那只怪兽除外。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { g.negateAttack(); await g.banish(ev.attacker); } }]
        } },
    { id: "waboku", password: "12607053", name: "鸥之护符", type: "trap", subtype: "通常", text: "此回合，自己受到的战斗伤害为0。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { g.setNoBattleDamage(g.playerOf(self)); } }]
        } },
    { id: "callofhaunted", password: "97077563", name: "活死人的呼唤", type: "trap", subtype: "永续", text: "以自己墓地1只怪兽为对象特殊召唤。此卡离场时那只怪兽破坏，那只怪兽被破坏时此卡破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.turnSet < g.turn,
                    acquireTargets: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        const opts = g.graveyard(p).filter((c) => c.type === "monster").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("活死人的呼唤：选择墓地1只怪兽特殊召唤", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => {
                        if (!t || !t[0])
                            return;
                        const p = g.playerOf(self);
                        const c = g.graveyard(p).find((x) => x.uid === t[0]);
                        if (!c)
                            return;
                        await g.specialSummon(c, p, "atk", "grave");
                        g.linkCards(self, c); // 互绑：任一离场则破坏另一个
                    } }]
        } },
    { id: "torrential", password: "53582587", name: "激流葬", type: "trap", subtype: "通常", text: "怪兽被召唤/反转召唤/特殊召唤时，场上全部怪兽破坏。", effect: {
            triggers: [{ event: "summon", auto: false,
                    condition: (self, ev, g) => self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { for (const m of [...g.allMonsters()])
                        await g.destroy(m); } }]
        } },
    { id: "ringofdestruction", password: "83555666", name: "破坏轮", type: "trap", subtype: "通常", text: "以场上1只表侧表示怪兽为对象破坏，双方受到其攻击力数值的伤害。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.turnSet < g.turn,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "破坏轮：选择1只表侧表示怪兽", (m) => !m.faceDown, 1),
                    resolve: async (self, ev, g, t) => {
                        if (!t || !t[0])
                            return;
                        const m = g.findCard(t[0]);
                        if (!m)
                            return;
                        const atk = g.stats(m).atk;
                        await g.destroy(m);
                        await g.damage("me", atk, "effect");
                        await g.damage("ai", atk, "effect");
                    } }]
        } },
    { id: "dusttornado", password: "60082869", name: "砂尘龙卷", type: "trap", subtype: "通常", text: "破坏对方场上1张魔法/陷阱卡。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.turnSet < g.turn,
                    acquireTargets: async (self, ev, g) => {
                        const opts = [...g.spells(g.opponent(g.playerOf(self))), g.field(g.opponent(g.playerOf(self)))].filter((c) => !!c).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("砂尘龙卷：选择对方1张魔陷卡破坏", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.findCard(t[0]);
                        if (c)
                            await g.destroyST(c);
                    } } }]
        } },
    { id: "seventools", password: "03819470", name: "王宫的敕命·七支刀", type: "trap", subtype: "反击", text: "反击陷阱：陷阱卡发动时可以发动。使其发动无效并破坏，支付1000基本分。", effect: {
            triggers: [{ event: "activate", auto: false,
                    condition: (self, ev, g) => ev.card?.type === "trap" && ev.actor !== g.playerOf(self) && self.turnSet < g.turn,
                    cost: async (self, ev, g) => { g.payLp(g.playerOf(self), 1000); },
                    resolve: async (self, ev, g) => { g.negate(ev.link); } }],
            speed: 3
        } },
    { id: "magicjammer", password: "77414722", name: "魔法干扰", type: "trap", subtype: "反击", text: "反击陷阱：魔法卡发动时可以发动。使其发动无效并破坏，丢弃1张手卡。", effect: {
            triggers: [{ event: "activate", auto: false,
                    condition: (self, ev, g) => ev.card?.type === "spell" && ev.actor !== g.playerOf(self) && self.turnSet < g.turn,
                    cost: async (self, ev, g) => { await g.discard(g.playerOf(self), 1); },
                    resolve: async (self, ev, g) => { g.negate(ev.link); } }],
            speed: 3
        } },
    { id: "bottomless", password: "29401950", name: "奈落的落穴", type: "trap", subtype: "通常", text: "对方对攻击力1500以上的怪兽进行召唤/特殊召唤时，那只怪兽破坏并除外。", effect: {
            triggers: [{ event: "summon", auto: false,
                    condition: (self, ev, g) => ev.actor !== g.playerOf(self) && !ev.hidden && g.stats(ev.monster).atk >= 1500 && self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { await g.banish(ev.monster); } }]
        } },
    /* ========================= 元素英雄（游城十代） ========================= */
    { id: "ehero_avian", name: "元素英雄 羽翼侠", type: "monster", level: 4, attribute: "风", race: "鸟兽族", atk: 1000, def: 1000, password: "21844576", text: "操纵风翼的元素英雄。" },
    { id: "ehero_burstinatrix", name: "元素英雄 爆裂女郎", type: "monster", level: 4, attribute: "炎", race: "战士族", atk: 1200, def: 800, password: "58932615", text: "操纵火焰的元素英雄。" },
    { id: "ehero_clayman", name: "元素英雄 黏土侠", type: "monster", level: 4, attribute: "地", race: "岩石族", atk: 800, def: 2000, password: "84327329", text: "拥有坚固身体的元素英雄。" },
    { id: "ehero_sparkman", name: "元素英雄 电光侠", type: "monster", level: 4, attribute: "光", race: "战士族", atk: 1600, def: 1400, password: "20721928", text: "操纵雷电的元素英雄。" },
    { id: "ehero_bubbleman", name: "元素英雄 泡泡人", type: "monster", level: 4, attribute: "水", race: "战士族", atk: 800, def: 1200, password: "79979666", text: "此卡召唤·特殊召唤成功时，若自己手卡为0张，从卡组抽2张。", effect: {
            triggers: [{ event: "summon", auto: true,
                    condition: (self, ev, g) => ev.monster === self && g.hand(g.playerOf(self)).length === 0,
                    resolve: async (self, ev, g) => { await g.draw(g.playerOf(self), 2); } }]
        } },
    { id: "ehero_wildheart", name: "元素英雄 荒野侠", type: "monster", level: 4, attribute: "地", race: "兽战士族", atk: 1500, def: 1600, password: "86188410", trapImmune: true, text: "只要此卡在场上表侧表示存在，不受陷阱卡影响。" },
    { id: "ehero_bladedge", name: "元素英雄 刃锋侠", type: "monster", level: 7, attribute: "地", race: "兽战士族", atk: 2600, def: 1800, password: "59793705", text: "锋利刀刃的元素英雄。向守备表示怪兽攻击时给与贯穿伤害。", effect: {
            triggers: [{ event: "damage_calc", auto: true,
                    condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
                    resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target).def; } }]
        } },
    { id: "ehero_stratos", name: "元素英雄 天空侠", type: "monster", level: 4, attribute: "风", race: "战士族", atk: 1800, def: 300, password: "40044918", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「元素英雄」怪兽加入手卡。", effect: {
            triggers: [{ event: "summon", auto: true,
                    condition: (self, ev) => ev.monster === self,
                    acquireTargets: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        const opts = g.deck(p).filter((c) => c.cid && c.cid.startsWith("ehero_") && !c.fusion && c.cid !== "ehero_stratos").slice(0, 12).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("天空侠：将卡组1只「元素英雄」加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const p = g.playerOf(self);
                        const c = g.deck(p).find((x) => x.uid === t[0]);
                        if (c)
                            await g.addToHand(c, p);
                    } } }]
        } },
    /* ---------- 融合怪兽（额外卡组） ---------- */
    { id: "ehero_flamewingman", name: "元素英雄 火焰翼人", type: "monster", level: 6, attribute: "风", race: "鸟兽族", atk: 2100, def: 1200, password: "35809262", fusion: { materials: ["ehero_avian", "ehero_burstinatrix"] }, text: "融合：羽翼侠+爆裂女郎。此卡战斗破坏怪兽送墓时，给与对方那只怪兽攻击力数值的伤害。", effect: {
            triggers: [{ event: "destroyed_by_battle", auto: true,
                    condition: (self, ev) => ev.attacker === self,
                    resolve: async (self, ev, g) => { await g.damage(g.opponent(g.playerOf(self)), g.stats(ev.card).atk || 0, "effect"); } }]
        } },
    { id: "ehero_thundergiant", name: "元素英雄 雷霆巨人", type: "monster", level: 6, attribute: "光", race: "战士族", atk: 2400, def: 1500, password: "61204971", fusion: { materials: ["ehero_sparkman", "ehero_clayman"] }, text: "融合：电光侠+黏土侠。丢弃1张手卡，以1只攻击力在此卡以下的怪兽为对象破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.allMonsters().filter((m) => m !== self && g.stats(m).atk <= g.stats(self).atk).map((m) => ({ value: m.uid, label: m.name, card: m }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("雷霆巨人：选择1只怪兽破坏", opts, 1);
                    },
                    cost: async (self, ev, g) => { await g.discard(g.playerOf(self), 1); },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.destroy(m);
                    } } }]
        } },
    { id: "ehero_wildedge", name: "元素英雄 荒野大侠", type: "monster", level: 8, attribute: "地", race: "兽战士族", atk: 2600, def: 2300, password: "10526791", fusion: { materials: ["ehero_wildheart", "ehero_bladedge"] }, text: "融合：荒野侠+刃锋侠。向守备表示怪兽攻击时给与贯穿伤害。", effect: {
            triggers: [{ event: "damage_calc", auto: true,
                    condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
                    resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target).def; } }]
        } },
    /* ========================= 机械族 ========================= */
    { id: "cyberdragon", name: "电子龙", type: "monster", level: 5, attribute: "光", race: "机械族", atk: 2100, def: 1600, password: "70095154", text: "对方场上有怪兽存在，自己场上没有怪兽的场合，此卡可从手牌特殊召唤。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.monsters(g.playerOf(self)).length === 0 && g.monsters(g.opponent(g.playerOf(self))).length > 0 && self.location === "hand",
                    resolve: async (self, ev, g) => { await g.specialSummon(self, g.playerOf(self), "atk", "hand"); } }]
        } },
    { id: "jinzo", name: "人造人-念力震慑者", type: "monster", level: 6, attribute: "暗", race: "机械族", atk: 2400, def: 1500, password: "77585513", trapNegate: true, text: "只要此卡在场上表侧表示存在，场上的陷阱卡发动与效果无效。" },
    { id: "ancientgeargolem", name: "古代的机械巨人", type: "monster", level: 8, attribute: "地", race: "机械族", atk: 3000, def: 3000, password: "83104731", text: "向守备表示怪兽攻击时给与贯穿伤害。", effect: {
            triggers: [{ event: "damage_calc", auto: true,
                    condition: (self, ev, g) => ev.attacker === self && !!ev.target && ev.target.position === "def" && g.stats(self).atk > g.stats(ev.target).def,
                    resolve: async (self, ev, g) => { ev.damage = (ev.damage || 0) + g.stats(self).atk - g.stats(ev.target).def; } }]
        } },
    { id: "greengadget", name: "绿齿轮", type: "monster", level: 4, attribute: "地", race: "机械族", atk: 1400, def: 600, password: "41172955", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「红齿轮」加入手卡。", effect: {
            triggers: [{ event: "summon", auto: true, condition: (self, ev) => ev.monster === self, acquireTargets: _gadgetSearch("redgadget", "红齿轮"), resolve: _gadgetResolve() }]
        } },
    { id: "redgadget", name: "红齿轮", type: "monster", level: 4, attribute: "地", race: "机械族", atk: 1300, def: 1500, password: "86445415", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「黄齿轮」加入手卡。", effect: {
            triggers: [{ event: "summon", auto: true, condition: (self, ev) => ev.monster === self, acquireTargets: _gadgetSearch("yellowgadget", "黄齿轮"), resolve: _gadgetResolve() }]
        } },
    { id: "yellowgadget", name: "黄齿轮", type: "monster", level: 4, attribute: "地", race: "机械族", atk: 1300, def: 1200, password: "13839120", text: "此卡召唤·特殊召唤成功时，可以从卡组把1只「绿齿轮」加入手卡。", effect: {
            triggers: [{ event: "summon", auto: true, condition: (self, ev) => ev.monster === self, acquireTargets: _gadgetSearch("greengadget", "绿齿轮"), resolve: _gadgetResolve() }]
        } },
    { id: "reflectbounder", name: "反射盾士", type: "monster", level: 4, attribute: "光", race: "机械族", atk: 1700, def: 1000, password: "02851070", text: "对方怪兽对此表侧攻击表示的卡攻击宣言时，给与对方此卡攻击力数值的伤害。", effect: {
            triggers: [{ event: "attack_declare", auto: true,
                    condition: (self, ev, g) => ev.target === self && self.position === "atk" && ev.attackerOwner !== g.playerOf(self),
                    resolve: async (self, ev, g) => { await g.damage(ev.attackerOwner, g.stats(self).atk, "effect"); } }]
        } },
    { id: "mechanicalchaser", name: "机械猎手", type: "monster", level: 4, attribute: "暗", race: "机械族", atk: 1850, def: 800, password: "07359741", text: "以机械部件构成的猎手。" },
    { id: "xheadcannon", name: "X-首领加农", type: "monster", level: 4, attribute: "光", race: "机械族", atk: 1800, def: 1500, password: "62651957", text: "搭载强力加农炮的机械怪兽。" },
    /* ========================= 经典魔法/陷阱 ========================= */
    { id: "polymerization", name: "融合", type: "spell", subtype: "通常", password: "24094653", text: "将自己场上或手牌的怪兽作为融合素材，融合召唤1只融合怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.extra(g.activator).some((f) => f.fusion && f.fusion.materials.every((cid) => g.hasMaterial(g.activator, cid))),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.extra(g.activator).filter((f) => f.fusion && f.fusion.materials.every((cid) => g.hasMaterial(g.activator, cid))).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("融合：选择要融合召唤的怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const f = g.findCard(t[0]);
                        if (f)
                            await g.fusionSummon(f, g.activator);
                    } } }]
        } },
    { id: "harpiesfeatherduster", name: "鹰身女妖的羽毛扫", type: "spell", subtype: "通常", password: "18144507", text: "对方场上的魔法·陷阱卡全部破坏。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
                        const opp = g.opponent(g.activator);
                        const all = [...g.spells(opp), g.field(opp)].filter((c) => !!c);
                        for (const c of [...all])
                            await g.destroyST(c);
                    } }]
        } },
    { id: "prematureburial", name: "过早的埋葬", type: "spell", subtype: "装备", password: "70828912", text: "支付800基本分，以自己墓地1只怪兽为对象特殊召唤并装备。此卡离场时那只怪兽破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    cost: async (self, ev, g) => { g.payLp(g.activator, 800); },
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.activator).filter((c) => c.type === "monster").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("过早的埋葬：选择墓地1只怪兽特殊召唤", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.findCard(t[0]);
                        if (c) {
                            await g.specialSummon(c, g.activator, "atk", "grave");
                            g.linkCards(self, c);
                        }
                    } } }]
        } },
    { id: "gianttrunade", name: "大旋风", type: "spell", subtype: "通常", password: "42703248", text: "场上的魔法·陷阱卡全部回到持有者手卡。", effect: {
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => {
                        const all = [...g.spells("me"), ...g.spells("ai"), g.field("me"), g.field("ai")].filter((c) => !!c);
                        for (const c of [...all])
                            await g.bounce(c);
                    } }]
        } },
    { id: "noblemanofcrossout", name: "抹杀之使徒", type: "spell", subtype: "通常", password: "71044499", text: "以场上1只里侧表示怪兽为对象破坏并除外，双方把同卡名的卡从卡组除外。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.allMonsters().filter((m) => m.faceDown).map((m) => ({ value: m.uid, label: m.name, card: m }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("抹杀之使徒：选择1只里侧怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => {
                        if (!t || !t[0])
                            return;
                        const m = g.findCard(t[0]);
                        if (!m)
                            return;
                        const cid = m.cid;
                        await g.banish(m);
                        for (const key of ["me", "ai"])
                            for (const c of [...g.deck(key)].filter((c) => c.cid === cid))
                                await g.banishFromDeck(c, key);
                    } }]
        } },
    { id: "magicalstoneexcavation", name: "魔法石采掘", type: "spell", subtype: "通常", password: "98494543", text: "丢弃2张手卡，以自己墓地1张魔法卡为对象加入手卡。", effect: {
            triggers: [{ event: "manual", auto: false,
                    cost: async (self, ev, g) => { await g.discard(g.activator, 2); },
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.activator).filter((c) => c.type === "spell").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("魔法石采掘：将墓地1张魔法加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.findCard(t[0]);
                        if (c)
                            await g.addToHand(c, g.activator);
                    } } }]
        } },
    { id: "solemnjudgment", name: "神之宣告", type: "trap", subtype: "反击", password: "41420027", text: "反击陷阱：怪兽召唤·反转召唤·特殊召唤或魔法·陷阱卡发动时可以发动并使其无效，支付一半基本分。", effect: {
            triggers: [
                { event: "summon_attempt", auto: false, speed: 3,
                    condition: (self, ev, g) => ["normal", "tribute", "special", "set", "fusion"].includes(ev.summonKind) && ev.actor !== g.playerOf(self) && self.turnSet < g.turn,
                    cost: async (self, ev, g) => { g.payLp(g.playerOf(self), Math.floor(g.lp(g.playerOf(self)) / 2)); },
                    resolve: async (self, ev, g) => { await g.negateSummon(ev.monster); } },
                { event: "activate", auto: false, speed: 3,
                    condition: (self, ev, g) => ev.actor !== g.playerOf(self) && (ev.card?.type === "spell" || ev.card?.type === "trap") && self.turnSet < g.turn,
                    cost: async (self, ev, g) => { g.payLp(g.playerOf(self), Math.floor(g.lp(g.playerOf(self)) / 2)); },
                    resolve: async (self, ev, g) => { g.negate(ev.link); } }
            ],
            speed: 3
        } },
    { id: "trapstun", name: "陷阱无力化", type: "trap", subtype: "通常", password: "59616123", text: "此回合，陷阱卡的效果无效。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.turnSet < g.turn,
                    resolve: async (self, ev, g) => { g.setTrapStunThisTurn(); } }]
        } },
    /* ========================= 青眼白龙（海马濑人） ========================= */
    { id: "blueyes_ultimate", name: "青眼究极龙", type: "monster", level: 12, attribute: "光", race: "龙族", atk: 4500, def: 3800, password: "23995346", fusion: { materials: ["blueyes", "blueyes", "blueyes"] }, text: "融合：青眼白龙×3。以三头龙之姿君临的传说之龙。" },
    { id: "lordofdragons", name: "龙之支配者", type: "monster", level: 4, attribute: "暗", race: "魔法师族", atk: 1200, def: 1100, password: "17985575", text: "支配龙族的魔法师。场上有此卡时，可发动「唤龙笛」召唤手牌的龙族怪兽。" },
    { id: "kaibaman", name: "青眼贤士", type: "monster", level: 3, attribute: "光", race: "战士族", atk: 200, def: 700, password: "34627841", text: "解放此卡：从手牌特殊召唤1只「青眼白龙」。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.location === "monster" && g.hand(g.activator).some((c) => c.cid === "blueyes"),
                    cost: async (self, ev, g) => { await g.tribute(self); },
                    resolve: async (self, ev, g) => { const c = g.hand(g.activator).find((x) => x.cid === "blueyes"); if (c)
                        await g.specialSummon(c, g.activator, "atk", "hand"); } }]
        } },
    { id: "flute", name: "唤龙笛", type: "spell", subtype: "通常", password: "43973174", text: "场上有「龙之支配者」时，从手牌将最多2只龙族怪兽特殊召唤。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "lordofdragons") && g.hand(g.activator).some((c) => c.type === "monster" && c.race === "龙族"),
                    resolve: async (self, ev, g) => {
                        const p = g.activator;
                        const summoned = [];
                        for (let i = 0; i < 2; i++) {
                            const opts = g.hand(p).filter((c) => c.type === "monster" && c.race === "龙族" && !summoned.includes(c.uid)).map((c) => ({ value: c.uid, label: c.name, card: c }));
                            if (!opts.length)
                                break;
                            opts.push({ value: null, label: "完成", card: null });
                            const r = await g.askTargets(`唤龙笛：特殊召唤龙族怪兽（${i + 1}/2，可完成）`, opts, 1);
                            if (r[0] === null)
                                break;
                            const c = g.findCard(r[0]);
                            if (c) {
                                await g.specialSummon(c, p, "atk", "hand");
                                summoned.push(c.uid);
                            }
                        }
                    } }]
        } },
    { id: "burststream", name: "白龙疾风弹", type: "spell", subtype: "通常", password: "17655904", text: "场上有「青眼白龙」时，对方场上的全部怪兽破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "blueyes" && g.controller(m) === g.activator),
                    resolve: async (self, ev, g) => { for (const m of [...g.monsters(g.opponent(g.activator))])
                        await g.destroy(m); } }]
        } },
    { id: "stamping", name: "粉碎爆裂", type: "spell", subtype: "通常", password: "81385346", text: "场上有「青眼白龙」时，对方场上的魔法·陷阱卡全部破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "blueyes" && g.controller(m) === g.activator),
                    resolve: async (self, ev, g) => { const opp = g.opponent(g.activator); const all = [...g.spells(opp), g.field(opp)].filter((c) => !!c); for (const c of [...all])
                        await g.destroyST(c); } }]
        } },
    /* ========================= 黑魔术师（武藤游戏） ========================= */
    { id: "darkmagiciangirl", name: "黑魔术少女", type: "monster", level: 6, attribute: "暗", race: "魔法师族", atk: 2000, def: 1700, password: "38033121", text: "双方墓地每有1只「黑魔术师」，此卡攻击力上升300。", effect: {
            continuous: (self, mon, g) => self === mon ? { atkDelta: 300 * (g.graveyard("me").filter((c) => c.cid === "darkmagician").length + g.graveyard("ai").filter((c) => c.cid === "darkmagician").length), defDelta: 0 } : { atkDelta: 0, defDelta: 0 }
        } },
    { id: "skilledwhitemagician", name: "熟练的白魔术师", type: "monster", level: 4, attribute: "光", race: "魔法师族", atk: 1700, def: 1900, password: "46363422", text: "精研魔法的年轻魔术师。" },
    { id: "thousandknives", name: "千把刀", type: "spell", subtype: "通常", password: "63391643", text: "场上有「黑魔术师」时，以对方场上1只怪兽为对象破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "darkmagician" && g.controller(m) === g.activator) && g.monsters(g.opponent(g.activator)).length > 0,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "千把刀：选择对方1只怪兽破坏", (m) => g.controller(m) === g.opponent(g.activator), 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.destroy(m);
                    } } }]
        } },
    { id: "darkmagicattack", name: "黑·魔·导", type: "spell", subtype: "通常", password: "02314238", text: "场上有「黑魔术师」时，对方场上的魔法·陷阱卡全部破坏。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "darkmagician" && g.controller(m) === g.activator),
                    resolve: async (self, ev, g) => { const opp = g.opponent(g.activator); const all = [...g.spells(opp), g.field(opp)].filter((c) => !!c); for (const c of [...all])
                        await g.destroyST(c); } }]
        } },
    { id: "curtain", name: "黑魔术的幕帘", type: "spell", subtype: "通常", password: "99789342", text: "支付一半基本分：从手牌特殊召唤1只「黑魔术师」。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.hand(g.activator).some((c) => c.cid === "darkmagician") && g.lp(g.activator) > 1,
                    cost: async (self, ev, g) => { g.payLp(g.activator, Math.floor(g.lp(g.activator) / 2)); },
                    resolve: async (self, ev, g) => { const c = g.hand(g.activator).find((x) => x.cid === "darkmagician"); if (c)
                        await g.specialSummon(c, g.activator, "atk", "hand"); } }]
        } },
    { id: "magiciancircle", name: "魔术师之阵", type: "trap", subtype: "通常", password: "00050755", text: "对方怪兽攻击宣言时：从卡组特殊召唤1只攻击力2000以下的魔法师族怪兽。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn && g.deck(g.playerOf(self)).some((c) => c.type === "monster" && c.race === "魔法师族" && (c.atk || 0) <= 2000),
                    resolve: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        const c = g.deck(p).find((x) => x.type === "monster" && x.race === "魔法师族" && (x.atk || 0) <= 2000);
                        if (c)
                            await g.specialSummon(c, p, "def", "deck");
                    } }]
        } },
    /* ========================= 真红眼黑龙（城之内克也） ========================= */
    { id: "redeyes", name: "真红眼黑龙", type: "monster", level: 7, attribute: "暗", race: "龙族", atk: 2400, def: 2000, password: "74677422", text: "拥有黑红色之眼的传说之龙。" },
    { id: "meteor", name: "流星之龙", type: "monster", level: 6, attribute: "地", race: "龙族", atk: 1800, def: 2000, password: "64271667", text: "自宇宙陨落的大地之龙。" },
    { id: "meteorb", name: "流星黑龙", type: "monster", level: 8, attribute: "炎", race: "龙族", atk: 3500, def: 2000, password: "90660762", fusion: { materials: ["redeyes", "meteor"] }, text: "融合：真红眼黑龙+流星之龙。燃烧的黑炎流星。" },
    { id: "infernofire", name: "黑炎弹", type: "spell", subtype: "通常", password: "69750536", text: "场上有「真红眼黑龙」时，给与对方2400伤害。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "redeyes" && g.controller(m) === g.activator),
                    resolve: async (self, ev, g) => { await g.damage(g.opponent(g.activator), 2400, "effect"); } }]
        } },
    { id: "metalmorph", name: "金属化·魔法反射装甲", type: "spell", subtype: "装备", password: "68540058", text: "装备怪兽攻击力·守备力上升400。", effect: {
            triggers: [{ event: "manual", auto: false,
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "金属化：选择1只己方怪兽装备", (m) => g.controller(m) === g.activator, 1),
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const m = g.findCard(t[0]);
                        if (m)
                            await g.equip(self, m);
                    } } }],
            continuous: (self, mon, g) => self.equipTarget === mon.uid ? { atkDelta: 400, defDelta: 400 } : { atkDelta: 0, defDelta: 0 }
        } },
    /* ========================= 神鹰女郎（孔雀舞） ========================= */
    { id: "harpylady", name: "神鹰女郎", type: "monster", level: 4, attribute: "风", race: "鸟兽族", atk: 1300, def: 1400, password: "76812113", text: "拥有羽毛之翼的狩猎者。" },
    { id: "harpiesisters", name: "神鹰女郎三姐妹", type: "monster", level: 5, attribute: "风", race: "鸟兽族", atk: 1950, def: 2100, password: "12206212", text: "三体合一的神鹰女郎。" },
    { id: "elegantegotist", name: "万华镜-华丽的分身", type: "spell", subtype: "通常", password: "90219263", text: "场上有「神鹰女郎」时，从手牌或卡组特殊召唤1只神鹰系怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.allMonsters().some((m) => m.cid === "harpylady" && g.controller(m) === g.activator),
                    acquireTargets: async (self, ev, g) => {
                        const p = g.activator;
                        const opts = [...g.hand(p), ...g.deck(p)].filter((c) => c.cid === "harpylady" || c.cid === "harpiesisters").slice(0, 9).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length)
                            return null;
                        return g.askTargets("万华镜：选择1只神鹰系怪兽特殊召唤", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => {
                        if (!t || !t[0])
                            return;
                        const c = g.findCard(t[0]);
                        if (!c)
                            return;
                        const from = g.hand(g.activator).includes(c) ? "hand" : "deck";
                        await g.specialSummon(c, g.activator, "atk", from);
                    } }]
        } },
    { id: "harpiespet", name: "神鹰的宠物龙", type: "monster", level: 7, attribute: "风", race: "龙族", atk: 2000, def: 2500, password: "52040216", text: "场上每有1只「神鹰女郎」，此卡攻击力·守备力上升300。", effect: {
            continuous: (self, mon, g) => self === mon ? { atkDelta: 300 * g.allMonsters().filter((m) => m.cid === "harpylady" && !m.faceDown).length, defDelta: 300 * g.allMonsters().filter((m) => m.cid === "harpylady" && !m.faceDown).length } : { atkDelta: 0, defDelta: 0 }
        } },
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
                            if (m)
                                await g.tribute(m);
                        }
                    },
                    resolve: async (self, ev, g) => { await g.specialSummon(self, g.playerOf(self), "atk", "hand"); } },
                { event: "destroyed_by_battle", auto: true,
                    condition: (self, ev) => ev.card === self,
                    resolve: async (self, ev, g) => {
                        const p = g.playerOf(self);
                        for (const cid of ["magnet_alpha", "magnet_beta", "magnet_gamma"]) {
                            const c = g.graveyard(p).find((x) => x.cid === cid);
                            if (c)
                                await g.specialSummon(c, p, "atk", "grave");
                        }
                    } }
            ]
        } },
    /* ========================= 扩充：机械族 ========================= */
    { id: "proto", password: "26439287", name: "原型电子龙", type: "monster", level: 3, attribute: "光", race: "机械族", atk: 1100, def: 600, text: "电子龙的原型机，虽未完成却已有钢铁之威。" },
    { id: "cybertwin", password: "74157028", name: "电子双生龙", type: "monster", level: 8, attribute: "光", race: "机械族", atk: 2800, def: 2100, fusion: { materials: ["cyberdragon", "cyberdragon"] }, text: "融合：电子龙×2。钢铁双头龙的二连击。" },
    { id: "powerbond", password: "37630732", name: "力量焊接", type: "spell", subtype: "通常", text: "将手牌/场上素材融合召唤1只机械族融合怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.extra(g.activator).some((f) => f.fusion && f.race === "机械族" && f.fusion.materials.every((cid) => g.hasMaterial(g.activator, cid))),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.extra(g.activator).filter((f) => f.fusion && f.race === "机械族" && f.fusion.materials.every((cid) => g.hasMaterial(g.activator, cid))).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("力量焊接：选择要融合召唤的机械族怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const f = g.findCard(t[0]);
                        if (f) await g.fusionSummon(f, g.activator);
                    } } }]
        } },
    { id: "cyberrepair", password: "86686671", name: "电子修复工厂", type: "spell", subtype: "通常", text: "自己墓地存在「电子龙」的场合：将墓地1只机械族怪兽加入手卡。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.graveyard(g.activator).some((c) => c.cid === "cyberdragon") && g.graveyard(g.activator).some((c) => c.type === "monster" && c.race === "机械族"),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.activator).filter((c) => c.type === "monster" && c.race === "机械族").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("电子修复工厂：将墓地1只机械族怪兽加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.graveyard(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.addToHand(c, g.activator);
                    } } }]
        } },
    /* ========================= 扩充：元素英雄 ========================= */
    { id: "e_call", password: "00213326", name: "E·紧急呼叫", type: "spell", subtype: "通常", text: "从卡组将1只「元素英雄」怪兽加入手卡。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.deck(g.activator).some((c) => c.name.startsWith("元素英雄")),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.deck(g.activator).filter((c) => c.name.startsWith("元素英雄")).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("E·紧急呼叫：将卡组1只「元素英雄」加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.deck(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.addToHand(c, g.activator);
                    } } }]
        } },
    { id: "hero_signal", password: "22020907", name: "英雄标记", type: "trap", subtype: "通常", text: "自己怪兽被战斗破坏时：从卡组特殊召唤1只4星以下「元素英雄」。", effect: {
            triggers: [{ event: "destroyed_by_battle", auto: true,
                    condition: (self, ev, g) => ev.owner === g.playerOf(self) && ev.card !== self && self.turnSet < g.turn,
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.deck(g.playerOf(self)).filter((c) => c.name.startsWith("元素英雄") && c.level <= 4).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("英雄标记：从卡组特殊召唤1只「元素英雄」", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.deck(g.playerOf(self)).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.playerOf(self), "atk", "deck");
                    } } }]
        } },
    { id: "hero_barrier", password: "44676200", name: "英雄障壁", type: "trap", subtype: "通常", text: "对方怪兽攻击宣言时，若自己场上有表侧表示「元素英雄」：使该攻击无效。", effect: {
            triggers: [{ event: "attack_declare", auto: false,
                    condition: (self, ev, g) => ev.attackerOwner !== g.playerOf(self) && self.turnSet < g.turn && g.monsters(g.playerOf(self)).some((m) => !m.faceDown && m.name.startsWith("元素英雄")),
                    resolve: async (self, ev, g) => { g.negateAttack(true); } }]
        } },
    /* ========================= 扩充：青眼白龙 ========================= */
    { id: "ancientrules", password: "10667321", name: "远古规则", type: "spell", subtype: "通常", text: "从手牌特殊召唤1只5星以上的通常怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.hand(g.activator).some((c) => c.type === "monster" && !c.effect && (c.level || 0) >= 5),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.hand(g.activator).filter((c) => c.type === "monster" && !c.effect && (c.level || 0) >= 5).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("远古规则：从手牌特殊召唤1只通常怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.hand(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.activator, "atk", "hand");
                    } } }]
        } },
    { id: "silvercry", password: "87025064", name: "银龙的咆哮", type: "spell", subtype: "速攻", text: "从自己墓地特殊召唤1只龙族通常怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.graveyard(g.activator).some((c) => c.type === "monster" && c.race === "龙族" && !c.effect),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.activator).filter((c) => c.type === "monster" && c.race === "龙族" && !c.effect).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("银龙的咆哮：从墓地特殊召唤1只龙族通常怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.graveyard(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.activator, "def", "grave");
                    } } }]
        } },
    { id: "championsvigilance", password: "82382815", name: "王者看破", type: "trap", subtype: "反击", text: "自己场上有5星以上通常怪兽时：魔法/陷阱卡发动无效并破坏。", effect: {
            triggers: [{ event: "activate", auto: false,
                    condition: (self, ev, g) => ev.actor !== g.playerOf(self) && self.turnSet < g.turn && (ev.card?.type === "spell" || ev.card?.type === "trap") && g.allMonsters().some((m) => !m.faceDown && !m.effect && (m.level || 0) >= 5 && g.controller(m) === g.playerOf(self)),
                    resolve: async (self, ev, g) => { g.negate(ev.link); } }],
            speed: 3
        } },
    /* ========================= 扩充：黑魔术师 ========================= */
    { id: "magicaldimension", password: "28553439", name: "次元魔法", type: "spell", subtype: "速攻", text: "解放自己场上1只怪兽，从手牌特殊召唤1只魔法师族怪兽，之后可破坏场上1只怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.monsters(g.activator).length > 0 && g.hand(g.activator).some((c) => c.type === "monster" && c.race === "魔法师族"),
                    acquireTargets: async (self, ev, g) => pickMonsters(g, "次元魔法：解放自己场上1只怪兽", (m) => g.controller(m) === g.activator, 1),
                    cost: async (self, ev, g, t) => { if (t && t[0]) { const m = g.findCard(t[0]); if (m) await g.tribute(m); } },
                    resolve: async (self, ev, g, t) => {
                        const opts = g.hand(g.activator).filter((c) => c.type === "monster" && c.race === "魔法师族").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (opts.length) {
                            const s = await g.askTargets("次元魔法：从手牌特殊召唤1只魔法师族", opts, 1);
                            if (s && s[0]) { const c = g.hand(g.activator).find((x) => x.uid === s[0]); if (c) await g.specialSummon(c, g.activator, "atk", "hand"); }
                        }
                        const dopts = g.allMonsters().map((m) => ({ value: m.uid, label: m.name, card: m }));
                        if (dopts.length) {
                            const d = await g.askTargets("次元魔法：破坏场上1只怪兽", dopts, 1);
                            if (d && d[0]) { const m = g.findCard(d[0]); if (m) await g.destroy(m); }
                        }
                    } }]
        } },
    /* ========================= 扩充：真红眼黑龙 ========================= */
    { id: "redeyesfusion", password: "06172122", name: "真红眼融合", type: "spell", subtype: "通常", text: "将手牌/场上素材融合召唤1只以「真红眼黑龙」为素材的融合怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.extra(g.activator).some((f) => f.fusion && f.fusion.materials.includes("redeyes") && f.fusion.materials.every((cid) => g.hasMaterial(g.activator, cid))),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.extra(g.activator).filter((f) => f.fusion && f.fusion.materials.includes("redeyes") && f.fusion.materials.every((cid) => g.hasMaterial(g.activator, cid))).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("真红眼融合：选择要融合召唤的怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const f = g.findCard(t[0]);
                        if (f) await g.fusionSummon(f, g.activator);
                    } } }]
        } },
    /* ========================= 扩充：神鹰女郎 ========================= */
    { id: "huntingground", password: "75782277", name: "神鹰的狩猎场", type: "spell", subtype: "场地", text: "场上鸟兽族怪兽攻守上升200。", effect: { races: ["鸟兽族"],
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
            continuous: (self, mon, g) => self.effect.races.includes(mon.race) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },
    { id: "hystericparty", password: "77778835", name: "歇斯底里的聚会", type: "trap", subtype: "通常", text: "丢弃1张手卡：从自己墓地特殊召唤1只「神鹰」怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.turnSet < g.turn && g.graveyard(g.playerOf(self)).some((c) => c.name.includes("神鹰")),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.playerOf(self)).filter((c) => c.name.includes("神鹰")).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("歇斯底里的聚会：从墓地特殊召唤1只「神鹰」", opts, 1);
                    },
                    cost: async (self, ev, g) => { await g.discard(g.playerOf(self), 1); },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.graveyard(g.playerOf(self)).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.playerOf(self), "atk", "grave");
                    } } }]
        } },
    /* ========================= 扩充：磁石战士 ========================= */
    { id: "magnet_delta", password: "12262393", name: "磁石战士δ", type: "monster", level: 4, attribute: "地", race: "岩石族", atk: 1600, def: 1400, text: "磁石四兄弟中的末弟，以灵巧弥补力量。" },
    /* ========================= 新卡组：战士族 ========================= */
    { id: "maraudingcaptain", password: "02460565", name: "切入队长", type: "monster", level: 3, attribute: "地", race: "战士族", atk: 1200, def: 400, text: "此卡召唤成功时：从手牌特殊召唤1只4星以下怪兽。", effect: {
            triggers: [{ event: "summon", auto: true,
                    condition: (self, ev, g) => ev.monster === self && g.hand(g.playerOf(self)).some((c) => c.type === "monster" && c.level <= 4),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.hand(g.playerOf(self)).filter((c) => c.type === "monster" && c.level <= 4).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("切入队长：从手牌特殊召唤1只4星以下怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.hand(g.playerOf(self)).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.playerOf(self), "atk", "hand");
                    } } }]
        } },
    { id: "warriordai", password: "75953262", name: "战士·戴格雷法", type: "monster", level: 4, attribute: "暗", race: "战士族", atk: 1700, def: 1600, text: "丢弃1张手卡：从卡组将1只战士族怪兽送去墓地。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.location === "monster" && g.deck(g.playerOf(self)).some((c) => c.type === "monster" && c.race === "战士族"),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.deck(g.playerOf(self)).filter((c) => c.type === "monster" && c.race === "战士族").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("战士·戴格雷法：从卡组将1只战士族送去墓地", opts, 1);
                    },
                    cost: async (self, ev, g) => { await g.discard(g.playerOf(self), 1); },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.deck(g.playerOf(self)).find((x) => x.uid === t[0]);
                        if (c) await g.sendToGrave(c, "deck", "effect");
                    } } }]
        } },
    { id: "amazoness", password: "94004268", name: "亚马逊剑士", type: "monster", level: 4, attribute: "地", race: "战士族", atk: 1500, def: 1600, text: "亚马逊的剑士，剑锋所指便是归途。" },
    { id: "swordstalker", password: "51345461", name: "剑之猎人", type: "monster", level: 5, attribute: "地", race: "战士族", atk: 2450, def: 1700, text: "被此卡战斗破坏的怪兽会化为它的利刃。" },
    { id: "commandknight", password: "10375182", name: "指挥骑士", type: "monster", level: 4, attribute: "炎", race: "战士族", atk: 1200, def: 1900, text: "只要此卡在场上表侧表示存在，己方战士族怪兽攻守上升400。", effect: {
            triggers: [],
            continuous: (self, mon, g) => mon.race === "战士族" && g.controller(mon) === g.controller(self) ? { atkDelta: 400, defDelta: 400 } : { atkDelta: 0, defDelta: 0 } } },
    { id: "reinforcement", password: "32807846", name: "增援", type: "spell", subtype: "通常", text: "从卡组将1只4星以下战士族怪兽加入手卡。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.deck(g.activator).some((c) => c.type === "monster" && c.race === "战士族" && c.level <= 4),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.deck(g.activator).filter((c) => c.type === "monster" && c.race === "战士族" && c.level <= 4).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("增援：将卡组1只战士族加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.deck(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.addToHand(c, g.activator);
                    } } }]
        } },
    { id: "warriorreturning", password: "95281259", name: "战士的生还", type: "spell", subtype: "通常", text: "从自己墓地选择1只战士族怪兽加入手卡。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.graveyard(g.activator).some((c) => c.type === "monster" && c.race === "战士族"),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.activator).filter((c) => c.type === "monster" && c.race === "战士族").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("战士的生还：将墓地1只战士族加入手卡", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.graveyard(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.addToHand(c, g.activator);
                    } } }]
        } },
    { id: "aforces", password: "00403847", name: "联合军", type: "spell", subtype: "场地", text: "场上战士族怪兽攻守上升200。", effect: { races: ["战士族"],
            triggers: [{ event: "manual", auto: false, resolve: async (self, ev, g) => { await g.setField(self); } }],
            continuous: (self, mon, g) => self.effect.races.includes(mon.race) ? { atkDelta: 200, defDelta: 200 } : { atkDelta: 0, defDelta: 0 } } },
    /* ========================= 新卡组：不死族 ========================= */
    { id: "vampirelord", password: "53839837", name: "吸血鬼领主", type: "monster", level: 6, attribute: "暗", race: "不死族", atk: 2000, def: 1500, text: "自己准备阶段，若此卡在墓地：将此卡特殊召唤。", effect: {
            triggers: [{ event: "phase_start", auto: true,
                    condition: (self, ev, g) => ev.phase === "standby" && self.location === "grave" && g.playerOf(self) === ev.player,
                    resolve: async (self, ev, g) => { await g.specialSummon(self, g.playerOf(self), "atk", "grave"); } }]
        } },
    { id: "zombiemaster", password: "17259470", name: "僵尸之主", type: "monster", level: 4, attribute: "暗", race: "不死族", atk: 1800, def: 0, text: "丢弃1张手卡：从自己墓地特殊召唤1只不死族怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => self.location === "monster" && g.graveyard(g.playerOf(self)).some((c) => c.type === "monster" && c.race === "不死族"),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.playerOf(self)).filter((c) => c.type === "monster" && c.race === "不死族").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("僵尸之主：从墓地特殊召唤1只不死族怪兽", opts, 1);
                    },
                    cost: async (self, ev, g) => { await g.discard(g.playerOf(self), 1); },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.graveyard(g.playerOf(self)).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.playerOf(self), "atk", "grave");
                    } } }]
        } },
    { id: "ryukokki", password: "57281778", name: "龙骨鬼", type: "monster", level: 6, attribute: "暗", race: "不死族", atk: 2400, def: 2000, text: "以龙之骨炼成的恶鬼。" },
    { id: "despair", password: "71200730", name: "来自黑暗的绝望", type: "monster", level: 8, attribute: "暗", race: "不死族", atk: 2800, def: 3000, text: "自黑暗深渊爬出的绝望化身。" },
    { id: "spiritreaper", password: "23205979", name: "削魂的死灵", type: "monster", level: 3, attribute: "暗", race: "不死族", atk: 300, def: 200, text: "持镰的死灵，不会被轻易消灭。" },
    { id: "patrician", password: "19153634", name: "黑暗贵族", type: "monster", level: 5, attribute: "暗", race: "不死族", atk: 2000, def: 1400, text: "统治黑暗的贵族。" },
    { id: "bookoflife", password: "02204140", name: "生者之书", type: "spell", subtype: "通常", text: "从自己墓地特殊召唤1只不死族怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.graveyard(g.activator).some((c) => c.type === "monster" && c.race === "不死族"),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.graveyard(g.activator).filter((c) => c.type === "monster" && c.race === "不死族").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("生者之书：从墓地特殊召唤1只不死族", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.graveyard(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.activator, "atk", "grave");
                    } } }]
        } },
    { id: "mummycall", password: "04861205", name: "木乃伊的呼声", type: "spell", subtype: "永续", text: "自己场上没有怪兽的场合：从手牌特殊召唤1只不死族怪兽。", effect: {
            triggers: [{ event: "manual", auto: false,
                    condition: (self, ev, g) => g.monsters(g.activator).length === 0 && g.hand(g.activator).some((c) => c.type === "monster" && c.race === "不死族"),
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.hand(g.activator).filter((c) => c.type === "monster" && c.race === "不死族").map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("木乃伊的呼声：从手牌特殊召唤1只不死族", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.hand(g.activator).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.activator, "atk", "hand");
                    } } }]
        } },
    /* ========================= 新卡组：天使族 ========================= */
    { id: "dunames", password: "12493482", name: "月之使者·杜娜梅斯", type: "monster", level: 4, attribute: "光", race: "天使族", atk: 1800, def: 1050, text: "月之女神派遣至人间的使者。" },
    { id: "shiningabyss", password: "87303357", name: "闪耀深渊", type: "monster", level: 4, attribute: "光", race: "天使族", atk: 1600, def: 1800, text: "守护深渊的闪耀天使。" },
    { id: "mudora", password: "82108372", name: "姆多拉", type: "monster", level: 4, attribute: "地", race: "天使族", atk: 1500, def: 1800, text: "大地孕育的天使。" },
    { id: "hoshiningen", password: "95956346", name: "光辉天使", type: "monster", level: 2, attribute: "光", race: "天使族", atk: 500, def: 700, text: "此卡被战斗破坏时：从卡组特殊召唤1只攻击力1500以下的光属性怪兽。", effect: {
            triggers: [{ event: "destroyed_by_battle", auto: true,
                    condition: (self, ev, g) => ev.card === self,
                    acquireTargets: async (self, ev, g) => {
                        const opts = g.deck(g.playerOf(self)).filter((c) => c.type === "monster" && c.attribute === "光" && (c.atk || 0) <= 1500).map((c) => ({ value: c.uid, label: c.name, card: c }));
                        if (!opts.length) return null;
                        return g.askTargets("光辉天使：从卡组特殊召唤1只光属性怪兽", opts, 1);
                    },
                    resolve: async (self, ev, g, t) => { if (t && t[0]) {
                        const c = g.deck(g.playerOf(self)).find((x) => x.uid === t[0]);
                        if (c) await g.specialSummon(c, g.playerOf(self), "atk", "deck");
                    } } }]
        } },
    { id: "mars", password: "91123920", name: "力之代行者·火星", type: "monster", level: 3, attribute: "光", race: "天使族", atk: 0, def: 0, text: "此卡攻击力上升双方LP差值。", effect: {
            triggers: [],
            continuous: (self, mon, g) => self === mon ? { atkDelta: Math.max(0, g.lp(g.playerOf(self)) - g.lp(g.opponent(g.playerOf(self)))), defDelta: 0 } : { atkDelta: 0, defDelta: 0 } } },
    { id: "solemnwishes", password: "35346968", name: "神之惠", type: "trap", subtype: "永续", text: "自己的抽卡阶段恢复500基本分。", effect: {
            triggers: [
                { event: "manual", auto: false,
                    condition: (self, ev, g) => self.turnSet < g.turn,
                    resolve: async () => {} },
                { event: "phase_start", auto: true,
                    condition: (self, ev, g) => ev.phase === "draw" && ev.player === g.playerOf(self) && !self.faceDown,
                    resolve: async (self, ev, g) => { g.payLp(g.playerOf(self), -500); } }
            ] } },
];
const CARD_BY_ID = Object.fromEntries(CARDS.map((c) => [c.id, c]));
// 卡组预设：经典 / 元素英雄(游城十代) / 机械族
const DECK_PRESETS = {
    classic: {
        main: [
            // 低星怪 24
            "celtic", "celtic", "gemini", "gemini", "axe", "axe", "battleox", "battleox",
            "lajinn", "lajinn", "stone", "stone", "mysticalelf", "mysticalelf",
            "maneater", "maneater", "oldvindictive", "oldvindictive", "witch", "sangan",
            "exiled", "goblin", "kuriboh", "sinisterserpent",
            // 高星怪 8
            "blueyes", "blueyes", "darkmagician", "darkmagician", "summonedskull", "summonedskull", "gaia", "gaia",
            // 魔法 18
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "shieldsword", "fissure", "fissure", "smashing",
            "swords", "heavystorm", "axeofdespair", "axeofdespair", "magepower",
            // 陷阱 10
            "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "magiccylinder",
            "waboku", "waboku", "callofhaunted", "torrential",
        ],
        extra: [],
    },
    hero: {
        main: [
            // 低星怪 24
            "ehero_avian", "ehero_avian", "ehero_avian", "ehero_burstinatrix", "ehero_burstinatrix", "ehero_burstinatrix",
            "ehero_clayman", "ehero_clayman", "ehero_sparkman", "ehero_sparkman", "ehero_sparkman",
            "ehero_bubbleman", "ehero_bubbleman", "ehero_wildheart", "ehero_wildheart",
            "ehero_stratos", "ehero_stratos", "gemini", "gemini", "celtic", "celtic",
            "magicianoffaith", "kuriboh", "witch",
            // 高星怪 7
            "ehero_bladedge", "ehero_bladedge", "ehero_bladedge", "darkmagician", "darkmagician", "gaia", "summonedskull",
            // 魔法 19
            "polymerization", "polymerization", "polymerization", "e_call", "e_call",
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "axeofdespair", "magepower", "fissure", "smashing",
            // 陷阱 10
            "hero_barrier", "hero_barrier", "hero_signal", "hero_signal",
            "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: ["ehero_flamewingman", "ehero_flamewingman", "ehero_thundergiant", "ehero_thundergiant", "ehero_wildedge", "ehero_wildedge"],
    },
    machine: {
        main: [
            // 低星怪 25
            "greengadget", "greengadget", "redgadget", "redgadget", "yellowgadget", "yellowgadget",
            "mechanicalchaser", "mechanicalchaser", "xheadcannon", "xheadcannon", "reflectbounder", "reflectbounder",
            "proto", "proto", "proto", "goblin", "goblin", "goblin",
            "cannonsoldier", "witch", "sangan", "kuriboh", "kuriboh", "gemini", "gemini",
            // 高星怪 8
            "cyberdragon", "cyberdragon", "cyberdragon", "jinzo", "jinzo",
            "ancientgeargolem", "ancientgeargolem", "ancientgeargolem",
            // 魔法 17
            "powerbond", "powerbond", "cyberrepair", "cyberrepair",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed", "gracefulcharity",
            "changeofheart", "swords", "axeofdespair", "axeofdespair", "magepower", "united",
            // 陷阱 10
            "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "torrential", "bottomless",
            "solemnjudgment", "ringofdestruction", "dusttornado", "trapstun",
        ],
        extra: ["cybertwin", "cybertwin", "cybertwin"],
    },
    blueeyes: {
        main: [
            // 低星怪 24
            "kaibaman", "kaibaman", "kaibaman", "lordofdragons", "lordofdragons",
            "gemini", "gemini", "lajinn", "lajinn", "celtic", "celtic", "battleox",
            "witch", "sangan", "kuriboh", "kuriboh", "stone", "stone",
            "mysticalelf", "mysticalelf", "maneater", "magicianoffaith", "exiled", "sinisterserpent",
            // 高星怪 8
            "blueyes", "blueyes", "blueyes", "summonedskull", "summonedskull", "gaia", "darkmagician", "darkmagician",
            // 魔法 18
            "flute", "flute", "ancientrules", "ancientrules", "silvercry", "silvercry",
            "burststream", "burststream", "stamping", "polymerization", "polymerization",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed", "gracefulcharity",
            // 陷阱 10
            "championsvigilance", "championsvigilance",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: ["blueyes_ultimate", "blueyes_ultimate"],
    },
    darkmagician: {
        main: [
            // 低星怪 25
            "darkmagiciangirl", "darkmagiciangirl", "skilledwhitemagician", "skilledwhitemagician",
            "gemini", "gemini", "gemini", "mysticalelf", "mysticalelf", "celtic", "celtic",
            "magicianoffaith", "magicianoffaith", "oldvindictive", "oldvindictive",
            "witch", "witch", "sangan", "kuriboh", "exiled", "maneater",
            "stone", "battleox", "lajinn", "axe",
            // 高星怪 8
            "darkmagician", "darkmagician", "darkmagician", "summonedskull", "summonedskull", "gaia", "gaia", "blueyes",
            // 魔法 17
            "thousandknives", "thousandknives", "darkmagicattack", "curtain", "curtain", "magicaldimension", "magicaldimension",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure",
            // 陷阱 10
            "magiciancircle", "magiciancircle",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: [],
    },
    redeyes: {
        main: [
            // 低星怪 25
            "meteor", "meteor", "meteor", "battleox", "battleox", "goblin", "goblin",
            "gemini", "gemini", "lajinn", "lajinn", "celtic", "celtic", "speardragon", "speardragon",
            "witch", "sangan", "kuriboh", "kuriboh", "exiled", "maneater", "stone",
            "mysticalelf", "magicianoffaith", "axe", "silverfang",
            // 高星怪 8
            "redeyes", "redeyes", "redeyes", "summonedskull", "summonedskull", "gaia", "blueyes",
            // 魔法 17
            "redeyesfusion", "redeyesfusion", "polymerization", "polymerization",
            "infernofire", "infernofire", "metalmorph", "metalmorph",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: ["meteorb", "meteorb"],
    },
    harpie: {
        main: [
            // 低星怪 25
            "harpylady", "harpylady", "harpylady", "harpiesisters", "harpiesisters",
            "harpiespet", "harpiespet", "celtic", "celtic", "battleox", "battleox",
            "gemini", "gemini", "lajinn", "lajinn", "axe", "axe",
            "witch", "sangan", "kuriboh", "kuriboh", "exiled", "mysticalelf", "magicianoffaith", "maneater", "axe",
            // 高星怪 7
            "summonedskull", "summonedskull", "gaia", "darkmagician", "blueyes", "redeyes",
            // 魔法 18
            "elegantegotist", "elegantegotist", "huntingground", "huntingground",
            "harpiesfeatherduster", "harpiesfeatherduster",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "magepower", "fissure", "smashing",
            // 陷阱 10
            "hystericparty", "hystericparty",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: [],
    },
    magnet: {
        main: [
            // 低星怪 25
            "magnet_alpha", "magnet_alpha", "magnet_alpha", "magnet_beta", "magnet_beta", "magnet_beta",
            "magnet_gamma", "magnet_gamma", "magnet_gamma", "magnet_delta", "magnet_delta", "magnet_delta",
            "stone", "stone", "stone", "goblin", "goblin", "battleox", "battleox",
            "gemini", "gemini", "witch", "sangan", "kuriboh", "exiled", "axe",
            // 高星怪 7
            "valkyrion", "valkyrion", "valkyrion", "summonedskull", "gaia", "darkmagician", "blueyes",
            // 魔法 18
            "polymerization", "polymerization",
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure", "smashing", "axeofdespair", "magepower", "united",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: [],
    },
    warrior: {
        main: [
            // 低星怪 25
            "maraudingcaptain", "maraudingcaptain", "maraudingcaptain", "warriordai", "warriordai",
            "amazoness", "amazoness", "commandknight", "commandknight",
            "exiled", "exiled", "celtic", "celtic", "axe", "axe", "gemini", "gemini",
            "battleox", "battleox", "witch", "sangan", "kuriboh", "magicianoffaith", "mysticalelf", "axe",
            // 高星怪 8
            "swordstalker", "swordstalker", "gaia", "gaia", "summonedskull", "summonedskull", "darkmagician", "blueyes",
            // 魔法 17
            "reinforcement", "reinforcement", "warriorreturning", "warriorreturning", "aforces",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "united", "magepower", "axeofdespair",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: [],
    },
    zombie: {
        main: [
            // 低星怪 25
            "zombiemaster", "zombiemaster", "zombiemaster", "spiritreaper", "spiritreaper", "spiritreaper",
            "patrician", "patrician", "mysticalelf", "mysticalelf", "lajinn", "lajinn", "gemini", "gemini",
            "witch", "witch", "sangan", "sangan", "kuriboh", "kuriboh", "maneater", "maneater",
            "oldvindictive", "exiled", "magicianoffaith",
            // 高星怪 8
            "vampirelord", "vampirelord", "ryukokki", "ryukokki", "despair", "despair",
            "summonedskull", "summonedskull",
            // 魔法 17
            "bookoflife", "bookoflife", "bookoflife", "mummycall", "mummycall",
            "raigeki", "darkhole", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure", "smashing", "axeofdespair",
            // 陷阱 10
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder",
            "negateattack", "waboku", "waboku", "callofhaunted",
        ],
        extra: [],
    },
    fairy: {
        main: [
            // 低星怪 25
            "dunames", "dunames", "dunames", "shiningabyss", "shiningabyss", "mudora", "mudora",
            "hoshiningen", "hoshiningen", "hoshiningen", "mars", "mars",
            "mysticalelf", "mysticalelf", "mysticalelf", "gemini", "gemini", "magicianoffaith", "magicianoffaith",
            "kuriboh", "kuriboh", "witch", "sangan", "exiled", "oldvindictive",
            // 高星怪 7
            "gaia", "summonedskull", "summonedskull", "darkmagician", "darkmagician", "blueyes", "redeyes",
            // 魔法 18
            "raigeki", "darkhole", "mst", "mst", "monsterreborn", "potofgreed", "potofgreed",
            "gracefulcharity", "changeofheart", "swords", "fissure", "smashing",
            "axeofdespair", "axeofdespair", "magepower", "united", "blackpendant", "shieldsword",
            // 陷阱 10
            "solemnwishes", "solemnwishes",
            "traphole", "traphole", "mirrorforce", "sakuretsu", "sakuretsu", "magiccylinder", "negateattack", "waboku",
        ],
        extra: [],
    },
};
function buildDeck(preset) {
    const def = DECK_PRESETS[preset || "classic"];
    const counts = {};
    for (const id of def.main)
        if (window.YGO_CARD_BY_ID[id])
            counts[id] = (counts[id] || 0) + 1;
    const deck = [];
    for (const id of Object.keys(counts))
        for (let i = 0; i < counts[id]; i++)
            deck.push(id);
    return deck.slice(0, 60); // 卡组上限 60 张
}
function buildExtra(preset) {
    const def = DECK_PRESETS[preset || "classic"];
    return (def.extra || []).filter((id) => window.YGO_CARD_BY_ID[id]);
}
// 卡密（ygoprodeck 官方密码，8 位）—— 现有卡补齐
const PASSWORDS = {
    blueyes: "89631139", darkmagician: "46986414", summonedskull: "70781052", gaia: "06368038",
    celtic: "91152256", gemini: "69140098", stone: "13039848", silverfang: "90357090",
    mysticalelf: "15025844", axe: "48305365", battleox: "05053103", lajinn: "97590747",
    maneater: "54652250", oldvindictive: "45141844", magicianoffaith: "31560081", penguin: "93920745",
    yomiship: "51534754", giantgerm: "95178994", witch: "78010363", sangan: "26202165",
    exiled: "74131780", cannonsoldier: "11384280", goblin: "78658564", speardragon: "31553716",
    kuriboh: "40640057", sinisterserpent: "08131171",
    raigeki: "12580477", darkhole: "53129443", mst: "05318639", heavystorm: "19613556",
    monsterreborn: "83764718", potofgreed: "55144522", gracefulcharity: "79571449", changeofheart: "04031928",
    shieldsword: "52097679", fissure: "66788016", smashing: "97169186", swords: "72302403",
    axeofdespair: "40619825", blackpendant: "65169794", magepower: "83746708", united: "56747793",
    yami: "59197169", mountain: "50913601", forest: "87430998",
    traphole: "04206964", mirrorforce: "44095762", sakuretsu: "56120475", magiccylinder: "62279055",
    negateattack: "14315573", dimensionalprison: "70342110", waboku: "12607053", callofhaunted: "97077563",
    torrential: "53582587", ringofdestruction: "83555666", dusttornado: "60082869", seventools: "03819470",
    magicjammer: "77414722", bottomless: "29401950",
};
CARDS.forEach((c) => { if (!c.password && PASSWORDS[c.id])
    c.password = PASSWORDS[c.id]; });
window.YGO_CARDS = CARDS;
window.YGO_CARD_BY_ID = CARD_BY_ID;
window.YGO_BUILD_DECK = buildDeck;
window.YGO_BUILD_EXTRA = buildExtra;
window.YGO_DECK_PRESETS = Object.keys(DECK_PRESETS);
