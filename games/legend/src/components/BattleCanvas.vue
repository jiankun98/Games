<script setup>
// 挂机战斗场景（Canvas 占位渲染：色块地形 + emoji 角色/怪物 + 血条 + 飘字 + 技能横幅）
//  M5 接入 sprite manifest 后替换绘制函数，事件/实体接口保持不变
import { ref, onMounted, onBeforeUnmount } from "vue";
import { useGame } from "../store.js";

const { state, onFx } = useGame();
const cv = ref(null);
let ctx = null;
let raf = 0;
let W = 0, H = 0;
const DPR = () => Math.min(2, window.devicePixelRatio || 1);

// 特效状态
const floaties = [];          // {x,y,vy,text,color,size,age,life}
let skillBanner = null;       // {text, age}
let lunge = 0;                // 玩家攻击前冲
const monFlash = {};          // uid -> 受击闪白计时
let killFx = [];              // {x,y,age,text}

const CLS_FIG = { warrior: "⚔️", mage: "🧙", taoist: "☯️" };
// 大陆地面色（占位）
const GROUNDS = ["#3d4a2c", "#4a3f2c", "#44372e", "#5a2c2c", "#3c2f42", "#2c3a42", "#45452c", "#2c4250", "#54261e", "#3a3550", "#2e4250", "#502c3a"];

function addFloaty(x, y, text, color, size = 15) {
  floaties.push({ x, y, vy: -42, text, color, size, age: 0, life: 1.1 });
  if (floaties.length > 40) floaties.shift();
}

function monPos(i, n) {
  const cx = W * (0.58 + (i % 2) * 0.18);
  const cy = H * (0.42 + Math.floor(i / 2) * 0.3) + (i % 2 ? 18 : 0);
  return { x: cx, y: cy };
}
function playerPos() {
  return { x: W * 0.24, y: H * 0.48 };
}

function onEvents(evs) {
  const snap = state.snap;
  if (!snap || !snap.battle) return;
  const mons = snap.battle.mons;
  for (const e of evs) {
    if (e.t === "hit") {
      const idx = mons.findIndex((m) => m.uid === e.target);
      const p = idx >= 0 ? monPos(idx, mons.length) : { x: W * 0.6, y: H * 0.45 };
      const cutMark = e.cut > 0 ? " ⚡" : "";
      addFloaty(p.x + (Math.random() - 0.5) * 40, p.y - 30, `-${e.dmg}${cutMark}`, e.crit ? "#ff6b4a" : "#ffd97a", e.crit ? 19 : 14);
      monFlash[e.target] = 0.18;
      lunge = 0.16;
    } else if (e.t === "miss") {
      const idx = mons.findIndex((m) => m.uid === e.target);
      const p = idx >= 0 ? monPos(idx, mons.length) : { x: W * 0.6, y: H * 0.45 };
      addFloaty(p.x, p.y - 26, "闪避", "#9a9a9a", 12);
    } else if (e.t === "php") {
      const p = playerPos();
      addFloaty(p.x + (Math.random() - 0.5) * 30, p.y - 40, `-${e.dmg}`, "#ff5252", 15);
    } else if (e.t === "pheal") {
      const p = playerPos();
      addFloaty(p.x, p.y - 46, `+${e.heal}`, "#6fbf5f", 15);
    } else if (e.t === "skill") {
      skillBanner = { text: e.name, age: 0 };
    } else if (e.t === "kill") {
      const idx = mons.findIndex((m) => m.uid === e.target);
      killFx.push({ x: W * 0.62, y: H * 0.4, age: 0, text: `☠ ${e.mon}` });
      if (e.rewards) {
        addFloaty(W * 0.62, H * 0.35, `+${e.rewards.exp} exp  +${e.rewards.gold} 金`, "#ffd97a", 13);
      }
    } else if (e.t === "pdead") {
      addFloaty(playerPos().x, playerPos().y - 50, "阵亡…", "#ff5252", 18);
    } else if (e.t === "previve") {
      addFloaty(playerPos().x, playerPos().y - 50, "复活!", "#6fbf5f", 16);
    } else if (e.t === "shit") {
      addFloaty(W * 0.45, H * 0.55, `💀${e.dmg}`, "#cfc", 12);
    }
  }
}

