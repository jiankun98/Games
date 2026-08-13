"use strict";
// 五子棋（n 子棋）游戏引擎
// 支持人人对战 / 人机对战 / AI 对战；记录落子历史与 AI 思考过程；支持复盘与对局导入导出。
// AI 决策由外部注入（ai_decide），引擎本身不依赖网络与 DOM 之外的 API。

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Game {
  canvas;
  ctx;

  // 每个棋子点，鼠标点击的判定生效区间差值
  static drop_area_size = 16;
  // 棋盘网格大小
  static grid_size = 40;

  config = {
    size: 15,
    first: "black",
    offset: 24,
    judge_fill_count: 5,
    mode: "pvp",
    ai_color: "white",
    ai_delay: 600,
  };

  // 所有棋子点 二维数组 points[i][j]（i=列, j=行）
  points = [];

  // 下次落子的颜色
  next_drop = "black";

  // 落子历史
  history = [];

  // 复盘游标：null=实时对局；否则显示到第 k 手（不含第 k 之后）
  view_index = null;

  // AI 思考中，禁止落子
  busy = false;

  // AI 对战暂停标志
  stopped = false;

  winner = null;
  win_line = null;

  callbacks = {};
  ai_decide = null;

  abortController = null;

  constructor(canvasElement, config, callbacks, ai_decide) {
    Object.assign(this.config, config || {});
    if (callbacks) this.callbacks = callbacks;
    if (ai_decide) this.ai_decide = ai_decide;

    if (!canvasElement) return;

    this.canvas = canvasElement;
    this.ctx = this.canvas.getContext("2d");

    this.init();
  }

  // 初始化：画布尺寸、棋子点生成、首次渲染
  init = () => {
    const { size, offset, first } = this.config;
    const grid_size = Game.grid_size;

    this.next_drop = first ?? "black";

    const sizeMax = (size - 1) * grid_size;
    this.canvas.width = sizeMax + offset * 2;
    this.canvas.height = sizeMax + offset * 2;
    this.canvas.style.backgroundColor = "#e3cdb0";
    this.ctx.lineWidth = 2;
    this.ctx.strokeStyle = "#000";

    this.points = [];
    for (let i = 0; i < size; i++) {
      const points = [];
      for (let j = 0; j < size; j++) {
        points.push({
          x: i * grid_size + offset,
          y: j * grid_size + offset,
          fill: null,
          address: [i, j],
        });
      }
      this.points.push(points);
    }

    this.render();
  };

  // 画棋盘线与星位
  draw_board = () => {
    const { size, offset } = this.config;
    const grid_size = Game.grid_size;
    const ctx = this.ctx;
    const sizeMax = (size - 1) * grid_size;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#000";

    for (let i = 0; i < size; i++) {
      const p = i * grid_size;
      ctx.beginPath();
      ctx.moveTo(offset, p + offset);
      ctx.lineTo(sizeMax + offset, p + offset);
      ctx.moveTo(p + offset, offset);
      ctx.lineTo(p + offset, sizeMax + offset);
      ctx.stroke();
      ctx.closePath();
    }

    // 星位
    const stars = [];
    if (size >= 9) {
      const edge = size >= 13 ? 3 : 2;
      stars.push([edge, edge], [edge, size - 1 - edge], [size - 1 - edge, edge], [size - 1 - edge, size - 1 - edge]);
      stars.push([Math.floor(size / 2), Math.floor(size / 2)]);
    }
    ctx.fillStyle = "#000";
    for (const [i, j] of stars) {
      ctx.beginPath();
      ctx.arc(i * grid_size + offset, j * grid_size + offset, 3.5, 0, 2 * Math.PI);
      ctx.fill();
      ctx.closePath();
    }
  };

  // 画棋子，画到第 upTo 手（含）
  draw_stones = (upTo) => {
    const ctx = this.ctx;
    const grid_size = Game.grid_size;
    const { offset } = this.config;
    for (let k = 0; k < upTo && k < this.history.length; k++) {
      const m = this.history[k];
      const cx = m.address[0] * grid_size + offset;
      const cy = m.address[1] * grid_size + offset;
      ctx.beginPath();
      ctx.arc(cx, cy, 15, 0, 2 * Math.PI);
      ctx.fillStyle = m.color === "black" ? "#000" : "#fff";
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#000";
      ctx.stroke();
      ctx.closePath();
    }
  };

  // 标记最后一手（红点）
  draw_last_marker = (upTo) => {
    if (upTo <= 0 || upTo > this.history.length) return;
    const ctx = this.ctx;
    const grid_size = Game.grid_size;
    const { offset } = this.config;
    const m = this.history[upTo - 1];
    const cx = m.address[0] * grid_size + offset;
    const cy = m.address[1] * grid_size + offset;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#e53935";
    ctx.fill();
    ctx.closePath();
  };

  // 高亮获胜连线
  draw_win_line = () => {
    if (!this.win_line || this.win_line.length === 0) return;
    const ctx = this.ctx;
    const grid_size = Game.grid_size;
    const { offset } = this.config;
    const [sx, sy] = this.win_line[0];
    const [ex, ey] = this.win_line[this.win_line.length - 1];
    ctx.beginPath();
    ctx.moveTo(sx * grid_size + offset, sy * grid_size + offset);
    ctx.lineTo(ex * grid_size + offset, ey * grid_size + offset);
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(229,57,53,0.85)";
    ctx.stroke();
    ctx.closePath();
  };

  // 全量重绘
  render = () => {
    const upTo = this.view_index === null ? this.history.length : this.view_index;
    this.draw_board();
    this.draw_stones(upTo);
    if (upTo > 0) this.draw_last_marker(upTo);
    if (this.winner && this.win_line && upTo >= this.history.length) this.draw_win_line();
  };

  // 设置画布点击事件
  set_click_event = () => {
    this.canvas.addEventListener("click", (event) => {
      const x = event.offsetX;
      const y = event.offsetY;
      this.on_click(x, y);
    });
  };

  on_click = (x, y) => {
    if (this.busy || this.winner || this.view_index !== null) return;
    if (this.config.mode === "ava") return; // AI 对战：人不参与
    // 人机模式下，AI 回合禁止人落子
    if (this.config.mode === "pvc" && this.next_drop === this.config.ai_color) return;
    const point = this.get_point_by_coordinate(x, y);
    if (!point) return;
    if (this.drop(point, "human")) {
      this.maybe_trigger_ai();
    }
  };

  // 根据鼠标点击坐标 获取棋子点
  get_point_by_coordinate = (x, y) => {
    const { drop_area_size } = Game;
    const half_size = drop_area_size / 2;
    for (let i = 0; i < this.points.length; i++) {
      for (let j = 0; j < this.points[i].length; j++) {
        const p = this.points[i][j];
        if (
          x >= p.x - half_size &&
          x <= p.x + half_size &&
          y >= p.y - half_size &&
          y <= p.y + half_size
        ) {
          return p;
        }
      }
    }
    return null;
  };

  // 通用落子：记录历史、判胜、翻色。返回是否落子成功。
  drop = (point, by, thinking, raw, reasoning) => {
    if (this.winner || this.view_index !== null) return false;
    if (point.fill) return false;

    point.fill = this.next_drop;
    const record = {
      index: this.history.length,
      address: [point.address[0], point.address[1]],
      color: this.next_drop,
      by,
      thinking,
      raw,
      reasoning,
      ts: Date.now(),
    };
    this.history.push(record);
    this.render();
    if (this.callbacks.onMove) this.callbacks.onMove(record);

    const line = this.check_win(point);
    if (line) {
      this.winner = this.next_drop;
      this.win_line = line.map((p) => p.address);
      this.set_busy(false);
      this.render();
      if (this.callbacks.onWin) this.callbacks.onWin(this.winner, this.win_line);
      return true;
    }

    this.flip_drop();
    if (this.callbacks.onTurn) this.callbacks.onTurn(this.next_drop);
    return true;
  };

  // 程序化落子（供 AI）
  place_at = (i, j, by, thinking, raw, reasoning) => {
    const point = this.points[i] && this.points[i][j];
    if (!point) return false;
    return this.drop(point, by, thinking, raw, reasoning);
  };

  is_valid_move = (move) => {
    if (!move) return false;
    const [i, j] = move;
    const p = this.points[i] && this.points[i][j];
    return !!p && !p.fill;
  };

  // 智能挽救模型给出的非法落子：越界时尝试 1 起算转换；界内被占用则取最近空位
  salvage_move = (m) => {
    if (!m) return null;
    const [i, j] = m;
    const { size } = this.config;
    if (!Number.isInteger(i) || !Number.isInteger(j)) return null;
    const inBounds = i >= 0 && i < size && j >= 0 && j < size;
    if (inBounds) {
      // 界内但被占用 -> 取最近空位
      return this.nearest_empty(i, j);
    }
    // 越界：尝试 1 起算转换 [1..size] -> [0..size-1]
    if (i >= 1 && i <= size && j >= 1 && j <= size) {
      const a = i - 1, b = j - 1;
      if (this.is_valid_move([a, b])) return [a, b];
    }
    return null;
  };

  // 以 (i,j) 为中心向外找最近的空位（切比雪夫距离 <=2）
  nearest_empty = (i, j) => {
    const { size } = this.config;
    for (let r = 1; r <= 2; r++) {
      for (let di = -r; di <= r; di++) {
        for (let dj = -r; dj <= r; dj++) {
          if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
          const a = i + di, b = j + dj;
          if (a >= 0 && a < size && b >= 0 && b < size && this.is_valid_move([a, b])) return [a, b];
        }
      }
    }
    return null;
  };

  // 描述非法落子原因，用作下一轮重试的纠正提示
  describe_invalid = (m) => {
    const { size } = this.config;
    if (!m) return "上一手未给出可解析的 move 字段。请确保返回 JSON，且 move 为 [列i, 行j] 两个从 0 开始的整数。";
    const [i, j] = m;
    if (!Number.isInteger(i) || !Number.isInteger(j)) return "move 字段需为两个整数组成的数组，如 [7, 7]。";
    if (i < 0 || i >= size || j < 0 || j >= size) {
      if (i >= 1 && i <= size && j >= 1 && j <= size) {
        return `上一手 [${i},${j}] 越界（你似乎用了 1 起算）。坐标须从 0 开始，合法范围 0..${size - 1}；例如 [${i - 1},${j - 1}]。请重新给出 0 起算的空位。`;
      }
      return `上一手 [${i},${j}] 越界，合法坐标范围 0..${size - 1}，请重新选择空位。`;
    }
    return `上一手 [${i},${j}] 已被占用，请选择一个空位。`;
  };

  // 从思考过程（reasoning）中解析草拟的落子（取最后一个 {"move":[i,j]}）
  parse_reasoning_move = (reasoning) => {
    if (!reasoning) return null;
    const matches = [...reasoning.matchAll(/"move"\s*:\s*\[\s*(-?\d+)\s*,\s*(-?\d+)\s*\]/gi)];
    if (matches.length === 0) return null;
    const m = matches[matches.length - 1];
    return [parseInt(m[1], 10), parseInt(m[2], 10)];
  };

  // 翻转下一次落子的颜色
  flip_drop = () => {
    this.next_drop = this.next_drop === "black" ? "white" : "black";
  };

  // 取包含 (x,y) 的同色连线（沿 dx,dy 方向，含当前点）
  get_run = (x, y, fill, dx, dy) => {
    const run = [this.points[x][y]];
    for (let k = 1; k < this.config.judge_fill_count; k++) {
      const p = (this.points[x + dx * k] || [])[y + dy * k];
      if (!p || p.fill !== fill) break;
      run.push(p);
    }
    for (let k = 1; k < this.config.judge_fill_count; k++) {
      const p = (this.points[x - dx * k] || [])[y - dy * k];
      if (!p || p.fill !== fill) break;
      run.unshift(p);
    }
    return run;
  };

  // 判断输赢：返回获胜连线点数组，无则 null
  check_win = (point) => {
    const [x, y] = point.address;
    const fill = point.fill;
    if (!fill) return null;
    const dirs = [
      [1, 0], // 横向
      [0, 1], // 纵向
      [1, 1], // 左上到右下
      [1, -1], // 右上到左下
    ];
    for (const [dx, dy] of dirs) {
      const run = this.get_run(x, y, fill, dx, dy);
      if (run.length >= this.config.judge_fill_count) return run;
    }
    return null;
  };

  // ============ AI 行棋 ============

  set_busy = (b) => {
    if (this.busy === b) return;
    this.busy = b;
    if (this.callbacks.onBusy) this.callbacks.onBusy(b);
  };

  // 是否轮到 AI：pvc 下 AI 色；ava 下任意色
  is_ai_turn = () => {
    if (this.config.mode === "pvc") return this.next_drop === this.config.ai_color;
    if (this.config.mode === "ava") return true;
    return false;
  };

  // 若轮到 AI 则触发其回合
  maybe_trigger_ai = async () => {
    if (this.config.mode === "pvp") return;
    if (this.winner || this.stopped) {
      this.set_busy(false);
      return;
    }
    if (!this.is_ai_turn()) return;
    if (!this.ai_decide) {
      if (this.callbacks.onStatus) this.callbacks.onStatus("未配置 AI 决策");
      return;
    }
    await this.run_ai_turn();
  };

  run_ai_turn = async () => {
    // AI 即将行棋，若处于复盘视图则先回到实时，避免 drop 被拦截导致 ava 空转
    if (this.view_index !== null) {
      this.view_index = null;
      this.render();
    }
    this.set_busy(true);
    this.abortController = new AbortController();
    const color = this.next_drop;
    const colorText = color === "black" ? "黑" : "白";
    if (this.callbacks.onStatus) this.callbacks.onStatus(`AI（${colorText}）思考中…`);
    if (this.callbacks.onThinking) this.callbacks.onThinking("", false);

    // AI 对战放慢节奏，便于观战
    if (this.config.mode === "ava" && this.history.length > 0) {
      await sleep(this.config.ai_delay);
      if (this.stopped || this.winner) {
        this.set_busy(false);
        return;
      }
    }

    let reasoning = "";     // 思考过程（reasoning_content / 流式输出）
    let jsonThinking = "";  // 输出结果中的 thinking 字段
    let move = null;
    let raw = "";

    let correction = undefined;
    for (let attempt = 0; attempt < 3 && !move; attempt++) {
      try {
        const res = await this.ai_decide({
          board_text: this.board_to_text(),
          board_array: this.board_to_array(),
          moves_text: this.moves_to_text(),
          color,
          size: this.config.size,
          n: this.config.judge_fill_count,
          on_thinking: (c) => {
            reasoning += c;
            if (this.callbacks.onThinking) this.callbacks.onThinking(c, false);
          },
          signal: this.abortController.signal,
          correction,
        });
        raw = res.raw ?? "";
        // 思考过程与输出结果分开：reasoning 为推理过程，thinking 为 JSON 内的简短分析
        if (res.reasoning) reasoning = res.reasoning;
        if (res.thinking) jsonThinking = res.thinking;
        const m = res.move;
        if (this.is_valid_move(m)) {
          // 一致性校验：思考过程若草拟了不同的落子，视为思考与输出不一致，重试
          const rc = this.parse_reasoning_move(res.reasoning);
          if (rc && this.is_valid_move(rc) && (rc[0] !== m[0] || rc[1] !== m[1])) {
            correction = `思考过程草拟的落子为 [${rc[0]},${rc[1]}]，但 move 字段输出为 [${m[0]},${m[1]}]，两者不一致。请重新确认最终落子，并确保 thinking 结论与 move 完全一致。`;
          } else {
            move = m;
          }
        } else {
          // 智能挽救：1 起算转换 / 落子被占用则取最近空位
          const salvaged = this.salvage_move(m);
          if (salvaged) {
            move = salvaged;
            reasoning += `\n\n[模型落子 ${m ? `[${m[0]},${m[1]}]` : "空"} 非法，已就近修正为 (${salvaged[0]},${salvaged[1]})]`;
          } else {
            correction = this.describe_invalid(m);
          }
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("abort")) {
          this.set_busy(false);
          if (this.callbacks.onStatus) this.callbacks.onStatus("AI 已取消");
          return;
        }
        if (this.callbacks.onStatus) this.callbacks.onStatus(`AI 调用失败：${msg}`);
        break;
      }
    }

    if (this.callbacks.onThinking) this.callbacks.onThinking(reasoning, true);

    if (this.stopped || this.winner) {
      this.set_busy(false);
      return;
    }

    // ava 连续对局期间保持 busy（避免遮罩闪烁），结束/暂停时统一清除
    if (this.config.mode !== "ava") this.set_busy(false);

    if (!move) {
      move = this.fallback_move(color);
      reasoning += `\n\n[模型未给出合法落子，使用兜底启发式：(${move[0]}, ${move[1]})]`;
      if (this.callbacks.onStatus) this.callbacks.onStatus("AI 未给出合法落子，使用兜底策略");
    } else {
      if (this.callbacks.onStatus) this.callbacks.onStatus(`AI 落子 (${move[0]}, ${move[1]})`);
    }

    this.place_at(move[0], move[1], "ai", jsonThinking, raw, reasoning);

    // ava：继续下一手
    if (this.config.mode === "ava" && !this.winner && !this.stopped) {
      await this.maybe_trigger_ai();
    }
  };

  // 取消正在进行的 AI 思考（不改变暂停状态）
  cancel_ai = () => {
    if (this.abortController) this.abortController.abort();
    this.set_busy(false);
  };

  // 暂停 AI 对战循环
  pause_ai = () => {
    this.stopped = true;
    if (this.abortController) this.abortController.abort();
    this.set_busy(false);
    if (this.callbacks.onStatus) this.callbacks.onStatus("已暂停");
  };

  // 继续 AI 对战循环
  resume_ai = () => {
    if (this.config.mode === "pvp" || this.winner) return;
    this.stopped = false;
    if (this.callbacks.onStatus) this.callbacks.onStatus("继续对局");
    this.maybe_trigger_ai();
  };

  // 兜底启发式：必杀 > 堵必杀 > 综合评分最高
  fallback_move = (color) => {
    const { size } = this.config;
    const opp = color === "black" ? "white" : "black";

    const empties = [];
    let hasStone = false;
    for (let i = 0; i < size; i++) {
      for (let j = 0; j < size; j++) {
        if (this.points[i][j].fill) hasStone = true;
        else if (this.has_neighbor(i, j)) empties.push([i, j]);
      }
    }
    if (!hasStone) return [Math.floor(size / 2), Math.floor(size / 2)];
    if (empties.length === 0) {
      for (let i = 0; i < size; i++)
        for (let j = 0; j < size; j++)
          if (!this.points[i][j].fill) return [i, j];
    }

    for (const [i, j] of empties) {
      this.points[i][j].fill = color;
      const win = this.check_win(this.points[i][j]);
      this.points[i][j].fill = null;
      if (win) return [i, j];
    }
    for (const [i, j] of empties) {
      this.points[i][j].fill = opp;
      const win = this.check_win(this.points[i][j]);
      this.points[i][j].fill = null;
      if (win) return [i, j];
    }
    let best = empties[0];
    let bestScore = -1;
    for (const [i, j] of empties) {
      const score = this.score_cell(i, j, color) + this.score_cell(i, j, opp) * 0.9;
      if (score > bestScore) {
        bestScore = score;
        best = [i, j];
      }
    }
    return best;
  };

  has_neighbor = (i, j) => {
    for (let di = -1; di <= 1; di++) {
      for (let dj = -1; dj <= 1; dj++) {
        if (di === 0 && dj === 0) continue;
        const p = this.points[i + di] && this.points[i + di][j + dj];
        if (p && p.fill) return true;
      }
    }
    return false;
  };

  // 评估在 (i,j) 落 color 子后，四个方向上同色连子潜力
  score_cell = (i, j, color) => {
    const dirs = [
      [1, 0],
      [0, 1],
      [1, 1],
      [1, -1],
    ];
    let total = 0;
    for (const [dx, dy] of dirs) {
      let count = 1;
      let openA = false;
      let openB = false;
      for (let k = 1; k < this.config.judge_fill_count; k++) {
        const p = this.points[i + dx * k] && this.points[i + dx * k][j + dy * k];
        if (!p) break;
        if (p.fill === color) count++;
        else {
          if (!p.fill) openA = true;
          break;
        }
      }
      for (let k = 1; k < this.config.judge_fill_count; k++) {
        const p = this.points[i - dx * k] && this.points[i - dx * k][j - dy * k];
        if (!p) break;
        if (p.fill === color) count++;
        else {
          if (!p.fill) openB = true;
          break;
        }
      }
      total += count * count + (openA ? 1 : 0) + (openB ? 1 : 0);
    }
    return total;
  };

  // 导出棋盘文本（供 LLM）
  board_to_text = () => {
    const { size } = this.config;
    const lines = [];
    // 表头每列固定 2 字符、无分隔，与行内格子对齐，避免列号错位
    const header = "   " + Array.from({ length: size }, (_, i) => String(i).padStart(2, " ")).join("");
    lines.push(header);
    for (let j = 0; j < size; j++) {
      let row = String(j).padStart(2, " ") + " ";
      for (let i = 0; i < size; i++) {
        const f = this.points[i][j].fill;
        row += f === "black" ? " X" : f === "white" ? " O" : " .";
      }
      lines.push(row);
    }
    return lines.join("\n");
  };

  // 导出棋盘二维数组（供 LLM 精确按下标取值）：arr[j][i] = 行j、列i 的格子
  board_to_array = () => {
    const { size } = this.config;
    const arr = [];
    for (let j = 0; j < size; j++) {
      let row = "";
      for (let i = 0; i < size; i++) {
        const f = this.points[i][j].fill;
        row += f === "black" ? "X" : f === "white" ? "O" : ".";
      }
      arr.push(row);
    }
    return arr;
  };

  // 导出走子记录文本
  moves_to_text = () => {
    return this.history
      .map((m, idx) => `${idx + 1}. ${m.color === "black" ? "黑" : "白"} (${m.address[0]},${m.address[1]})`)
      .join("  ");
  };

  // ============ 复盘 ============

  goto_move = (index) => {
    const clamped = Math.max(0, Math.min(index, this.history.length));
    this.view_index = clamped >= this.history.length ? null : clamped;
    this.render();
    if (this.view_index === null) {
      if (this.callbacks.onStatus) this.callbacks.onStatus(`实时对局（共 ${this.history.length} 手）`);
    } else {
      const m = this.history[this.view_index - 1];
      if (this.callbacks.onStatus)
        this.callbacks.onStatus(
          `复盘：第 ${clamped}/${this.history.length} 手 - ${m ? (m.color === "black" ? "黑" : "白") + " (" + m.address[0] + "," + m.address[1] + ")" : "开局"}`
        );
    }
  };

  step = (delta) => {
    const base = this.view_index === null ? this.history.length : this.view_index;
    this.goto_move(base + delta);
  };

  to_live = () => {
    this.view_index = null;
    this.render();
    if (this.callbacks.onStatus) this.callbacks.onStatus(`实时对局（共 ${this.history.length} 手）`);
  };

  // 悔棋：撤销最后一手；人机模式下若撤的是 AI 一手，则连同人的上一手一起撤
  undo = () => {
    this.cancel_ai();
    if (this.history.length === 0) return false;
    let last = this.history.pop();
    this.points[last.address[0]][last.address[1]].fill = null;
    if (this.config.mode === "pvc" && last.by === "ai" && this.history.length > 0) {
      last = this.history.pop();
      this.points[last.address[0]][last.address[1]].fill = null;
    }
    this.winner = null;
    this.win_line = null;
    this.view_index = null;
    this.next_drop =
      this.history.length === 0
        ? this.config.first
        : this.history[this.history.length - 1].color === "black"
        ? "white"
        : "black";
    this.render();
    if (this.callbacks.onStatus) this.callbacks.onStatus(`悔棋，当前 ${this.history.length} 手`);
    if (this.callbacks.onTurn) this.callbacks.onTurn(this.next_drop);
    return true;
  };

  // ============ 导入导出 ============

  export_record = () => {
    return {
      version: 1,
      config: { ...this.config },
      moves: this.history.map((m) => ({ ...m, address: [m.address[0], m.address[1]] })),
      winner: this.winner,
      created_at: new Date().toISOString(),
    };
  };

  load_record = (data) => {
    this.cancel_ai();
    this.stopped = true;
    if (data.config) Object.assign(this.config, data.config);
    this.history = [];
    this.winner = data.winner ?? null;
    this.win_line = null;
    this.view_index = null;
    this.busy = false;
    this.init();
    for (const m of data.moves) {
      const p = this.points[m.address[0]] && this.points[m.address[0]][m.address[1]];
      if (p && !p.fill) {
        p.fill = m.color;
        this.history.push({ ...m, address: [m.address[0], m.address[1]] });
      }
    }
    this.next_drop =
      this.history.length > 0
        ? this.history[this.history.length - 1].color === "black"
          ? "white"
          : "black"
        : this.config.first;
    this.render();
    if (this.callbacks.onStatus) this.callbacks.onStatus(`已载入 ${this.history.length} 手对局，可复盘`);
    if (this.callbacks.onTurn) this.callbacks.onTurn(this.next_drop);
  };

  // ============ 生命周期 ============

  reset = (config) => {
    this.cancel_ai();
    this.stopped = false;
    if (config) Object.assign(this.config, config);
    this.history = [];
    this.winner = null;
    this.win_line = null;
    this.view_index = null;
    this.busy = false;
    this.init();
    if (this.callbacks.onStatus) this.callbacks.onStatus("新对局开始");
    if (this.callbacks.onTurn) this.callbacks.onTurn(this.next_drop);
  };

  start = () => {
    this.set_click_event();
    if (this.callbacks.onTurn) this.callbacks.onTurn(this.next_drop);
    // 不自动开始 AI：需用户点「开始新对局」才会触发，避免打开页面即自动行棋
  };

  end = () => {
    const winText = this.winner === "black" ? "黑子" : "白子";
    const loseText = this.winner === "black" ? "白子" : "黑子";
    if (this.callbacks.onStatus) this.callbacks.onStatus(`${winText} 获胜，${loseText} 说话！`);
  };
}
