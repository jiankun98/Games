/*
 * 游戏王·决斗对战 - 事件驱动规则引擎（TypeScript）
 *  引擎只负责：回合/阶段流、LP、场地、卡牌状态记录、通用规则（召唤/祭品/战斗公式/连锁/咒文速度/胜负/手卡上限）、
 *  事件总线 emit、通用触发器查询 collectTriggers、激活生命周期 activateAndResolve、响应窗口 openResponse、连锁结算、
 *  原语 API g、recompute。引擎不认识任何具体卡：所有卡牌特殊处理都在 cards.ts 的 triggers 与 continuous 中。
 *  AI 决策全部在 ai-player.ts（AiPlayer），引擎仅在 AI 回合与决策点回调，双方通过公开接口协作。
 *
 *  对外：window.Duel = class Duel。界面 new Duel(config, callbacks)。
 *  依赖：cards.js（window.YGO_CARDS / window.YGO_CARD_BY_ID / window.YGO_BUILD_DECK / window.YGO_BUILD_EXTRA）、ai-player.js。
 */

/* ===================== 全局类型声明 ===================== */

type PlayerKey = "me" | "ai";
type Position = "atk" | "def";
type CardLocation = "deck" | "hand" | "monster" | "spell" | "field" | "grave" | "banished" | "extra";
type CardType = "monster" | "spell" | "trap";
type CardSubtype = "通常" | "永续" | "装备" | "场地" | "反击" | undefined;
type Phase = "draw" | "standby" | "main1" | "battle" | "main2" | "end";
type EventKind =
  | "game_start" | "turn_start" | "turn_end" | "phase_start" | "draw_card"
  | "summon_attempt" | "summon" | "flip" | "activate" | "attack_declare" | "damage_calc"
  | "damage_step_end" | "destroyed_by_battle" | "sent_to_grave" | "banish" | "return_to_hand"
  | "control_change" | "lp_change" | "position_change";

/** 卡牌效果触发器（声明式，全部由 cards.ts 提供） */
interface Trigger {
  event: EventKind | string;
  auto?: boolean;
  speed?: number;
  condition?: (self: Card, ev: GameEvent, g: GameApi) => boolean;
  cost?: (self: Card, ev: GameEvent, g: GameApi) => void | Promise<void>;
  acquireTargets?: (self: Card, ev: GameEvent, g: GameApi) => Promise<(string | null)[] | null>;
  resolve?: (self: Card, ev: GameEvent, g: GameApi, targets: (string | null)[]) => void | Promise<void>;
}

/** 卡牌效果（triggers + 永续修饰 continuous） */
interface Effect {
  triggers?: Trigger[];
  continuous?: (self: Card, mon: Card, g: GameApi) => { atkDelta: number; defDelta: number };
  races?: string[];
  speed?: number;
}

/** 融合素材声明 */
interface FusionDef { materials: string[]; }

/** 卡面数据（cards.ts 静态定义） */
interface CardDef {
  id: string;
  name: string;
  type: CardType;
  level?: number;
  attribute?: string;
  race?: string;
  atk?: number;
  def?: number;
  text?: string;
  password?: string;
  subtype?: CardSubtype;
  effect?: Effect;
  fusion?: FusionDef;
  trapNegate?: boolean;
  trapImmune?: boolean;
}

/** 卡牌实例（卡面数据 + 对局运行时状态） */
interface Card extends CardDef {
  uid: string;
  cid: string;
  position: Position | null;
  faceDown: boolean;
  turnSet: number;
  turnSummoned: number;
  controller: PlayerKey;
  location: CardLocation;
  originalAtk: number;
  originalDef: number;
  equipped: Card[];
  equipTarget: string | null;
  linkPartner: Card | null;
  controlOriginalController: PlayerKey | null;
  tempControlUntil: string | null;
}

/** 双方玩家状态 */
interface PlayerState {
  lp: number;
  deck: Card[];
  hand: Card[];
  extra: Card[];
  monsterZone: (Card | null)[];
  spellZone: (Card | null)[];
  fieldZone: Card | null;
  graveyard: Card[];
  banished: Card[];
  normalSummonUsed: boolean;
  attacked: Record<number, boolean>;
  positionChanged: Record<number, boolean>;
  setThisTurn: Record<number, boolean>;
  noBattleDamageTurn: boolean;
  attackLockTurns: number;
}

/** 连锁环节点 */
interface ChainLink {
  player: PlayerKey;
  card: Card;
  trigger: Trigger;
  targets: (string | null)[];
  event: GameEvent | null;
  source: string;
  speed: number;
  ctx: GameEvent;
}

/** 对局总状态 */
interface GameState {
  me: PlayerState;
  ai: PlayerState;
  turn: number;
  turnPlayer: PlayerKey;
  phase: Phase;
  winner: PlayerKey | "draw" | null;
  chain: ChainLink[];
  resolving: boolean;
  lastEvent: GameEvent | null;
  currentAttack: { attacker: Card; atkOwner: PlayerKey } | null;
  attackNegated: boolean;
  endBattlePhase: boolean;
  swappedAtkDefTurn: number;
  trapStunTurn: number;
  pending: PromptState | null;
}

/** 事件（字段按需可选，另留索引签名容纳扩展字段） */
interface GameEvent {
  kind: EventKind | string;
  actor?: PlayerKey;
  player?: PlayerKey;
  card?: Card;
  monster?: Card;
  attacker?: Card;
  target?: Card | null;
  attackerOwner?: PlayerKey;
  targetOwner?: PlayerKey;
  damageTo?: PlayerKey;
  damage?: number;
  direct?: boolean;
  hidden?: boolean;
  summonKind?: string;
  phase?: Phase;
  turn?: number;
  source?: string;
  link?: ChainLink;
  from?: string;
  reason?: string;
  owner?: PlayerKey;
  by?: string;
  delta?: number;
  until?: string;
  /** control_change 事件为控制权转移目标玩家；position_change 事件为切换后的表示形式 */
  to?: PlayerKey | Position;
  [key: string]: unknown;
}

/** 引擎原语 API（卡牌效果唯一 mutate 通道，由 Duel 构建） */
interface GameApi {
  readonly activator: PlayerKey | null;
  readonly turn: number;
  readonly phase: Phase;
  opponent(player: PlayerKey): PlayerKey;
  monsters(p: PlayerKey): Card[];
  spells(p: PlayerKey): Card[];
  allMonsters(): Card[];
  field(p: PlayerKey): Card | null;
  graveyard(p: PlayerKey): Card[];
  deck(p: PlayerKey): Card[];
  hand(p: PlayerKey): Card[];
  stats(mon: Card): { atk: number; def: number };
  countST(p: PlayerKey): number;
  findCard(uid: string | null): Card | null;
  isValid(card: Card): boolean;
  controller(card: Card): PlayerKey;
  playerOf(card: Card): PlayerKey;
  extra(player: PlayerKey): Card[];
  hasMaterial(player: PlayerKey, cid: string): boolean;
  lp(player: PlayerKey): number;
  destroy(card: Card): Promise<void>;
  destroyST(card: Card): Promise<void>;
  banish(card: Card): Promise<void>;
  banishFromDeck(card: Card, player: PlayerKey): Promise<void>;
  bounce(card: Card): Promise<void>;
  sendToGrave(card: Card, from: string, reason?: string): Promise<void>;
  tribute(card: Card): Promise<void>;
  negateSummon(mon: Card): Promise<void>;
  damage(player: PlayerKey, n: number, reason?: string): Promise<void>;
  draw(player: PlayerKey, n: number): Promise<void>;
  discard(player: PlayerKey, n: number): Promise<void>;
  discardCard(card: Card): Promise<void>;
  payLp(player: PlayerKey, n: number): void;
  specialSummon(card: Card, player: PlayerKey, pos: Position, from: string): Promise<void>;
  fusionSummon(fusionCard: Card, player: PlayerKey): Promise<boolean>;
  addToHand(card: Card, player: PlayerKey): Promise<void>;
  recoverToHand(card: Card, player: PlayerKey): Promise<void>;
  changePosition(mon: Card, pos: Position): Promise<void>;
  changeControl(mon: Card, to: PlayerKey, until?: string): Promise<void>;
  flipUp(mon: Card): Promise<void>;
  equip(equipCard: Card, target: Card): Promise<void>;
  setField(card: Card): Promise<void>;
  linkCards(a: Card, b: Card): void;
  setAttackLock(player: PlayerKey, turns: number): void;
  swapAtkDefThisTurn(): void;
  setNoBattleDamage(player: PlayerKey): void;
  setTrapStunThisTurn(): void;
  negateAttack(endBattle?: boolean): void;
  negateBattleDamage(): void;
  negate(link: ChainLink): boolean;
  askTargets(msg: string, options: TargetOption[], count: number): Promise<(string | null)[]>;
}

/** 引擎回调 */
interface DuelCallbacks {
  onState?: (state: GameState) => void;
  onLog?: (msg: string) => void;
  onToast?: (msg: string) => void;
  onGameOver?: (who: PlayerKey | "draw") => void;
  onEvent?: (ev: GameEvent) => void | Promise<void>;
}

