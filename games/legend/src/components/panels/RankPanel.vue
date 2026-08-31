<script setup>
// 排行榜：等级榜 / 战力榜（服务端 characters 索引列）
import { ref, onMounted } from "vue";
import { api } from "../../net/api.js";
import { CLASS_NAMES } from "../../data/constants.mjs";

const type = ref("power");
const rows = ref([]);
const loading = ref(false);

async function load(t) {
  type.value = t;
  loading.value = true;
  const r = await api.rank(t);
  loading.value = false;
  rows.value = r.ok ? r.rows : [];
}
onMounted(() => load("power"));

const MEDALS = ["🥇", "🥈", "🥉"];
</script>

<template>
  <div class="rank">
    <div class="tabs">
      <button class="rtab" :class="{ on: type === 'power' }" @click="load('power')">战力榜</button>
      <button class="rtab" :class="{ on: type === 'level' }" @click="load('level')">等级榜</button>
    </div>
    <div v-if="loading" class="empty">加载中…</div>
    <div v-else-if="!rows.length" class="empty">暂无上榜勇士</div>
    <div v-for="(r, i) in rows" :key="i" class="row" :class="{ me: false }">
      <span class="no">{{ MEDALS[i] || i + 1 }}</span>
      <span class="cls">{{ CLASS_NAMES[r.class] || r.class }}</span>
      <span class="name">{{ r.name }}</span>
      <span class="lv">Lv.{{ r.level }}</span>
      <span class="pw">⚔{{ r.battlePower.toLocaleString() }}</span>
      <span class="ct">{{ r.continent }}大陆</span>
    </div>
  </div>
</template>

<style scoped>
.rank { display: flex; flex-direction: column; gap: 4px; }
.tabs { display: flex; gap: 8px; margin-bottom: 6px; }
.rtab {
  min-height: 34px; padding: 0 16px;
  border: 1px solid var(--line); border-radius: 8px;
  background: transparent; color: var(--text-dim); font-size: 13px;
}
.rtab.on { color: var(--gold); border-color: var(--gold-dim); background: rgba(217, 164, 65, 0.1); }
.row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.06); font-size: 13px;
}
.no { width: 30px; text-align: center; }
.cls { color: var(--text-dim); font-size: 11px; width: 34px; }
.name { flex: 1; color: var(--text); }
.lv { color: var(--text-dim); font-size: 12px; }
.pw { color: var(--gold); font-size: 12px; width: 90px; text-align: right; }
.ct { color: var(--text-dim); font-size: 11px; width: 56px; text-align: right; }
.empty { text-align: center; color: var(--text-dim); padding: 24px 0; }
</style>
