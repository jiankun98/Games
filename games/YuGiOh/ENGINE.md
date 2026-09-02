# 游戏王·决斗对战 —— 引擎实现文档

本文档描述 `games/YuGiOh/` 下决斗引擎与 3D 界面的实现细节：模块结构、事件定义、状态参数、入口与调用链。
引擎与 UI 均为**原生 ES Module（`.mjs`）**，无打包器；浏览器经 importmap 直引 `node_modules` 的 three/animejs。
文中行号对应当前工作区文件。

---

## 目录

1. [架构总览](#1-架构总览)
2. [文件构成](#2-文件构成)
3. [入口与启动流程](#3-入口与启动流程)
4. [状态参数（数据结构）](#4-状态参数数据结构)
5. [事件系统](#5-事件系统)
6. [回合 / 阶段状态机](#6-回合--阶段状态机)
7. [关键调用链](#7-关键调用链)
8. [GameApi 原语参考](#8-gameapi-原语参考)
9. [卡牌数据与效果声明](#9-卡牌数据与效果声明)
10. [AI 与大模型接入](#10-ai-与大模型接入)
11. [3D UI 层（ui3d）](#11-3d-ui-层ui3d)
12. [测试](#12-测试)

---

## 1. 架构总览

「**规则引擎 + 数据驱动卡牌**」分层（引擎职责自述见 `engine/duel.mjs` 头注释）：

```
┌──────────────────────────────────────────────────────────────┐
│  UI 层   game.html（2D，经典全局脚本 + boot.mjs）              │
│          game3d.html（3D 薄入口）→ ui3d/*.mjs（九模块）        │
├──────────────────────────────────────────────────────────────┤
│  对手层  ai-player.mjs（启发式 AiPlayer）                      │
│          llm-player.mjs（大模型 LlmPlayer，失败回退 AI）       │
│          契约：mainPhase/battlePhase/pickTargets/              │
│                pickDiscard/decideChain 五个决策回调            │
├──────────────────────────────────────────────────────────────┤
│  数据层  cards.mjs：149 张卡的效果 triggers / continuous       │
│          + DECK_PRESETS 11 套卡组（引擎不认识任何具体卡）       │
├──────────────────────────────────────────────────────────────┤
│  引擎层  engine/*.mjs：duel.mjs 门面 + 九个"方法集类"子系统     │
│          回合/阶段流、LP、场地、通用规则、事件总线、            │
│          连锁响应窗、战斗公式、胜负、原语 API g                 │
└──────────────────────────────────────────────────────────────┘
```

**设计约束**（重构后保持不变）：

- 引擎不认识任何具体卡：卡牌效果全部以 `effect.triggers`（事件订阅）与 `effect.continuous`（永续攻守修正）声明在 `cards.mjs`。
- 卡牌效果修改对局的**唯一通道**是原语 API `g`（`engine/api.mjs` 的 `apiProto`），保证破坏送墓、事件发射、胜负检查等横切逻辑不被绕过。
- AI / 大模型只实现 5 个回调，经 `config.ai` 注入；UI 经 `DuelCallbacks`（onState/onLog/onToast/onEvent/onGameOver）被动接收状态。
- **节奏契约**：引擎 `emit()` 会 `await cb.onEvent(event)` 的返回 Promise（`engine/events.mjs:25-32`），UI 用 `fxPause`/通知队列控制动画节奏——修改 UI 时不可破坏该语义。

**模块拆分方式**：引擎原为单体 `index.js`（1690 行），现按职责切为 9 个"方法集类"文件，`duel.mjs` 用原型拷贝组装（`Object.defineProperty(Duel.prototype, …)`），方法体与单体版逐字相同，`this` 语义不变。对外 `Duel` 门面接口零变化。

---

## 2. 文件构成

| 文件 | 行数 | 职责 |
|---|---|---|
| `engine/duel.mjs` | 71 | **门面**：`class Duel`（constructor + start）+ 原型组装；`export { Duel }` |
| `engine/state.mjs` | 178 | 常量（`MONSTER_ZONES`/`ST_ZONES`/`NO_EVENT`/`RESPONSE_EVENTS`）、洗牌、`_initState`/`_mkCard`、查询方法（`monsters`/`stats`/`_findZone`/`_findCard`…） |
| `engine/prompt.mjs` | 50 | 输出/输入：`log`/`emitView`/`_pacePlayer`/`_ask`/`answer`/`delay`/`_askTargets`/`_toast` |
| `engine/events.mjs` | 82 | 事件总线：`spellSpeed`、`emit`、`_collectTriggers` |
| `engine/chain.mjs` | 186 | 连锁：`_openResponse`/`_chainableCards`/`_trapsNegated`/`activateAndResolve`/`_resolveChain`/`_afterResolve` |
| `engine/turn.mjs` | 209 | 回合/阶段：`_beginTurn`/`_drawPhase`/`nextPhase`/`endTurn`/`_enterBattlePhase`/`enterMain2`/`_endTurn`/`_enforceHandLimit`/`_checkWin`/`_win` |
| `engine/summon.mjs` | 167 | 召唤：`normalSummon`/`setMonster`/`tributeSummon`/`flipSummon`/`changePosition`/`placeMonster`/`doSummon` |
| `engine/action.mjs` | 172 | 手动发动：`activateHandSpell`/`setSpellTrap`/`activateSetTrap`/`activateMonsterEffect`/`activateHandMonsterEffect`/`manualTrigger`/`_manualCondOk`/`manualCondOk` |
| `engine/battle.mjs` | 208 | 战斗：`attackBlock`/`declareAttack`/`damageStep`/`_afterAttack`/`_destroyInBattle` |
| `engine/api.mjs` | 460 | 原语 API：`apiProto`（`g` 的方法表）+ `_buildApi` + 全部原语内部实现（`_destroy`/`_banish`/`_sendToGrave`/`_specialSummon`/`_fusionSummon`…） |
| `engine/boot.mjs` | 21 | 经典页面兼容层：组装并挂 `window.YGO_*`/`AiPlayer`/`LlmPlayer`/`Duel`，派发 `DOMContentLoaded`（2D 页使用） |
| `cards.mjs` | 1366 | **卡牌数据与效果**：149 张卡 + `DECK_PRESETS` 11 套（`cards.mjs:1107`）+ `PASSWORDS`（:1341）；导出 `CARDS/CARD_BY_ID/DECK_PRESETS/buildDeck/buildExtra`（:1361） |
| `ai-player.mjs` | 518 | 启发式 AI，`export { AiPlayer }`（:517） |
| `llm-player.mjs` | 738 | 大模型玩家，`export { LlmPlayer, YGO_LLM }`（:737-738）；仅浏览器可用 |
| `game.html` | 1301 | 2D 对局界面（内联 UI 脚本，后续可迁移 ui3d 风格） |
| `game3d.html` | 88 | **3D 薄入口**：DOM 骨架 + importmap + 错误收集器 + `<script src="./ui3d/main.mjs">` |
| `game3d.css` | 1595 | 3D 页全部样式（从原 HTML 抽出） |
| `ui3d/*.mjs` | 9 个模块 | 3D UI 层（见 [§11](#11-3d-ui-层ui3d)） |
| `run/game.js` | — | Express 静态服务器（:5173）+ `/api/llm`、`/api/img` 代理 |
| `run/test-*.mjs` | 7 个 | 引擎回归测试（见 [§12](#12-测试)） |

> 原 `index.js`/`cards.js`/`ai-player.js`/`llm-player.js` 与滞后的 `.ts`、`tsconfig.json` 已在拆分验证后删除（git 历史可查）。

---

## 3. 入口与启动流程

### 3.1 服务端

```
npm start  →  node run/game.js   （仓库根 package.json:8）
```

- `run/game.js:16-20`：端口默认 **5173**；`:33` 静态托管整个仓库（展厅 `/index.html`，游戏王 `/games/YuGiOh/game.html` 与 `/games/YuGiOh/game3d.html`）。
- `run/game.js:36`：`POST /api/llm` OpenAI 兼容流式代理；`:101`：`GET /api/img` 卡图代理（白名单 `images.ygoprodeck.com`）。

### 3.2 页面加载

**2D `game.html`**：`<head>` 仅一个 `<script type="module" src="./engine/boot.mjs">`。boot 挂载全部 window 全局；页面内联 UI 脚本在 `DOMContentLoaded` 后调用 `newGame()`（模块脚本先于该事件执行，时序安全）：

```js
// game.html 尾部
document.addEventListener("DOMContentLoaded", () => newGame());
// game.html:1266-1267 处 newGame 内：
duel = new Duel({ playerPreset, aiPreset, pace, promptDelay },
                { onState, onLog, onToast, onEvent, onGameOver });
duel.start();
```

**3D `game3d.html`**：薄入口直接加载 `ui3d/main.mjs`（**不经 window 全局**，直接 `import { Duel } from "../engine/duel.mjs"`）。一个内联错误收集模块先于 main 执行（`window.__errs`）。

### 3.3 引擎初始化序列

`new Duel(config, callbacks)`（`engine/duel.mjs:28`）→ 挂 `this._apiProto = apiProto`、读 rng/预设/LP/节奏 → `this.g = this._buildApi()`（api.mjs）→ 默认 `this.ai = new AiPlayer(this)`。

`duel.start()`（`engine/duel.mjs:54`）：

```
start()
 ├─ this.state = this._initState()      // state.mjs:22：洗牌、各抽 5 张、GameState
 ├─ emit({ kind: "game_start" })
 └─ this._beginTurn()                   // turn.mjs:9
```

### 3.4 配置与回调参数

`DuelConfig` / `DuelCallbacks` 的字段与旧版一致（LP 8000、`aiDelay` 650、`pace` 350、`promptDelay` 220）：

| DuelConfig | 说明 | DuelCallbacks | 说明 |
|---|---|---|---|
| `rng` | 随机源（洗牌） | `onState(state)` | 每次状态变化（`emitView`） |
| `lp` | 初始 LP（8000） | `onLog(msg)` | 战斗日志 |
| `aiDelay` | AI 动作间隔 650ms | `onToast(msg)` | 非致命提示 |
| `playerPreset` / `aiPreset` | 卡组预设名 | `onEvent(ev)` | 事件表现钩子，可返回 Promise 控制节奏 |
| `playerDeck` / `aiDeck` / `playerExtra` / `aiExtra` | 直接指定卡组（覆盖预设） | `onGameOver(who)` | `"me" \| "ai" \| "draw"` |
| `ai` | 对手驱动（默认 `new AiPlayer(this)`） | | |
| `pace` / `promptDelay` | 玩家节流 / 弹窗前置延迟 | | |

---

## 4. 状态参数（数据结构）

> 原 `index.ts`（滞后副本）已删除；本节为状态结构的**权威定义**。运行时构造在 `engine/state.mjs`（`_initState`:22、`_mkCard`:73）。

### 4.1 基础类型与常量

| 类型 | 取值 |
|---|---|
| `PlayerKey` | `"me" \| "ai"` |
| `Position` | `"atk" \| "def"` |
| `CardLocation` | `"deck" \| "hand" \| "monster" \| "spell" \| "field" \| "grave" \| "banished" \| "extra"` |
| `Phase` | `"draw" \| "standby" \| "main1" \| "battle" \| "main2" \| "end"` |
| `CardType` / `CardSubtype` | `monster/spell/trap`；`通常/永续/装备/场地/反击` |

常量（`engine/state.mjs:7-12`）：`MONSTER_ZONES=5`、`ST_ZONES=5`、`NO_EVENT={}`（手动发动占位）、`RESPONSE_EVENTS={"summon_attempt","summon","attack_declare","damage_calc"}`。

### 4.2 CardDef / Card

`CardDef`（卡面静态数据）：`id, name, type, level?, attribute?, race?, atk?, def?, text?, password?, subtype?, effect?, fusion?{materials}, trapNegate?, trapImmune?`。

`Card`（运行时实例 = CardDef + 状态字段，`_mkCard` 构造）：`uid`（实例唯一 id，目标/装备寻址）、`cid`（=CardDef.id）、`position`、`faceDown`、`turnSet`（覆盖回合，`-1` 非覆盖）、`turnSummoned`（上场回合，`-1` 未上场）、`controller`、`location`、`originalAtk/originalDef`、`equipped[]`、`equipTarget`、`linkPartner`（场地链接连带破坏）、`controlOriginalController` + `tempControlUntil`（临时控制权，`"turn_end"` 归还）。

### 4.3 PlayerState（`state.mjs:127-142` 构造）

`lp`、`deck/hand/extra`、`monsterZone[5]`、`spellZone[5]`、`fieldZone`、`graveyard/banished`、`normalSummonUsed`、`attacked/positionChanged/setThisTurn`（按区下标记录）、`noBattleDamageTurn`、`attackLockTurns`（光之护封剑）。前 9 项每回合在 `_beginTurn` 重置。

### 4.4 GameState（`state.mjs:171-175` 构造）

`me/ai`、`turn`、`turnPlayer`、`phase`、`winner`（非 null 后 `emit` 短路）、`chain[]`（连锁栈）、`resolving`、`lastEvent`、`currentAttack{attacker,atkOwner}`、`attackNegated`、`endBattlePhase`、`swappedAtkDefTurn`（盾与剑）、`trapStunTurn`（陷阱无力化）、`pending`（PromptState）。

### 4.5 ChainLink

`player, card, trigger, targets[], event, source, speed, ctx`。`source`：`auto / response / spell-hand / trap-set / monster-effect / monster-hand-effect`。

### 4.6 GameEvent

`kind` + 按需字段：`actor, player, card, monster, attacker, target, attackerOwner, targetOwner, damageTo, damage, direct, hidden, summonKind, phase, turn, source, link, from, reason, owner, by, delta, until, to`。注意 `damage_calc` 事件对象是**可变引用**——连锁中改写 `ev.damage` 即减伤（栗子球 `g.negateBattleDamage`）。

### 4.7 PromptState（挂起的交互提示，`prompt.mjs:18` `_ask` 写入）

`{kind:"select", options, selectOne?, multi?}` / `{kind:"chain", event, options}` / `{kind:"confirm", msg}`；UI 渲染后经 `duel.answer(value)` 应答（`prompt.mjs:32`）。

---

## 5. 事件系统

### 5.1 事件定义全集（19 种 + manual 伪事件）

| # | 事件 | 发射位置 | 说明 |
|---|---|---|---|
| 1 | `game_start` | duel.mjs（start） | 决斗开始 |
| 2 | `turn_start` | turn.mjs `_beginTurn` | 每回合标志已重置、护封剑计数已递减 |
| 3 | `turn_end` | turn.mjs `_endTurn` | 心变归还后、手卡上限前 |
| 4 | `phase_start` | `_beginTurn`/`_drawPhase`/`_beginTurn`/`_enterBattlePhase`/`enterMain2`/`_endTurn` | 六阶段各一次 |
| 5 | `draw_card` | api.mjs `_draw`、turn.mjs `_drawPhase` | 抽卡（含效果抽卡） |
| 6 | `summon_attempt` | summon.mjs `doSummon` | 神之宣告可 `g.negateSummon` 无效召唤 |
| 7 | `summon` | api.mjs `_specialSummon`/`_fusionSummon`、summon.mjs `doSummon` | 召唤成功（summonKind: normal/set/tribute/flip/special/fusion） |
| 8 | `flip` | api.mjs `_flipUp`、summon.mjs `flipSummon`、battle.mjs `damageStep` | 反转效果触发点（by: effect/flipSummon/attack） |
| 9 | `activate` | chain.mjs `_openResponse`/`activateAndResolve` | **纯表现事件**，无卡订阅，仅 UI 消费 |
| 10 | `attack_declare` | battle.mjs `declareAttack` | 攻击反应陷阱主窗口 |
| 11 | `damage_calc` | battle.mjs `damageStep`（直攻/守方/攻方） | 事件对象可变引用，可连锁减伤 |
| 12 | `damage_step_end` | battle.mjs `_afterAttack` | 哥布林转守备类 |
| 13 | `destroyed_by_battle` | battle.mjs `_destroyInBattle` | 死者之船类反伤 |
| 14 | `sent_to_grave` | api.mjs `_sendToGrave`、battle.mjs `_destroyInBattle` | 检索触发点（reason: battle/effect/discard/tribute/fusion/negate） |
| 15 | `banish` | api.mjs `_banish` | 除外 |
| 16 | `return_to_hand` | api.mjs `_bounce` | 弹回手卡 |
| 17 | `control_change` | api.mjs `_changeControl` | 控制权变更（until: turn_end） |
| 18 | `lp_change` | api.mjs `_damage` | LP 变动（payLp 不发） |
| 19 | `position_change` | summon.mjs `changePosition` | 表示形式切换 |

> `event:"manual"` 是卡牌触发器的**伪事件**：仅被 `manualTrigger()`（action.mjs:145）用于查找可手动发动触发器，从不经过 `emit`。cards.mjs 中有 61 处。

### 5.2 分发机制 —— `emit(event)`（events.mjs:18）

```
emit(event)
 ├─ winner 已定 → 返回；嵌套深度 > 30 → 截断
 ├─ state.lastEvent = event
 ├─ await cb.onEvent(event)            // UI 表现钩子（可控制节奏，异常不影响逻辑）
 ├─ ① 自动触发：_collectTriggers(event, true) → 逐个 activateAndResolve(..., "auto")
 └─ ② 若 kind ∈ RESPONSE_EVENTS：_openResponse → chain 非空则 _resolveChain
```

### 5.3 触发器声明与收集

订阅声明（cards.mjs，`Trigger`）：`{ event, auto?, speed?, condition?, cost?, acquireTargets?, resolve? }`。
收集 `_collectTriggers`（events.mjs:52）：遍历双方 `hand+monsterZone+spellZone+fieldZone+graveyard`（墓地触发器有效），匹配 `event.kind + auto 标志 + condition`（异常视为不满足），每卡最多一条，**回合玩家优先**排序。

### 5.4 连锁响应窗与咒文速度

- 咒文速度 `spellSpeed`（events.mjs:7）：陷阱 2、反击陷阱 3、其余 1（`effect.speed` 可覆盖）。
- 响应窗 `_openResponse`（chain.mjs:14）：从 `opp(event.actor)` 起双方交替询问，连续 2 次 pass 关闭；`_chainableCards`（:68）过滤规则——非 auto、event 匹配、速度 ≥ 连锁顶、陷阱未被无效（`_trapsNegated`:108）、盖伏陷阱须 `turnSet < 当前回合`、手坑仅 `damage_calc` 窗口。**第一张卡入链后，后续连锁匹配 `activate` 语境**（引擎的"连锁上一环"语义）。
- 人 `_ask("chain")` 弹窗应答；AI `ai.decideChain`。入链 → `emit activate` → 换边。
- 结算 `_resolveChain`（chain.mjs:149）：逆序 pop，`trigger.resolve(card, ctx, g, targets)`，`_afterResolve`（:174）将通常/反击魔陷送墓。

### 5.5 激活生命周期 `activateAndResolve`（chain.mjs:120）

所有效果发动统一入口：`acquireTargets`（null 则取消）→ `cost` → 陷阱翻开 → `emit activate` → 入链 → `_openResponse` → `_resolveChain`。`preTargets` 用于手牌魔法"先选目标再上场"。

### 5.6 手动发动（action.mjs）

四个入口汇入 `activateAndResolve`：`activateHandSpell`:9（source `"spell-hand"`，条件校验+先选目标+上场）、`setSpellTrap`:50、`activateSetTrap`:73（`"trap-set"`，盖伏当回合禁发）、`activateMonsterEffect`:98（`"monster-effect"`）、`activateHandMonsterEffect`:124（`"monster-hand-effect"`）。`manualTrigger`:145、`_manualCondOk`:151、UI 预检 `manualCondOk`:162。

### 5.7 永续修正 `continuous`（不走事件）

`stats()`（state.mjs:102）每次查询重算：场地魔法 + 双方场上光环 + 装备；盾与剑回合先做原始攻守互换；结果下限 0。

---

## 6. 回合 / 阶段状态机

```
_beginTurn (turn.mjs:9)
  重置每回合标志(:14-19) → 护封剑计数(:21-35) → emit turn_start(:37)
  → draw（先手首回合跳抽 :41-48）→ standby(:51) → main1(:54-55)
      玩家回合：停住等操作
      AI 回合：ai.mainPhase(:61) → _enterBattlePhase(:64) → _endTurn(:67)
_enterBattlePhase(:108)：先手首回合禁入 → 直接落 main2
enterMain2(:123)
_endTurn(:132)：emit end(:133) → 心变归还(:135-153) → emit turn_end(:155)
  → 手卡上限6(:157, :166) → 换边/turn++/phase=draw(:159-161) → 递归 _beginTurn(:163)
```

玩家操作：`nextPhase`（turn.mjs:88，main1→battle→main2→结束）、`endTurn`（:101，一键结束）。均有守卫（回合/阶段/无 pending/非 resolving）+ `_pacePlayer` 节流。

胜负 `_checkWin`（:181，LP 双零平局/单零判负）、`_win`（:200，`onGameOver`）；卡组耗尽在抽卡时判负（api.mjs `_draw` / turn.mjs `_drawPhase`）。

---

## 7. 关键调用链

（方法名可直接在对应模块中检索；括号为 UI 触发点）

**① 通常召唤**：UI 手牌菜单 → `duel.normalSummon`（summon.mjs:9，守卫 :10-27）→ `placeMonster`（:146）→ `doSummon`（:156）→ `emit summon_attempt` → `_collectTriggers`（神之宣告可 negateSummon）→ `_openResponse` → `emit summon` → 触发窗/连锁。

**② 手动发动**：UI → `activateHandSpell`（action.mjs:9）→ `manualTrigger` + `_manualCondOk`（不满足留在手牌）→ `acquireTargets`（无目标不发动）→ 上场 → `activateAndResolve`（chain.mjs:120）→ `emit activate` → 入链 → `_openResponse` → `_resolveChain` → `trigger.resolve` → `_afterResolve`。

**③ 攻击/伤害步骤**：UI → `declareAttack`（battle.mjs:28，守卫 :29-51，无怪直接攻击 :53-54）→ `emit attack_declare`（:59，陷阱连锁窗）→ `endBattlePhase`→enterMain2 / `attackNegated`→终止 → `damageStep`（:83）：`stats` → 守备翻面 → 攻vs攻/攻vs守公式 → `emit damage_calc`（守方/攻方，`ev.damage` 可被改写）→ `_destroyInBattle`（:184：装备随葬→送墓→`sent_to_grave`→`destroyed_by_battle`）→ LP 扣减 `_checkWin` → 反转效果 `flip` → `_afterAttack`（:174）→ `emit damage_step_end`。

**④ 连锁响应**：`_openResponse`（chain.mjs:14）→ `_chainableCards` 枚举 → 人弹窗/AI decideChain → 入链（acquireTargets→cost→翻开）→ 窗闭 → `_resolveChain`（:149，LIFO）→ `_afterResolve`。

**⑤ AI 回合驱动**：`_beginTurn` AI 分支（turn.mjs:61）→ `ai.mainPhase`（ai-player.mjs:50）→ `_enterBattlePhase` → `ai.battlePhase`（ai-player.mjs:355）→ `_endTurn`。其余决策点：连锁 `decideChain`（:457，engine/chain.mjs 调用）、目标 `pickTargets`（:35，prompt.mjs `_askTargets` 调用）、弃牌 `pickDiscard`（:42，api.mjs `_discard`/turn.mjs `_enforceHandLimit` 调用）。

**⑥ 交互应答**：`_askTargets`（prompt.mjs:41）→ 人：`_ask("select")` 挂起 pending → UI 渲染 → `duel.answer(value)`（:32）；AI：`ai.pickTargets` 同步返回。

---

## 8. GameApi 原语参考

卡牌效果**唯一 mutate 通道**。方法表 `apiProto`（api.mjs:7）由 `_buildApi` 挂载为 `this.g`（`g._duel = this`，方法内 `this` 指向 g）。

**查询类**：`opponent / monsters / spells / allMonsters / field / graveyard / deck / hand / extra / stats / countST / findCard / isValid / controller / playerOf / hasMaterial / lp / activator / turn / phase`。

**动作类**（内部实现均在 api.mjs，动作后统一 `emitView` + 事件发射 + `_checkWin`）：

| 方法 | 内部实现 | 说明 |
|---|---|---|
| `destroy / destroyST` | `_destroy` | 破坏（装备随葬、场地链接连带、护封剑解锁、trapImmune） |
| `banish` / `banishFromDeck` | `_banish` / :312 | 除外（后者不发事件） |
| `bounce` | `_bounce` | 弹回手卡 |
| `sendToGrave(card, from, reason?)` | `_sendToGrave` | 任意送墓（触发墓地触发器） |
| `tribute` | `tribute` | 祭品 |
| `negateSummon` | `_negateSummon` | 无效召唤 |
| `damage / draw / discard / discardCard / payLp` | `_damage` 等 | 伤害发 `lp_change`；payLp 不发 |
| `specialSummon / fusionSummon` | `_specialSummon` / `_fusionSummon` | 特召/融合（校验 materials） |
| `addToHand / recoverToHand` | `_addToHand` | 检索/回收 |
| `changePosition / changeControl / flipUp / equip / setField / linkCards` | 同名 `_` 前缀 | 表示/控制权/翻转/装备/场地/链接 |
| `setAttackLock / swapAtkDefThisTurn / setNoBattleDamage / setTrapStunThisTurn / negateAttack / negateBattleDamage / negate` | 同名 | 光封/盾剑/免伤/陷阱无力化/无效攻击/无效伤害/无效连锁 |
| `askTargets` | `_askTargets` | 目标选择（人弹窗/AI 自动） |

**免疫机制** `_immuneNow`：卡带 `trapImmune` 且当前结算发动卡（`_currentEffectType`，`_resolveChain` 置位）为陷阱时，destroy/banish/bounce 无效。

---

## 9. 卡牌数据与效果声明

格式约定见 `cards.mjs` 头注释。声明示例：

```js
// 无效果怪兽
{ id: "blueyes", password: "89631139", name: "青眼白龙", type: "monster", level: 8, atk: 3000, def: 2500, ... }
// 反转效果（cards.mjs:50 食人虫）
effect: { triggers: [{ event: "flip", auto: true,
    condition: (self, ev) => ev.monster === self,
    acquireTargets: async (self, ev, g) => pickMonsters(g, "...", filter, 1),
    resolve: async (self, ev, g, t) => { ... g.destroy(...) } }] }
// 永续修正
effect: { continuous: (self, mon, g) => ({ atkDelta: 500, defDelta: 200 }) }
```

- `DECK_PRESETS`（cards.mjs:1107）11 套：classic/hero/machine/blueeyes/darkmagician/redeyes/harpie/magnet/warrior/zombie/fairy，结构 `{ main, extra }`。
- `buildDeck`（:1324，上限 60）/ `buildExtra`（:1336）；`PASSWORDS`（:1341）官方卡密；导出（:1361）。
- 卡图按卡密从 ygoprodeck 拉取（`run/fetch-passwords.js` 校准、`/api/img` 代理）。

---

## 10. AI 与大模型接入

**契约（5 个决策回调）**：

| 方法 | 职责 | 引擎调用点 |
|---|---|---|
| `mainPhase` | 主阶段自动出牌 | turn.mjs（AI 回合 main1/main2） |
| `battlePhase` | 战斗攻击决策 | turn.mjs `_enterBattlePhase` |
| `pickTargets` | 效果目标选择 | prompt.mjs `_askTargets` |
| `pickDiscard` | 弃牌选择 | api.mjs `_discard`、turn.mjs `_enforceHandLimit` |
| `decideChain` | 是否连锁 | chain.mjs `_openResponse` |

内置 `AiPlayer`（ai-player.mjs）为启发式估值；`LlmPlayer`（llm-player.mjs:212）实现同一契约：每步把净化局面 + 合法动作候选表发给 OpenAI 兼容接口，失败回退 AiPlayer；供应商预设/配置见 `YGO_LLM`（:737，含 `PRESETS/loadCfg/saveCfg/cfgReady/testConnection`），默认走 `/api/llm` 代理。3D 页 `llm.attach(duel, new AiPlayer(duel))` 后替换 `duel.ai`。

---

## 11. 3D UI 层（ui3d）

`game3d.html` 原 4998 行单文件已拆为薄入口（88 行）+ `game3d.css` + 九个模块。依赖**单向无环**：

```
main.mjs ─→ scene.mjs ─→ domfx.mjs ─→ labels.mjs
   │           │ ↑(chipEls/projectMesh/artUrl) sfx.mjs
   ├──→ hud.mjs ─┘（scene 点击路由由 main 经 setClickHandler 注入，避免 hud↔scene 环）
   ├──→ fxevent.mjs ─→ scene（fx3D 函数/tween3D/cardMeshes）
   └──→ store.mjs / engine（Duel/AiPlayer/LlmPlayer 直 import，不经 window）
```

| 模块 | 行数 | 职责 |
|---|---|---|
| `store.mjs` | 47 | 共享可变状态单例 `S`（duel/mode/attackZone/tributePool/menuOpen/deckChoice/opponentMode/paceMode/llmPlayer/onAgain）+ `PACE_PRESETS/PACE_SCALE/saveOppMode` |
| `labels.mjs` | 111 | SVG 图标 `IC`、属性/种族 emoji、`DECK_LABELS/DECK_EMOJIS/PHASE_TIPS`（原两页重复文案的收敛点） |
| `sfx.mjs` | 92 | WebAudio 合成音效（`sfx/toggleSfx`，无音频资源） |
| `domfx.mjs` | 80 | DOM 特效原语：`fxEl` 横幅/`fxTurnBanner`/`fxPhaseBanner`/`fxLpFloat`/`flashScreen` |
| `scene.mjs` | 1732 | Three.js 层：场景/灯光/穹顶/桌面/贴花、纹理与立绘三级缓存、卡牌 mesh 与布局、`sync3D` 状态同步、animejs 动画（tween/粒子/冲击波/碎裂）、拾取与渲染循环；导出 `sync3D/projectMesh/projectCard3D/fxGlow3D/fxAttack3D/fxImpact3D/fxBurst3D/fxSummon3D/tween3D/shakeBoard/chipEls/setClickHandler/resetScene3D/artUrl/debugPick` |
| `hud.mjs` | 817 | DOM/HUD：`render/updateLP/turnBar/chainBanner/openMenu/closeMenu/renderModeBar/renderChips/renderPrompt/pushLog/toast/openListModal/showHelp/showGameOver/openDeckSelect`（含 LLM 配置面板）+ `resetHud` |
| `actions.mjs` | 159 | `availableActions(ctx, card, info)` 纯逻辑（ctx = `{duel, ic, closeMenu, startTribute, enterAttackMode}`，2D 页迁移时可直接复用） |
| `fxevent.mjs` | 226 | `fxEvent(ev)` 事件→动画/通知分发（**返回 Promise 供引擎 await，节奏契约**）+ 串行通知队列（FIFO/CAP/HOLD×PACE_SCALE） |
| `main.mjs` | 148 | 装配：newGame、Duel callbacks、按钮绑定、点击路由注入、`window.__ygo3d` 调试句柄 |

**四个关键接缝**（改动 UI 时保持）：

1. **state 注入**：scene 不直读全局——`sync3D` 经 `store.S` 取 duel/模式状态；`stats` 查询走 `S.duel.stats`。
2. **投影 API**：`projectMesh(mesh)` / `projectCard3D(uid)` 返回屏幕坐标（菜单定位、伤害数字、chip 投影统一出口）。
3. **节奏契约**：`fxEvent` 返回 Promise，引擎 `await`（events.mjs `emit`）；通知队列串行 FIFO + `NOTIFY_CAP` 洪峰保护 + `PACE_SCALE` 节奏缩放，语义不可改。
4. **模式高亮**：`S.mode/attackZone/tributePool` 同时被 3D 高亮（sync3D）、渲染循环抬升、拾取路由、modebar 消费；渲染刷新走单通道（onState → render + sync3D）。

**按需渲染 + 双路驱动 + tween 超时收尾**：内嵌 webview 常把页签误报为 `document.hidden`，rAF 会停摆/半节流（实测低至 1-16fps），纯 rAF 驱动的页面在该状态下要么冻结、要么（有兜底时）持续全速空转烧 CPU。scene.mjs 的对策分三层：① **空闲早退**——`renderLoop` 开头检查「无激活 tween、无未落位卡牌、距最后交互/状态变化超过宽限期（1.6s）」则跳过全部场景更新与渲染，最后一帧保留在画布上，空闲 CPU 占用≈0；② **双路驱动互不污染**——rAF 自循环 `frame()`（可见时 60fps；一帧至多一个待回调，永不累积）+ Web Worker 定时器兜底（25ms tick，不受可见性节流，rAF 停摆时直调 renderLoop）；**renderLoop 内绝不排队 rAF**——否则 Worker 每次直调都会多排一个回调，队列以 +40/s 线性累积，表现为「越玩越卡直至冻死」；③ **tween 超时强制收尾**——animejs 同样依赖 rAF，冻结时 onComplete 永不触发、busy 标记永久卡死早退判定，Worker 巡检对超时（dur+2s）未完成的 tween 强制收尾。唤醒源：`sync3D`（状态变化）、`tween3D`/粒子/碎裂/受击闪光（动画期）、pointer 事件（悬停/拖拽）、resize。另检测软件 WebGL（SwiftShader/llvmpipe）时自动关阴影、像素比降为 1（`window.__ygoSoftGL`）。调试句柄：`window.__renderCount`（实际渲染计数）、`window.__ygo3d`（S/projectCard3D/debugPick）。

---

## 12. 测试

Node 直跑（引擎为纯 ESM，无需 window 垫片）：

```bash
node run/test-swords.mjs        # 光之护封剑：封锁攻击 + 破坏解除
node run/test-cylinder.mjs      # 魔法筒：仅反弹一次
node run/test-cond.mjs          # condition 前置校验（幕帘/青眼贤士）
node run/test-chain.mjs         # 同窗口连锁逆序（LIFO）结算
node run/test-summon-negate.mjs # 神之宣告无效召唤（半 LP 代价）
node run/test-sangan.mjs        # 三眼怪送墓触发检索
node run/test-control.mjs       # 心变控制权 turn_end 归还
node run/check-decks.mjs        # 11 套卡组构建校验
```

退出码：0=通过，1=BUG，2/3=不确定/异常。测试经 `DuelConfig` 注入固定卡组与 `aiDelay/pace/promptDelay: 0`。

---

## 附：一图速查（启动 → 首回合）

```
npm start → run/game.js (:5173 Express)
  └─ /games/YuGiOh/game3d.html
       ├─ ui3d/main.mjs ─ import engine/duel.mjs（Duel）+ ui3d 九模块
       ├─ newGame(): resetHud → resetScene3D → new Duel(config, callbacks)
       │                （LLM 模式：llm.attach(duel, new AiPlayer(duel))）
       └─ duel.start()
             ├─ _initState（state.mjs）→ emit game_start → _beginTurn（turn.mjs）
             └─ draw → standby → main1 →（battle → main2）→ end → 换边循环
                  每步 emit 事件 → fxEvent（Promise 节奏）→ render + sync3D
```