/** 引擎配置 */
interface DuelConfig {
  rng?: () => number;
  lp?: number;
  aiDelay?: number;
  playerPreset?: string;
  aiPreset?: string;
  playerDeck?: string[];
  aiDeck?: string[];
  playerExtra?: string[];
  aiExtra?: string[];
  ai?: AiPlayer;
  /** 玩家动作之间的最小间隔（毫秒，节奏控制） */
  pace?: number;
  /** 弹窗出现前的延迟（毫秒，避免提示堆叠） */
  promptDelay?: number;
}

/** 挂起的交互提示（等待玩家应答） */
type PromptState =
  | { kind: "select"; msg: string; options: TargetOption[]; selectOne?: boolean; multi?: boolean }
  | { kind: "chain"; event: GameEvent; options: ChainableOption[] }
  | { kind: "confirm"; msg: string };

/* ===================== 常量 ===================== */

const MONSTER_ZONES = 5;
const ST_ZONES = 5;
// 手动发动类触发器的 condition/acquireTargets 允许在无事件上下文中调用（引擎传 null），用空对象占位避免运行时 null 解引用
const NO_EVENT = {} as GameEvent;
// 响应窗口事件：召唤尝试（神之宣告无效召唤）-> 召唤成功（奈落/落穴等）-> 攻击宣言 -> 伤害计算
const RESPONSE_EVENTS = new Set(["summon_attempt", "summon", "attack_declare", "damage_calc"]);

function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function spellSpeed(card: Card): number {
  const e = card.effect;
  if (e && e.speed) return e.speed;
  if (card.type === "trap") return card.subtype === "反击" ? 3 : 2;
  return 1;
}

/* ===================== 规则引擎 ===================== */

class Duel {
  cb: DuelCallbacks;
  rng: () => number;
  playerPreset: string;
  aiPreset: string;
  playerDeckIds: string[];
  aiDeckIds: string[];
  playerExtraIds: string[];
  aiExtraIds: string[];
  startingLP: number;
  aiDelay: number;
  /** 玩家动作最小间隔（节奏配置） */
  pace: number;
  /** 弹窗前置延迟（节奏配置） */
  promptDelay: number;
  private _lastPlayerActionAt = 0;
  state!: GameState;             // start() 中初始化
  _await: { resolve: (value: unknown) => void } | null = null;
  _log: string[] = [];
  _activator: PlayerKey | null = null;
  _dmgEvent: GameEvent | null = null;
  _currentEffectType: CardType | null = null;
  _depth = 0;
  g: GameApi;
  ai: AiPlayer;

  /**
   * 构造函数
   * @param config 游戏配置（含 AI 驱动，默认 AiPlayer）
   * @param callbacks 界面回调
   */
  constructor(config: DuelConfig = {}, callbacks: DuelCallbacks = {}) {
    this.cb = callbacks;
    this.rng = config.rng || Math.random;
    this.playerPreset = config.playerPreset || "classic";
    this.aiPreset = config.aiPreset || "classic";
    this.playerDeckIds = config.playerDeck || window.YGO_BUILD_DECK(this.playerPreset);
    this.aiDeckIds = config.aiDeck || window.YGO_BUILD_DECK(this.aiPreset);
    this.playerExtraIds = config.playerExtra || window.YGO_BUILD_EXTRA(this.playerPreset);
    this.aiExtraIds = config.aiExtra || window.YGO_BUILD_EXTRA(this.aiPreset);
    this.startingLP = config.lp || 8000;
    this.aiDelay = config.aiDelay || 650;
    this.pace = config.pace ?? 350;
    this.promptDelay = config.promptDelay ?? 220;
    this.g = this._buildApi();
    this.ai = config.ai || new AiPlayer(this);
  }

  /* ===================== 生命周期 ===================== */
  start(): void {
    this.state = this._initState();
    this.log("决斗开始！双方各 8000 LP，先手第一回合不抽卡、不能攻击。");
    this.emit({ kind: "game_start" });
    this._beginTurn();
  }
  _initState(): GameState {
    const mkPlayer = (deckIds: string[], extraIds: string[]): PlayerState => {
      const deck = shuffle(deckIds.map((id) => this._mkCard(id)), this.rng);
      const extra = (extraIds || []).map((id) => this._mkCard(id));
      for (const c of extra) { c.location = "extra"; c.controller = "me"; }
      return {
        lp: this.startingLP, deck, hand: [], extra,
        monsterZone: new Array<Card | null>(MONSTER_ZONES).fill(null),
        spellZone: new Array<Card | null>(ST_ZONES).fill(null),
        fieldZone: null, graveyard: [], banished: [],
        normalSummonUsed: false, attacked: {}, positionChanged: {}, setThisTurn: {},
        noBattleDamageTurn: false, attackLockTurns: 0,
      };
    };
    const me = mkPlayer(this.playerDeckIds, this.playerExtraIds);
    const ai = mkPlayer(this.aiDeckIds, this.aiExtraIds);
    for (let i = 0; i < 5; i++) { me.hand.push(me.deck.pop()!); ai.hand.push(ai.deck.pop()!); }
    for (const c of me.hand) { c.location = "hand"; c.controller = "me"; }
    for (const c of ai.hand) { c.location = "hand"; c.controller = "ai"; }
    for (const c of me.deck) { c.location = "deck"; c.controller = "me"; }
    for (const c of ai.deck) { c.location = "deck"; c.controller = "ai"; }
    for (const c of me.extra) { c.controller = "me"; }
    for (const c of ai.extra) { c.controller = "ai"; }
    return {
      me, ai, turn: 1, turnPlayer: "me", phase: "draw", winner: null,
      chain: [], resolving: false, lastEvent: null, currentAttack: null,
      attackNegated: false, endBattlePhase: false, swappedAtkDefTurn: -1, trapStunTurn: -1, pending: null,
    };
  }
  _mkCard(id: string): Card {
    const def = window.YGO_CARD_BY_ID[id];
    return {
      ...def, uid: "c" + Math.random().toString(36).slice(2, 9), cid: id,
      position: null, faceDown: false, turnSet: -1, turnSummoned: -1,
      controller: "me", location: "deck",
      originalAtk: def.atk || 0, originalDef: def.def || 0,
      equipped: [], equipTarget: null, linkPartner: null, controlOriginalController: null,
      tempControlUntil: null,
    };
  }

  /* ===================== 查询 ===================== */
  P(k: PlayerKey): PlayerState { return this.state[k]; }
  opp(k: PlayerKey): PlayerKey { return k === "me" ? "ai" : "me"; }
  cur(): PlayerState { return this.state[this.state.turnPlayer]; }
  curOpp(): PlayerState { return this.state[this.opp(this.state.turnPlayer)]; }
  isHumanTurn(): boolean { return this.state.turnPlayer === "me"; }
  _name(k: PlayerKey): string { return k === "me" ? "玩家" : "AI"; }
  monsters(p: PlayerState): Card[] { return p.monsterZone.filter((m): m is Card => !!m); }
  spells(p: PlayerState): Card[] { return p.spellZone.filter((c): c is Card => !!c); }
  allMonsters(): Card[] { return [...this.monsters(this.state.me), ...this.monsters(this.state.ai)]; }
  freeMonsterZones(p: PlayerState): number[] { const r: number[] = []; for (let i = 0; i < MONSTER_ZONES; i++) if (!p.monsterZone[i]) r.push(i); return r; }
  freeSTZones(p: PlayerState): number[] { const r: number[] = []; for (let i = 0; i < ST_ZONES; i++) if (!p.spellZone[i]) r.push(i); return r; }
  fieldSpellCard(): Card | null { return this.state.me.fieldZone || this.state.ai.fieldZone || null; }
  countST(p: PlayerState): number { return this.spells(p).length + (p.fieldZone ? 1 : 0); }
  stats(mon: Card): { atk: number; def: number } {
    let baseAtk = mon.originalAtk, baseDef = mon.originalDef;
    if (this.state.swappedAtkDefTurn === this.state.turn) [baseAtk, baseDef] = [baseDef, baseAtk];
    let atk = baseAtk, def = baseDef;
    const fs = this.fieldSpellCard();
    if (fs && fs.effect && fs.effect.continuous) { const d = fs.effect.continuous(fs, mon, this.g); atk += (d.atkDelta || 0); def += (d.defDelta || 0); }
    // 怪兽自身永续修正（如黑魔术少女/神鹰的宠物龙，双方场上怪兽均可参与）
    for (const key of ["me", "ai"] as PlayerKey[]) {
      for (const m of this.state[key].monsterZone) {
        if (m && m.effect && m.effect.continuous) {
          const d = m.effect.continuous(m, mon, this.g);
          atk += (d.atkDelta || 0); def += (d.defDelta || 0);
        }
      }
    }
    if (mon.equipped) {
      for (const eq of mon.equipped) {
        if (eq.effect && eq.effect.continuous) { const d = eq.effect.continuous(eq, mon, this.g); atk += (d.atkDelta || 0); def += (d.defDelta || 0); }
      }
    }
    return { atk: Math.max(0, atk), def: Math.max(0, def) };
  }
  _findZone(card: Card): { key: PlayerKey; kind: "monster" | "spell" | "field"; idx: number } | null {
    if (!card) return null;
    for (const key of ["me", "ai"] as PlayerKey[]) {
      const p = this.state[key];
      for (let i = 0; i < MONSTER_ZONES; i++) if (p.monsterZone[i] === card) return { key, kind: "monster", idx: i };
      for (let i = 0; i < ST_ZONES; i++) if (p.spellZone[i] === card) return { key, kind: "spell", idx: i };
      if (p.fieldZone === card) return { key, kind: "field", idx: 0 };
    }
    return null;
  }
  _ownerOf(card: Card): PlayerKey {
    const z = this._findZone(card);
    if (z) return z.key;
    for (const key of ["me", "ai"] as PlayerKey[]) {
      const p = this.state[key];
      if (p.hand.includes(card) || p.deck.includes(card) || p.graveyard.includes(card) || p.banished.includes(card)) return key;
    }
    return card.controller;
  }
  _findCard(uid: string | null): Card | null {
    if (!uid) return null;
    for (const key of ["me", "ai"] as PlayerKey[]) {
      const p = this.state[key];
      const all = [...p.hand, ...p.deck, ...p.graveyard, ...p.banished, ...p.extra, ...p.monsterZone, ...p.spellZone, p.fieldZone].filter((c): c is Card => !!c);
      const f = all.find((c) => c.uid === uid);
      if (f) return f;
    }
    return null;
  }
  isValid(card: Card): boolean { return !!card && !!this._findZone(card); }
  controller(card: Card): PlayerKey { return this._ownerOf(card); }
  playerOf(card: Card): PlayerKey { return this._ownerOf(card); }

