<script setup>
// 商店：药水与材料（装备只能打，经典味）
import { computed } from "vue";
import { useGame } from "../../store.js";
import { ITEMS } from "../../data/items.mjs";

const { state, actions } = useGame();
const GOODS = ["potion_hp", "potion_mp", "mat_heiiron", "mat_xiuwei", "mat_qiege", "mat_yumao", "mat_gongxun", "mat_jingmai"];

const goods = computed(() => GOODS.map((id) => ITEMS[id]).filter(Boolean));
</script>

<template>
  <div class="shop">
    <div class="wallet">💰 {{ Math.floor(state.snap.gold).toLocaleString() }}　💎 {{ state.snap.ingot }}</div>
    <div class="list">
      <div v-for="g in goods" :key="g.id" class="good panel">
        <span class="g-icon">{{ g.icon }}</span>
        <div class="g-mid">
          <div class="g-name">{{ g.name }}</div>
          <div class="g-desc">{{ g.desc || "恢复类药水" }}</div>
          <div class="g-have">持有 {{ (state.snap.bag || []).filter((b) => b.tpl === g.id).reduce((a, b) => a + b.qty, 0) }}</div>
        </div>
        <div class="g-btns">
          <button class="btn" :disabled="state.snap.gold < g.price" @click="actions.buyItem(g.id, 1)">💰{{ g.price }}</button>
          <button class="btn" :disabled="state.snap.gold < g.price * 10" @click="actions.buyItem(g.id, 10)">×10</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.shop { display: flex; flex-direction: column; gap: 8px; }
.wallet { font-size: 13px; color: var(--gold); }
.list { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 8px; }
.good { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border: 1px solid var(--line); }
.g-icon { font-size: 24px; }
.g-mid { flex: 1; }
.g-name { font-size: 13px; color: var(--text); }
.g-desc { font-size: 10px; color: var(--text-dim); }
.g-have { font-size: 10px; color: var(--text-dim); }
.g-btns { display: flex; flex-direction: column; gap: 4px; }
.g-btns .btn { min-height: 32px; padding: 0 10px; font-size: 11px; }
</style>
