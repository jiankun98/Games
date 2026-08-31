<script setup>
// 游戏主界面：Canvas 挂机场景 + 横屏 HUD + 面板路由 + 离线收益弹窗
import { computed } from "vue";
import { useGame } from "../store.js";
import BattleCanvas from "./BattleCanvas.vue";
import PanelSheet from "./panels/PanelSheet.vue";
import BagPanel from "./panels/BagPanel.vue";
import EquipPanel from "./panels/EquipPanel.vue";
import GrowthPanel from "./panels/GrowthPanel.vue";
import MapPanel from "./panels/MapPanel.vue";
import RankPanel from "./panels/RankPanel.vue";
import ShopPanel from "./panels/ShopPanel.vue";
import { ITEMS } from "../data/items.mjs";

const { state, actions } = useGame();
const s = computed(() => state.snap || {});

const railItems = [
  { id: "bag", icon: "🎒", label: "背包" },
  { id: "equip", icon: "🛡️", label: "装备" },
  { id: "growth", icon: "✨", label: "养成" },
  { id: "map", icon: "🗺️", label: "大陆" },
  { id: "shop", icon: "🏪", label: "商店" },
  { id: "rank", icon: "🏆", label: "排行" }
];
const panelTitles = { bag: "背包", equip: "装备栏", growth: "养成大厅", map: "大陆 · 地图", shop: "杂货商店", rank: "排行榜" };

const battle = computed(() => s.value.battle || { player: {}, mons: [], skills: [] });
const hpPct = computed(() => battle.value.player.hpMax ? battle.value.player.hp / battle.value.player.hpMax : 1);
const mpPct = computed(() => battle.value.player.mpMax ? battle.value.player.mp / battle.value.player.mpMax : 1);

const potions = computed(() => ({
  hp: (s.value.bag || []).filter((b) => b.tpl === "potion_hp").reduce((a, b) => a + b.qty, 0),
  mp: (s.value.bag || []).filter((b) => b.tpl === "potion_mp").reduce((a, b) => a + b.qty, 0)
}));

const offItems = computed(() => {
  const off = state.offline;
  if (!off || !off.items) return [];
  return Object.entries(off.items).map(([key, qty]) => {
    const [tpl, q] = key.split(":");
    return { name: (ITEMS[tpl] || {}).name || tpl, qty, q: Number(q) };
  });
});
</script>

<template>
  <div class="view game-view" v-if="state.snap">
    <BattleCanvas />

    <!-- 左上：角色状态 -->
    <div class="hud-top-left">
      <div class="who">
        <span class="name">{{ s.name }}</span>
        <span class="lv">Lv.{{ s.level }}</span>
        <span v-if="s.rebirth" class="rb">转{{ s.rebirth }}</span>
      </div>
      <div class="bar hp"><i :style="{ width: hpPct * 100 + '%' }"></i></div>
      <div class="bar mp"><i :style="{ width: mpPct * 100 + '%' }"></i>
        <span class="bar-expr">经验 {{ s.expPct }}%</span>
      </div>
    </div>

    <!-- 右上：战力/资源/账号 -->
    <div class="hud-top-right">
      <div class="power">⚔ 战力 {{ s.power ? s.power.toLocaleString() : 0 }}</div>
      <div class="res">💰{{ Math.floor(s.gold).toLocaleString() }}　💎{{ s.ingot }}</div>
      <div class="user-row">
        <span class="username">{{ state.username }}</span>
        <button class="mini" :class="{ saving: state.saving }" @click="actions.saveNow()">☁ {{ state.saving ? "…" : "存档" }}</button>
        <button class="mini danger" @click="actions.logout()">退出</button>
      </div>
    </div>

    <!-- 左缘：功能栏 -->
    <div class="hud-rail">
      <div v-for="r in railItems" :key="r.id" class="rail-btn" :class="{ on: state.panel === r.id }" @click="actions.openPanel(r.id)">
        {{ r.icon }}<span>{{ r.label }}</span>
      </div>
    </div>

    <!-- 右下：技能轮（CD 环）+ 药水 -->
    <div class="skill-wheel">
      <div class="potion-col">
        <button class="skill-btn pot" @click="actions.usePotion('potion_hp')">🧴<i class="cnt">{{ potions.hp }}</i></button>
        <button class="skill-btn pot" @click="actions.usePotion('potion_mp')">🧪<i class="cnt">{{ potions.mp }}</i></button>
      </div>
      <div v-for="sk in battle.skills" :key="sk.id" class="skill-btn" :title="sk.name">
        {{ sk.icon }}
        <i v-if="sk.cdLeft > 0.2" class="cd" :style="{ height: (sk.cdLeft / (sk.cd || 1)) * 100 + '%' }"></i>
      </div>
      <div class="skill-btn big auto">⚔️<span class="auto-t">自动</span></div>
    </div>

    <!-- 面板 -->
    <PanelSheet v-if="state.panel" :title="panelTitles[state.panel]" @close="actions.closePanel()">
      <BagPanel v-if="state.panel === 'bag'" />
      <EquipPanel v-else-if="state.panel === 'equip'" />
      <GrowthPanel v-else-if="state.panel === 'growth'" />
      <MapPanel v-else-if="state.panel === 'map'" />
      <ShopPanel v-else-if="state.panel === 'shop'" />
      <RankPanel v-else-if="state.panel === 'rank'" />
    </PanelSheet>

    <!-- 离线收益 -->
    <div v-if="state.offline" class="sheet" @click.self="actions.closeOffline()">
      <div class="off-panel panel">
        <h3>🌙 离线收益（{{ Math.round(state.offline.seconds / 3600) }} 小时）</h3>
        <template v-if="state.offline.stuck">
          <p class="off-stuck">当前地图怪物过于强大，挂机无法产出。<br>请提升战力或回到低级地图。</p>
        </template>
        <template v-else>
          <p class="off-line">击杀 <b>{{ state.offline.kills.toLocaleString() }}</b> 只　经验 <b>+{{ state.offline.exp.toLocaleString() }}</b>　金币 <b>+{{ state.offline.gold.toLocaleString() }}</b></p>
          <div class="off-items">
            <span v-for="(it, i) in offItems.slice(0, 12)" :key="i" class="off-item">{{ it.name }}×{{ it.qty }}</span>
          </div>
        </template>
        <button class="btn primary" @click="actions.closeOffline()">收下</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-view { padding: 0; }