  /* ===================== 输出/输入 ===================== */
  log(msg: string): void { this._log.push(msg); this.cb.onLog && this.cb.onLog(msg); }
  emitView(): void { this.cb.onState && this.cb.onState(this.state); }
  /** 玩家动作节流：保证连续动作之间的最小间隔，避免操作过快导致提示堆叠 */
  async _pacePlayer(): Promise<void> {
    const wait = this._lastPlayerActionAt + this.pace - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this._lastPlayerActionAt = Date.now();
  }
  _ask(kind: PromptState["kind"], payload: object): Promise<unknown> {
    return new Promise((resolve) => {
      const show = () => {
        this.state.pending = { kind, ...payload } as PromptState;
        this.emitView();
        this._await = { resolve };
      };
      // 弹窗前置延迟：让上一个动作的特效/横幅播完，避免弹框接踵而至
      if (this.promptDelay > 0) setTimeout(show, this.promptDelay);
      else show();
    });
  }
  answer(value: unknown): void {
    if (!this._await) return;
    const a = this._await;
    this._await = null;
    this.state.pending = null;
    a.resolve(value);
  }
  delay(ms?: number): Promise<void> { return new Promise((r) => setTimeout(r, ms || this.aiDelay)); }

  /* ===================== 事件总线 ===================== */
  async emit(event: GameEvent): Promise<void> {
    if (this.state.winner) return;
    if (this._depth > 30) { this.log("（事件嵌套过深，截断）"); return; }
    this._depth++;
    this.state.lastEvent = event;
    // 表现层钩子：UI 可消费事件做动画/提示，并可返回 Promise 控制节奏（不改变游戏逻辑）
    if (this.cb.onEvent) {
      try { const r = this.cb.onEvent(event); if (r && typeof r.then === "function") await r; } catch (e) { /* 表现层异常不影响引擎 */ }
    }
    // 1. 触发型（auto）效果：自动入链、各自结算
    const autos = this._collectTriggers(event, true);
    for (const a of autos) {
      if (this.state.winner) break;
      await this.activateAndResolve(a.player, a.card, a.trigger, event, "auto");
    }
    // 2. 响应窗口：玩家可连锁响应型触发器
    if (RESPONSE_EVENTS.has(event.kind)) {
      await this._openResponse(event);
      if (this.state.chain.length) await this._resolveChain();
    }
    this._depth--;
  }

  // 通用触发器查询：遍历双方手牌/场上/墓地，匹配 event + auto + condition
  _collectTriggers(event: GameEvent, auto: boolean): { player: PlayerKey; card: Card; trigger: Trigger }[] {
    const out: { player: PlayerKey; card: Card; trigger: Trigger }[] = [];
    for (const playerKey of ["me", "ai"] as PlayerKey[]) {
      const p = this.state[playerKey];
      const cards = [...p.hand, ...p.monsterZone, ...p.spellZone, p.fieldZone, ...p.graveyard].filter((c): c is Card => !!c);
      for (const card of cards) {
        if (!card.effect || !card.effect.triggers) continue;
        for (const trigger of card.effect.triggers) {
          if (trigger.event !== event.kind) continue;
          if (!!trigger.auto !== !!auto) continue;
          if (trigger.condition) { try { if (!trigger.condition(card, event, this.g)) continue; } catch (e) { continue; } }
          out.push({ player: playerKey, card, trigger });
          break;
        }
      }
    }
    out.sort((a, b) => (a.player === this.state.turnPlayer ? 0 : 1) - (b.player === this.state.turnPlayer ? 0 : 1));
    return out;
  }

  _chainTopSpeed(): number {
    if (!this.state.chain.length) return 1;
    return this.state.chain[this.state.chain.length - 1].speed;
  }

  // 响应窗口：双方交替决定是否连锁
  async _openResponse(event: GameEvent): Promise<void> {
    const s = this.state;
    if (s.winner) return;
    let responder: PlayerKey = this.opp(event.actor!);
    let consecPass = 0, guard = 0;
    while (consecPass < 2 && guard++ < 40) {
      const floor = this._chainTopSpeed();
      const chainable = this._chainableCards(responder, event, floor);
      if (!chainable.length) { consecPass++; responder = this.opp(responder); continue; }
      let action: ChainDecision | null;
      if (responder === "me") action = await this._ask("chain", { event, options: chainable }) as ChainDecision;
      else { action = this.ai.decideChain(responder, event, chainable); await this.delay(this.aiDelay); }
      if (!action || action.pass) { consecPass++; responder = this.opp(responder); continue; }
      consecPass = 0;
      // 激活被连锁的卡
      const { card, trigger } = action;
      this._activator = responder;
      let targets: (string | null)[] = [];
      if (trigger.acquireTargets) {
        const t = await trigger.acquireTargets(card, event, this.g);
        if (t === null) { consecPass++; responder = this.opp(responder); continue; }
        targets = t;
      }
      if (trigger.cost) await trigger.cost(card, event, this.g);
      if (card.type === "trap" && card.faceDown) card.faceDown = false;
      const link: ChainLink = { player: responder, card, trigger, targets, event, source: "response", speed: spellSpeed(card), ctx: event };
      s.chain.push(link);
      // 响应发动的表现事件（UI 反馈：栗子球/陷阱等连锁发动有横幅与音效；无卡订阅，不改变游戏逻辑）
      await this.emit({ kind: "activate", actor: responder, card, source: "response" });
      this.log(`${this._name(responder)} 发动 ${card.name}，加入连锁。`);
      this.emitView();
      event = { kind: "activate", actor: responder, card, source: "response", link };
      responder = this.opp(responder);
    }
  }

  _chainableCards(playerKey: PlayerKey, event: GameEvent, floor: number): ChainableOption[] {
    const out: ChainableOption[] = [];
    const trapsNegated = this._trapsNegated();
    const add = (card: Card) => {
      if (!card.effect || !card.effect.triggers) return;
      for (const trigger of card.effect.triggers) {
        if (trigger.auto) continue;
        if (trigger.event !== event.kind) continue;
        if (spellSpeed(card) < floor) continue;
        // 人造人/陷阱无力化：陷阱不能发动（反击陷阱自身仍可？为简洁也禁）
        if (trapsNegated && card.type === "trap") continue;
        if (trigger.condition) { try { if (!trigger.condition(card, event, this.g)) continue; } catch (e) { continue; } }
        out.push({ card, trigger });
        break;
      }
    };
    const p = this.state[playerKey];
    for (const c of p.spellZone) if (c && c.type === "trap" && c.faceDown && c.turnSet < this.state.turn) add(c);
    if (event.kind === "damage_calc") for (const c of p.hand) add(c);
    // 永续陷阱（已表侧）的 manual 触发不参与响应；手坑仅 damage_calc
    return out;
  }

  // 陷阱是否被无效（人造人表侧存在 或 本回合陷阱无力化）
  _trapsNegated(): boolean {
    if (this.state.trapStunTurn === this.state.turn) return true;
    for (const key of ["me", "ai"] as PlayerKey[]) {
      for (const m of this.state[key].monsterZone) if (m && !m.faceDown && m.trapNegate) return true;
    }
    return false;
  }

