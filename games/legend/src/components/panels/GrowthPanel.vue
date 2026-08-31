<script setup>
// 养成大厅：所有养成线卡片（等级/消耗/属性/祝福值/升级按钮）
//  当前：转生、切割之刃；M4/M5 新养成线在 registry 登记后自动出现
import { useGame } from "../../store.js";

const { state, actions } = useGame();
const STAT_NAMES = {
  atkPct: "攻击%", hpPct: "生命%", defPct: "防御%", mdefPct: "魔防%", cutPct: "切割%", atk: "攻击", hp: "生命"
};
</script>

<template>
  <div class="growth">
    <div v-for="t in state.snap.tracks" :key="t.id" class="track panel" :class="{ locked: !t.unlock }">
      <div class="t-head">
        <span class="t-icon">{{ t.icon }}</span>
        <span class="t-name">{{ t.name }}</span>
        <span class="t-lv">{{ t.level }}<i>/{{ t.maxLevel }}</i> 阶</span>
      </div>
      <div class="t-desc">{{ t.unlock ? t.desc : t.unlockDesc }}</div>
      <div class="t-stats" v-if="t.unlock">
        下一阶：<template v-for="(v, k) in t.stats" :key="k">{{ STAT_NAMES[k] || k }}+{{ v }} </template>
      </div>
      <div v-if="t.blessingMax > 0" class="t-bless">
        祝福 {{ t.blessing }}/{{ t.blessingMax }}（满必成，成功率 {{ Math.round(t.rate * 100) }}%）
      </div>
      <div class="t-cost" v-if="t.cost && t.unlock">
        <span v-if="t.cost.gold">💰{{ t.cost.gold.toLocaleString() }}</span>
        <span v-if="t.cost.ingot">💎{{ t.cost.ingot }}</span>
        <span v-for="(n, m) in t.cost.mats || {}" :key="m">📦{{ n }}</span>
      </div>
      <button class="btn up" :disabled="!t.unlock || t.level >= t.maxLevel" @click="actions.upgradeTrack(t.id)">
        {{ !t.unlock ? "未解锁" : t.level >= t.maxLevel ? "已满阶" : "升级" }}
      </button>
    </div>
    <div class="hint">更多养成线（羽翼/官爵/经脉/坐骑/圣装/五行/魂环…）随版本逐步开放</div>
  </div>
</template>

<style scoped>
.growth { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 10px; }
.track { padding: 10px 12px; display: flex; flex-direction: column; gap: 5px; border: 1px solid var(--line); }
.track.locked { opacity: 0.55; }
.t-head { display: flex; align-items: baseline; gap: 6px; }
.t-icon { font-size: 18px; }
.t-name { color: var(--gold); font-weight: 700; font-size: 14px; }
.t-lv { margin-left: auto; font-size: 13px; }
.t-lv i { font-style: normal; color: var(--text-dim); font-size: 11px; }
.t-desc { font-size: 11px; color: var(--text-dim); }
.t-stats { font-size: 11px; color: var(--text); }
.t-bless { font-size: 11px; color: #4f8ad9; }
.t-cost { display: flex; gap: 8px; font-size: 11px; color: var(--gold); flex-wrap: wrap; }
.up { min-height: 38px; margin-top: 2px; font-size: 13px; }
.hint { grid-column: 1 / -1; font-size: 11px; color: var(--text-dim); text-align: center; padding: 6px 0; }
</style>