function drawBar(x, y, w, h, pct, fg, bg = "rgba(0,0,0,0.55)", text = null) {
  ctx.fillStyle = bg;
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = fg;
  ctx.fillRect(x, y, Math.max(0, Math.min(1, pct)) * w, h);
  if (text) {
    ctx.fillStyle = "#fff";
    ctx.font = `${Math.max(9, h)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(text, x + w / 2, y - 2);
  }
}

function draw(dt) {
  const snap = state.snap;
  ctx.clearRect(0, 0, W, H);
  if (!snap || !snap.battle) return;
  const cont = snap.continent || 1;

  // 地面
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#1c1814");
  g.addColorStop(1, GROUNDS[(cont - 1) % GROUNDS.length]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // 地表装饰（确定性散布）
  ctx.globalAlpha = 0.5;
  const props = ["🌲", "🌾", "🪨"];
  for (let i = 0; i < 8; i++) {
    const hx = ((i * 137) % 100) / 100;
    const hy = ((i * 73) % 100) / 100;
    ctx.font = `${16 + (i % 3) * 6}px serif`;
    ctx.textAlign = "center";
    ctx.fillText(props[i % 3], W * (0.05 + hx * 0.9), H * (0.15 + hy * 0.75));
  }
  ctx.globalAlpha = 1;
  // 地平线光
  const glow = ctx.createRadialGradient(W * 0.5, H * 0.35, 10, W * 0.5, H * 0.35, W * 0.55);
  glow.addColorStop(0, "rgba(255,220,150,0.10)");
  glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  const P = playerPos();
  // 召唤物
  if (snap.battle.player.summon) {
    const s = snap.battle.player.summon;
    ctx.font = "26px serif";
    ctx.textAlign = "center";
    ctx.fillText("💀", P.x + 52, P.y + 6);
    drawBar(P.x + 32, P.y - 24, 44, 5, s.hp / s.hpMax, "#8fd07f");
  }
  // 玩家
  lunge = Math.max(0, lunge - dt);
  const px = P.x + lunge * 90;
  ctx.font = `${Math.round(Math.min(64, H * 0.16))}px serif`;
  ctx.textAlign = "center";
  ctx.globalAlpha = snap.battle.player.dead ? 0.35 : 1;
  ctx.fillText(CLS_FIG[snap.class] || "⚔️", px, P.y);
  ctx.globalAlpha = 1;
  drawBar(px - 46, P.y - 76, 92, 8, snap.battle.player.hp / snap.battle.player.hpMax, "#d9534f", "rgba(0,0,0,0.55)", `${Math.ceil(snap.battle.player.hp)}`);
  drawBar(px - 46, P.y - 64, 92, 5, snap.battle.player.mp / snap.battle.player.mpMax, "#4f8ad9");
  ctx.fillStyle = "#ffd97a";
  ctx.font = "12px sans-serif";
  ctx.fillText(`${snap.name} Lv.${snap.level}${snap.rebirth ? " 转" + snap.rebirth : ""}`, px, P.y - 80);

  // 怪物
  const mons = snap.battle.mons;
  mons.forEach((m, i) => {
    const p = monPos(i, mons.length);
    const flash = monFlash[m.uid] > 0;
    if (flash) monFlash[m.uid] -= dt;
    const size = m.boss ? Math.min(84, H * 0.22) : Math.min(56, H * 0.15);
    ctx.font = `${size}px serif`;
    ctx.textAlign = "center";
    ctx.save();
    if (flash) { ctx.shadowColor = "#fff"; ctx.shadowBlur = 16; }
    ctx.fillText(m.icon, p.x, p.y);
    ctx.restore();
    const bw = m.boss ? 120 : 76;
    drawBar(p.x - bw / 2, p.y - size - 10, bw, m.boss ? 9 : 6, m.hp / m.maxHp, m.boss ? "#e2532c" : "#c0392b", "rgba(0,0,0,0.55)", m.boss ? `${m.name} Lv.${m.lvl}` : null);
    ctx.fillStyle = "#e8ddc8";
    ctx.font = "11px sans-serif";
    if (!m.boss) ctx.fillText(`${m.name} Lv.${m.lvl}`, p.x, p.y - size - 14);
  });

  // 飘字
  for (let i = floaties.length - 1; i >= 0; i--) {
    const f = floaties[i];
    f.age += dt;
    if (f.age > f.life) { floaties.splice(i, 1); continue; }
    f.y += f.vy * dt;
    const alpha = 1 - f.age / f.life;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = f.color;
    ctx.font = `bold ${f.size}px sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillText(f.text, f.x, f.y);
    ctx.globalAlpha = 1;
  }
  // 击杀爆点
  for (let i = killFx.length - 1; i >= 0; i--) {
    const k = killFx[i];
    k.age += dt;
    if (k.age > 0.8) { killFx.splice(i, 1); continue; }
    ctx.globalAlpha = 1 - k.age / 0.8;
    ctx.strokeStyle = "#ffd97a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(k.x, k.y, 10 + k.age * 60, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 技能横幅
  if (skillBanner) {
    skillBanner.age += dt;
    if (skillBanner.age > 0.9) skillBanner = null;
    else {
      const a = 1 - skillBanner.age / 0.9;
      ctx.globalAlpha = a;
      ctx.fillStyle = "rgba(20,16,12,0.55)";
      ctx.fillRect(0, H * 0.2, W, 34);
      ctx.fillStyle = "#ffd97a";
      ctx.font = "bold 20px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("『 " + skillBanner.text + " 』", W / 2, H * 0.2 + 24);
      ctx.globalAlpha = 1;
    }
  }
  // 死亡遮罩
  if (snap.battle.player.dead) {
    ctx.fillStyle = "rgba(80,0,0,0.35)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#ffbbbb";
    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(`复活倒计时 ${snap.battle.player.reviveIn}s`, W / 2, H / 2);
  }
  // 地图名水印
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = "#e8ddc8";
  ctx.font = "12px sans-serif";
  ctx.textAlign = "left";
  ctx.fillText(`${snap.continentName} · ${snap.mapName}`, 12, H - 12);
  ctx.globalAlpha = 1;
}

let last = 0;
function loop(ts) {
  const dt = Math.min(0.05, (ts - last) / 1000 || 0.016);
  last = ts;
  draw(dt);
  raf = requestAnimationFrame(loop);
}

function resize() {
  const el = cv.value;
  if (!el) return;
  const r = el.parentElement.getBoundingClientRect();
  const d = DPR();
  W = Math.max(1, Math.round(r.width));
  H = Math.max(1, Math.round(r.height));
  el.width = W * d;
  el.height = H * d;
  el.style.width = W + "px";
  el.style.height = H + "px";
  ctx.setTransform(d, 0, 0, d, 0, 0);
}

let offFx = null;
onMounted(() => {
  ctx = cv.value.getContext("2d");
  resize();
  window.addEventListener("resize", resize);
  offFx = onFx(onEvents);
  raf = requestAnimationFrame(loop);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", resize);
  if (offFx) offFx();
});
</script>

<template>
  <div class="scene">
    <canvas ref="cv"></canvas>
  </div>
</template>

<style scoped>
.scene { position: absolute; inset: 0; overflow: hidden; }
canvas { display: block; }
</style>