  // 手动/自动激活：acquireTargets -> cost -> 入链 -> 开响应窗口 -> 结算
  // preTargets：调用方已在入链前选好目标（用于手牌魔法的"先选目标再上场"），避免无效发卡滞留场上
  async activateAndResolve(player: PlayerKey, card: Card, trigger: Trigger, event: GameEvent | null, source: string, preTargets?: (string | null)[] | null): Promise<boolean> {
    const s = this.state;
    if (s.winner) return false;
    this._activator = player;
    let targets: (string | null)[] = preTargets || [];
    if (!preTargets && trigger.acquireTargets) {
      const t = await trigger.acquireTargets(card, event as GameEvent, this.g);
      if (t === null) return false;
      targets = t;
    }
    if (trigger.cost) await trigger.cost(card, event as GameEvent, this.g);
    if (card.type === "trap" && card.faceDown) card.faceDown = false;
    // 发动表现事件（UI 反馈用；无卡订阅该事件，不改变游戏逻辑）
    await this.emit({ kind: "activate", actor: player, card, source });
    if (s.winner) return false;
    const link: ChainLink = { player, card, trigger, targets, event, source, speed: spellSpeed(card), ctx: (event as GameEvent) || {} };
    s.chain.push(link);
    this.log(`${this._name(player)} 发动 ${card.name}。`);
    this.emitView();
    await this._openResponse({ kind: "activate", actor: player, card, source, link });
    if (s.chain.length) await this._resolveChain();
    return true;
  }

  async _resolveChain(): Promise<void> {
    const s = this.state;
    s.resolving = true;
    this.emitView();
    while (s.chain.length) {
      const link = s.chain.pop()!;
      if (s.winner) break;
      this._currentEffectType = link.card ? link.card.type : null;
      try { if (link.trigger && link.trigger.resolve) await link.trigger.resolve(link.card, link.ctx, this.g, link.targets); }
      catch (e) { this.log("效果执行出错：" + (e instanceof Error ? e.message : String(e))); }
      this._currentEffectType = null;
      this._afterResolve(link);
      if (s.winner) break;
    }
    s.resolving = false;
    s.lastEvent = null;
    this.emitView();
  }
  _afterResolve(link: ChainLink): void {
    // 通常/反击 魔陷结算后送墓（永续/装备/场地留存）
    const c = link.card;
    if ((c.type === "spell" || c.type === "trap") && (c.subtype === "通常" || c.subtype === "反击")) {
      const z = this._findZone(c);
      if (z && z.kind === "spell") {
        this.state[z.key].spellZone[z.idx] = null;
        this.state[z.key].graveyard.push(c);
        c.location = "grave";
      }
    }
  }

  /* ===================== 原语 API（卡牌唯一 mutate 通道） ===================== */
  _buildApi(): GameApi {
    const g: GameApi = {
      get activator() { return this._duel._activator; },
      get turn() { return this._duel.state.turn; },
      get phase() { return this._duel.state.phase; },
    } as GameApi & { _duel: Duel };
    (g as GameApi & { _duel: Duel })._duel = this;
    Object.setPrototypeOf(g, this._apiProto);
    return g;
  }
  // 原语方法（通过原型共享）
  // 原语方法（通过原型共享）；方法内 this 指向挂载了 _duel 的 g 对象
  _apiProto: Record<string, unknown> & ThisType<{ _duel: Duel }> = {
    opponent(player: PlayerKey): PlayerKey { return this._duel.opp(player); },
    monsters(p: PlayerKey): Card[] { return this._duel.monsters(this._duel.state[p]); },
    spells(p: PlayerKey): Card[] { return this._duel.spells(this._duel.state[p]); },
    allMonsters(): Card[] { return this._duel.allMonsters(); },
    field(p: PlayerKey): Card | null { return this._duel.state[p].fieldZone; },
    graveyard(p: PlayerKey): Card[] { return this._duel.state[p].graveyard; },
    deck(p: PlayerKey): Card[] { return this._duel.state[p].deck; },
    hand(p: PlayerKey): Card[] { return this._duel.state[p].hand; },
    stats(mon: Card) { return this._duel.stats(mon); },
    countST(p: PlayerKey): number { return this._duel.countST(this._duel.state[p]); },
    findCard(uid: string | null) { return this._duel._findCard(uid); },
    isValid(card: Card) { return this._duel.isValid(card); },
    controller(card: Card) { return this._duel.controller(card); },
    playerOf(card: Card) { return this._duel.playerOf(card); },
    extra(player: PlayerKey) { return this._duel.state[player].extra; },
    hasMaterial(player: PlayerKey, cid: string) { return this._duel._hasMaterial(player, cid); },
    lp(player: PlayerKey) { return this._duel.state[player].lp; },
    // 查询 end

    async destroy(card: Card) { return this._duel._destroy(card, "effect"); },
    async destroyST(card: Card) { return this._duel._destroy(card, "effect"); },
    async banish(card: Card) { return this._duel._banish(card); },
    async banishFromDeck(card: Card, player: PlayerKey) { return this._duel._banishFromDeck(card, player); },
    async bounce(card: Card) { return this._duel._bounce(card); },
    async sendToGrave(card: Card, from: string, reason?: string) { return this._duel._sendToGrave(card, from, reason || "effect"); },
    async tribute(card: Card) { return this._duel.tribute(card); },
    async negateSummon(mon: Card) { return this._duel._negateSummon(mon); },

    async damage(player: PlayerKey, n: number, reason?: string) { return this._duel._damage(player, n, reason || "effect"); },
    async draw(player: PlayerKey, n: number) { return this._duel._draw(player, n); },
    async discard(player: PlayerKey, n: number) { return this._duel._discard(player, n); },
    async discardCard(card: Card) { return this._duel._discardCard(card); },
    payLp(player: PlayerKey, n: number) { const p = this._duel.state[player]; p.lp -= n; this._duel.log(`${this._duel._name(player)} 支付 ${n} LP。`); this._duel.emitView(); this._duel._checkWin(); },

    async specialSummon(card: Card, player: PlayerKey, pos: Position, from: string) { return this._duel._specialSummon(card, player, pos, from); },
    async fusionSummon(fusionCard: Card, player: PlayerKey) { return this._duel._fusionSummon(fusionCard, player); },
    async addToHand(card: Card, player: PlayerKey) { return this._duel._addToHand(card, player); },
    async recoverToHand(card: Card, player: PlayerKey) { return this._duel._addToHand(card, player); },

    async changePosition(mon: Card, pos: Position) { return this._duel._changePosition(mon, pos); },
    async changeControl(mon: Card, to: PlayerKey, until?: string) { return this._duel._changeControl(mon, to, until); },
    async flipUp(mon: Card) { return this._duel._flipUp(mon, true); },
    async equip(equipCard: Card, target: Card) { return this._duel._equip(equipCard, target); },
    async setField(card: Card) { return this._duel._setField(card); },
    linkCards(a: Card, b: Card) { a.linkPartner = b; b.linkPartner = a; },

    setAttackLock(player: PlayerKey, turns: number) { this._duel.state[player].attackLockTurns = turns; this._duel.log(`光之护封剑：${this._duel._name(this._duel.opp(player))} ${turns} 回合内不能攻击。`); },
    swapAtkDefThisTurn() { this._duel.state.swappedAtkDefTurn = this._duel.state.turn; this._duel.log("盾与剑：场上怪兽原本攻守互换（本回合）。"); this._duel.emitView(); },
    setNoBattleDamage(player: PlayerKey) { this._duel.state[player].noBattleDamageTurn = true; this._duel.log(`${this._duel._name(player)} 本回合不受战斗伤害。`); },
    setTrapStunThisTurn() { this._duel.state.trapStunTurn = this._duel.state.turn; this._duel.log("陷阱无力化：本回合陷阱效果无效。"); },
    negateAttack(endBattle?: boolean) { this._duel.state.attackNegated = true; if (endBattle) this._duel.state.endBattlePhase = true; },
    negateBattleDamage() { if (this._duel._dmgEvent) this._duel._dmgEvent.damage = 0; },
    negate(link: ChainLink) { return this._duel._negate(link); },

    async askTargets(msg: string, options: TargetOption[], count: number) { return this._duel._askTargets(msg, options, count); },
  };

  _askTargets(msg: string, options: TargetOption[], count: number): Promise<(string | null)[]> {
    const c = count || 1;
    if (this._activator === "me") {
      return this._ask("select", { msg, options, selectOne: c === 1, multi: c > 1 }).then((r) => (Array.isArray(r) ? r as (string | null)[] : [r as string | null]));
    }
    // AI：选最有利
    return Promise.resolve(this.ai.pickTargets(msg, options, c));
  }

