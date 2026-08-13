interface GamePlayConfig {
  width?: number;
  height?: number;
  backgroundColor?: string;

  size?: number;
  speed?: number;
  direction?: `${Direction}`;
  length?: number;

  foodNumber: number;
}

enum Direction {
  Up = "up",
  Down = "down",
  Left = "left",
  Right = "right",
}

interface GameSnakeConfig {
  speed: number;
  size: number;
  headerConfig: {
    x: number;
    y: number;
    color?: string;
  };
  bodyConfig: {
    color: string;
  };
  length?: number;
  direction?: `${Direction}`;
}

interface GameRectConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor?: string;
  ctx: CanvasRenderingContext2D;
}

// 公共的块
class React {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  borderColor?: string;

  ctx!: CanvasRenderingContext2D;

  constructor({
    x,
    y,
    width,
    height,
    color,
    borderColor,
    ctx,
  }: GameRectConfig) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.borderColor = borderColor;
    this.ctx = ctx;
  }

  draw() {
    const ctx = this.ctx;
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    if (this.borderColor) {
      ctx.strokeStyle = this.borderColor;
      ctx.strokeRect(this.x, this.y, this.width, this.height);
    }
  }

  clear() {
    const ctx = this.ctx;
    ctx.clearRect(this.x, this.y, this.width, this.height);
  }
}

// 会动的蛇
class Snake {
  ctx!: CanvasRenderingContext2D;

  speed: number;
  direction: `${Direction}`;
  size: number;

  header: React;
  body: React[] = [];

  constructor(config: GameSnakeConfig, ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;

    const {
      headerConfig: { x, y, color = "red" },
      bodyConfig: { color: bodyColor = "green" },
      size,
      length = 6,
      direction = Direction.Right,
      speed,
    } = config;

    this.direction = direction;
    this.speed = speed;
    this.size = size;

    this.header = new React({
      x,
      y,
      width: size,
      height: size,
      color,
      ctx,
    });

    const totalLength = length * size;
    let startX, startY;
    switch (direction) {
      case Direction.Up:
        startX = x;
        startY = y + size;
        for (let i = 1; i <= totalLength; i++) {
          this.body.push(
            new React({
              x: startX,
              y: startY - i,
              width: size,
              height: 1,
              color: bodyColor,
              ctx,
            })
          );
        }
        break;
      case Direction.Down:
        startX = x;
        startY = y;
        for (let i = 1; i <= totalLength; i++) {
          this.body.push(
            new React({
              x: startX,
              y: startY + i,
              width: size,
              height: 1,
              color: bodyColor,
              ctx,
            })
          );
        }
        break;
      case Direction.Left:
        startX = x + size;
        startY = y;
        for (let i = 1; i <= totalLength; i++) {
          this.body.push(
            new React({
              x: startX + i,
              y: startY,
              width: 1,
              height: size,
              color: bodyColor,
              ctx,
            })
          );
        }
        break;
      case Direction.Right:
        startX = x;
        startY = y;
        for (let i = 1; i <= totalLength; i++) {
          this.body.push(
            new React({
              x: startX - i,
              y: startY,
              width: 1,
              height: size,
              color: bodyColor,
              ctx,
            })
          );
        }
        break;
    }

    this.draw();
    // this.move_snake();

    this.listen_to_keyboard();
  }

  move() {
    const { direction, speed } = this;
    const size = this.size;
    const ctx = this.ctx;

    let startX, startY;
    let i = speed;

    switch (direction) {
      case Direction.Up:
        this.header.y -= speed;
        startX = this.header.x;
        startY = this.header.y + size;
        while (i >= 1) {
          this.body.unshift(
            new React({
              x: startX,
              y: startY - i + 1,
              width: size,
              height: 1,
              color: "green",
              ctx,
            })
          );
          i--;
        }
        break;
      case Direction.Down:
        this.header.y += speed;
        startX = this.header.x;
        startY = this.header.y;

        while (i >= 1) {
          this.body.unshift(
            new React({
              x: startX,
              y: startY - i,
              width: size,
              height: 1,
              color: "green",
              ctx,
            })
          );
          i--;
        }
        break;
      case Direction.Left:
        this.header.x -= speed;
        startX = this.header.x + size - 1;
        startY = this.header.y;

        while (i >= 1) {
          this.body.unshift(
            new React({
              x: startX + i,
              y: startY,
              width: 1,
              height: size,
              color: "green",
              ctx,
            })
          );
          i--;
        }
        break;
      case Direction.Right:
        this.header.x += speed;
        startX = this.header.x;
        startY = this.header.y;

        while (i >= 1) {
          this.body.unshift(
            new React({
              x: startX - i,
              y: startY,
              width: 1,
              height: size,
              color: "green",
              ctx,
            })
          );
          i--;
        }
        break;
    }

    this.body.splice(this.body.length - speed, speed);
  }

  draw() {
    this.header.draw();
    this.body.forEach((rect) => rect.draw());
  }

  listen_to_keyboard() {
    document.addEventListener("keydown", (event) => {
      const { key } = event;
      if (key === "ArrowUp" && this.direction !== Direction.Down) {
        this.direction = Direction.Up;
      } else if (key === "ArrowDown" && this.direction !== Direction.Up) {
        this.direction = Direction.Down;
      } else if (key === "ArrowLeft" && this.direction !== Direction.Right) {
        this.direction = Direction.Left;
      } else if (key === "ArrowRight" && this.direction !== Direction.Left) {
        this.direction = Direction.Right;
      }
    });
  }

  start = () => {};
}

// 刷新的食
class Food {
  draw() {}
}

// 串联的主程序
class Game {
  canvas!: HTMLCanvasElement;
  ctx!: CanvasRenderingContext2D;

  snake_instance!: Snake;
  food_instance!: Food;

  config: Required<GamePlayConfig> = {
    width: 700,
    height: 700,
    backgroundColor: "#fff",
    speed: 3,
    direction: Direction.Right,
    length: 6,
    size: 24,
    foodNumber: 1,
  };

  constructor(canvasElement: HTMLCanvasElement, config: GamePlayConfig) {
    Object.assign(this.config, config);

    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext("2d")!;
  }

  make_snake_instance = () => {
    const { width, height, backgroundColor, size, speed, direction, length } =
      this.config;
    this.canvas.width = width;
    this.canvas.height = height;
    this.canvas.style.backgroundColor = backgroundColor;

    this.snake_instance = new Snake(
      {
        speed,
        size,
        length,
        direction,
        headerConfig: {
          x: length * size + size,
          y: height / 2 - size / 2,
          color: "red",
        },
        bodyConfig: {
          color: "green",
        },
      },
      this.ctx
    );

    this.snake_move();
  };

  // 新增属性：记录上次移动时间戳
  private lastMoveTime: number = 0;

  snake_move = () => {
    requestAnimationFrame(() => {
      this.snake_instance.move();

      this.clear_canvas();
      this.snake_instance.draw();

      this.snake_move(); // 保持循环
    });
  };

  make_food_instance = () => {
    this.food_instance = new Food();
  };

  clear_canvas = () => {
    const { width, height } = this.config;
    this.ctx.clearRect(0, 0, width, height);
  };

  start = () => {
    this.make_snake_instance();

    this.make_food_instance();
  };
}
