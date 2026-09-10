/*
 * 游戏王 3D UI · Three.js 场景层
 *  场景/灯光/桌面/贴花、卡牌纹理与立绘缓存、3D 卡牌对象与布局、状态同步、动画、拾取与渲染循环。
 *  依赖注入：duel 与模式状态读 store.S；点击路由由 main 经 setClickHandler 注入（避免 hud <-> scene 循环依赖）。
 */
import * as THREE from "three";
import { animate, cubicBezier } from "animejs";
import { S, hiddenForMe } from "./store.mjs";
import { IC, ATTR_TXT } from "./labels.mjs";
import { fxEl } from "./domfx.mjs";
import { sfx } from "./sfx.mjs";
import { handPlacementZones } from "./actions.mjs";
const $ = (id) => document.getElementById(id);

      /* ===================== Three.js 场景 ===================== */
      const stage = $("stage");
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0b0e16);
      scene.fog = new THREE.Fog(0x0b0e16, 14, 30);

      /* 相机：抬高机位+加大 fov，降低对方远端场地的透视压缩（卡牌与区域更可读） */
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
      camera.position.set(0, 5.6, 9.6);
      camera.lookAt(0, -0.3, -0.8);

      /* 渲染器：ACES 色调映射给高光/暗部带来电影感层次 */
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      stage.appendChild(renderer.domElement);
      /* 软件 WebGL（SwiftShader/llvmpipe）逐帧成本极高：检测到即降质（关阴影/像素比 1），
         配合"按需渲染"把空闲 CPU 占用降到接近零 */
      try {
        const glc = renderer.getContext();
        const dbgExt = glc.getExtension("WEBGL_debug_renderer_info");
        const rstr = dbgExt ? String(glc.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL)) : "";
        if (/swiftshader|llvmpipe|software|basic render/i.test(rstr)) {
          renderer.shadowMap.enabled = false;
          renderer.setPixelRatio(1);
          window.__ygoSoftGL = true;
          console.info("[ygo3d] 软件渲染 detected：已关闭阴影并降低像素比");
        }
      } catch (e) {}

      /* 布光：暖色主光（唯一投影源）+ 冷蓝逆光勾轮廓 + 金色场地氛围光 + 半球底光 */
      scene.add(new THREE.HemisphereLight(0x93a4cf, 0x161c2c, 0.85));
      const keyLight = new THREE.DirectionalLight(0xfff1da, 1.6);
      keyLight.position.set(5, 9, 4);
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(2048, 2048);
      Object.assign(keyLight.shadow.camera, {
        left: -8,
        right: 8,
        top: 7,
        bottom: -7,
        near: 2,
        far: 30,
      });
      keyLight.shadow.camera.updateProjectionMatrix();
      keyLight.shadow.bias = -0.0004;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight(0x5d7cff, 0.5);
      rimLight.position.set(-6, 4.5, -7);
      scene.add(rimLight);
      const arenaGlow = new THREE.PointLight(0xe6b24a, 14, 11, 2);
      arenaGlow.position.set(0, 2.6, 0);
      scene.add(arenaGlow);

      /* ===================== 预设机位 + 响应式相机 =====================
         四个预设视角平滑切换（右下角按钮）；水平拖拽=平移偏移；滚轮=缩放；双击空白=复位。
         fov 按 aspect 自适应：竖屏/窄窗自动拉远，保证含堆位在内整桌可见（不再出画）。 */
      const VIEWS = {
        standard: { pos: [0, 5.6, 9.6], target: [0, -0.3, -0.8] }, // 默认俯视全场
        low: { pos: [0, 2.4, 11.2], target: [0, 0.9, -1.6] }, // 低角对峙
        me: { pos: [0, 7.6, 5.2], target: [0, 0, 2.6] }, // 俯瞰我方半场
        ai: { pos: [0, 7.6, -5.2], target: [0, 0, -2.6] }, // 俯瞰对方半场
      };
      let curView = "standard";
      let camOffsetX = 0; // 水平拖拽平移量
      let camZoom = 1; // 滚轮缩放系数（绕 target 沿视线方向拉远/拉近）
      const camLook = new THREE.Vector3(0, -0.3, -0.8); // 当前注视点（拖拽/过渡共用，统一 lookAt 消除不一致）
      const camGoal = { px: 0, py: 5.6, pz: 9.6, tx: 0, ty: -0.3, tz: -0.8 };
      function computeGoal() {
        const v = VIEWS[curView];
        camGoal.px = v.target[0] + (v.pos[0] - v.target[0]) * camZoom + camOffsetX;
        camGoal.py = v.target[1] + (v.pos[1] - v.target[1]) * camZoom;
        camGoal.pz = v.target[2] + (v.pos[2] - v.target[2]) * camZoom;
        camGoal.tx = v.target[0] + camOffsetX;
        camGoal.ty = v.target[1];
        camGoal.tz = v.target[2];
      }
      function fitFov() {
        // 水平视野需覆盖 ±viewHalfX（含堆位列）：由机位到 target 距离反推所需垂直 fov
        const dist = Math.hypot(
          camGoal.px - camGoal.tx,
          camGoal.py - camGoal.ty,
          camGoal.pz - camGoal.tz,
        );
        const hHalf = Math.atan2(LAYOUT.viewHalfX + Math.abs(camOffsetX), dist);
        const vFov = 2 * Math.atan(Math.tan(hHalf) / camera.aspect) * (180 / Math.PI);
        camera.fov = THREE.MathUtils.clamp(vFov, 46, 80);
        camera.updateProjectionMatrix();
      }
      function applyGoal() {
        camera.position.set(camGoal.px, camGoal.py, camGoal.pz);
        camLook.set(camGoal.tx, camGoal.ty, camGoal.tz);
        camera.lookAt(camLook);
        fitFov();
      }
      let camTween = null;
      function transitionCamera() {
        computeGoal();
        if (camTween) {
          try { camTween.cancel(); } catch (e) {}
        }
        const from = {
          px: camera.position.x, py: camera.position.y, pz: camera.position.z,
          tx: camLook.x, ty: camLook.y, tz: camLook.z,
        };
        const st = { k: 0 };
        camTween = animate(st, {
          k: 1,
          duration: 620,
          ease: "inOutQuad",
          onUpdate: () => {
            const k = st.k;
            camera.position.set(
              from.px + (camGoal.px - from.px) * k,
              from.py + (camGoal.py - from.py) * k,
              from.pz + (camGoal.pz - from.pz) * k,
            );
            camLook.set(
              from.tx + (camGoal.tx - from.tx) * k,
              from.ty + (camGoal.ty - from.ty) * k,
              from.tz + (camGoal.tz - from.tz) * k,
            );
            camera.lookAt(camLook);
            fitFov();
            hot(700);
          },
          onComplete: () => sync3D(), // 机位落定后重算场上卡牌后仰角（fieldPitch 绑定实时机位）
        });
      }
      function setView(name) {
        if (!VIEWS[name] || name === curView) return;
        curView = name;
        refreshViewSwitch();
        transitionCamera();
      }
      function resetCamera() {
        camOffsetX = 0;
        camZoom = 1;
        transitionCamera();
      }

      /* ===================== 背景：夜幕穹顶 + 星尘（脱离雾影响） ===================== */
      let stars; // 渲染循环中缓慢漂移
      {
        const cv = document.createElement("canvas");
        cv.width = 64;
        cv.height = 512;
        const ctx = cv.getContext("2d");
        const g = ctx.createLinearGradient(0, 0, 0, 512);
        g.addColorStop(0, "#28305c");
        g.addColorStop(0.4, "#181f3a");
        g.addColorStop(0.68, "#0f1322");
        g.addColorStop(1, "#090b12");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 64, 512);
        const domeTex = new THREE.CanvasTexture(cv);
        domeTex.colorSpace = THREE.SRGBColorSpace;
        const dome = new THREE.Mesh(
          new THREE.SphereGeometry(46, 32, 20),
          new THREE.MeshBasicMaterial({
            map: domeTex,
            side: THREE.BackSide,
            fog: false,
          }),
        );
        scene.add(dome);
        // 星尘：上半球壳层随机撒点，柔和圆点贴图，整体缓慢漂移
        const dotCv = document.createElement("canvas");
        dotCv.width = dotCv.height = 64;
        const dctx = dotCv.getContext("2d");
        const dg = dctx.createRadialGradient(32, 32, 0, 32, 32, 30);
        dg.addColorStop(0, "rgba(255,250,235,1)");
        dg.addColorStop(0.4, "rgba(230,230,255,0.5)");
        dg.addColorStop(1, "rgba(200,210,255,0)");
        dctx.fillStyle = dg;
        dctx.fillRect(0, 0, 64, 64);
        const starTex = new THREE.CanvasTexture(dotCv);
        starTex.colorSpace = THREE.SRGBColorSpace;
        const N = 420;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const r = 33 + Math.random() * 9;
          const th = Math.random() * Math.PI * 2;
          const el =
            Math.pow(Math.random(), 1.4) * Math.PI * 0.47 + Math.PI * 0.03;
          pos[i * 3] = r * Math.cos(el) * Math.cos(th);
          pos[i * 3 + 1] = r * Math.sin(el) - 1.5;
          pos[i * 3 + 2] = r * Math.cos(el) * Math.sin(th);
        }
        const sg = new THREE.BufferGeometry();
        sg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        stars = new THREE.Points(
          sg,
          new THREE.PointsMaterial({
            map: starTex,
            size: 0.55,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            fog: false,
          }),
        );
        scene.add(stars);
      }

      /* ===================== 桌面：程序纹理 + 接收阴影，金边框带 ===================== */
      {
        const cv = document.createElement("canvas");
        cv.width = 1024;
        cv.height = 768;
        const ctx = cv.getContext("2d");
        ctx.fillStyle = "#10151f";
        ctx.fillRect(0, 0, 1024, 768);
        for (let i = 0; i < 2400; i++) {
          ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.022})`;
          ctx.fillRect(Math.random() * 1024, Math.random() * 768, 1, 1);
        }
        const warm = ctx.createRadialGradient(
          512,
          384,
          60,
          512,
          384,
          520,
        );
        warm.addColorStop(0, "rgba(230,178,74,0.07)");
        warm.addColorStop(1, "rgba(230,178,74,0)");
        ctx.fillStyle = warm;
        ctx.fillRect(0, 0, 1024, 768);
        const vig = ctx.createRadialGradient(
          512,
          384,
          300,
          512,
          384,
          700,
        );
        vig.addColorStop(0, "rgba(0,0,0,0)");
        vig.addColorStop(1, "rgba(0,0,0,0.42)");
        ctx.fillStyle = vig;
        ctx.fillRect(0, 0, 1024, 768);
        const tableTex = new THREE.CanvasTexture(cv);
        tableTex.colorSpace = THREE.SRGBColorSpace;
        tableTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const tableMat = new THREE.MeshStandardMaterial({
          map: tableTex,
          roughness: 0.92,
          metalness: 0.06,
        });
        const table = new THREE.Mesh(
          new THREE.PlaneGeometry(19, 14),
          tableMat,
        );
        table.rotation.x = -Math.PI / 2;
        table.receiveShadow = true;
        scene.add(table);
        // 桌沿金色描边（四条细带围合）
        const edgeMat = new THREE.MeshBasicMaterial({
          color: 0xe6b24a,
          transparent: true,
          opacity: 0.32,
        });
        const mk = (w, d, x, z) => {
          const m = new THREE.Mesh(
            new THREE.BoxGeometry(w, 0.04, d),
            edgeMat,
          );
          m.position.set(x, 0.02, z);
          return m;
        };
        scene.add(mk(19.06, 0.09, 0, 6.99));
        scene.add(mk(19.06, 0.09, 0, -6.99));
        scene.add(mk(0.09, 14.05, 9.49, 0));
        scene.add(mk(0.09, 14.05, -9.49, 0));
      }

      /* ===================== 场地布局常量（单一来源） =====================
         slotPos/handPos/pilePos 与桌面贴花绘制共用同一份坐标，改这里即可整体重排。
         约定：+z 为玩家（me）半场，AI 半场对称取负。 */
      const LAYOUT = {
        slotGap: 1.9, // 怪兽/魔陷槽横向间距
        monsterZ: 2.15, // 怪兽区行深
        stZ: 3.4, // 魔陷区行深
        fieldX: -5.6, // 场地魔法槽横坐标
        handZ: 4.6, // 手牌行深
        halfX: 5.6, // 半场框横向半宽
        halfZ0: 1.35, // 半场框靠中线一边
        halfZ1: 4.15, // 半场框靠玩家一边
        // 堆位（玩家半场坐标，AI 对称取负）：右列=卡组/墓地，左列=额外/除外，
        // 间距 1.4 > 牌盒深 0.86，杜绝相邻堆穿插与数量标签压盖
        piles: {
          deck: { x: 6.3, z: 4.35 },
          grave: { x: 6.3, z: 2.95 },
          extra: { x: -6.9, z: 4.35 },
          banished: { x: -6.9, z: 2.95 },
        },
        pileRingR: 0.52, // 堆位环半径（贴花）
        viewHalfX: 7.6, // 相机水平视野需覆盖的半宽（响应式适配用，含堆位列）
      };
      /* ===================== 决斗盘贴花：一格一线按实际槽位坐标绘制 =====================
         单张覆盖全桌的透明贴花画布（100px = 1 世界单位），一次绘出：
         双方半场描边渐变、怪兽/魔陷/场地槽位金框、中央分隔光带、八个堆位环。 */
      {
        const PX = 100; // px / world unit
        const W = 1900,
          H = 1400;
        const px = (x) => ((x + 9.5) * PX) | 0;
        const pz = (z) => ((z + 7) * PX) | 0;
        const cv = document.createElement("canvas");
        cv.width = W;
        cv.height = H;
        const ctx = cv.getContext("2d");
        const strokeGlow = (color, blur) => {
          ctx.strokeStyle = color;
          ctx.shadowColor = color;
          ctx.shadowBlur = blur;
        };
        // 半场区域：描边发光框 + 从边缘向中心的渐隐填充（蓝=玩家，红=AI）
        for (const [who, col] of [
          ["me", "74,150,255"],
          ["ai", "230,84,84"],
        ]) {
          const s = who === "me" ? 1 : -1;
          const x0 = px(-LAYOUT.halfX),
            x1 = px(LAYOUT.halfX);
          const zA = pz(s * LAYOUT.halfZ0),
            zB = pz(s * LAYOUT.halfZ1);
          const rx = Math.min(x0, x1),
            rw = Math.abs(x1 - x0);
          const rz = Math.min(zA, zB),
            rh = Math.abs(zB - zA);
          ctx.fillStyle = `rgba(${col},0.075)`;
          roundRect(ctx, rx, rz, rw, rh, 26);
          ctx.fill();
          const lg = ctx.createLinearGradient(
            0,
            s === 1 ? zB : rz,
            0,
            s === 1 ? rz : zB,
          );
          lg.addColorStop(0, `rgba(${col},0.14)`);
          lg.addColorStop(1, `rgba(${col},0)`);
          ctx.fillStyle = lg;
          roundRect(ctx, rx, rz, rw, rh, 26);
          ctx.fill();
          strokeGlow(`rgba(${col},0.62)`, 16);
          ctx.lineWidth = 3.5;
          roundRect(ctx, rx, rz, rw, rh, 26);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
        // 中央分隔光带（替代原 lane 平面）
        strokeGlow("rgba(230,178,74,0.75)", 22);
        ctx.lineWidth = 6;
        roundRect(ctx, px(-6.3), pz(0) - 4, px(6.3) - px(-6.3), 8, 4);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // 外圈装饰：决斗盘整体的金细线边框 + 四角饰纹（仪式感框体）
        {
          const ox = px(-6.75),
            ow = px(6.75) - ox;
          const oz = pz(-5.1),
            oh = pz(5.1) - oz;
          strokeGlow("rgba(230,178,74,0.4)", 10);
          ctx.lineWidth = 2.4;
          roundRect(ctx, ox, oz, ow, oh, 18);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = "rgba(233,190,105,0.75)";
          ctx.lineWidth = 5;
          const tick = 46; // 角部折线长度（px）
          for (const [cx, cy, sx, sy] of [
            [ox, oz, 1, 1],
            [ox + ow, oz, -1, 1],
            [ox, oz + oh, 1, -1],
            [ox + ow, oz + oh, -1, -1],
          ]) {
            ctx.beginPath();
            ctx.moveTo(cx + sx * tick, cy);
            ctx.lineTo(cx, cy);
            ctx.lineTo(cx, cy + sy * tick);
            ctx.stroke();
          }
        }
        // 槽位金框：怪兽行较亮，魔陷/场地稍收敛；方形槽（≈槽距），竖放/横放守备卡都居中容纳
        const fw = LAYOUT.slotGap * PX * 0.94,
          fh = LAYOUT.slotGap * PX * 0.94;
        const slotFrame = (x, z, bright) => {
          strokeGlow(bright ? "rgba(233,190,105,0.66)" : "rgba(233,190,105,0.45)", 10);
          ctx.lineWidth = 2.8;
          roundRect(ctx, px(x) - fw / 2, pz(z) - fh / 2, fw, fh, 10);
          ctx.stroke();
        };
        ctx.shadowBlur = 0;
        for (const s of [1, -1]) {
          for (let i = 0; i < 5; i++) {
            slotFrame((i - 2) * LAYOUT.slotGap, s * LAYOUT.monsterZ, true);
            slotFrame((i - 2) * LAYOUT.slotGap, s * LAYOUT.stZ, false);
          }
          slotFrame(LAYOUT.fieldX, s * LAYOUT.stZ, false);
          // 堆位环：卡组/墓地/额外/除外占位标记（坐标与 pilePos 同源，双方各半场）
          for (const q of Object.values(LAYOUT.piles)) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(200,170,110,0.2)";
            ctx.lineWidth = 2;
            ctx.arc(px(s * q.x), pz(s * q.z), LAYOUT.pileRingR * PX, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        // 区域行带弱底色：怪兽带暖金 / 魔陷带淡紫（低饱和，不与卡面抢视觉）
        for (const s of [1, -1]) {
          ctx.fillStyle = "rgba(255,205,110,0.05)";
          roundRect(ctx, px(-4.5), pz(s * LAYOUT.monsterZ) - fh / 2, px(4.5) - px(-4.5), fh, 14);
          ctx.fill();
          ctx.fillStyle = "rgba(190,160,255,0.045)";
          roundRect(ctx, px(-4.5), pz(s * LAYOUT.stZ) - fh / 2, px(4.5) - px(-4.5), fh, 14);
          ctx.fill();
        }
        // 区域文字角标（竖排小字，新手可分辨分区用途；置于行侧空白，不与卡牌重叠）
        const zoneLabel = (txt, x, z, col) => {
          ctx.fillStyle = col;
          ctx.font =
            "bold 26px 'PingFang SC','Microsoft YaHei',sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const chars = [...txt];
          const y0 = pz(z) - ((chars.length - 1) * 32) / 2;
          chars.forEach((ch, i) => ctx.fillText(ch, px(x), y0 + i * 32));
        };
        for (const s of [1, -1]) {
          zoneLabel("怪兽区", -5.02, s * LAYOUT.monsterZ, "rgba(240,225,195,0.52)");
          zoneLabel("魔陷区", 5.02, s * LAYOUT.stZ, "rgba(240,225,195,0.45)");
          zoneLabel("场地", -6.72, s * LAYOUT.stZ, "rgba(240,225,195,0.4)");
          // 手牌托板：半透明圆角带区分手牌区与场地（右端收到半场框同宽，给堆位列让位）
          const padZ = s * (LAYOUT.handZ + 0.25);
          const padCol = s === 1 ? "74,150,255" : "230,84,84";
          ctx.fillStyle = `rgba(${padCol},0.055)`;
          roundRect(ctx, px(-LAYOUT.halfX), pz(padZ) - 62, px(LAYOUT.halfX) - px(-LAYOUT.halfX), 124, 30);
          ctx.fill();
          ctx.strokeStyle = `rgba(${padCol},0.22)`;
          ctx.lineWidth = 2;
          roundRect(ctx, px(-LAYOUT.halfX), pz(padZ) - 62, px(LAYOUT.halfX) - px(-LAYOUT.halfX), 124, 30);
          ctx.stroke();
        }
        const decalTex = new THREE.CanvasTexture(cv);
        decalTex.colorSpace = THREE.SRGBColorSpace;
        decalTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        const decal = new THREE.Mesh(
          new THREE.PlaneGeometry(19, 14),
          new THREE.MeshBasicMaterial({
            map: decalTex,
            transparent: true,
            depthWrite: false,
          }),
        );
        decal.rotation.x = -Math.PI / 2;
        decal.position.y = 0.02;
        scene.add(decal);
      }
      /* ===================== 卡牌纹理 ===================== */
      const TEX_W = 512,
        TEX_H = 720; // 卡牌纹理分辨率（约 1:1.41）
      const texCache = new Map(); // key -> CanvasTexture
      function texKey(card, faceUp, landscape) {
        return (
          (faceUp ? "u:" : "d:") +
          (card ? card.uid : "back") +
          (landscape ? ":L" : "")
        );
      }
      function roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
      }
      // 卡面 UI 叠加层（程序卡面与立绘卡面共用，按画布尺寸等比缩放，官方布局风格：
      // 顶部名牌+属性徽章 → 星级/魔陷行 → 立绘 → 底部攻守框）
      function drawCardOverlay(ctx, card, w, h) {
        const isMon = card.type === "monster";
        const u = w / 512; // 以 512 宽为基准等比缩放
        const barcode = (x, y, bw, bh, r, fill, stroke) => {
          ctx.fillStyle = fill || "rgba(10,12,18,0.82)";
          roundRect(ctx, x, y, bw, bh, r);
          ctx.fill();
          if (stroke) {
            ctx.strokeStyle = stroke;
            ctx.lineWidth = Math.max(1, u * 1.6);
            roundRect(ctx, x, y, bw, bh, r);
            ctx.stroke();
          }
        };
        // 顶部名牌
        const nbW = w * 0.64,
          nbH = h * 0.058;
        barcode(
          w * 0.02,
          h * 0.012,
          nbW,
          nbH,
          4 * u,
          "rgba(10,12,18,0.8)",
          "rgba(212,176,106,0.55)",
        );
        ctx.fillStyle = "#f5eed6";
        ctx.font =
          "bold " +
          Math.round(w * 0.058) +
          "px 'PingFang SC','Microsoft YaHei',sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(card.name, w * 0.035, h * 0.012 + nbH / 2 + 1);
        if (isMon) {
          // 属性徽章（右上圆牌）
          const cx = w * 0.925,
            cy = h * 0.038,
            r = w * 0.055;
          ctx.fillStyle = "rgba(245,238,214,0.95)";
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(212,176,106,0.8)";
          ctx.lineWidth = Math.max(1, u * 1.4);
          ctx.stroke();
          ctx.fillStyle = "#2a2213";
          ctx.font = Math.round(r * 1.15) + "px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(ATTR_TXT[card.attribute] || "?", cx, cy + 1);
          // 星级（徽章下方，右对齐；超过 5 星折行）
          ctx.textAlign = "right";
          ctx.font = Math.round(w * 0.048) + "px serif";
          ctx.fillStyle = "#ffd24a";
          ctx.shadowColor = "rgba(0,0,0,0.8)";
          ctx.shadowBlur = 3 * u;
          const lv = Math.min(card.level || 0, 12);
          const row1 = Math.min(lv, 5),
            row2 = lv - 5;
          ctx.fillText("★".repeat(row1), w * 0.975, h * 0.105);
          if (row2 > 0) ctx.fillText("★".repeat(row2), w * 0.975, h * 0.145);
          ctx.shadowBlur = 0;
        } else {
          // 魔/陷类型徽章（右上）
          const isSpell = card.type === "spell";
          const bw = w * 0.2,
            bh = h * 0.052;
          barcode(
            w * 0.78,
            h * 0.014,
            bw,
            bh,
            4 * u,
            isSpell ? "rgba(47,174,99,0.92)" : "rgba(164,95,220,0.92)",
            null,
          );
          ctx.fillStyle = "#fff";
          ctx.font =
            "bold " +
            Math.round(w * 0.05) +
            "px 'PingFang SC','Microsoft YaHei',sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(
            isSpell ? "魔法" : "陷阱",
            w * 0.78 + bw / 2,
            h * 0.014 + bh / 2 + 1,
          );
          // 第二行：魔陷种类
          ctx.textAlign = "left";
          ctx.fillStyle = "#ffd24a";
          ctx.font =
            "bold " +
            Math.round(w * 0.05) +
            "px 'PingFang SC','Microsoft YaHei',sans-serif";
          ctx.fillText(
            (card.subtype || "") + (isSpell ? "魔法" : "陷阱"),
            w * 0.03,
            h * 0.105,
          );
        }
        if (isMon) {
          // 底部攻守框
          const st = optsStats(card);
          const bbH = h * 0.06,
            bbY = h * 0.925,
            bbW = w * 0.44;
          ctx.font =
            "bold " + Math.round(w * 0.056) + "px 'SF Mono',Consolas,monospace";
          ctx.textBaseline = "middle";
          barcode(
            w * 0.02,
            bbY,
            bbW,
            bbH,
            4 * u,
            "rgba(10,12,18,0.85)",
            "rgba(255,210,74,0.65)",
          );
          ctx.textAlign = "left";
          ctx.fillStyle = "#ffd24a";
          ctx.fillText("ATK " + st.atk, w * 0.045, bbY + bbH / 2 + 1);
          barcode(
            w * 0.54,
            bbY,
            bbW,
            bbH,
            4 * u,
            "rgba(10,12,18,0.85)",
            "rgba(120,180,255,0.65)",
          );
          ctx.textAlign = "right";
          ctx.fillStyle = "#9cc4ff";
          ctx.fillText("DEF " + st.def, w * 0.955, bbY + bbH / 2 + 1);
        }
      }
      // 游戏王卡背（本地图片，同源无污染；未加载完成前用程序卡背回退）
      const backImg = new Image();
      backImg.src = "assets/card-back.jpg";
      let backImgReady = false;
      backImg.onload = () => {
        backImgReady = true;
        refreshBackTexture();
      };
      backImg.onerror = () => {
        backImgReady = false;
      };
      // 卡背图就绪后：清空背面纹理缓存并重新绑定所有卡背
      function refreshBackTexture() {
        for (const key of [...texCache.keys()])
          if (key.startsWith("d:")) {
            const t = texCache.get(key);
            if (t) t.dispose();
            texCache.delete(key);
          }
        for (const g of cardMeshes.values()) {
          const landscape = isLandscape(g.userData.slot, g.userData.card);
          g.userData.backMat.map = getTexture(null, false, landscape);
          g.userData.backMat.needsUpdate = true;
          if (!g.userData.faceUp) {
            g.userData.frontMat.map = getTexture(
              g.userData.card,
              false,
              landscape,
            );
            g.userData.frontMat.needsUpdate = true;
          }
        }
        // 牌堆顶面若在卡背图加载前创建，会停留在程序回退卡背上，这里一并换新
        for (const g of pileMeshes.values()) {
          if (g.userData.topUid) continue; // 面朝上的堆顶用卡面纹理，无需处理
          g.userData.topMat.map = getTexture(null, false);
          g.userData.topMat.needsUpdate = true;
        }
      }
      function makeCardTexture(card, faceUp) {
        const cv = document.createElement("canvas");
        cv.width = TEX_W;
        cv.height = TEX_H;
        const ctx = cv.getContext("2d");
        const r = 28;
        if (!faceUp) {
          if (backImgReady && backImg.naturalWidth) {
            // 游戏王卡背：本地图片 cover 铺满整张卡背
            const bw = backImg.naturalWidth,
              bh = backImg.naturalHeight;
            const sc = Math.max(TEX_W / bw, TEX_H / bh);
            ctx.drawImage(
              backImg,
              (TEX_W - bw * sc) / 2,
              (TEX_H - bh * sc) / 2,
              bw * sc,
              bh * sc,
            );
          } else {
            // 未加载完成时的程序卡背回退
            ctx.fillStyle = "#3a2350";
            roundRect(ctx, 0, 0, TEX_W, TEX_H, r);
            ctx.fill();
            ctx.strokeStyle = "#5a3a78";
            ctx.lineWidth = 8;
            roundRect(ctx, 6, 6, TEX_W - 12, TEX_H - 12, r - 6);
            ctx.stroke();
            ctx.fillStyle = "rgba(255,255,255,0.25)";
            ctx.font = "bold 180px serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("✦", TEX_W / 2, TEX_H / 2);
          }
        } else {
          // 程序化卡面（无立绘时的回退；有立绘时走 makeArtTexture，不经过 Canvas）
          const isMon = card.type === "monster";
          const grad = ctx.createLinearGradient(0, 0, TEX_W, TEX_H);
          if (isMon) {
            grad.addColorStop(0, "#e8c64b");
            grad.addColorStop(1, "#b8902a");
          } else if (card.type === "spell") {
            grad.addColorStop(0, "#3fb06c");
            grad.addColorStop(1, "#247a42");
          } else {
            grad.addColorStop(0, "#a85fd6");
            grad.addColorStop(1, "#6e3392");
          }
          ctx.fillStyle = grad;
          roundRect(ctx, 0, 0, TEX_W, TEX_H, r);
          ctx.fill();
          const glow = ctx.createRadialGradient(
            TEX_W / 2,
            TEX_H * 0.42,
            40,
            TEX_W / 2,
            TEX_H * 0.42,
            TEX_H * 0.7,
          );
          glow.addColorStop(0, "rgba(255,255,255,0.25)");
          glow.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = glow;
          ctx.fillRect(0, 0, TEX_W, TEX_H);
          // 无立绘占位：怪兽显示种族、魔陷显示类别（纯文字，字号随字数收缩以留在卡框内）
          const label = isMon
            ? (card.race || "怪兽").replace(/族$/, "")
            : card.type === "spell"
              ? "魔法"
              : "陷阱";
          ctx.font = Math.round(Math.min(150, (TEX_W * 0.82) / Math.max(1, label.length))) + "px serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "rgba(0,0,0,0.55)";
          ctx.fillText(label, TEX_W / 2, TEX_H * 0.42);
          // 名字条 + 数值条
          drawCardOverlay(ctx, card, TEX_W, TEX_H);
        }
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.minFilter = THREE.LinearFilter; // 无 mipmap 线性过滤：卡面缩放更锐利
        tex.generateMipmaps = false;
        return tex;
      }
      const artCache = new Map(); // uid -> Texture | null（立绘纹理，null=未就绪走程序卡面）
      const artImg = new Map(); // uid -> Image（保留原图，数值变化时可重绘卡面）
      const ART_ORIGIN = "https://images.ygoprodeck.com/images/cards_cropped/";
      function artUrl(password) {
        // ygoprodeck 裁剪图按数字 id 命名（无前导零），8 位卡密需去掉前导零拼接
        return (
          "/api/img?url=" +
          encodeURIComponent(ART_ORIGIN + String(Number(password)) + ".jpg")
        );
      }
      // 立绘纹理：方形立绘按卡面竖版比例居中裁剪（cover），再传 CanvasTexture
      // （图片走本地代理同源，无污染；img.decode() 确保像素解码完成再绘制，避免空白/灰面）
      function buildArtTexture(img, card) {
        const iw = img.naturalWidth,
          ih = img.naturalHeight;
        const A = CARD_W / CARD_H; // 卡面宽高比 ≈0.707（竖版）
        const sw = Math.min(iw, Math.round(ih * A));
        const sh = Math.min(ih, Math.round(iw / A));
        const cv = document.createElement("canvas");
        cv.width = sw;
        cv.height = sh;
        const ctx = cv.getContext("2d");
        ctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, sw, sh);
        // 名字条 + 数值条叠加在立绘上
        drawCardOverlay(ctx, card, sw, sh);
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
        tex.minFilter = THREE.LinearFilter; // 无 mipmap 线性过滤：卡面缩放更锐利
        tex.generateMipmaps = false;
        return tex;
      }
      function ensureArt(card) {
        if (!card || !card.password || artCache.has(card.uid)) return;
        const img = new Image();
        img.src = artUrl(card.password);
        img.onload = () => {
          // decode() 确保像素数据就绪，避免 drawImage/上传拿到空白
          img
            .decode()
            .then(() => {
              artImg.set(card.uid, img); // 保留原图，供数值变化时重绘
              artCache.set(card.uid, buildArtTexture(img, card));
              refreshCardTexture(card.uid);
            })
            .catch(() => {
              artCache.set(card.uid, null);
            });
        };
        img.onerror = () => {
          artCache.set(card.uid, null);
        };
        artCache.set(card.uid, null); // 占位：未就绪前用程序卡面
      }
      // 横向（防守/埋伏）纹理：在竖版纹理基础上绕中心旋转 -90°，恰好铺满横放卡面（无拉伸），立绘朝上
      function landscapeClone(tex) {
        const c = tex.clone();
        c.center.set(0.5, 0.5);
        c.rotation = -Math.PI / 2;
        return c;
      }
      function buildTexture(card, faceUp, landscape) {
        let t = null;
        if (faceUp && card && card.password) t = artCache.get(card.uid);
        if (!t) t = makeCardTexture(card, faceUp);
        return landscape ? landscapeClone(t) : t;
      }
      function getTexture(card, faceUp, landscape) {
        const key = texKey(card, faceUp, landscape);
        if (!texCache.has(key))
          texCache.set(key, buildTexture(card, faceUp, landscape));
        return texCache.get(key);
      }
      function optsStats(card) {
        if (S.duel && S.duel.state) {
          try {
            return S.duel.stats(card);
          } catch (e) {
            /* 未开局 */
          }
        }
        return { atk: card.atk ?? 0, def: card.def ?? 0 };
      }
      // 从缓存丢弃纹理并释放 GPU 资源（替换前调用，防止显存泄漏）
      function dropTex(key) {
        const t = texCache.get(key);
        if (t) {
          t.dispose();
          texCache.delete(key);
        }
      }
      function refreshCardTexture(uid) {
        dropTex("u:" + uid);
        dropTex("u:" + uid + ":L");
        for (const m of cardMeshes.values()) {
          if (
            m.userData.card &&
            m.userData.card.uid === uid &&
            m.userData.faceUp
          ) {
            const t = getTexture(
              m.userData.card,
              true,
              isLandscape(m.userData.slot, m.userData.card),
            );
            m.userData.frontMat.map = t;
            m.userData.frontMat.needsUpdate = true;
          }
        }
      }
      /* ===================== 3D 卡牌 ===================== */
      const CARD_W = 1.06,
        CARD_H = 1.5,
        CARD_T = 0.045;
      const cardMeshes = new Map(); // uid -> Group
      const pileMeshes = new Map(); // key -> Group（卡组/墓地/额外/除外/场地）
      const pileTags = new Map(); // key -> DOM 标签
      const chipEls = new Map(); // uid(+后缀) -> DOM 引导 chip（战斗攻击/祭品已选）

      const sideMat = new THREE.MeshStandardMaterial({
        color: 0xe8e4da,
        roughness: 0.6,
      });
      // 释放单卡独占的 GPU 资源（几何体与正反面材质；纹理由 texCache/artCache 统一管理，跳过共享侧边材质）
      function disposeCardGroup(g) {
        g.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          const mats = Array.isArray(o.material)
            ? o.material
            : o.material
              ? [o.material]
              : [];
          for (const m of mats) if (m !== sideMat) m.dispose();
        });
      }
      function makeCard3D() {
        const g = new THREE.Group();
        // 卡面用 Basic 材质：直接显示纹理颜色，不受光照影响（鲜艳清晰）
        // 注意：绑定 map 的材质不能带深色底色，否则纹理会被颜色乘算压暗
        // BoxGeometry 材质顺序：[+x, -x, +y, -y, +z, -z]，正面(+z)放立绘、背面(-z)放卡背
        const backMat = new THREE.MeshBasicMaterial();
        const frontMat = new THREE.MeshBasicMaterial();
        const box = new THREE.Mesh(
          new THREE.BoxGeometry(CARD_W, CARD_H, CARD_T),
          [sideMat, sideMat, sideMat, sideMat, frontMat, backMat],
        );
        box.castShadow = true; // 卡牌在暖色主光下向桌面投影
        g.add(box);
        g.userData = {
          frontMat,
          backMat,
          card: null,
          slot: null,
          targetPos: new THREE.Vector3(),
          targetRot: new THREE.Euler(),
          targetScale: 1,
          dying: false,
          hover: false,
        };
        return g;
      }
      // 摆放形态：里侧（翻转）→ 平躺贴桌（像书平放）；正面防守 → 横向竖立；其余（攻击/魔陷）→ 竖向竖立
      function isFlat(slot, card) {
        return !!card && !!card.faceDown;
      }
      function isLandscape(slot, card) {
        return (
          !!card &&
          !card.faceDown &&
          slot &&
          slot.kind === "monster" &&
          card.position === "def"
        );
      }
      function setCard3D(g, card, faceUp, landscape, flat, rotX) {
        g.userData.card = card;
        g.userData.faceUp = faceUp;
        g.userData.frontMat.map = getTexture(card, faceUp, landscape);
        g.userData.frontMat.needsUpdate = true;
        g.userData.backMat.map = getTexture(null, false, landscape);
        g.userData.backMat.needsUpdate = true;
        // 里侧平躺（绕 x -90° 贴桌 + 绕 z 90° 横向，长边左右摆放）；防守横向竖立（绕 z 90°）；其余直立
        g.userData.targetRot.set(
          flat ? -Math.PI / 2 : rotX || 0,
          0,
          landscape || flat ? Math.PI / 2 : 0,
        );
      }

      // 槽位坐标：怪兽区一行 5 槽（近中线），魔陷区一行 5 槽（靠玩家侧），场地魔法在魔陷区左端；
      // 槽距 1.9：横向卡（守备/里侧）长边 ≈ CARD_H*FIELD_SCALE ≈ 1.73，保证相邻槽位有可见间隔
      const HAND_SCALE = 0.62; // 手牌缩放（比场上小）
      const HAND_HOVER_SCALE = 1.42; // hover 手牌时的临时放大倍率（乘在 HAND_SCALE 上）
      const HAND_PITCH = -0.42; // 手牌绕X后仰，让牌面正对俯视镜头（修正“朝下”感）
      const FIELD_SCALE = 1.15; // 场上卡牌缩放
      // 场上卡牌后仰角：按排深计算俯视角度的 65% 补偿（离玩家越近俯视越陡、后仰越大）
      function fieldPitch(who, kind) {
        const z = Math.abs(slotPos(who, kind, 0).z);
        // 用当前机位实时计算（拖拽/切机位后由 sync3D 重算），不再绑死初始相机常量
        const dy = camera.position.y - (CARD_H / 2) * FIELD_SCALE;
        return -Math.atan(dy / Math.max(1, Math.abs(camera.position.z) - z)) * 0.65;
      }
      function slotPos(who, kind, idx) {
        let x, z;
        if (kind === "monster") {
          x = (idx - 2) * LAYOUT.slotGap;
          z = LAYOUT.monsterZ;
        } else if (kind === "field") {
          x = LAYOUT.fieldX;
          z = LAYOUT.stZ;
        } else {
          x = (idx - 2) * LAYOUT.slotGap;
          z = LAYOUT.stZ;
        }
        return new THREE.Vector3(x, CARD_H / 2, who === "me" ? z : -z);
      }
      function handPos(i, n, who) {
        const spread = Math.min(n * 0.85, 5.2);
        const x = (i - (n - 1) / 2) * (spread / Math.max(n - 1, 1));
        const z = (who === "me" ? 1 : -1) * LAYOUT.handZ;
        return new THREE.Vector3(x, (CARD_H / 2) * HAND_SCALE, z);
      }
      function pilePos(who, kind) {
        // 堆位坐标来自 LAYOUT.piles（与桌面贴花的堆位环同源）；各自半场内、互不穿插
        const q = LAYOUT.piles[kind] || { x: 8.2, z: 0 };
        const s = who === "me" ? 1 : -1;
        return new THREE.Vector3(s * q.x, 0.14, s * q.z);
      }
      /* 悬停光环：与决斗盘贴花同语言的柔光金框，跟随指针下的场上卡牌（方形，兼容横放卡） */
      const hoverRing = (() => {
        const cv = document.createElement("canvas");
        cv.width = 160;
        cv.height = 160;
        const ctx = cv.getContext("2d");
        strokeGlowStyle(ctx, "rgba(255,216,132,0.95)", 16);
        ctx.lineWidth = 6;
        roundRect(ctx, 12, 12, 136, 136, 16);
        ctx.stroke();
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        // 取竖放/横放卡的外接尺寸 + 余量：守备横卡也完整包在光环内
        const ringSide =
          Math.max(CARD_H, CARD_W) * FIELD_SCALE + 0.22;
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(ringSide, ringSide),
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        m.renderOrder = 2;
        scene.add(m);
        return m;
      })();
      function strokeGlowStyle(ctx, color, blur) {
        ctx.strokeStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = blur;
      }

      /* 合法放置区高亮：手牌召唤/覆盖时点亮己方可用的怪兽/魔陷格（hud 经此桥接控制）。
         绿色发光框 + 半透明填充，脉冲在渲染循环里按时间驱动；格子可点击（放置模式选位）。 */
      const zoneGlows = new Map(); // "monster:3" -> Mesh
      let zoneGlowActive = false;
      function zoneGlowMesh(key) {
        let m = zoneGlows.get(key);
        if (m) return m;
        const [kind, idxStr] = key.split(":");
        const cv = document.createElement("canvas");
        cv.width = 178;
        cv.height = 178;
        const c2 = cv.getContext("2d");
        strokeGlowStyle(c2, "rgba(110,225,160,0.95)", 18);
        c2.lineWidth = 7;
        c2.fillStyle = "rgba(110,225,160,0.16)";
        roundRect(c2, 10, 10, 158, 158, 16);
        c2.fill();
        c2.stroke();
        const tex = new THREE.CanvasTexture(cv);
        tex.colorSpace = THREE.SRGBColorSpace;
        // 方形格子（≈槽距）：竖放/横放卡都居中容纳，与贴花槽框对齐
        const cell = LAYOUT.slotGap * 0.94;
        m = new THREE.Mesh(
          new THREE.PlaneGeometry(cell, cell),
          new THREE.MeshBasicMaterial({
            map: tex,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
          }),
        );
        m.rotation.x = -Math.PI / 2;
        m.visible = false;
        m.renderOrder = 2;
        m.userData.zone = { who: "me", kind, idx: Number(idxStr) }; // 点击拾取用
        scene.add(m);
        zoneGlows.set(key, m);
        return m;
      }
      function setZoneHighlight3D(spec) {
        hot(900);
        for (const [, m] of zoneGlows) m.visible = false;
        zoneGlowActive = !!spec;
        if (!spec) return;
        for (const idx of spec.idxs) {
          const m = zoneGlowMesh(spec.kind + ":" + idx);
          const p = slotPos("me", spec.kind, idx);
          m.position.set(p.x, 0.045, p.z);
          m.visible = true;
        }
      }

      /* ===================== 状态同步 ===================== */
      const STICKY_SCALE = 0.68; // 常驻魔陷（装备/永续/场地）在场时的缩小比例
      function isStickyST(card) {
        return (
          !!card &&
          (card.type === "spell" || card.type === "trap") &&
          (card.subtype === "装备" ||
            card.subtype === "永续" ||
            card.subtype === "场地")
        );
      }
      const linkedUids = new Set(); // 常驻魔陷关联的怪兽 uid（渲染循环抬升用）
      function sync3D() {
        hot();
        const s = S.duel && S.duel.state;
        if (!s) return;
        const alive = new Set();
        // 场上（怪兽+魔陷）
        for (const who of ["me", "ai"]) {
          const p = s[who];
          for (let i = 0; i < 5; i++) {
            const m = p.monsterZone[i];
            const st = p.spellZone[i];
            if (m) {
              placeCard3D(m, { kind: "monster", who, idx: i });
              alive.add(m.uid);
            }
            if (st) {
              placeCard3D(st, { kind: "st", who, idx: i });
              alive.add(st.uid);
            }
          }
          if (p.fieldZone) {
            placeCard3D(p.fieldZone, { kind: "field", who, idx: 0 });
            alive.add(p.fieldZone.uid);
          }
          // 手牌
          p.hand.forEach((c, i) => {
            placeCard3D(c, { kind: "hand", who, idx: i, handN: p.hand.length });
            alive.add(c.uid);
          });
        }
        // 移除离场卡
        for (const [uid, g] of cardMeshes) {
          if (!alive.has(uid) && !g.userData.dying) {
            g.userData.dying = true;
            leaveCard3D(g, "#ff6b4a");
          }
        }
        // 堆
        for (const who of ["me", "ai"]) {
          const p = s[who];
          setPile("deck", who, p.deck.length, p.deck[0] || null);
          setPile(
            "grave",
            who,
            p.graveyard.length,
            p.graveyard[p.graveyard.length - 1] || null,
          );
          if (p.extra.length)
            setPile("extra", who, p.extra.length, p.extra[0] || null);
          if (p.banished.length)
            setPile(
              "banished",
              who,
              p.banished.length,
              p.banished[p.banished.length - 1] || null,
            );
        }
        // 常驻魔陷关联怪兽（装备目标 / 链接 / 种族场地buff），用于金色高亮与抬升
        linkedUids.clear();
        for (const who of ["me", "ai"]) {
          const p = s[who];
          for (const c of [...p.spellZone, p.fieldZone]) {
            if (!c || c.faceDown) continue;
            if (c.equipTarget) linkedUids.add(c.equipTarget);
            if (c.linkPartner) linkedUids.add(c.linkPartner);
            if (c.effect && c.effect.races) {
              for (const key of ["me", "ai"])
                for (const m of s[key].monsterZone)
                  if (m && c.effect.races.includes(m.race))
                    linkedUids.add(m.uid);
            }
          }
        }
        // 模式高亮：攻击者（蓝）/可选目标（红）/祭品候选（浅金）/祭品已选（金）
        for (const [uid, g] of cardMeshes) {
          const slot = g.userData.slot;
          let color = 0xffffff;
          if (S.mode === "attack") {
            if (
              slot &&
              slot.who === "me" &&
              slot.kind === "monster" &&
              slot.idx === S.attackZone
            )
              color = 0x8fc2ff;
            else if (slot && slot.who === "ai" && slot.kind === "monster")
              color = 0xff9d8a;
          } else if (
            S.mode === "tribute" &&
            slot &&
            slot.who === "me" &&
            slot.kind === "monster"
          ) {
            color = S.tributePool.includes(slot.idx) ? 0xffd24a : 0xffcc66;
          } else if (g.userData.card && linkedUids.has(g.userData.card.uid)) {
            color = 0xffd24a; // 常驻魔陷关联怪兽：金色高亮
          }
          g.userData.frontMat.color.set(color);
        }
        // 攻守数值同步：装备/场地/攻守互换等改变数值时，重绘卡面纹理（攻击结算与菜单始终取实时值）
        for (const [uid, g] of cardMeshes) {
          const card = g.userData.card;
          if (
            !card ||
            card.type !== "monster" ||
            !g.userData.faceUp ||
            g.userData.dying
          )
            continue;
          let st;
          try {
            st = S.duel.stats(card);
          } catch (e) {
            continue;
          }
          const prev = g.userData.lastStats;
          if (prev && prev.atk === st.atk && prev.def === st.def) continue;
          g.userData.lastStats = { atk: st.atk, def: st.def };
          const img = artImg.get(card.uid);
          if (img) {
            const oldArt = artCache.get(card.uid);
            if (oldArt) oldArt.dispose();
            artCache.set(card.uid, buildArtTexture(img, card)); // 用原图按新数值重绘立绘卡面
          }
          refreshCardTexture(card.uid);
        }
      }
      function placeCard3D(card, slot) {
        let g = cardMeshes.get(card.uid);
        const faceUp =
          slot.kind === "hand" ? slot.who === "me" : !card.faceDown;
        // 手牌立放（卡面正对相机）；AI 手牌背面朝向玩家（绕 y 旋转 180°）
        const handRotY =
          slot.kind === "hand" && slot.who === "ai" ? Math.PI : 0;
        const landscape = isLandscape(slot, card);
        const flat = isFlat(slot, card);
        if (!g) {
          g = makeCard3D();
          cardMeshes.set(card.uid, g);
          scene.add(g);
          setCard3D(
            g,
            card,
            faceUp,
            landscape,
            flat,
            slot.kind === "hand" ? 0 : fieldPitch(slot.who, slot.kind),
          );
          g.userData.targetRot.set(
            slot.kind === "hand" ? HAND_PITCH : g.userData.targetRot.x,
            handRotY,
            g.userData.targetRot.z,
          );
          // 落卡动画（从槽位上方落下）
          g.position.set(
            slotPos(slot.who, slot.kind, slot.idx).x,
            CARD_H / 2 + 3.5,
            slotPos(slot.who, slot.kind, slot.idx).z,
          );
          g.rotation.set(0, handRotY, 0);
          g.userData.slot = slot;
          const sticky =
            (slot.kind === "st" || slot.kind === "field") &&
            faceUp &&
            isStickyST(card);
          g.userData.targetScale =
            slot.kind === "hand"
              ? HAND_SCALE
              : sticky
                ? FIELD_SCALE * STICKY_SCALE
                : FIELD_SCALE;
          g.userData.targetPos =
            slot.kind === "hand"
              ? handPos(slot.idx, slot.handN, slot.who)
              : slotPos(slot.who, slot.kind, slot.idx);
          if (flat)
            g.userData.targetPos.y = CARD_T / 2; // 平躺贴桌
          else if (landscape)
            g.userData.targetPos.y = (CARD_W / 2) * FIELD_SCALE; // 横向竖立：贴桌站立
          else if (sticky)
            g.userData.targetPos.y = (CARD_H / 2) * FIELD_SCALE * STICKY_SCALE; // 常驻魔陷：缩小并贴桌
        } else {
          // 更新（翻面/位置变化）
          const newFaceUp = faceUp;
          const curFaceUp = g.userData.faceUp;
          const curLandscape = isLandscape(g.userData.slot, g.userData.card);
          const curFlat = isFlat(g.userData.slot, g.userData.card);
          if (
            curFaceUp !== newFaceUp ||
            curLandscape !== landscape ||
            curFlat !== flat
          ) {
            g.userData.faceUp = newFaceUp;
            g.userData.frontMat.map = getTexture(card, newFaceUp, landscape);
            g.userData.frontMat.needsUpdate = true;
            if (newFaceUp) ensureArt(card);
          }
          g.userData.slot = slot;
          const sticky =
            (slot.kind === "st" || slot.kind === "field") &&
            faceUp &&
            isStickyST(card);
          g.userData.targetScale =
            slot.kind === "hand"
              ? HAND_SCALE
              : sticky
                ? FIELD_SCALE * STICKY_SCALE
                : FIELD_SCALE;
          g.userData.targetPos =
            slot.kind === "hand"
              ? handPos(slot.idx, slot.handN, slot.who)
              : slotPos(slot.who, slot.kind, slot.idx);
          if (flat)
            g.userData.targetPos.y = CARD_T / 2; // 平躺贴桌
          else if (landscape)
            g.userData.targetPos.y = (CARD_W / 2) * FIELD_SCALE; // 横向竖立：贴桌站立
          else if (sticky)
            g.userData.targetPos.y = (CARD_H / 2) * FIELD_SCALE * STICKY_SCALE; // 常驻魔陷：缩小并贴桌
          g.userData.targetRot.set(
            slot.kind === "hand"
              ? HAND_PITCH
              : flat
                ? -Math.PI / 2
                : fieldPitch(slot.who, slot.kind),
            handRotY,
            landscape || flat ? Math.PI / 2 : 0,
          );
        }
        if (faceUp) ensureArt(card);
        if (g.userData.dying) {
          g.userData.dying = false;
          g.visible = true;
          // 离场飞散动画期间同卡回场：取消旧 tween，交还渲染循环的阻尼接管
          // （否则 onUpdate 会继续把卡拉向天空，出现"先飞走再飞回"）
          const t = tween3DMap.get(g);
          if (t && !t.done) t.cancel();
        }
      }
      function leaveCard3D(g, color) {
        // 离场动画：飞起旋转缩小 + 粒子
        burst3D(g.position.clone(), color, 18);
        tween3D(
          g,
          {
            pos: g.position.clone().add(new THREE.Vector3(0, 2.2, 0)),
            scale: 0.05,
            rotY: g.rotation.y + Math.PI * 2,
          },
          420,
          "easeIn",
          () => {
            // 死亡动画期间同 uid 卡牌回到场上（dying 已被 placeCard3D 复位）则放弃移除
            if (!g.userData.dying) return;
            scene.remove(g);
            cardMeshes.delete(g.userData.card && g.userData.card.uid);
            disposeCardGroup(g);
          },
        );
      }
      function setPile(kind, who, count, topCard) {
        const key = kind + ":" + who;
        let g = pileMeshes.get(key);
        if (!g) {
          g = new THREE.Group();
          // 顶面与前后两面都贴牌图：侧视/俯视都能看到卡背图案
          const topTex = new THREE.MeshBasicMaterial({
            map: topCard
              ? getTexture(topCard, true)
              : getTexture(null, false),
          });
          const box = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 0.05), [
            sideMat,
            sideMat,
            topTex,
            new THREE.MeshBasicMaterial({ color: 0x241a33 }),
            topTex,
            topTex,
          ]);
          box.castShadow = true;
          g.userData.topMat = box.material[2];
          g.userData.topUid = topCard ? topCard.uid : null;
          g.add(box);
          scene.add(g);
          pileMeshes.set(key, g);
          // DOM 数量标签
          const tag = document.createElement("div");
          tag.className = "pile-tag";
          tag.textContent =
            ({ deck: "卡组", grave: "墓地", extra: "额外", banished: "除外" }[
              kind
            ] || kind) +
            " " +
            count;
          stage.appendChild(tag);
          pileTags.set(key, tag);
          g.userData.key = key;
        }
        g.userData.count = count;
        g.position.copy(pilePos(who, kind));
        // 堆叠厚度
        g.scale.y = Math.min(1 + count * 0.02, 2.2);
        // 顶卡变化（如墓地顶）时换面并刷新标签
        const uid = topCard ? topCard.uid : null;
        if (uid !== g.userData.topUid) {
          g.userData.topUid = uid;
          g.userData.topMat.map = topCard
            ? getTexture(topCard, true)
            : getTexture(null, false);
          g.userData.topMat.needsUpdate = true;
          const tag = pileTags.get(key);
          if (tag)
            tag.textContent =
              ({ deck: "卡组", grave: "墓地", extra: "额外", banished: "除外" }[
                kind
              ] || kind) +
              " " +
              count;
        }
      }
      /* ===================== LP 显示（DOM 血条，见 hud.mjs / game3d.css） =====================
         3D 悬浮屏方案因遮挡场上的卡废弃；仅保留伤害浮字的定位锚点（屏幕上/下缘中点）。 */
      function projectLp3D(who) {
        return {
          x: window.innerWidth / 2,
          y: who === "ai" ? 64 : window.innerHeight - 108,
        };
      }


      /* ===================== 动画系统（anime.js 统一驱动 3D + DOM） ===================== */
      // 说明：3D 对象用“代理状态对象”接入 anime（anime 管时间轴/缓动，onUpdate 写回 three 属性），
      // 避免 v4.5 three 适配器对数值初始值的解析缺陷，同时天然支持贝塞尔/弹簧缓动。
      // 缓动映射：兼容旧签名 + 贝塞尔/弹簧
      const EASE3D = {
        easeIn: "inQuad",
        easeOut: "outCubic",
        easeInOut: "inOutQuad",
        attack: cubicBezier(0.62, -0.28, 0.74, 0.05), // 攻击突进：急冲骤停
        recoil: "outElastic", // 回弹
      };
      const tween3DMap = new Map(); // obj -> anime Animation（同一对象新 tween 自动停止旧的）
      function tween3D(obj, to, dur, ease, onDone) {
        hot((dur || 300) + 300);
        const prev = tween3DMap.get(obj);
        if (prev && !prev.done) prev.cancel();
        if (obj.userData) obj.userData.busy = true; // 动画接管期间，阻尼趋近循环跳过该对象
        const fromPos = obj.position.clone();
        const fromScale = obj.scale.x;
        const fromRotY = obj.rotation.y;
        const toPos = to.pos || fromPos;
        const toScale = to.scale != null ? to.scale : fromScale;
        const toRotY = to.rotY != null ? to.rotY : fromRotY;
        const state = { k: 0 };
        const entry = { done: false, started: performance.now(), dur: dur || 300, cancel: null };
        // finish：动画完成/被超时强制收尾的统一出口（幂等）。rAF 冻结时 anime 不会推进，
        // 若只依赖 onComplete，busy 标记将永久卡死按需渲染的早退判定 → 兜底渲染全速空转烧 CPU。
        const finish = () => {
          if (entry.done) return;
          entry.done = true;
          tween3DMap.delete(obj);
          if (obj.userData) obj.userData.busy = false;
          if (onDone) onDone();
        };
        const anim = animate(state, {
          k: 1,
          duration: dur,
          ease: EASE3D[ease] || ease || "outCubic",
          onUpdate: () => {
            const k = state.k;
            obj.position.lerpVectors(fromPos, toPos, k);
            obj.scale.setScalar(fromScale + (toScale - fromScale) * k);
            obj.rotation.y = fromRotY + (toRotY - fromRotY) * k;
          },
          onComplete: finish,
        });
        entry.cancel = () => {
          try { anim.cancel(); } catch (e) {}
          finish();
        };
        tween3DMap.set(obj, entry);
        return anim;
      }
      // 粒子爆发：小方块上抛 + 淡出（代理状态接入 anime，无需自管更新循环）
      function burst3D(pos, color, count) {
        hot(1400);
        const geo = new THREE.BoxGeometry(0.09, 0.09, 0.09);
        let alive = count;
        for (let i = 0; i < count; i++) {
          const m = new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({
              color: new THREE.Color(color),
              transparent: true,
            }),
          );
          m.position
            .copy(pos)
            .add(
              new THREE.Vector3(
                (Math.random() - 0.5) * 0.4,
                0.06,
                (Math.random() - 0.5) * 0.4,
              ),
            );
          scene.add(m);
          const st = {
            x: m.position.x,
            y: m.position.y,
            z: m.position.z,
            s: 1,
            o: 1,
          };
          animate(st, {
            x: st.x + (Math.random() - 0.5) * 1.6,
            z: st.z + (Math.random() - 0.5) * 1.6,
            y: st.y + 0.9 + Math.random() * 1.1,
            s: 0.1,
            o: 0,
            duration: 420 + Math.random() * 320,
            ease: "outCubic",
            onUpdate: () => {
              m.position.set(st.x, st.y, st.z);
              m.scale.setScalar(st.s);
              m.material.opacity = st.o;
            },
            onComplete: () => {
              scene.remove(m);
              m.material.dispose();
              if (--alive <= 0) geo.dispose();
            },
          });
        }
      }
      // 冲击波圆环：扩散 + 淡出
      function shockwave3D(pos) {
        hot(900);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.3, 0.42, 32),
          new THREE.MeshBasicMaterial({
            color: 0xffd24a,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(pos).setY(0.06);
        scene.add(ring);
        const st = { s: 1, o: 0.95 };
        animate(st, {
          s: 3.2,
          o: 0,
          duration: 430,
          ease: "outCubic",
          onUpdate: () => {
            ring.scale.setScalar(st.s);
            ring.material.opacity = st.o;
          },
          onComplete: () => {
            scene.remove(ring);
            ring.geometry.dispose();
            ring.material.dispose();
          },
        });
      }
      // 受击闪光：材质颜色红闪后恢复（anime 驱动颜色插值）
      function flashMesh3D(g) {
        if (!g) return;
        hot(600);
        const mat = g.userData.frontMat;
        const red = new THREE.Color(0xff5a4a),
          white = new THREE.Color(0xffffff);
        const st = { k: 0 };
        animate(st, {
          k: 1,
          duration: 55,
          ease: "linear",
          onUpdate: () => mat.color.lerpColors(white, red, st.k),
          onComplete: () => {
            animate(st, {
              k: 0,
              duration: 260,
              ease: "outQuad",
              onUpdate: () => mat.color.lerpColors(white, red, st.k),
            });
          },
        });
      }
      // 卡片碎裂：按当前纹理分片，碎片随机飞散旋转淡出（里侧/横置卡取各自实际纹理）
      function shatter3D(g, color) {
        if (!g || !g.visible) return;
        hot(1600);
        g.visible = false;
        const COLS = 5,
          ROWS = 7;
        const frontTex = g.userData.frontMat.map;
        const src =
          frontTex && frontTex.image && frontTex.image.getContext
            ? frontTex.image
            : null;
        const shardW = CARD_W / COLS,
          shardH = CARD_H / ROWS;
        const holder = new THREE.Group();
        holder.position.copy(g.position);
        holder.rotation.copy(g.rotation);
        holder.scale.copy(g.scale);
        scene.add(holder);
        let alive = COLS * ROWS;
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const mat = new THREE.MeshBasicMaterial({
              transparent: true,
              side: THREE.DoubleSide,
              depthWrite: false,
            });
            if (src) {
              const s = 64;
              const cv = document.createElement("canvas");
              cv.width = s;
              cv.height = s;
              const ctx = cv.getContext("2d");
              ctx.drawImage(
                src,
                Math.floor((c * src.width) / COLS),
                Math.floor((r * src.height) / ROWS),
                Math.ceil(src.width / COLS),
                Math.ceil(src.height / ROWS),
                0,
                0,
                s,
                s,
              );
              const tex = new THREE.CanvasTexture(cv);
              tex.colorSpace = THREE.SRGBColorSpace;
              mat.map = tex;
            } else {
              mat.color.set(color || 0x9a8fb0);
            }
            const piece = new THREE.Mesh(
              new THREE.PlaneGeometry(shardW * 0.92, shardH * 0.92),
              mat,
            );
            piece.position.set(
              (c - (COLS - 1) / 2) * shardW,
              ((ROWS - 1) / 2 - r) * shardH,
              CARD_T / 2 + 0.01,
            );
            holder.add(piece);
            const st = {
              x: piece.position.x,
              y: piece.position.y,
              z: piece.position.z,
              rx: 0,
              ry: 0,
              rz: 0,
              o: 1,
            };
            animate(st, {
              x: st.x + (Math.random() - 0.5) * 1.7,
              y: st.y + 0.35 - Math.random() * 1.0,
              z: st.z + 0.35 + Math.random() * 0.9,
              rx: ((Math.random() - 0.5) * 720 * Math.PI) / 180,
              ry: ((Math.random() - 0.5) * 720 * Math.PI) / 180,
              rz: ((Math.random() - 0.5) * 360 * Math.PI) / 180,
              o: 0,
              duration: 750 + Math.random() * 400,
              ease: "outQuad",
              onUpdate: () => {
                piece.position.set(st.x, st.y, st.z);
                piece.rotation.set(st.rx, st.ry, st.rz);
                mat.opacity = st.o;
              },
              onComplete: () => {
                holder.remove(piece);
                if (mat.map) mat.map.dispose();
                mat.dispose();
                piece.geometry.dispose();
                if (--alive <= 0) scene.remove(holder);
              },
            });
          }
        }
      }
      /* ===================== 拾取交互 ===================== */
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      let hoveredMesh = null;
      let downPos = null;
      const DEFAULT_HINT = "点击卡牌操作 · 拖手牌到场上召唤（Shift=覆盖 Ctrl=守备） · 拖拽平移视角 · 滚轮缩放 · 双击空白复位";
      // 输入判定阈值集中定义：位移超过 CLICK_SLOP 视为拖拽（不触发点击）；
      // 超过 DRAG_SLOP 才开始视角平移（容忍轻微手抖）；手牌拖拽召唤阈值更大以防误拖
      const CLICK_SLOP = 8;
      const DRAG_SLOP = 8;
      const HAND_DRAG_SLOP = 14;
      /* 手牌拖拽召唤：按住我方手牌拖到发光格直接召唤/覆盖（点击菜单仍是完整操作入口） */
      let handDrag = null; // { slot, mesh, zones, active, magnetKey }
      const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.7); // 悬浮高度 y=0.7
      const dragHit = new THREE.Vector3();
      function dragHandCard(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.ray.intersectPlane(dragPlane, dragHit)) {
          // 卡牌跟随指针（写 targetPos，渲染循环阻尼平滑趋近）
          handDrag.mesh.userData.targetPos.set(
            THREE.MathUtils.clamp(dragHit.x, -5.2, 5.2),
            0.7,
            THREE.MathUtils.clamp(dragHit.z, -1.4, 5.0),
          );
        }
        // 磁吸：距指针最近的可用格（该格高亮常亮，提示落点）
        let best = null,
          bestD = 1e9;
        for (const idx of handDrag.zones.idxs) {
          const p = slotPos("me", handDrag.zones.kind, idx);
          const d = p.distanceToSquared(dragHit);
          if (d < bestD) {
            bestD = d;
            best = idx;
          }
        }
        handDrag.magnetKey = best != null ? handDrag.zones.kind + ":" + best : null;
      }
      function dropHandCard(e) {
        const hd = handDrag;
        hd.mesh.userData.hover = false; // 复用 hover 放大效果，落手关闭
        hd.mesh.visible = false; // 被拖卡悬在落点正上方会挡住射线：判定时先隐藏
        const g = pick(e); // 拾取落点（趁发光格与场上卡可见时判定）
        hd.mesh.visible = true;
        const z = g && g.userData.zone;
        setZoneHighlight3D(null);
        setHint(DEFAULT_HINT);
        hot(600);
        // 落点：优先射线命中的格；被场上立卡挡住时退回磁吸高亮格（限 1.7 距离内，超出则弹回）
        let hitIdx = null;
        if (z && z.who === "me" && hd.zones && z.kind === hd.zones.kind && hd.zones.idxs.includes(z.idx)) {
          hitIdx = z.idx;
        } else if (hd.zones && hd.magnetKey) {
          const idx = Number(hd.magnetKey.split(":")[1]);
          if (hd.zones.idxs.includes(idx) && dragHit.distanceTo(slotPos("me", hd.zones.kind, idx)) <= 1.7)
            hitIdx = idx;
        }
        if (hitIdx == null) {
          sync3D(); // 未落在可用格：弹回手牌位
          return;
        }
        const card = hd.mesh.userData.card;
        if (hd.zones.kind === "monster") {
          if (card.type === "monster" && (card.level || 0) >= 5) {
            // 高星怪兽：转祭品模式（经 main 注入的桥接调用 hud.startTribute）
            if (S.dragBridge) S.dragBridge.startTribute(hd.slot.idx);
            else sync3D();
            return;
          }
          // 拖拽落位同时快速选表示形式：默认攻击，Shift=覆盖（里侧守备），Ctrl/Alt=表侧守备
          if (e.shiftKey) S.duel.setMonster(hd.slot.idx, hitIdx);
          else if (e.ctrlKey || e.altKey) S.duel.normalSummon(hd.slot.idx, hitIdx, "def");
          else S.duel.normalSummon(hd.slot.idx, hitIdx, "atk");
        } else {
          S.duel.setSpellTrap(hd.slot.idx, hitIdx);
        }
      }
      const pickables = () =>
        [
          ...cardMeshes.values(),
          ...pileMeshes.values(),
          ...zoneGlows.values(), // 放置模式的发光格可点击选位
        ].filter((g) => g.visible);
      function pick(e) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects(pickables(), true);
        if (!hits.length) return null;
        let g = hits[0].object;
        while (g && !g.userData.slot && !g.userData.key && !g.userData.zone)
          g = g.parent;
        return g || null;
      }
      /* 指针事件统一处理：悬停拾取 + 提示文案（仅变化时写 DOM）+ 水平拖拽视角。
         （原 pointer/mouse 双份监听会让同一次移动做两次射线检测，现只保留 Pointer 一路） */
      let dragStart = null;
      let lastHint = null;
      function setHint(t) {
        if (t === lastHint) return;
        lastHint = t;
        const hint = document.querySelector(".hint3d");
        if (hint) hint.textContent = t || "";
      }
      renderer.domElement.addEventListener("pointerdown", (e) => {
        hot(600);
        downPos = { x: e.clientX, y: e.clientY };
        dragStart = { x: e.clientX };
        // 我方手牌按下：预判可拖性（我的主阶段 + 有合法放置区），供拖拽召唤
        handDrag = null;
        if (e.button === 0 || e.pointerType === "touch") {
          const g = pick(e);
          const sl = g && g.userData.slot;
          if (g && sl && sl.kind === "hand" && sl.who === "me") {
            const s = S.duel && S.duel.state;
            const ok =
              s &&
              s.turnPlayer === "me" &&
              !s.pending &&
              !s.resolving &&
              (s.phase === "main1" || s.phase === "main2") &&
              !S.mode &&
              !S.menuOpen;
            const zones = ok ? handPlacementZones(S.duel, g.userData.card) : null;
            handDrag = { slot: sl, mesh: g, zones, active: false, magnetKey: null };
          }
        }
      });
      renderer.domElement.addEventListener("pointermove", (e) => {
        hot(500); // 悬停光环/抬升/拖拽视角期间保持渲染
        // 手牌拖拽召唤：超过阈值进入拖拽态，卡牌跟随指针、可用格点亮
        if (handDrag && e.buttons === 1) {
          if (!handDrag.active && downPos) {
            const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
            if (moved >= HAND_DRAG_SLOP && handDrag.zones) {
              handDrag.active = true;
              handDrag.mesh.userData.hover = true; // 复用 hover 放大，拖拽中读卡更清楚
              setZoneHighlight3D(handDrag.zones);
              setHint("拖到发光格松手：攻击表示 · 按住 Shift=覆盖 · Ctrl=表侧守备");
              sfx("draw");
            }
          }
          if (handDrag.active) {
            dragHandCard(e);
            return; // 拖卡期间：不做视角平移与悬停拾取
          }
        }
        // 视角水平拖拽：累加平移偏移（机位系统统一计算，可双击空白复位）
        if (dragStart && e.buttons === 1) {
          const dx = e.clientX - dragStart.x;
          if (Math.abs(dx) > DRAG_SLOP) {
            camOffsetX = THREE.MathUtils.clamp(
              camOffsetX - dx * 0.01 * camZoom,
              -2.8,
              2.8,
            );
            applyGoal();
            dragStart = { x: e.clientX };
          }
        }
        // 悬停拾取（拖拽中沿用旧目标，省一次 raycast）
        const dragging = dragStart && e.buttons === 1;
        const g = dragging ? hoveredMesh : pick(e);
        if (!dragging) {
          if (hoveredMesh && hoveredMesh !== g) {
            hoveredMesh.userData.hover = false;
            hoveredMesh = null;
          }
          if (g && g.userData.slot) {
            hoveredMesh = g;
            g.userData.hover = true;
          }
        }
        renderer.domElement.style.cursor =
          g && (g.userData.slot || g.userData.key || g.userData.zone)
            ? "pointer"
            : "default";
        setHint(
          g
            ? g.userData.key
              ? "堆:" + g.userData.key
              : hiddenForMe(g.userData.card, g.userData.slot)
                ? g.userData.slot.kind === "hand"
                  ? "对方的手牌"
                  : "里侧卡牌"
                : g.userData.card
                    ? "卡:" + g.userData.card.name
                    : "?"
            : "点击卡牌查看/操作",
        );
        // 右侧卡牌预览浮层（hud 提供，经 store 桥接避免循环依赖）
        const bridge = S.previewBridge;
        if (bridge) {
          if (g && g.userData.slot && g.userData.card)
            bridge.show(g.userData.card, g.userData.slot);
          else bridge.hide();
        }
      });
      renderer.domElement.addEventListener("pointerup", (e) => {
        dragStart = null;
        if (handDrag && handDrag.active) dropHandCard(e);
        handDrag = null;
      });
      // 指针离开画布/被系统手势打断（触屏滚动等）：清理拖拽与悬停态，避免状态残留
      const clearPointerState = () => {
        dragStart = null;
        downPos = null;
        if (handDrag) {
          if (handDrag.active) {
            handDrag.mesh.userData.hover = false;
            sync3D(); // 拖拽被打断：卡弹回手牌位
            setZoneHighlight3D(null);
          }
          handDrag = null;
        }
        if (hoveredMesh) {
          hoveredMesh.userData.hover = false;
          hoveredMesh = null;
        }
        const bridge = S.previewBridge;
        if (bridge) bridge.hide();
        hot(500);
      };
      renderer.domElement.addEventListener("pointercancel", clearPointerState);
      renderer.domElement.addEventListener("pointerleave", clearPointerState);
      // 滚轮缩放（沿机位视线拉远/拉近）；双击空白复位视角与缩放
      renderer.domElement.addEventListener(
        "wheel",
        (e) => {
          e.preventDefault();
          camZoom = THREE.MathUtils.clamp(camZoom + e.deltaY * 0.0012, 0.72, 1.45);
          transitionCamera();
        },
        { passive: false },
      );
      renderer.domElement.addEventListener("dblclick", (e) => {
        if (!pick(e)) resetCamera();
      });
      /* 机位切换按钮组（右下角悬浮，激活态高亮） */
      const VIEW_LABELS = {
        standard: "◉ 标准",
        low: "⚔ 对峙",
        me: "▣ 我方",
        ai: "▣ 对方",
      };
      const viewSwitch = document.createElement("div");
      viewSwitch.className = "view-switch";
      for (const name of Object.keys(VIEWS)) {
        const b = document.createElement("button");
        b.type = "button";
        b.title = VIEW_LABELS[name];
        b.textContent = VIEW_LABELS[name];
        b.dataset.view = name;
        b.onclick = () => setView(name);
        viewSwitch.appendChild(b);
      }
      function refreshViewSwitch() {
        viewSwitch.querySelectorAll("button").forEach((b) =>
          b.classList.toggle("on", b.dataset.view === curView),
        );
      }
      stage.appendChild(viewSwitch);
      refreshViewSwitch();
      // 统一用 click 事件处理拾取（pointer/mouse 派发均兼容）
      /* ===================== 渲染循环 ===================== */
      let viewW = 1,
        viewH = 1; // 缓存画布尺寸，投影循环不再每帧 getBoundingClientRect
      let __hotUntil = 0; // 持续渲染截止时刻：动画/交互期间不断续期；过期且卡牌全部落位后停止渲染（省电）
      const IDLE_GRACE = 1600;
      function resize() {
        window.__resizeCount = (window.__resizeCount || 0) + 1;
        hot(200);
        const w = stage.clientWidth,
          h = stage.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        applyGoal(); // aspect 变化后按预设机位重算 fov/位置（竖屏自动拉远，桌宽含堆位不出画）
        viewW = w;
        viewH = h;
      }
      window.addEventListener("resize", resize);
      new ResizeObserver(resize).observe(stage);
      resize();
      requestAnimationFrame(resize); // 布局稳定后再校正一次
      let __lastFrame = 0;
      function hot(ms) {
        window.__hotCount = (window.__hotCount || 0) + 1;
        __hotUntil = Math.max(__hotUntil, performance.now() + (ms || IDLE_GRACE));
      }
      function __anyUnsettled() {
        for (const g of cardMeshes.values()) {
          const u = g.userData;
          if (u.dying || u.busy) return true;
          if (u.targetPos && g.position.distanceToSquared(u.targetPos) > 1e-4) return true;
          // hover 中的手牌目标缩放会被临时放大（与渲染循环保持一致），需等它落定
          let ts = u.targetScale;
          if (u.hover && u.slot && u.slot.kind === "hand") ts = ts * HAND_HOVER_SCALE;
          if (Math.abs(g.scale.x - ts) > 1e-3) return true;
        }
        return false;
      }
      function renderLoop() {
        __lastFrame = performance.now();
        // 空闲早退：无动画、无交互且卡牌全部落位时跳过场景更新与渲染（最后一帧保留在画布上）
        // （放置格脉冲/攻击目标呼吸等常驻特效期间不早退）
        const modeFx = zoneGlowActive || S.mode === "attack";
        if (performance.now() > __hotUntil && !tween3DMap.size && !__anyUnsettled() && !modeFx)
          return;
        window.__renderCount = (window.__renderCount || 0) + 1; // 实际渲染计数（调试/性能排查用）
        camera.updateMatrixWorld(true);
        // 平滑趋近目标位（tween3D 接管中的卡跳过，避免阻尼覆盖动画）
        for (const g of cardMeshes.values()) {
          if (g.userData.dying || g.userData.busy) continue;
          const tp = g.userData.targetPos;
          g.position.lerp(tp, 0.22);
          if (g.userData.hover && !g.userData.dying) g.position.y = tp.y + 0.18;
          // 选中态（攻击者/祭品已选）抬升，强化视觉反馈
          const slotInfo = g.userData.slot;
          const liftedSel =
            (S.mode === "attack" &&
              slotInfo &&
              slotInfo.who === "me" &&
              slotInfo.kind === "monster" &&
              slotInfo.idx === S.attackZone) ||
            (S.mode === "tribute" &&
              slotInfo &&
              slotInfo.who === "me" &&
              slotInfo.kind === "monster" &&
              S.tributePool.includes(slotInfo.idx));
          if (liftedSel) g.position.y = tp.y + 0.3;
          // 常驻魔陷关联怪兽：轻微抬升
          else if (g.userData.card && linkedUids.has(g.userData.card.uid))
            g.position.y = tp.y + 0.12;
          // 手牌/场上缩放趋近（hover 手牌临时放大，便于读卡）
          const slot = g.userData.slot;
          let ts = g.userData.targetScale;
          if (g.userData.hover && slot && slot.kind === "hand")
            ts = ts * HAND_HOVER_SCALE;
          g.scale.x += (ts - g.scale.x) * 0.22;
          g.scale.y += (ts - g.scale.y) * 0.22;
          g.scale.z += (ts - g.scale.z) * 0.22;
          const damp = 0.25;
          // 手牌：水平方向始终朝向镜头（消除透视偏转），并保持后仰角
          if (slot && slot.kind === "hand") {
            const dir = new THREE.Vector3().subVectors(
              camera.position,
              g.position,
            );
            const ry =
              Math.atan2(dir.x, dir.z) + (slot.who === "ai" ? Math.PI : 0);
            g.rotation.y += (ry - g.rotation.y) * damp;
            g.rotation.x += (HAND_PITCH - g.rotation.x) * damp;
            g.rotation.z += (0 - g.rotation.z) * damp;
            continue;
          }
          const tr = g.userData.targetRot;
          g.rotation.z += (tr.z - g.rotation.z) * damp;
          g.rotation.x += (tr.x - g.rotation.x) * damp;
          g.rotation.y += (tr.y - g.rotation.y) * damp;
        }
        // 放置模式/拖拽中：可用格绿色脉冲呼吸（磁吸格常亮提示落点）
        if (zoneGlowActive) {
          const k = 0.5 + 0.5 * Math.sin(performance.now() * 0.004);
          for (const [key, m] of zoneGlows)
            if (m.visible)
              m.material.opacity =
                handDrag && handDrag.magnetKey === key ? 1 : 0.55 + 0.45 * k;
        }
        // 攻击模式：可选目标（对方怪兽）红色明暗呼吸，比静态染色更醒目
        if (S.mode === "attack") {
          const k = 0.5 + 0.5 * Math.sin(performance.now() * 0.005);
          for (const [, g] of cardMeshes) {
            const sl = g.userData.slot;
            if (sl && sl.who === "ai" && sl.kind === "monster" && g.userData.frontMat)
              g.userData.frontMat.color.setRGB(1, 0.42 + 0.22 * k, 0.36 + 0.2 * k);
          }
        }
        // 堆标签投影（取整定位，避免亚像素抖动；文案仅变化时更新）
        for (const [key, g] of pileMeshes) {
          const tag = pileTags.get(key);
          if (!tag) continue;
          const v = g.position.clone().project(camera);
          tag.style.left = Math.round((v.x * 0.5 + 0.5) * viewW) + "px";
          tag.style.top = Math.round((-v.y * 0.5 + 0.5) * viewH + 26) + "px";
          const txt =
            ({ deck: "卡组", grave: "墓地", extra: "额外", banished: "除外" }[
              key.split(":")[0]
            ] || "") +
            " " +
            g.userData.count;
          if (tag.textContent !== txt) tag.textContent = txt;
          tag.style.display = g.userData.count > 0 ? "" : "none";
        }
        // 卡牌引导 chip 投影（跟随对应卡牌，取整定位）
        for (const [key, el] of chipEls) {
          const uid = key.split(":")[0];
          const g = cardMeshes.get(uid);
          if (!g) {
            el.remove();
            chipEls.delete(key);
            continue;
          }
          const v = g.position.clone().project(camera);
          el.style.left = Math.round((v.x * 0.5 + 0.5) * viewW) + "px";
          el.style.top = Math.round((-v.y * 0.5 + 0.5) * viewH - 40) + "px";
        }
        // 星尘缓慢漂移与明暗呼吸
        const tNow = performance.now() / 1000;
        stars.rotation.y = tNow * 0.006;
        stars.material.opacity = 0.72 + Math.sin(tNow * 0.7) * 0.13;
        // 合法放置区高亮呼吸
        if (zoneGlowActive) {
          const o = 0.68 + Math.sin(tNow * 4.2) * 0.26;
          for (const [, m] of zoneGlows)
            if (m.visible) m.material.opacity = o;
        }
        // 悬停光环：贴桌发光框，跟随指针下场上卡牌的落脚点
        const hvSlot = hoveredMesh && hoveredMesh.userData.slot;
        if (hoveredMesh && hvSlot && hvSlot.kind !== "hand") {
          hoverRing.visible = true;
          hoverRing.position.set(hoveredMesh.position.x, 0.05, hoveredMesh.position.z);
          hoverRing.scale.setScalar(hoveredMesh.scale.x / FIELD_SCALE);
        } else hoverRing.visible = false;
        renderer.render(scene, camera);
      }
      /* 渲染驱动（两路互不污染，杜绝回调累积）：
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
      // Worker 的定时器不受页面可见性节流；可见时 rAF 满帧、本兜底因 __lastFrame 新鲜而空转。
      try {
        const tickWorker = new Worker(
          URL.createObjectURL(new Blob(["setInterval(()=>postMessage(0),25)"], { type: "text/javascript" })),
        );
        tickWorker.onmessage = () => {
          const now = performance.now();
          // 巡检：超时未完成的 tween 强制收尾（rAF 冻结时 anime 停摆，onComplete 不会来）
          for (const entry of [...tween3DMap.values()])
            if (!entry.done && now - entry.started > entry.dur + 2000) entry.cancel();
          if (now - __lastFrame > 30) renderLoop();
        };
      } catch (e) {
        // Worker 不可用的环境退回普通定时器（会被可见性节流，但聊胜于无）
        setInterval(() => {
          if (performance.now() - __lastFrame > 180) renderLoop();
        }, 60);
      }
      function shakeBoard() {
        animate($("board"), {
          x: [0, -7, 6, -5, 4, -2, 0],
          duration: 380,
          ease: "linear",
        });
      }
      function projectCard3D(uid) {
        const g = cardMeshes.get(uid);
        if (!g) return null;
        const v = g.position.clone().project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return {
          x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
          y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
        };
      }
      function fxGlow3D(card, color) {
        const p = projectCard3D(card.uid);
        if (!p) return;
        fxEl(`<div class="fx-burst-txt">${IC.spark}</div>`, p.x, p.y - 40, "fx-burst");
      }
      function fxAttack3D(attacker, target) {
        const ag = cardMeshes.get(attacker.uid);
        if (!ag) return;
        const fromPos = ag.position.clone();
        const tg = target ? cardMeshes.get(target.uid) : null;
        // 突进方向按攻击者归属取符号：me 朝 -z（AI 半场）、ai 朝 +z（玩家半场）
        const toward = attacker.controller === "ai" ? 1 : -1;
        const toPos = tg
          ? tg.position.clone().add(new THREE.Vector3(0, 0, -toward * 0.55)) // 停在目标靠攻击方一侧
          : fromPos.clone().add(new THREE.Vector3(0, 0.4, toward * 2.2)); // 直接攻击：冲向对方半场
        sfx("attack");
        // 1) 突进（贝塞尔急冲）→ 2) 命中：冲击波 + 闪光 + 目标受击后退 → 3) 弹性回弹
        tween3D(ag, { pos: toPos }, 150, "attack", () => {
          shockwave3D(tg ? tg.position.clone() : toPos);
          burst3D(toPos, "#e6b24a", 10);
          if (tg) {
            flashMesh3D(tg);
            const base = tg.position.clone();
            const nudge = base.clone().add(new THREE.Vector3(0, 0, toward * 0.22)); // 被撞向远离攻击者的方向退
            tween3D(tg, { pos: nudge }, 90, "easeIn", () => {
              tween3D(tg, { pos: base }, 240, "easeOut", null);
            });
          }
          shakeBoard();
          tween3D(ag, { pos: fromPos }, 420, "recoil", null);
        });
      }
      function fxImpact3D(ev) {
        const dmg = ev.damage || 0;
        // ev.damageTo 是受击方归属（"me"/"ai"）：受击的是该方场上的卡——
        // target.controller 一致取目标卡，否则是攻击者被反伤
        const posCard = ev.direct
          ? null
          : ev.target && ev.target.controller === ev.damageTo
            ? ev.target
            : ev.attacker;
        let p = posCard ? projectCard3D(posCard.uid) : null;
        // 受击卡不在场上（直接攻击等）：定位到受击方 3D LP 屏
        if (!p) p = projectLp3D(ev.damageTo || "ai");
        if (ev.direct)
          fxEl(
            `<div class="fx-burst-txt">直接攻击！</div>`,
            p.x,
            p.y - 54,
            "fx-burst",
          );
        else {
          // 受伤方若正是攻击怪兽的控制者，则为攻守差回弹的反伤
          const side = S.duel && S.duel.state && S.duel.state[ev.damageTo];
          const rebound = !!(side && ev.attacker && side.monsterZone.some((m) => m && m.uid === ev.attacker.uid));
          fxEl(
            `<div class="fx-burst-txt">${rebound ? "反伤" : "命中"}</div>`,
            p.x,
            p.y - 30,
            "fx-burst",
          );
        }
        if (dmg > 0)
          fxEl(`<b class="fx-dmg-txt">−${dmg}</b>`, p.x, p.y - 58, "fx-dmg");
        shakeBoard();
        sfx("damage");
      }
      function fxBurst3D(card, color) {
        const g = cardMeshes.get(card.uid);
        if (!g) return;
        shatter3D(g, color || "#ffd24a"); // 碎裂飞散
        burst3D(g.position.clone(), color || "#ffd24a", 12); // 碎屑
        sfx("destroy");
      }
      /* 召唤 3D 特效：光柱 + 上升粒子 + 场景光脉冲。
         临时特效对象登记进 fxTemp，用后即焚；resetScene3D 兜底清理防跨局残留。 */
      const fxTemp = new Set();
      function disposeFxTemp() {
        for (const o of fxTemp) {
          scene.remove(o);
          if (o.geometry) o.geometry.dispose();
          if (o.material) o.material.dispose();
        }
        fxTemp.clear();
      }
      function fxSummonBeam(card) {
        const g = cardMeshes.get(card.uid);
        if (!g) return;
        const p = g.userData.targetPos || g.position;
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.78, 4.6, 18, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0xe9be69,
            transparent: true,
            opacity: 0.4,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
            depthWrite: false,
          }),
        );
        beam.position.set(p.x, 2.1, p.z);
        const N = 26;
        const pos = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
          const a = (i / N) * Math.PI * 2;
          const r = 0.28 + (i % 3) * 0.17;
          pos[i * 3] = p.x + Math.cos(a) * r;
          pos[i * 3 + 1] = 0.15 + (i % 5) * 0.24;
          pos[i * 3 + 2] = p.z + Math.sin(a) * r;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        const pts = new THREE.Points(
          geo,
          new THREE.PointsMaterial({
            color: 0xffe2a0,
            size: 0.09,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
          }),
        );
        pts.position.set(0, 0, 0);
        scene.add(beam);
        scene.add(pts);
        fxTemp.add(beam).add(pts);
        animate(beam.material, { opacity: [0.42, 0], duration: 640, ease: "outQuad" });
        animate(beam.scale, { y: [0.4, 1.25], duration: 640, ease: "outCubic" });
        animate(pts.material, { opacity: [0.9, 0], duration: 780, ease: "outQuad" });
        animate(pts.position, {
          y: [0, 1.5],
          duration: 780,
          ease: "outCubic",
          onComplete: () => {
            scene.remove(beam);
            scene.remove(pts);
            beam.geometry.dispose();
            beam.material.dispose();
            geo.dispose();
            pts.material.dispose();
            fxTemp.delete(beam);
            fxTemp.delete(pts);
          },
        });
        // 场景光脉冲：主光短暂提亮，强化"召唤瞬间"
        animate(keyLight, { intensity: [2.3, 1.6], duration: 560, ease: "outQuad" });
      }
      function fxSummon3D(card) {
        fxGlow3D(card, "#e6b24a");
        fxSummonBeam(card);
        sfx("summon");
      }
      function fxPause(ms) {
        return new Promise((r) => setTimeout(r, ms));
      }

      let clickHandler = null;
      function setClickHandler(fn) {
        clickHandler = fn;
      }
      // 统一用 click 事件处理拾取（pointer/mouse 派发均兼容）；具体路由由 main 注入（解耦 hud）
      renderer.domElement.addEventListener("click", (e) => {
        const moved = downPos
          ? Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y)
          : 0;
        if (moved > CLICK_SLOP) return;
        const g = pick(e);
        if (clickHandler) clickHandler(g);
      });

      /* 重开局清理：清空 3D 场景并释放 GPU 资源（几何体/材质/纹理），避免显存累积 */
      function resetScene3D() {
        setZoneHighlight3D(null);
        disposeFxTemp(); // 召唤光柱等临时特效兜底清理
        for (const [, g] of cardMeshes) {
          scene.remove(g);
          disposeCardGroup(g);
        }
        cardMeshes.clear();
        for (const t of texCache.values()) t.dispose();
        texCache.clear();
        for (const t of artCache.values()) if (t) t.dispose();
        artCache.clear();
        artImg.clear();
      }
      /* 3D 卡牌 -> 屏幕坐标（菜单定位/特效落点用） */
      function projectMesh(mesh) {
        const v = mesh.position.clone().project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return {
          x: (v.x * 0.5 + 0.5) * rect.width + rect.left,
          y: (-v.y * 0.5 + 0.5) * rect.height + rect.top,
        };
      }

export function debugPick(x, y) { return pick({ clientX: x, clientY: y }); }
export { sync3D, resetScene3D, setClickHandler, projectMesh, projectCard3D, projectLp3D, fxGlow3D, fxSummon3D, fxAttack3D, fxImpact3D, fxBurst3D, tween3D, shakeBoard, cardMeshes, chipEls, artUrl, setZoneHighlight3D };