  /* ===================== 原语内部实现 ===================== */
  _immuneNow(card: Card): boolean { return !!card.trapImmune && this._currentEffectType === "trap"; }
  async _destroy(card: Card, reason: string): Promise<void> {
    const z = this._findZone(card);
    if (!z) return;
    if (this._immuneNow(card)) { this.log(`${card.name} 不受陷阱影响。`); return; }
    const p = this.state[z.key];
    if (z.kind === "monster") {
      for (const eq of [...card.equipped]) await this._sendToGrave(eq, "field", reason);
      card.equipped = [];
    }
    if (z.kind === "field") p.fieldZone = null; else if (z.kind === "spell") p.spellZone[z.idx] = null; else p.monsterZone[z.idx] = null;
    // 场地链接（活死人）：任一离场则破坏另一个
    if (card.linkPartner) { const partner = card.linkPartner; card.linkPartner = null; if (this._findZone(partner)) await this._destroy(partner, reason); }
    card.controlOriginalController = null;
    await this._sendToGrave(card, "field", reason);
  }
  async _banish(card: Card): Promise<void> {
    const z = this._findZone(card);
    if (!z) return;
    if (this._immuneNow(card)) { this.log(`${card.name} 不受陷阱影响。`); return; }
    const p = this.state[z.key];
    if (z.kind === "monster") { for (const eq of [...card.equipped]) await this._sendToGrave(eq, "field", "effect"); card.equipped = []; }
    if (z.kind === "field") p.fieldZone = null; else if (z.kind === "spell") p.spellZone[z.idx] = null; else p.monsterZone[z.idx] = null;
    if (card.linkPartner) { const partner = card.linkPartner; card.linkPartner = null; if (this._findZone(partner)) await this._destroy(partner, "effect"); }
    card.controlOriginalController = null;
    const owner = this._ownerOf(card);
    this.state[owner].banished.push(card);
    card.location = "banished"; card.controller = owner;
    await this.emit({ kind: "banish", card, owner, from: "field" });
  }
  async _bounce(card: Card): Promise<void> {
    const z = this._findZone(card);
    if (!z) return;
    if (this._immuneNow(card)) { this.log(`${card.name} 不受陷阱影响。`); return; }
    const p = this.state[z.key];
    if (z.kind === "monster") { for (const eq of [...card.equipped]) await this._sendToGrave(eq, "field", "effect"); card.equipped = []; }
    if (z.kind === "monster") p.monsterZone[z.idx] = null; else p.spellZone[z.idx] = null;
    card.controlOriginalController = null;
    if (card.linkPartner) { const partner = card.linkPartner; card.linkPartner = null; if (this._findZone(partner)) await this._destroy(partner, "effect"); }
    const owner = this._ownerOf(card);
    card.faceDown = false; card.position = "atk"; card.location = "hand"; card.controller = owner;
    this.state[owner].hand.push(card);
    await this.emit({ kind: "return_to_hand", card, owner, from: "field" });
  }
  async _sendToGrave(card: Card, from: string, reason: string): Promise<void> {
    const owner = this._ownerOf(card);
    const p = this.state[owner];
    this._removeFromArr(p.hand, card); this._removeFromArr(p.deck, card); this._removeFromArr(p.banished, card);
    p.graveyard.push(card);
    card.location = "grave"; card.controller = owner;
    await this.emit({ kind: "sent_to_grave", card, owner, from, reason });
  }
  async tribute(card: Card): Promise<void> {
    const z = this._findZone(card);
    if (!z) return;
    const p = this.state[z.key];
    if (z.kind === "monster") { for (const eq of [...card.equipped]) await this._sendToGrave(eq, "field", "tribute"); card.equipped = []; }
    p.monsterZone[z.idx] = null;
    if (card.linkPartner) { const partner = card.linkPartner; card.linkPartner = null; if (this._findZone(partner)) await this._destroy(partner, "tribute"); }
    card.controlOriginalController = null;
    await this._sendToGrave(card, "field", "tribute");
  }
  async _damage(player: PlayerKey, n: number, reason: string): Promise<void> {
    if (n <= 0) return;
    const p = this.state[player];
    p.lp -= n;
    this.log(`${this._name(player)} 受 ${n} 伤害。`);
    this.emitView();
    this._checkWin();
    if (!this.state.winner) await this.emit({ kind: "lp_change", player, delta: -n, reason });
  }
  async _draw(player: PlayerKey, n: number): Promise<void> {
    const p = this.state[player];
    for (let i = 0; i < n; i++) {
      if (!p.deck.length) { this._win(this.opp(player), "卡组耗尽"); return; }
      const c = p.deck.pop()!;
      c.location = "hand"; c.controller = player; p.hand.push(c);
      await this.emit({ kind: "draw_card", player, card: c });
      if (this.state.winner) return;
    }
    this.log(`${this._name(player)} 抽 ${n} 张。`);
    this.emitView();
  }
  async _discard(player: PlayerKey, n: number): Promise<void> {
    const p = this.state[player];
    for (let k = 0; k < n; k++) {
      if (!p.hand.length) break;
      let idx: number;
      if (player === "me") {
        const opts = p.hand.map((c, i) => ({ value: i, label: c.name, card: c }));
        idx = await this._ask("select", { msg: `丢弃 ${n - k} 张手卡`, options: opts, selectOne: true }) as number;
      } else {
        idx = this.ai.pickDiscard(p.hand);
      }
      const c = p.hand.splice(idx, 1)[0];
      await this._sendToGrave(c, "hand", "discard");
    }
  }
  async _discardCard(card: Card): Promise<void> {
    const owner = this._ownerOf(card);
    this._removeFromArr(this.state[owner].hand, card);
    await this._sendToGrave(card, "hand", "discard");
  }
  async _specialSummon(card: Card, player: PlayerKey, pos: Position, from: string): Promise<void> {
    const p = this.state[player];
    const zi = this.freeMonsterZones(p)[0];
    if (zi == null) return;
    // 从来源移除
    const srcOwner = this._ownerOf(card);
    if (from === "grave") this._removeFromArr(this.state[srcOwner].graveyard, card);
    else if (from === "deck") this._removeFromArr(this.state[srcOwner].deck, card);
    else if (from === "extra") this._removeFromArr(this.state[srcOwner].extra, card);
    else this._removeFromArr(this.state[srcOwner].hand, card);
    p.monsterZone[zi] = card;
    card.position = pos || "atk"; card.faceDown = false; card.turnSummoned = this.state.turn; card.turnSet = -1;
    card.controller = player; card.location = "monster"; card.equipped = [];
    this.log(`${this._name(player)} 特殊召唤 ${card.name}。`);
    this.emitView();
    await this.emit({ kind: "summon", actor: player, monster: card, summonKind: "special", hidden: false });
  }
  // 融合召唤：验证素材 -> 送墓 -> 从额外卡组特召
  async _fusionSummon(fusionCard: Card, player: PlayerKey): Promise<boolean> {
    if (!fusionCard || !fusionCard.fusion) return false;
    const p = this.state[player];
    const mats = fusionCard.fusion.materials;
    const sources = [...p.monsterZone.filter((m): m is Card => !!m), ...p.hand];
    const used = new Set<string>();
    const found: Card[] = [];
    for (const cid of mats) {
      const inst = sources.find((c) => !used.has(c.uid) && c.cid === cid);
      if (!inst) { this.log("融合素材不足。"); return false; }
      used.add(inst.uid); found.push(inst);
    }
    // 素材送墓
    for (const m of found) {
      if (p.hand.includes(m)) { this._removeFromArr(p.hand, m); await this._sendToGrave(m, "hand", "fusion"); }
      else { await this.tribute(m); this.log(`融合素材 ${m.name} 送墓。`); }
    }
    // 从额外卡组特召
    const zi = this.freeMonsterZones(p)[0];
    if (zi == null) return false;
    this._removeFromArr(p.extra, fusionCard);
    p.monsterZone[zi] = fusionCard;
    fusionCard.position = "atk"; fusionCard.faceDown = false; fusionCard.turnSummoned = this.state.turn; fusionCard.turnSet = -1;
    fusionCard.controller = player; fusionCard.location = "monster"; fusionCard.equipped = [];
    this.log(`${this._name(player)} 融合召唤 ${fusionCard.name}！`);
    this.emitView();
    await this.emit({ kind: "summon", actor: player, monster: fusionCard, summonKind: "fusion", hidden: false });
    return true;
  }
  _hasMaterial(player: PlayerKey, cid: string): boolean {
    const p = this.state[player];
    return [...p.monsterZone.filter((m): m is Card => !!m), ...p.hand].some((c) => c.cid === cid);
  }
  async _banishFromDeck(card: Card, player: PlayerKey): Promise<void> {
    this._removeFromArr(this.state[player].deck, card);
    this.state[player].banished.push(card);
    card.location = "banished"; card.controller = player;
  }
  async _negateSummon(mon: Card): Promise<void> {
    const z = this._findZone(mon);
    if (!z) return;
    const p = this.state[z.key];
    if (z.kind === "monster") {
      for (const eq of [...mon.equipped]) await this._sendToGrave(eq, "field", "negate");
      mon.equipped = [];
      p.monsterZone[z.idx] = null;
    }
    mon.controlOriginalController = null;
    this.log(`${mon.name} 的召唤被无效！`);
    await this._sendToGrave(mon, "field", "negate");
  }
  async _addToHand(card: Card, player: PlayerKey): Promise<void> {
    const owner = this._ownerOf(card);
    this._removeFromArr(this.state[owner].graveyard, card);
    this._removeFromArr(this.state[owner].deck, card);
    this.state[player].hand.push(card);
    card.location = "hand"; card.controller = player;
    this.log(`${this._name(player)} 将 ${card.name} 加入手卡。`);
    this.emitView();
  }
  async _changePosition(mon: Card, pos: Position): Promise<void> {
    if (mon.position === pos) return;
    mon.position = pos;
    this.log(`${mon.name} 切换为 ${pos === "atk" ? "攻击" : "守备"}表示。`);
    this.emitView();
  }
  async _changeControl(mon: Card, to: PlayerKey, until?: string): Promise<void> {
    const z = this._findZone(mon);
    if (!z) return;
    const fromP = this.state[z.key];
    const toP = this.state[to];
    const zi = this.freeMonsterZones(toP)[0];
    if (zi == null) return;
    fromP.monsterZone[z.idx] = null;
    mon.controlOriginalController = z.key;
    mon.tempControlUntil = until || null;
    toP.monsterZone[zi] = mon; mon.controller = to;
    this.log(`${mon.name} 控制权转移给 ${this._name(to)}。`);
    this.emitView();
    await this.emit({ kind: "control_change", monster: mon, from: z.key, to, until });
  }
  async _flipUp(mon: Card, doEmit: boolean): Promise<void> {
    if (!mon.faceDown) return;
    mon.faceDown = false;
    this.log(`${mon.name} 翻开。`);
    this.emitView();
    if (doEmit) await this.emit({ kind: "flip", monster: mon, owner: this._ownerOf(mon), by: "effect" });
  }
  async _equip(equipCard: Card, target: Card): Promise<void> {
    const z = this._findZone(equipCard);
    if (!z) return;
    target.equipped.push(equipCard);
    equipCard.equipTarget = target.uid;
    this.log(`${equipCard.name} 装备给 ${target.name}。`);
    this.emitView();
  }
  async _setField(card: Card): Promise<void> {
    const z = this._findZone(card);
    const owner = z ? z.key : this._ownerOf(card);
    const p = this.state[owner];
    // 场地魔法互相顶替：发动新场地时，双方场上现有的场地魔法一并送墓（_sendToGrave 不清场上位置，需先置空）
    if (p.fieldZone && p.fieldZone !== card) { const old = p.fieldZone; p.fieldZone = null; await this._sendToGrave(old, "field", "effect"); }
    const oppP = this.state[this.opp(owner)];
    if (oppP.fieldZone && oppP.fieldZone !== card) { const old = oppP.fieldZone; oppP.fieldZone = null; await this._sendToGrave(old, "field", "effect"); }
    if (z && z.kind === "spell") p.spellZone[z.idx] = null;
    p.fieldZone = card;
    this.log(`场地魔法 ${card.name} 生效。`);
    this.emitView();
  }
  _negate(link: ChainLink): boolean {
    if (!link) return false;
    const idx = this.state.chain.findIndex((l) => l === link);
    if (idx >= 0) {
      this.state.chain.splice(idx, 1);
      const tz = this._findZone(link.card);
      if (tz) {
        const tp = this.state[tz.key];
        if (tz.kind === "field") tp.fieldZone = null; else if (tz.kind === "spell") tp.spellZone[tz.idx] = null;
      }
      this.state[link.player].graveyard.push(link.card);
      link.card.location = "grave";
      this.log(`${link.card.name} 的发动被无效！`);
      this.emitView();
    }
    return false;
  }
  _removeFromArr<T>(arr: T[], item: T): void { const i = arr.indexOf(item); if (i >= 0) arr.splice(i, 1); }