.who { display: flex; align-items: baseline; gap: 6px; margin-bottom: 5px; }
.who .name { color: var(--gold); font-size: 15px; font-weight: 700; }
.who .lv { font-size: 12px; color: var(--text); }
.who .rb { font-size: 10px; color: #4f8ad9; border: 1px solid #4f8ad9; border-radius: 4px; padding: 0 3px; }
.bar { width: 170px; height: 10px; border-radius: 5px; background: rgba(0, 0, 0, 0.55); border: 1px solid rgba(255, 255, 255, 0.12); margin-bottom: 4px; position: relative; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 4px; transition: width 0.3s; }
.bar.hp i { background: linear-gradient(90deg, #a52a1e, #d9534f); }
.bar.mp i { background: linear-gradient(90deg, #1e5aa5, #4f8ad9); }
.bar-expr { position: absolute; right: 4px; top: -2px; font-size: 9px; color: rgba(255, 255, 255, 0.7); line-height: 14px; }

.power { color: var(--gold); font-size: 15px; font-weight: 700; }
.res { font-size: 12px; color: var(--text); margin-top: 2px; }
.user-row { display: flex; gap: 6px; align-items: center; margin-top: 5px; justify-content: flex-end; }
.username { font-size: 11px; color: var(--text-dim); }
.mini {
  min-height: 30px; padding: 0 10px; font-size: 11px;
  border: 1px solid var(--line); border-radius: 6px;
  background: rgba(0, 0, 0, 0.4); color: var(--text-dim);
}
.mini.saving { color: var(--gold); }
.mini.danger { color: #e0836f; border-color: #8c3a30; }

.hud-rail .rail-btn.on { border-color: var(--gold); background: rgba(217, 164, 65, 0.12); }

.potion-col { display: flex; flex-direction: column; gap: 10px; }
.skill-btn { overflow: hidden; }
.skill-btn .cd { position: absolute; left: 0; bottom: 0; width: 100%; background: rgba(0, 0, 0, 0.68); height: 0; transition: height 0.9s linear; }
.skill-btn.pot { position: relative; }
.skill-btn .cnt { position: absolute; right: 2px; bottom: 2px; font-style: normal; font-size: 9px; color: #fff; }
.skill-btn .auto-t { position: absolute; font-size: 9px; color: var(--gold); bottom: 8px; }

.off-panel {
  width: min(460px, 92vw);
  padding: 18px 22px;
  display: flex; flex-direction: column; gap: 12px; align-items: center; text-align: center;
}
.off-panel h3 { color: var(--gold); font-size: 16px; }
.off-line { font-size: 13px; }
.off-line b { color: var(--gold); }
.off-stuck { font-size: 13px; color: #e0836f; line-height: 1.7; }
.off-items { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
.off-item { font-size: 11px; color: var(--text); border: 1px solid var(--line); border-radius: 6px; padding: 3px 8px; }
</style>
