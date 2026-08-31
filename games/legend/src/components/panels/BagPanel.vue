<script setup>
// 背包：格子列表 + 点选物品详情（装备/强化/镶嵌/出售）
import { ref, computed } from "vue";
import { useGame } from "../../store.js";
import { ITEMS, QUALITIES, SLOTS } from "../../data/items.mjs";

const { state, actions } = useGame();
const selected = ref(null);

const cells = computed(() => {
  const bag = state.snap.bag || [];
  const out = bag.map((it) => {
    const tpl = ITEMS[it.tpl] || {};
    let icon = tpl.icon || "📦";
    if (tpl.type === "equip") icon = (SLOTS.find((s) => s.id === tpl.slot) || {}).icon || "🗡️";
    const equipped = Object.values(state.snap.equips || {}).includes(it.uid);
    return { it, tpl, icon, equipped, qc: QUALITIES[it.q || 0] };
  });
  // 穿戴中置顶
  return out.sort((a, b) => (b.equipped ? 1 : 0) - (a.equipped ? 1 : 0));
});

const gemsInBag = computed(() =>
  (state.snap.bag || []).filter((it) => (ITEMS[it.tpl] || {}).type === "gem")
);
const gemChoices = computed(() => {
  if (!selected.value || (selected.value.tpl.type !== "equip")) return [];
  const inst = selected.value.it;
  return gemsInBag.value.filter((g) => !(inst.gems || []).includes(g.tpl));
});

function statLine(tpl, inst) {
  const keys = ["atk", "hp", "def", "mdef", "hit", "dodge", "crit", "critDmg", "aspd"];
  const map = { atk: "攻击", hp: "生命", def: "防御", mdef: "魔防", hit: "命中", dodge: "闪避", crit: "暴击", critDmg: "暴伤", aspd: "攻速" };
  const src = tpl.type === "equip"
    ? Object.fromEntries(Object.entries(equipRealStats(tpl, inst)).map(([k, v]) => [k, Math.round(v * 10) / 10]))
    : tpl.stats || {};
  return keys.filter((k) => src[k]).map((k) => `${map[k]}+${src[k]}`).join("  ");
}
function equipRealStats(tpl, inst) {
  // 与 items.equipStats 相同口径（组件内联避免引引擎内部）
  const q = QUALITIES[inst.q || 0].mult;
  const e = Math.pow(1.08, inst.enhance || 0);
  const out = {};
  for (const [k, v] of Object.entries(tpl.stats || {})) out[k] = v * q * e;
  for (const g of inst.gems || []) {
    const gt = ITEMS[g];
    if (gt) for (const [k, v] of Object.entries(gt.stats || {})) out[k] = (out[k] || 0) + v;
  }
  return out;
}
</script>

<template>
  <div class="bag">
    <div class="grid">
      <div v-for="c in cells" :key="c.it.uid" class="cell" :class="{ sel: selected && selected.it.uid === c.it.uid }"
           :style="{ borderColor: c.tpl.type === 'equip' ? c.qc.color : 'var(--line)' }" @click="selected = c">
        <span class="ic">{{ c.icon }}</span>
        <span v-if="c.it.qty > 1" class="qty">×{{ c.it.qty }}</span>
        <span v-if="c.tpl.type === 'equip' && c.it.enhance" class="enh">+{{ c.it.enhance }}</span>
        <span v-if="c.equipped" class="eq">穿</span>
      </div>
      <div v-if="!cells.length" class="empty">背包空空如也，去挂机打宝吧</div>
    </div>

    <div v-if="selected" class="detail panel">
      <div class="d-head">
        <span class="d-name" :style="{ color: selected.tpl.type === 'equip' ? selected.qc.color : 'var(--gold)' }">
          {{ selected.tpl.name }}<template v-if="selected.tpl.type === 'equip'">（{{ selected.qc.name }}）</template>
        </span>
        <span class="d-lv" v-if="selected.tpl.lvlReq">Lv.{{ selected.tpl.lvlReq }} 起</span>
      </div>
      <div class="d-stats">{{ statLine(selected.tpl, selected.it) || selected.tpl.desc || "" }}</div>
      <div v-if="selected.tpl.type === 'equip'" class="d-gems">
        宝石：{{ (selected.it.gems || []).map((g) => (ITEMS[g] || {}).name).join("、") || "未镶嵌" }}
      </div>
      <div class="d-btns">
        <button v-if="selected.tpl.type === 'equip' && !selected.equipped" class="btn primary" @click="actions.equip(selected.it.uid)">装备</button>
        <button v-if="selected.equipped" class="btn" @click="actions.unequip(selected.tpl.slot)">卸下</button>
        <button v-if="selected.tpl.type === 'equip'" class="btn" @click="actions.enhance(selected.it.uid)">🔨 强化</button>
        <button v-if="selected.tpl.type !== 'equip'" class="btn" @click="actions.sellStack(selected.tpl.id, selected.it.qty)">出售全部</button>
        <button v-else class="btn danger" @click="actions.sellItem(selected.it.uid); selected = null">出售</button>
      </div>
      <div v-if="gemChoices.length" class="d-gemrow">
        <button v-for="g in gemChoices.slice(0, 6)" :key="g.uid" class="gem-btn" @click="actions.embedGem(selected.it.uid, g.tpl)">
          {{ (ITEMS[g.tpl] || {}).icon }}{{ (ITEMS[g.tpl] || {}).name }} ×{{ g.qty }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bag { display: flex; flex-direction: column; gap: 10px; height: 100%; }
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(52px, 1fr));
  gap: 6px;
}
.cell {
  position: relative;
  aspect-ratio: 1;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
}
.cell.sel { outline: 2px solid var(--gold); }
.qty { position: absolute; right: 3px; bottom: 1px; font-size: 10px; color: var(--text-dim); }
.enh { position: absolute; left: 3px; top: 1px; font-size: 10px; color: #6fbf5f; }
.eq { position: absolute; right: 3px; top: 1px; font-size: 9px; color: var(--gold); }
.empty { grid-column: 1 / -1; text-align: center; color: var(--text-dim); padding: 30px 0; }
.detail { padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.d-head { display: flex; justify-content: space-between; align-items: baseline; }
.d-name { font-size: 15px; font-weight: 700; }
.d-lv { font-size: 11px; color: var(--text-dim); }
.d-stats { font-size: 12px; color: var(--text); }
.d-gems { font-size: 11px; color: var(--text-dim); }
.d-btns { display: flex; gap: 8px; flex-wrap: wrap; }
.d-btns .btn { min-height: 38px; padding: 0 12px; font-size: 13px; }
.d-gemrow { display: flex; gap: 6px; flex-wrap: wrap; }
.gem-btn {
  min-height: 32px;
  padding: 0 10px;
  font-size: 11px;
  border: 1px solid var(--gold-dim);
  border-radius: 6px;
  background: rgba(217, 164, 65, 0.08);
  color: var(--gold);
}
</style>
