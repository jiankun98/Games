// 一次性修复：渲染驱动分离——renderLoop 只做工作，不再自排队；rAF 自循环与 Worker 兜底互不污染
import { readFileSync, writeFileSync } from "node:fs";
const p = "games/YuGiOh/ui3d/scene.mjs";
let s = readFileSync(p, "utf8");
let ok = true;
function rep(from, to, name) {
  if (!s.includes(from)) { ok = false; console.error("MISS:", name); return; }
  s = s.replace(from, to);
}

// 1) renderLoop 不再自己排 rAF（自排队 + Worker 高频直调 = 回调队列线性累积 → 越来越卡直至冻死）
rep(
  `      function renderLoop() {
        __lastFrame = performance.now();
        requestAnimationFrame(renderLoop);
        // 空闲早退：无动画、无交互且卡牌全部落位时跳过场景更新与渲染（最后一帧保留在画布上）`,
  `      function renderLoop() {
        __lastFrame = performance.now();
        // 空闲早退：无动画、无交互且卡牌全部落位时跳过场景更新与渲染（最后一帧保留在画布上）`,
  "renderLoop 去自排队",
);

// 2) 驱动分离：rAF 自循环（一帧至多一个待回调，永不累积）+ Worker 停摆兜底直调
rep(
  `      renderLoop();
      // rAF 在页签隐藏/被遮挡时会停摆（内嵌 webview 常见）：改用 Web Worker 定时器兜底驱动。
      // Worker 的定时器不受页面可见性节流；可见时 rAF 满帧、本兜底因 __lastFrame 新鲜而空转。`,
  `      /* 渲染驱动（两路互不污染，杜绝回调累积）：
         ① rAF 自循环 frame()：可见时 60fps；renderLoop 内绝不排队 rAF，一帧至多一个待回调，永不累积；
            页签隐藏时 rAF 停摆，此路自然静止（零开销）。
         ② Worker 兜底：rAF 停摆时由 Worker 定时器（不受可见性节流）直接调用 renderLoop 推进动画，
            频率即 Worker 节拍（~25ms），同样不触碰 rAF 队列。 */
      function frame() {
        renderLoop();
        requestAnimationFrame(frame);
      }
      frame();
      // rAF 在页签隐藏/被遮挡时会停摆（内嵌 webview 常见）：改用 Web Worker 定时器兜底驱动。
      // Worker 的定时器不受页面可见性节流；可见时 rAF 满帧、本兜底因 __lastFrame 新鲜而空转。`,
  "驱动分离",
);

if (!ok) process.exit(1);
writeFileSync(p, s);
console.log("scene.mjs 渲染驱动修复完成");