  /* ===================== 回合/阶段 ===================== */
  async _beginTurn(): Promise<void> {
    const s = this.state;
    if (s.winner) return;
    s.phase = "draw";
    const tp = s.turnPlayer;
    const p = this.cur();
    p.normalSummonUsed = false; p.attacked = {}; p.positionChanged = {}; p.setThisTurn = {}; p.noBattleDamageTurn = false;
    // 光之护封剑计数（在控制者的回合开始时递减）
    for (const key of ["me", "ai"] as PlayerKey[]) {
      const pp = this.state[key];
      if (pp.attackLockTurns > 0) {
        if (key === tp) {
          pp.attackLockTurns--;
          if (pp.attackLockTurns === 0) {
            const sw = pp.spellZone.find((c) => c && c.cid === "swords");
            if (sw) { this._destroy(sw, "effect"); this.log(`${this._name(key)} 的光之护封剑失效。`); }
          }
        }
      }
    }
    this.emitView();
    await this.emit({ kind: "turn_start", player: tp, turn: s.turn });
    if (s.winner) return;
    // 抽卡阶段
    if (!(s.turn === 1 && tp === "me")) {
      await this.emit({ kind: "phase_start", player: tp, phase: "draw" });
      if (!s.winner) await this._drawPhase();
    } else {
      this.log(`${this._name(tp)} 先手，第一回合跳过抽卡。`);
    }
    if (s.winner) return;
    await this.emit({ kind: "phase_start", player: tp, phase: "standby" });
    if (s.winner) return;
    s.phase = "main1";
    await this.emit({ kind: "phase_start", player: tp, phase: "main1" });
    this.emitView();
    if (tp === "me") {
      this.log("你的主要阶段 1。");
    } else {
      await this.ai.mainPhase();
      if (s.winner) return;
      await this._enterBattlePhase();
      if (s.winner) return;
      await this._endTurn();
    }
  }

  async _drawPhase(): Promise<void> {
    const s = this.state;
    s.phase = "draw";
    const p = this.cur();
    if (!p.deck.length) { this._win(this.opp(s.turnPlayer), "卡组耗尽"); return; }
    const c = p.deck.pop()!;
    c.location = "hand"; c.controller = s.turnPlayer; p.hand.push(c);
    this.log(`${this._name(s.turnPlayer)} 抽卡：${p.hand.length} 张手卡。`);
    this.emitView();
    await this.emit({ kind: "draw_card", player: s.turnPlayer, card: c });
    await this.delay(this.isHumanTurn() ? 0 : this.aiDelay);
  }

