<script setup>
// 大陆与地图：解锁链 + 各大陆地图切换
import { computed } from "vue";
import { useGame } from "../../store.js";
import { CONTINENTS } from "../../data/continents.mjs";
import { mapsOfContinent } from "../../data/monsters.mjs";

const { state, actions } = useGame();

const list = computed(() => {
  const unlocked = state.snap.unlocked || [];
  const rebirth = state.snap.rebirth || 0;
  return CONTINENTS.map((c) => {
    const isUnlocked = unlocked.includes(c.id);
    const canUnlock = !isUnlocked && state.snap.level >= c.unlock.level && rebirth >= c.unlock.rebirth
      && c.id === Math.max(...unlocked) + 1;
    return { c, isUnlocked, canUnlock, maps: isUnlocked ? mapsOfContinent(c.id) : [] };
  });
});
</script>

<template>
  <div class="maps">
    <div v-for="row in list" :key="row.c.id" class="cont panel" :class="{ locked: !row.isUnlocked && !row.canUnlock }">
      <div class="c-head">
        <span class="c-name">{{ row.c.id }}. {{ row.c.name }}</span>
        <span v-if="row.isUnlocked" class="c-ok">已解锁</span>
        <button v-else-if="row.canUnlock" class="btn unlock" @click="actions.unlockContinent()">前往解锁</button>
        <span v-else class="c-need">需 Lv.{{ row.c.unlock.level }} + 转{{ row.c.unlock.rebirth }}</span>
      </div>
      <div class="c-desc">{{ row.c.desc }}</div>
      <div class="c-maps" v-if="row.maps.length">
        <button v-for="m in row.maps" :key="m.id" class="map-btn" :class="{ cur: m.id === state.snap.map }"
                :disabled="state.snap.level < m.lvlReq" @click="actions.switchMap(m.id)">
          {{ m.name }}<i>Lv.{{ m.lvlReq }}{{ m.boss ? " 👹" : "" }}</i>
          <b v-if="m.id === state.snap.map">当前</b>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.maps { display: flex; flex-direction: column; gap: 8px; }
.cont { padding: 8px 12px; border: 1px solid var(--line); }
.cont.locked { opacity: 0.5; }
.c-head { display: flex; align-items: center; gap: 8px; }
.c-name { color: var(--gold); font-weight: 700; font-size: 14px; }
.c-ok { font-size: 11px; color: var(--good); }
.c-need { font-size: 11px; color: var(--text-dim); }
.c-desc { font-size: 11px; color: var(--text-dim); margin: 2px 0 6px; }
.unlock { min-height: 32px; font-size: 12px; }
.c-maps { display: flex; gap: 8px; flex-wrap: wrap; }
.map-btn {
  min-height: 40px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.35);
  color: var(--text);
  font-size: 13px;
}
.map-btn.cur { border-color: var(--gold); color: var(--gold); background: rgba(217, 164, 65, 0.1); }
.map-btn:disabled { opacity: 0.45; }
.map-btn i { font-style: normal; font-size: 10px; color: var(--text-dim); margin-left: 5px; }
.map-btn b { font-size: 10px; color: var(--good); margin-left: 5px; }
</style>
