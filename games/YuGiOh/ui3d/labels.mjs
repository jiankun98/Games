/*
 * 游戏王 3D UI · 文案/图标常量（2D/3D 页面重复声明的收敛点）
 */
      /* ===================== 内联 SVG 图标（统一笔画，替代 emoji 图标） ===================== */
      const svgWrap = (inner) =>
        `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
      const IC = {
        pace: svgWrap(
          '<path d="M4.5 14a7.5 7.5 0 1 1 15 0"/><path d="M12 14l3.2-3.2"/><circle cx="12" cy="14" r="1.1" fill="currentColor" stroke="none"/><path d="M4.5 14H3M21 14h-1.5"/>',
        ),
        sfxOn: svgWrap(
          '<path d="M11 5.5 6.5 9H3.8v6h2.7L11 18.5z" fill="currentColor" stroke-linejoin="round"/><path d="M14.5 9.5a3.6 3.6 0 0 1 0 5"/><path d="M16.8 7.2a7 7 0 0 1 0 9.6"/>',
        ),
        sfxOff: svgWrap(
          '<path d="M11 5.5 6.5 9H3.8v6h2.7L11 18.5z" fill="currentColor" stroke-linejoin="round"/><path d="M15.5 10l4.5 4.5M20 10l-4.5 4.5"/>',
        ),
        log: svgWrap(
          '<circle cx="4.5" cy="6.5" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1" fill="currentColor" stroke="none"/><path d="M8.5 6.5H20M8.5 12H20M8.5 17.5H20"/>',
        ),
        help: svgWrap(
          '<circle cx="12" cy="12" r="8.6"/><path d="M9.7 9.4a2.5 2.5 0 1 1 3.4 2.3c-.85.35-1.1.9-1.1 1.8"/><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none"/>',
        ),
        close: svgWrap('<path d="M6 6l12 12M18 6L6 18"/>'),
        sword: svgWrap(
          '<path d="M4 20l3-1 11.5-11.5a2.1 2.1 0 0 0-3-3L4 16z"/><path d="M13.5 6.5l4 4"/><path d="M5.5 15.5l3 3"/>',
        ),
        shield: svgWrap(
          '<path d="M12 3.5l7 2.6v5.4c0 4.6-3 7.9-7 9.4-4-1.5-7-4.8-7-9.4V6.1z"/><path d="M12 7v9"/>',
        ),
        setCard: svgWrap(
          '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M12 9v6M9.5 12.8 12 15.3l2.5-2.5"/>',
        ),
        spark: svgWrap(
          '<path d="M12 4l1.7 4.6L18 10l-4.3 1.4L12 16l-1.7-4.6L6 10l4.3-1.4z" fill="currentColor" stroke-linejoin="round"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="currentColor" stroke-linejoin="round"/>',
        ),
        flip: svgWrap(
          '<path d="M4.5 9a8 8 0 0 1 14-2.5"/><path d="M19.5 15a8 8 0 0 1-14 2.5"/><path d="M18.6 3.5v3h-3M5.4 20.5v-3h3"/>',
        ),
        flag: svgWrap(
          '<path d="M6 21V4.5"/><path d="M6 5c2.6-1.6 5.2 1.4 8 0 1.6-.8 2.8-.7 4 0v8c-1.2-.7-2.4-.8-4 0-2.8 1.4-5.4-1.6-8 0"/>',
        ),
        ban: svgWrap('<circle cx="12" cy="12" r="8.6"/><path d="M6 6l12 12"/>'),
        check: svgWrap('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
        draw: svgWrap(
          '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M12 15v-5M9.8 12.2 12 10l2.2 2.2"/>',
        ),
        gear: svgWrap(
          '<circle cx="12" cy="12" r="2.6"/><path d="M12 4.2v2.3M12 17.5v2.3M4.2 12h2.3M17.5 12h2.3M6.5 6.5l1.6 1.6M15.9 15.9l1.6 1.6M17.5 6.5l-1.6 1.6M8.1 15.9l-1.6 1.6"/>',
        ),
        lp: svgWrap('<path d="M12 3.5 18.5 12 12 20.5 5.5 12Z"/><path d="M12 8.5v7"/>'),
      };
      /* 卡面属性角标文字（无图版卡面 / DOM 卡牌用；不使用 emoji） */
      const ATTR_TXT = {
        光: "光",
        暗: "暗",
        地: "地",
        水: "水",
        炎: "炎",
        风: "风",
      };
      const PHASE_TIPS = {
        draw: ["抽卡阶段", "自动从卡组抽 1 张"],
        standby: ["准备阶段", "自动推进"],
        main1: ["主要阶段 1", "点击卡牌：召唤怪兽 / 发动魔法 / 覆盖卡牌"],
        battle: ["战斗阶段", "点击攻击表示的怪兽发起攻击"],
        main2: ["主要阶段 2", "还可召唤、覆盖魔法·陷阱卡"],
        end: ["结束阶段", "手卡多于 6 张需丢弃"],
      };
      /* 阶段全称（顶部回合信息唯一来源，取代各处缩写/重复表） */
      const PHASE_NAMES = {
        draw: "抽卡阶段",
        standby: "准备阶段",
        main1: "主要阶段 1",
        battle: "战斗阶段",
        main2: "主要阶段 2",
        end: "结束阶段",
      };
      /* 阶段流程顺序（阶段进度条用，抽卡→准备→主要1→战斗→主要2→结束） */
      const PHASE_ORDER = ["draw", "standby", "main1", "battle", "main2", "end"];

export { IC, ATTR_TXT, PHASE_TIPS, PHASE_NAMES, PHASE_ORDER };