  async nextPhase(): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || s.pending || s.resolving) return;
    await this._pacePlayer();
    if (s.phase === "main1") await this._enterBattlePhase();
    else if (s.phase === "battle") await this.enterMain2();
    else if (s.phase === "main2") await this._endTurn();
  }
  // 任意阶段一键结束回合（跳过战斗/主阶段2，由玩家决定）
  async endTurn(): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || s.pending || s.resolving) return;
    await this._pacePlayer();
    await this._endTurn();
  }
  async _enterBattlePhase(): Promise<void> {
    const s = this.state;
    if (s.turn === 1 && s.turnPlayer === "me") { this.log("先手第一回合不能进入战斗阶段。"); s.phase = "main2"; this.emitView(); return; }
    s.phase = "battle";
    await this.emit({ kind: "phase_start", player: s.turnPlayer, phase: "battle" });
    this.log(`${this._name(s.turnPlayer)} 进入战斗阶段。`);
    this.emitView();
    if (s.turnPlayer === "ai") await this.ai.battlePhase();
  }
  async enterMain2(): Promise<void> {
    const s = this.state;
    s.phase = "main2";
    await this.emit({ kind: "phase_start", player: s.turnPlayer, phase: "main2" });
    this.log(`${this._name(s.turnPlayer)} 进入主要阶段 2。`);
    this.emitView();
    if (s.turnPlayer === "ai") await this.ai.mainPhase();
  }
  async _endTurn(): Promise<void> {
    const s = this.state;
    await this.emit({ kind: "phase_start", player: s.turnPlayer, phase: "end" });
    // 心变归还：tempControlUntil === 'turn_end'
    for (const key of ["me", "ai"] as PlayerKey[]) {
      const pp = this.state[key];
      for (let i = 0; i < MONSTER_ZONES; i++) {
        const m = pp.monsterZone[i];
        if (m && m.tempControlUntil === "turn_end" && m.controlOriginalController && m.controlOriginalController !== key) {
          const orig = m.controlOriginalController;
          m.controlOriginalController = null; m.tempControlUntil = null;
          const origP = this.state[orig];
          const free = this.freeMonsterZones(origP);
          if (free.length) { pp.monsterZone[i] = null; origP.monsterZone[free[0]] = m; m.controller = orig; this.log(`${m.name} 控制权归还 ${this._name(orig)}。`); }
        }
      }
    }
    // 临时攻守互换在回合切换时自动失效（swappedAtkDefTurn 判定）
    await this.emit({ kind: "turn_end", player: s.turnPlayer });
    // 手卡上限6
    await this._enforceHandLimit(this.cur());
    this.log(`${this._name(s.turnPlayer)} 结束回合。`);
    s.turnPlayer = this.opp(s.turnPlayer);
    s.turn++;
    s.phase = "draw";
    this.emitView();
    this._beginTurn();
  }
  async _enforceHandLimit(p: PlayerState): Promise<void> {
    while (p.hand.length > 6) {
      let idx: number;
      if (this.state.turnPlayer === "me" && p === this.state.me) {
        const opts = p.hand.map((c, i) => ({ value: i, label: c.name, card: c }));
        idx = await this._ask("select", { msg: "手卡超过6张，请丢弃1张。", options: opts, selectOne: true }) as number;
      } else {
        idx = this.ai.pickDiscard(p.hand);
      }
      const c = p.hand.splice(idx, 1)[0];
      await this._sendToGrave(c, "hand", "discard");
    }
  }

  /* ===================== 召唤（玩家动作，引擎执行通用规则） ===================== */
  async normalSummon(handIdx: number, zoneIdx: number | null, pos: Position = "atk"): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    if (p.normalSummonUsed) { this._toast("本回合已通常召唤过。"); return; }
    const card = p.hand[handIdx];
    if (!card || card.type !== "monster") return;
    if ((card.level || 0) >= 5) { this._toast("高星怪兽请使用祭品召唤。"); return; }
    if (zoneIdx == null) zoneIdx = this.freeMonsterZones(p)[0];
    if (zoneIdx == null || p.monsterZone[zoneIdx]) return;
    p.hand.splice(handIdx, 1);
    this.placeMonster(p, card, zoneIdx, pos, false);
    p.normalSummonUsed = true;
    this.log(`${this._name("me")} 通常召唤 ${card.name}（${pos === "atk" ? "攻击表示" : "守备表示"}）。`);
    await this.doSummon("me", card, "normal");
  }
  async setMonster(handIdx: number, zoneIdx: number | null): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    if (p.normalSummonUsed) { this._toast("本回合已通常召唤过。"); return; }
    const card = p.hand[handIdx];
    if (!card || card.type !== "monster") return;
    if ((card.level || 0) >= 5) { this._toast("高星怪兽请使用祭品召唤。"); return; }
    if (zoneIdx == null) zoneIdx = this.freeMonsterZones(p)[0];
    if (zoneIdx == null || p.monsterZone[zoneIdx]) return;
    p.hand.splice(handIdx, 1);
    this.placeMonster(p, card, zoneIdx, "def", true);
    p.normalSummonUsed = true; p.setThisTurn[zoneIdx] = true;
    this.log(`${this._name("me")} 覆盖了1只怪兽。`);
    await this.doSummon("me", card, "set");
  }
  async tributeSummon(handIdx: number, tributes: number[], zoneIdx: number | null, pos: Position = "atk"): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    if (p.normalSummonUsed) { this._toast("本回合已通常召唤过。"); return; }
    const card = p.hand[handIdx];
    if (!card || card.type !== "monster") return;
    const need = (card.level || 0) >= 7 ? 2 : 1;
    if (!tributes || tributes.length !== need) { this._toast(`需要 ${need} 只祭品。`); return; }
    for (const ti of tributes) if (!p.monsterZone[ti]) return;
    for (const ti of tributes) { await this.tribute(p.monsterZone[ti]!); }
    p.hand.splice(handIdx, 1);
    if (zoneIdx == null) zoneIdx = this.freeMonsterZones(p)[0];
    if (zoneIdx == null) return;
    this.placeMonster(p, card, zoneIdx, pos, false);
    p.normalSummonUsed = true;
    this.log(`${this._name("me")} 祭品召唤 ${card.name}！`);
    await this.doSummon("me", card, "tribute");
  }
  async flipSummon(zoneIdx: number): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    const m = p.monsterZone[zoneIdx];
    if (!m || !m.faceDown) return;
    if (m.turnSet === s.turn) { this._toast("覆盖当回合不能翻转召唤。"); return; }
    if (p.positionChanged[zoneIdx]) { this._toast("本回合已改变过表示形式。"); return; }
    m.faceDown = false; m.position = "atk"; p.positionChanged[zoneIdx] = true;
    this.log(`${this._name("me")} 翻转召唤 ${m.name}。`);
    await this.doSummon("me", m, "flip");
    if (!s.winner && m.effect && this._hasFlip(m)) await this.emit({ kind: "flip", monster: m, owner: "me", by: "flipSummon" });
  }
  async changePosition(zoneIdx: number): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    const m = p.monsterZone[zoneIdx];
    if (!m || m.faceDown) return;
    if (m.turnSummoned === s.turn) { this._toast("召唤当回合不能切换表示。"); return; }
    if (p.positionChanged[zoneIdx]) { this._toast("本回合已改变过表示形式。"); return; }
    m.position = m.position === "atk" ? "def" : "atk"; p.positionChanged[zoneIdx] = true;
    this.log(`${m.name} 切换为 ${m.position === "atk" ? "攻击" : "守备"}表示。`);
    await this.emit({ kind: "position_change", monster: m, owner: "me", from: m.position === "atk" ? "def" : "atk", to: m.position });
    this.emitView();
  }
  placeMonster(p: PlayerState, card: Card, zoneIdx: number, pos: Position, faceDown: boolean): void {
    card.position = pos; card.faceDown = faceDown; card.turnSummoned = this.state.turn;
    card.turnSet = faceDown ? this.state.turn : -1; card.controller = this._ownerKey(p); card.location = "monster"; card.equipped = [];
    p.monsterZone[zoneIdx] = card;
  }
  _ownerKey(p: PlayerState): PlayerKey { return p === this.state.me ? "me" : "ai"; }
  _hasFlip(m: Card): boolean { return !!(m.effect && m.effect.triggers && m.effect.triggers.some((t) => t.event === "flip" && t.auto)); }

  async doSummon(player: PlayerKey, mon: Card, kind: string): Promise<void> {
    this.emitView();
    // summon_attempt（神之宣告可在此无效召唤）-> summon（召唤成功后的响应）
    // 注意：召唤类型放 summonKind，避免覆盖事件 kind（历史 bug：{kind:"summon", kind} 会让事件 kind 变成召唤类型）
    await this.emit({ kind: "summon_attempt", actor: player, monster: mon, summonKind: kind });
    if (this.state.winner) return;
    if (!this.isValid(mon)) return; // 召唤被无效
    await this.emit({ kind: "summon", actor: player, monster: mon, summonKind: kind, hidden: mon.faceDown });
  }

  /* ===================== 魔法/陷阱/效果手动发动 ===================== */
  async activateHandSpell(handIdx: number): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    const card = p.hand[handIdx];
    if (!card || card.type !== "spell") return;
    const trigger = this.manualTrigger(card);
    if (!trigger) { this._toast("此卡不能发动。"); return; }
    // 先选目标再上场：无合法目标则留在手牌，避免无效发卡滞留魔陷区
    this._activator = "me";
    let targets: (string | null)[] | null = null;
    if (trigger.acquireTargets) {
      targets = await trigger.acquireTargets(card, NO_EVENT, this.g);
      if (targets === null) { this._toast("没有可指定的对象。"); return; }
    }
    const zi = this.freeSTZones(p)[0];
    if (zi == null) { this._toast("魔陷区已满。"); return; }
    p.hand.splice(handIdx, 1);
    p.spellZone[zi] = card; card.faceDown = false; card.location = "spell"; card.controller = "me";
    await this.activateAndResolve("me", card, trigger, null, "spell-hand", targets);
  }
  async setSpellTrap(handIdx: number): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    const card = p.hand[handIdx];
    if (!card || (card.type !== "spell" && card.type !== "trap")) return;
    const zi = this.freeSTZones(p)[0];
    if (zi == null) { this._toast("魔陷区已满。"); return; }
    p.hand.splice(handIdx, 1);
    p.spellZone[zi] = card; card.faceDown = true; card.turnSet = s.turn; card.location = "spell"; card.controller = "me";
    this.log(`${this._name("me")} 覆盖了1张魔陷卡。`);
    this.emitView();
  }
  async activateSetTrap(zoneIdx: number): Promise<void> {
    const s = this.state;
    if (s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.state.me;
    const card = p.spellZone[zoneIdx];
    if (!card || !card.faceDown) return;
    if (card.turnSet === s.turn) { this._toast("覆盖当回合不能发动陷阱。"); return; }
    const trigger = this.manualTrigger(card);
    if (!trigger) { this._toast("此卡不能在此时发动。"); return; }
    if (trigger.condition && !trigger.condition(card, NO_EVENT, this.g)) { this._toast("发动条件不满足。"); return; }
    await this.activateAndResolve("me", card, trigger, null, "trap-set");
  }
  async activateMonsterEffect(zoneIdx: number): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    const m = p.monsterZone[zoneIdx];
    if (!m || !m.effect) return;
    if (m.faceDown) { this._toast("里侧怪兽不能发动效果。"); return; }
    const trigger = this.manualTrigger(m);
    if (!trigger) { this._toast("此怪兽没有可手动发动的效果。"); return; }
    await this.activateAndResolve("me", m, trigger, null, "monster-effect");
  }
  // 手牌怪兽效果发动（电磁武神/电子龙等手牌特殊召唤）
  async activateHandMonsterEffect(handIdx: number): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || !(s.phase === "main1" || s.phase === "main2") || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    const card = p.hand[handIdx];
    if (!card || card.type !== "monster" || !card.effect) return;
    const trigger = this.manualTrigger(card);
    if (!trigger) { this._toast("此怪兽没有可发动的效果。"); return; }
    if (trigger.condition && !trigger.condition(card, NO_EVENT, this.g)) { this._toast("发动条件不满足。"); return; }
    this._activator = "me";
    await this.activateAndResolve("me", card, trigger, null, "monster-hand-effect");
  }
  manualTrigger(card: Card): Trigger | null {
    if (!card.effect || !card.effect.triggers) return null;
    return card.effect.triggers.find((t) => t.event === "manual" && !t.auto) || null;
  }

  /* ===================== 战斗 ===================== */
  async declareAttack(zoneIdx: number, targetIdx: number | null): Promise<void> {
    const s = this.state;
    if (s.turnPlayer !== "me" || s.phase !== "battle" || s.pending || s.resolving) return;
    await this._pacePlayer();
    const p = this.cur();
    const attacker = p.monsterZone[zoneIdx];
    if (!attacker || attacker.faceDown || attacker.position !== "atk") { this._toast("只能用攻击表示怪兽攻击。"); return; }
    if (p.attacked[zoneIdx]) { this._toast("此怪兽本回合已攻击。"); return; }
    if (s.turn === 1 && s.turnPlayer === "me") { this._toast("先手第一回合不能攻击。"); return; }
    const oppP = this.curOpp();
    if (oppP.attackLockTurns > 0) { this._toast("受光之护封剑影响，不能攻击。"); return; }
    p.attacked[zoneIdx] = true;
    let target: Card | null = targetIdx != null ? oppP.monsterZone[targetIdx] : null;
    if (this.monsters(oppP).length === 0) target = null;
    s.attackNegated = false; s.endBattlePhase = false;
    s.currentAttack = { attacker, atkOwner: "me" };
    this.log(`${attacker.name} 发动攻击！${target ? `目标：${target.name}` : "直接攻击"}`);
    await this.emit({ kind: "attack_declare", actor: "me", attacker, attackerOwner: "me", target, targetOwner: "ai" });
    if (s.endBattlePhase) { await this.enterMain2(); return; }
    if (s.attackNegated) { this.emitView(); return; }
    if (!this.isValid(attacker)) { this.log(`${attacker.name} 已不在场上，攻击中止。`); this.emitView(); return; }
    if (target && !this.isValid(target)) {
      this.log("攻击对象已消失，进入回放。");
      if (this.monsters(oppP).length === 0) target = null;
      else target = oppP.monsterZone.find((m) => m) || null;
    }
    await this.damageStep(attacker, "me", target, "ai");
  }

  async damageStep(attacker: Card, atkOwner: PlayerKey, target: Card | null, defOwner: PlayerKey): Promise<void> {
    const s = this.state;
    const atkStats = this.stats(attacker);
    const attackerP = this.state[atkOwner];
    const defenderP = this.state[defOwner];
    if (!target) {
      let dmg = atkStats.atk;
      if (defenderP.noBattleDamageTurn) dmg = 0;
      const ev: GameEvent = { kind: "damage_calc", attacker, target: null, damageTo: defOwner, damage: dmg, direct: true };
      this._dmgEvent = ev;
      await this.emit(ev);
      dmg = ev.damage || 0;
      if (dmg > 0) { defenderP.lp -= dmg; this.log(`${attacker.name} 直接攻击，${this._name(defOwner)} 受 ${dmg} 伤害。`); this.emitView(); this._checkWin(); }
      await this._afterAttack(attacker, atkOwner, target);
      return;
    }
    const wasFacedown = target.faceDown;
    if (target.faceDown) await this._flipUp(target, false);
    const defStats = this.stats(target);
    let destroyedTarget = false, destroyedAttacker = false, battleDmgToDef = 0, battleDmgToAtk = 0;
    if (target.position === "atk") {
      if (atkStats.atk > defStats.atk) { destroyedTarget = true; battleDmgToDef = atkStats.atk - defStats.atk; }
      else if (atkStats.atk < defStats.atk) { destroyedAttacker = true; battleDmgToAtk = defStats.atk - atkStats.atk; }
      else { destroyedTarget = true; destroyedAttacker = true; }
    } else {
      if (atkStats.atk > defStats.def) destroyedTarget = true;
      else if (atkStats.atk < defStats.def) battleDmgToAtk = defStats.def - atkStats.atk;
    }
    if (battleDmgToDef > 0 && defenderP.noBattleDamageTurn) battleDmgToDef = 0;
    if (battleDmgToAtk > 0 && attackerP.noBattleDamageTurn) battleDmgToAtk = 0;
    // damage_calc 事件（贯穿自动修饰 + 栗子球响应）
    if (battleDmgToDef > 0 || (target.position === "def" && atkStats.atk > defStats.def)) {
      const ev: GameEvent = { kind: "damage_calc", attacker, target, damageTo: defOwner, damage: battleDmgToDef };
      this._dmgEvent = ev;
      await this.emit(ev);
      battleDmgToDef = Math.max(0, ev.damage || 0);
    }
    if (battleDmgToAtk > 0) {
      const ev: GameEvent = { kind: "damage_calc", attacker, target, damageTo: atkOwner, damage: battleDmgToAtk };
      this._dmgEvent = ev;
      await this.emit(ev);
      battleDmgToAtk = Math.max(0, ev.damage || 0);
    }
    this._dmgEvent = null;
    if (destroyedTarget) { await this._destroyInBattle(target, defOwner, attacker, atkOwner); this.log(`${target.name} 被破坏。`); }
    if (destroyedAttacker) { await this._destroyInBattle(attacker, atkOwner, target, defOwner); this.log(`${attacker.name} 被破坏。`); }
    if (battleDmgToDef > 0) { defenderP.lp -= battleDmgToDef; this.log(`${this._name(defOwner)} 受 ${battleDmgToDef} 战斗伤害。`); this.emitView(); this._checkWin(); }
    if (battleDmgToAtk > 0) { attackerP.lp -= battleDmgToAtk; this.log(`${this._name(atkOwner)} 受 ${battleDmgToAtk} 战斗伤害。`); this.emitView(); this._checkWin(); }
    // 翻转效果（被攻击翻开，即使被破坏也生效）
    if (!s.winner && wasFacedown && target.effect && this._hasFlip(target)) {
      await this.emit({ kind: "flip", monster: target, owner: defOwner, by: "attack" });
    }
    await this._afterAttack(attacker, atkOwner, target);
  }

  async _afterAttack(attacker: Card, atkOwner: PlayerKey, target: Card | null): Promise<void> {
    const s = this.state;
    if (s.winner) return;
    // damage_step_end 事件（哥布林/长枪龙 转守备）
    if (this.isValid(attacker)) await this.emit({ kind: "damage_step_end", attacker, target, atkOwner });
    s.currentAttack = null;
    this.emitView();
  }

  async _destroyInBattle(mon: Card, ownerKey: PlayerKey, attacker: Card, atkOwner: PlayerKey): Promise<void> {
    const z = this._findZone(mon);
    if (!z) return;
    const p = this.state[z.key];
    for (const eq of [...mon.equipped]) await this._sendToGrave(eq, "field", "battle");
    mon.equipped = [];
    p.monsterZone[z.idx] = null;
    mon.controlOriginalController = null;
    if (mon.linkPartner) { const partner = mon.linkPartner; mon.linkPartner = null; if (this._findZone(partner)) await this._destroy(partner, "battle"); }
    // 先送墓（触发送墓检索），再发 destroyed_by_battle
    const owner = this._ownerOf(mon);
    p.graveyard.push(mon); mon.location = "grave"; mon.controller = owner;
    await this.emit({ kind: "sent_to_grave", card: mon, owner, from: "field", reason: "battle" });
    await this.emit({ kind: "destroyed_by_battle", card: mon, owner, attacker, attackerOwner: atkOwner });
  }

  /* ===================== 胜负 ===================== */
  _checkWin(): void {
    const s = this.state;
    if (s.me.lp <= 0 && s.ai.lp <= 0) { s.me.lp = 0; s.ai.lp = 0; this._win("draw", "双方LP归零"); return; }
    if (s.me.lp <= 0) { s.me.lp = 0; this._win("ai", "LP归零"); return; }
    if (s.ai.lp <= 0) { s.ai.lp = 0; this._win("me", "LP归零"); return; }
  }
  _win(who: PlayerKey | "draw", reason: string): void {
    const s = this.state;
    if (s.winner) return;
    s.winner = who;
    this.log(`${who === "draw" ? "平局" : this._name(who) + " 获胜"}！（${reason}）`);
    this.emitView();
    this.cb.onGameOver && this.cb.onGameOver(who);
  }
  _toast(msg: string): void { this.cb.onToast && this.cb.onToast(msg); }
}

interface Window {
  YGO_CARDS: CardDef[];
  YGO_CARD_BY_ID: Record<string, CardDef>;
  YGO_BUILD_DECK: (preset: string) => string[];
  YGO_BUILD_EXTRA: (preset: string) => string[];
  YGO_DECK_PRESETS: string[];
  Duel: typeof Duel;
  AiPlayer: typeof AiPlayer;
}

window.Duel = Duel;
