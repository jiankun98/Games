/*
 * 游戏王 3D UI · 音效（WebAudio 振荡器合成，无音频资源文件）
 */
let sfxOn = true;
let ac = null;

      /* ===================== 音效 ===================== */
      function acCtx() {
        if (!sfxOn) return null;
        if (!ac) {
          try {
            ac = new (window.AudioContext || window.webkitAudioContext)();
          } catch (e) {
            return null;
          }
        }
        if (ac.state === "suspended") ac.resume().catch(() => {});
        return ac;
      }
      function tone(freq, dur, type, vol, slideTo, delay) {
        const ctx = acCtx();
        if (!ctx) return;
        const t0 = ctx.currentTime + (delay || 0);
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type || "sine";
        o.frequency.setValueAtTime(freq, t0);
        if (slideTo)
          o.frequency.exponentialRampToValueAtTime(
            Math.max(20, slideTo),
            t0 + dur,
          );
        g.gain.setValueAtTime(vol || 0.12, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        o.connect(g);
        g.connect(ctx.destination);
        o.start(t0);
        o.stop(t0 + dur + 0.03);
      }
      function sfx(kind) {
        if (!sfxOn) return;
        switch (kind) {
          case "turn":
            tone(392, 0.12, "triangle", 0.1);
            tone(523, 0.18, "triangle", 0.1, null, 0.09);
            break;
          case "draw":
            tone(660, 0.08, "sine", 0.06, 920);
            break;
          case "summon":
            tone(220, 0.1, "sawtooth", 0.06, 520);
            tone(520, 0.14, "triangle", 0.1, 780, 0.08);
            break;
          case "activate":
            tone(520, 0.1, "square", 0.05, 700);
            tone(700, 0.16, "triangle", 0.08, 1040, 0.08);
            break;
          case "attack":
            tone(900, 0.12, "sawtooth", 0.07, 200);
            break;
          case "damage":
            tone(160, 0.22, "square", 0.14, 55);
            tone(95, 0.28, "sawtooth", 0.12, 40, 0.04);
            break;
          case "destroy":
            tone(320, 0.26, "sawtooth", 0.12, 60);
            tone(190, 0.18, "square", 0.08, 50, 0.02);
            break;
          case "flip":
            tone(500, 0.09, "sine", 0.07, 720);
            break;
          case "win":
            [523, 659, 784, 1047].forEach((f, i) =>
              tone(f, 0.2, "triangle", 0.1, null, i * 0.12),
            );
            break;
          case "lose":
            [392, 330, 262, 196].forEach((f, i) =>
              tone(f, 0.24, "sawtooth", 0.08, null, i * 0.14),
            );
            break;
          case "chain":
            tone(600, 0.07, "square", 0.05, 900);
            break;
        }
      }

export function toggleSfx() {
  sfxOn = !sfxOn;
  return sfxOn;
}
export { sfx };
