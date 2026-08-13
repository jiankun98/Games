var Direction;
(function (Direction) {
    Direction["Up"] = "up";
    Direction["Down"] = "down";
    Direction["Left"] = "left";
    Direction["Right"] = "right";
})(Direction || (Direction = {}));
// 公共的块
var React = /** @class */ (function () {
    function React(_a) {
        var x = _a.x, y = _a.y, width = _a.width, height = _a.height, color = _a.color, borderColor = _a.borderColor, ctx = _a.ctx;
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
        this.borderColor = borderColor;
        this.ctx = ctx;
    }
    React.prototype.draw = function () {
        var ctx = this.ctx;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, this.width, this.height);
        if (this.borderColor) {
            ctx.strokeStyle = this.borderColor;
            ctx.strokeRect(this.x, this.y, this.width, this.height);
        }
    };
    React.prototype.clear = function () {
        var ctx = this.ctx;
        ctx.clearRect(this.x, this.y, this.width, this.height);
    };
    return React;
}());
// 会动的蛇
var Snake = /** @class */ (function () {
    function Snake(config, ctx) {
        this.body = [];
        this.start = function () { };
        this.ctx = ctx;
        var _a = config.headerConfig, x = _a.x, y = _a.y, _b = _a.color, color = _b === void 0 ? "red" : _b, _c = config.bodyConfig.color, bodyColor = _c === void 0 ? "green" : _c, size = config.size, _d = config.length, length = _d === void 0 ? 6 : _d, _e = config.direction, direction = _e === void 0 ? Direction.Right : _e, speed = config.speed;
        this.direction = direction;
        this.speed = speed;
        this.size = size;
        this.header = new React({
            x: x,
            y: y,
            width: size,
            height: size,
            color: color,
            ctx: ctx,
        });
        var totalLength = length * size;
        var startX, startY;
        switch (direction) {
            case Direction.Up:
                startX = x;
                startY = y + size;
                for (var i = 1; i <= totalLength; i++) {
                    this.body.push(new React({
                        x: startX,
                        y: startY - i,
                        width: size,
                        height: 1,
                        color: bodyColor,
                        ctx: ctx,
                    }));
                }
                break;
            case Direction.Down:
                startX = x;
                startY = y;
                for (var i = 1; i <= totalLength; i++) {
                    this.body.push(new React({
                        x: startX,
                        y: startY + i,
                        width: size,
                        height: 1,
                        color: bodyColor,
                        ctx: ctx,
                    }));
                }
                break;
            case Direction.Left:
                startX = x + size;
                startY = y;
                for (var i = 1; i <= totalLength; i++) {
                    this.body.push(new React({
                        x: startX + i,
                        y: startY,
                        width: 1,
                        height: size,
                        color: bodyColor,
                        ctx: ctx,
                    }));
                }
                break;
            case Direction.Right:
                startX = x;
                startY = y;
                for (var i = 1; i <= totalLength; i++) {
                    this.body.push(new React({
                        x: startX - i,
                        y: startY,
                        width: 1,
                        height: size,
                        color: bodyColor,
                        ctx: ctx,
                    }));
                }
                break;
        }
        this.draw();
        // this.move_snake();
        this.listen_to_keyboard();
    }
    Snake.prototype.move = function () {
        var _a = this, direction = _a.direction, speed = _a.speed;
        var size = this.size;
        var ctx = this.ctx;
        var startX, startY;
        var i = speed;
        switch (direction) {
            case Direction.Up:
                this.header.y -= speed;
                startX = this.header.x;
                startY = this.header.y + size;
                while (i >= 1) {
                    this.body.unshift(new React({
                        x: startX,
                        y: startY - i + 1,
                        width: size,
                        height: 1,
                        color: "green",
                        ctx: ctx,
                    }));
                    i--;
                }
                break;
            case Direction.Down:
                this.header.y += speed;
                startX = this.header.x;
                startY = this.header.y;
                while (i >= 1) {
                    this.body.unshift(new React({
                        x: startX,
                        y: startY - i,
                        width: size,
                        height: 1,
                        color: "green",
                        ctx: ctx,
                    }));
                    i--;
                }
                break;
            case Direction.Left:
                this.header.x -= speed;
                startX = this.header.x + size - 1;
                startY = this.header.y;
                while (i >= 1) {
                    this.body.unshift(new React({
                        x: startX + i,
                        y: startY,
                        width: 1,
                        height: size,
                        color: "green",
                        ctx: ctx,
                    }));
                    i--;
                }
                break;
            case Direction.Right:
                this.header.x += speed;
                startX = this.header.x;
                startY = this.header.y;
                while (i >= 1) {
                    this.body.unshift(new React({
                        x: startX - i,
                        y: startY,
                        width: 1,
                        height: size,
                        color: "green",
                        ctx: ctx,
                    }));
                    i--;
                }
                break;
        }
        this.body.splice(this.body.length - speed, speed);
    };
    Snake.prototype.draw = function () {
        this.header.draw();
        this.body.forEach(function (rect) { return rect.draw(); });
    };
    Snake.prototype.listen_to_keyboard = function () {
        var _this = this;
        document.addEventListener("keydown", function (event) {
            var key = event.key;
            if (key === "ArrowUp" && _this.direction !== Direction.Down) {
                _this.direction = Direction.Up;
            }
            else if (key === "ArrowDown" && _this.direction !== Direction.Up) {
                _this.direction = Direction.Down;
            }
            else if (key === "ArrowLeft" && _this.direction !== Direction.Right) {
                _this.direction = Direction.Left;
            }
            else if (key === "ArrowRight" && _this.direction !== Direction.Left) {
                _this.direction = Direction.Right;
            }
        });
    };
    return Snake;
}());
// 刷新的食
var Food = /** @class */ (function () {
    function Food() {
    }
    Food.prototype.draw = function () { };
    return Food;
}());
// 串联的主程序
var Game = /** @class */ (function () {
    function Game(canvasElement, config) {
        var _this = this;
        this.config = {
            width: 700,
            height: 700,
            backgroundColor: "#fff",
            speed: 3,
            direction: Direction.Right,
            length: 6,
            size: 24,
            foodNumber: 1,
        };
        this.make_snake_instance = function () {
            var _a = _this.config, width = _a.width, height = _a.height, backgroundColor = _a.backgroundColor, size = _a.size, speed = _a.speed, direction = _a.direction, length = _a.length;
            _this.canvas.width = width;
            _this.canvas.height = height;
            _this.canvas.style.backgroundColor = backgroundColor;
            _this.snake_instance = new Snake({
                speed: speed,
                size: size,
                length: length,
                direction: direction,
                headerConfig: {
                    x: length * size + size,
                    y: height / 2 - size / 2,
                    color: "red",
                },
                bodyConfig: {
                    color: "green",
                },
            }, _this.ctx);
            _this.snake_move();
        };
        // 新增属性：记录上次移动时间戳
        this.lastMoveTime = 0;
        this.snake_move = function () {
            requestAnimationFrame(function () {
                _this.snake_instance.move();
                _this.clear_canvas();
                _this.snake_instance.draw();
                _this.snake_move(); // 保持循环
            });
        };
        this.make_food_instance = function () {
            _this.food_instance = new Food();
        };
        this.clear_canvas = function () {
            var _a = _this.config, width = _a.width, height = _a.height;
            _this.ctx.clearRect(0, 0, width, height);
        };
        this.start = function () {
            _this.make_snake_instance();
            _this.make_food_instance();
        };
        Object.assign(this.config, config);
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext("2d");
    }
    return Game;
}());
