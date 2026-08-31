<script setup>
// 装备栏：8 部位 + 面板汇总
import { computed } from "vue";
import { useGame } from "../../store.js";
import { ITEMS, QUALITIES, SLOTS } from "../../data/items.mjs";

const { state, actions } = useGame();

const slots = computed(() => {
  const equips = state.snap.equips || {};
  return SLOTS.map((s) => {
    const uid = equips[s.id];
    const inst = uid ? (state.snap.bag || []).find((it) => it.uid === uid) : null;
    const tpl = inst ? ITEMS[inst.tpl] : null;
    return { s, inst, tpl, qc: inst ? QUALITIES[inst.q || 0] : null };
  });
});

const MAP = { atk: "攻击", hpMax: "生命上限", def: "防御", mdef: "魔防", hit: "命中", dodge: "闪避", crit: "暴击", critDmg: "暴伤", aspd: "攻速", cutPct: "切割%" };
const statLines = computed(() =>
  Object.entries(state.snap.stats || {})
    .filter(([k]) => MAP[k])
    .map(([k, v]) => `${MAP[k]} ${Math.round(v * 10) / 10}`)
);
</script>

<template>
  <div class="equip">
    <div class="slots">
      <div v-for="c in slots" :key="c.s.id" class="slot panel" @click="c.inst && actions.unequip(c.s.id)">
        <div class="s-icon">{{ c.inst ? c.s.icon : c.s.icon }}</div>
        <div class="s-name">{{ c.s.name }}</div>
        <div v-if="c.inst" class="s-item" :style="{ color: c.qc.color }">
          {{ c.tpl.name }}<template v-if="c.inst.enhance"> +{{ c.inst.enhance }}</template>
        </div>
        <div v-else class="s-item dim">空</div>
      </div>
    </div>
    <div class="total panel">
      <span class="t-label">总战力</span>
      <span class="t-power">⚔ {{ state.snap.power.toLocaleString() }}</span>
      <span class="t-stats">
        <span v-for="s in statLines" :key="s">{{ s }}&nbsp;&nbsp;</span>
      </span>
    </div>
  </div>
</template>

<style scoped>
.equip { display: flex; flex-direction: column; gap: 10px; }
.slots { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
.slot { padding: 8px 6px; text-align: center; border: 1px solid var(--line); }
.s-icon { font-size: 22px; }
.s-name { font-size: 11px; color: var(--text-dim); margin: 2px 0; }
.s-item { font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.s-item.dim { color: #555; }
.total { padding: 8px 12px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.t-label { font-size: 12px; color: var(--text-dim); }
.t-power { color: var(--gold); font-size: 16px; font-weight: 700; }
.t-stats { font-size: 11px; color: var(--text); }
</style>
