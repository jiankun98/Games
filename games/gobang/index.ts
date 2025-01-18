interface GameConfig {
    size: number;
    first: "black" | "white";
    offset: number;
  
    judge_fill_count: number;
  }
  
  interface Point {
    fill: "black" | "white" | null;
    x: number;
    y: number;
    address: [number, number];
  }
  
  class Game {
    canvas!: HTMLCanvasElement;
    ctx!: CanvasRenderingContext2D;
  
    // 初始配置
    // 每个棋子点，鼠标点击的判定生效区间差值 如：20，20的棋子点 生效区间为：12，12， 28，12， 12，28， 28，28
    static drop_area_size = 16;
    // 棋盘网格大小
    static grid_size = 40;
    config: GameConfig = {
      size: 20, // 棋盘大小 20 * 20
      first: "black", // 先手颜色
      offset: 20, // 棋盘内边距
  
      judge_fill_count: 5, // 连子个数 可以是五子棋，六子棋等
    };
  
    // 所有棋子点 二维数组
    points: Point[][] = [];
  
    // 下次落子的颜色
    next_drop: "black" | "white" = "black";
  
    constructor(canvasElement: HTMLCanvasElement, config: GameConfig) {
      Object.assign(this.config, config);
  
      if (!canvasElement) return;
  
      this.canvas = canvasElement;
      this.ctx = this.canvas.getContext("2d")!;
  
      this.init();
    }
  
    // 初始化配置
    init = () => {
      const { size, offset, first } = this.config;
  
      const grid_size = Game.grid_size;
  
      // 设置先手
      this.next_drop = first ?? "black";
  
      const sizeMax = size * grid_size;
  
      // 设置画布大小
      this.canvas.width = sizeMax + offset * 2;
      this.canvas.height = sizeMax + offset * 2;
  
      // 设置画布样式
      this.canvas.style.backgroundColor = "#e3cdb0";
      this.ctx.lineWidth = 2;
      this.ctx.strokeStyle = "#000";
  
      // 画棋盘线
      for (let i = 0; i <= size; i++) {
        const addressIndex = i * grid_size;
  
        this.ctx.beginPath();
        // 画横线
        this.ctx.moveTo(offset, addressIndex + offset);
        this.ctx.lineTo(sizeMax + offset, addressIndex + offset);
        // 画竖线
        this.ctx.moveTo(addressIndex + offset, offset);
        this.ctx.lineTo(addressIndex + offset, sizeMax + offset);
        this.ctx.stroke();
  
        this.ctx.closePath();
      }
  
      // 设置棋子点坐标
      for (let i = 0; i <= size; i++) {
        const points: Point[] = [];
  
        for (let j = 0; j <= size; j++) {
          const point: Point = {
            x: i * grid_size + offset,
            y: j * grid_size + offset,
            fill: null,
            address: [i, j],
          };
  
          points.push(point);
        }
        this.points.push(points);
      }
    };
  
    // 设置画布点击事件
    set_click_event = () => {
      this.canvas.addEventListener("click", (event) => {
        const x = event.offsetX;
        const y = event.offsetY;
  
        const point = this.get_point_by_coordinate(x, y);
        if (!point) {
          return;
        }
        this.drop_chess(point);
      });
    };
  
    // 根据鼠标点击坐标 获取棋子点
    get_point_by_coordinate = (x: number, y: number) => {
      const { drop_area_size } = Game;
  
      const point = this.points.reduce<Point | null>((s, current) => {
        if (s) return s;
        const point = current.find((p) => {
          const { x: address_x, y: address_y } = p;
  
          const half_size = drop_area_size / 2;
  
          const is_in_point =
            x >= address_x - half_size &&
            x <= address_x + half_size &&
            y >= address_y - half_size &&
            y <= address_y + half_size;
  
          return is_in_point;
        });
        if (point) {
          s = point;
        }
        return s;
      }, null);
  
      return point;
    };
  
    // 落子
    drop_chess = (point: Point) => {
      // 判断是否已经有棋子
      const { x, y, fill } = point;
      const { ctx } = this;
  
      // 已经有棋子
      if (fill) {
        return;
      }
  
      // 落子类型
      point.fill = this.next_drop;
  
      // 画棋子
      ctx.beginPath();
      ctx.arc(x, y, 15, 0, 2 * Math.PI);
      ctx.fillStyle = this.next_drop === "black" ? "#000" : "#fff";
      ctx.fill();
      ctx.closePath();
  
      // 判断输赢
      if (this.check_win(point)) {
        this.end();
        return;
      }
  
      // 翻转下一次落子的颜色
      this.flip_drop();
    };
  
    // 翻转下一次落子的颜色 黑--->白 白--->黑
    flip_drop = () => {
      this.next_drop = this.next_drop === "black" ? "white" : "black";
    };
  
    // 判断输赢
    check_win = (point: Point) => {
      const { points } = this;
      const { size } = this.config;
      const {
        address: [x, y],
        fill,
      } = point;
      // 判断横向
      if (this.check_win_by_row(x, y, fill)) {
        return true;
      }
      // 判断纵向
      if (this.check_win_by_col(x, y, fill)) {
        return true;
      }
  
      // 判断斜向 左上到右下
      if (this.check_win_by_top_left_right_bottom(x, y, fill)) {
        return true;
      }
  
      // 判断斜向 右上到左下
      if (this.check_win_by_top_right_left_bottom(x, y, fill)) {
        return true;
      }
    };
  
    // 判断横向
    check_win_by_row = (x: Point["x"], y: Point["y"], fill: Point["fill"]) => {
      const {
        config: { judge_fill_count },
      } = this;
      let fill_arr = [];
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_x = x - i;
        const point = (this.points[currentAddress_x] || [])[y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.unshift(point);
      }
  
      fill_arr.push(this.points[x][y]);
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_x = x + i;
        const point = (this.points[currentAddress_x] || [])[y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.push(point);
      }
  
      if (fill_arr.length === judge_fill_count - 1) {
        // 已连成n -1后，在判断两头是否有空位，两头都有空位则为赢
        const {
          address: [start_x, start_y],
        } = fill_arr[0];
        const {
          address: [end_x, end_y],
        } = fill_arr[fill_arr.length - 1];
  
        const ponitS = (this.points[start_x - 1] || [])[start_y];
        const pointE = (this.points[end_x + 1] || [])[end_y];
  
        // 两头都有空位则为赢
        if (ponitS && pointE && !ponitS.fill && !pointE.fill) {
          return true;
        }
        return false;
      }
  
      if (fill_arr.length >= judge_fill_count) {
        return true;
      }
    };
  
    // 判断纵向
    check_win_by_col = (x: Point["x"], y: Point["y"], fill: Point["fill"]) => {
      const {
        config: { judge_fill_count },
      } = this;
      let fill_arr = [];
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_y = y - i;
        const point = (this.points[x] || [])[currentAddress_y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.unshift(point);
      }
  
      fill_arr.push(this.points[x][y]);
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_y = y + i;
        const point = (this.points[x] || [])[currentAddress_y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.push(point);
      }
  
      if (fill_arr.length === judge_fill_count - 1) {
        // 已连成n -1后，在判断两头是否有空位，两头都有空位则为赢
        const {
          address: [start_x, start_y],
        } = fill_arr[0];
        const {
          address: [end_x, end_y],
        } = fill_arr[fill_arr.length - 1];
  
        const ponitS = (this.points[start_x] || [])[start_y - 1];
        const pointE = (this.points[end_x] || [])[end_y + 1];
  
        // 两头都有空位则为赢
        if (ponitS && pointE && !ponitS.fill && !pointE.fill) {
          return true;
        }
        return false;
      }
  
      if (fill_arr.length >= judge_fill_count) {
        return true;
      }
    };
  
    // 判断斜向 左上到右下
    check_win_by_top_left_right_bottom = (
      x: Point["x"],
      y: Point["y"],
      fill: Point["fill"]
    ) => {
      const {
        config: { judge_fill_count },
      } = this;
      let fill_arr = [];
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_x = x - i;
        const currentAddress_y = y - i;
        const point = (this.points[currentAddress_x] || [])[currentAddress_y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.unshift(point);
      }
  
      fill_arr.push(this.points[x][y]);
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_x = x + i;
        const currentAddress_y = y + i;
        const point = (this.points[currentAddress_x] || [])[currentAddress_y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.push(point);
      }
  
      if (fill_arr.length === judge_fill_count - 1) {
        // 已连成n -1后，在判断两头是否有空位，两头都有空位则为赢
        const {
          address: [start_x, start_y],
        } = fill_arr[0];
        const {
          address: [end_x, end_y],
        } = fill_arr[fill_arr.length - 1];
  
        const ponitS = (this.points[start_x - 1] || [])[start_y - 1];
        const pointE = (this.points[end_x + 1] || [])[end_y + 1];
  
        // 两头都有空位则为赢
        if (ponitS && pointE && !ponitS.fill && !pointE.fill) {
          return true;
        }
        return false;
      }
  
      if (fill_arr.length >= judge_fill_count) {
        return true;
      }
    };
  
    // 判断斜向 右上到左下
    check_win_by_top_right_left_bottom = (
      x: Point["x"],
      y: Point["y"],
      fill: Point["fill"]
    ) => {
      const {
        config: { judge_fill_count },
      } = this;
      let fill_arr = [];
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_x = x - i;
        const currentAddress_y = y + i;
        const point = (this.points[currentAddress_x] || [])[currentAddress_y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.unshift(point);
      }
  
      fill_arr.push(this.points[x][y]);
  
      for (let i = 1; i < judge_fill_count; i++) {
        const currentAddress_x = x + i;
        const currentAddress_y = y - i;
        const point = (this.points[currentAddress_x] || [])[currentAddress_y];
        if (!point) break;
        if (point.fill !== fill) break;
        fill_arr.push(point);
      }
  
      if (fill_arr.length === judge_fill_count - 1) {
        // 已连成n -1后，在判断两头是否有空位，两头都有空位则为赢
        const {
          address: [start_x, start_y],
        } = fill_arr[0];
        const {
          address: [end_x, end_y],
        } = fill_arr[fill_arr.length - 1];
  
        const ponitS = (this.points[start_x - 1] || [])[start_y + 1];
        const pointE = (this.points[end_x + 1] || [])[end_y - 1];
  
        // 两头都有空位则为赢
        if (ponitS && pointE && !ponitS.fill && !pointE.fill) {
          return true;
        }
        return false;
      }
  
      if (fill_arr.length >= judge_fill_count) {
        return true;
      }
    };
  
    // 开始游戏
    start = () => {
      // 设置画布点击事件
      this.set_click_event();
    };
  
    end = () => {
      setTimeout(() => {
        const win_account = this.next_drop === "black" ? "黑子" : "白子";
        const lose_account = this.next_drop === "black" ? "白子" : "黑子";
        alert(`${win_account} 获胜, ${lose_account} 说话！`);
      }, 10);
    };
  }
  