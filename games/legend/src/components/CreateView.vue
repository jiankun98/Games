<script setup>
// 建角页：选职业（战/法/道）+ 起名
import { ref } from "vue";
import { useGame } from "../store.js";
import { NAME_RE } from "../data/constants.mjs";

const { state, actions } = useGame();

const CLASSES = [
  { id: "warrior", icon: "⚔️", name: "战士", desc: "近战 · 高防血厚\n烈火剑法逐个击破" },
  { id: "mage", icon: "🔮", name: "法师", desc: "远程 · 群攻爆发\n冰咆哮清扫成片怪物" },
  { id: "taoist", icon: "☯️", name: "道士", desc: "召唤 · 毒咒续航\n骷髅扛线施毒消耗" }
];
const SURNAME = ["沙", "巴", "沃", "祖", "赤", "魔", "龙", "苍", "血", "夜"];
const GIVEN = ["城战神", "法之王", "门老道", "玛勇士", "月行者", "域领主", "山猎人", "海刀客"];

const cls = ref("warrior");
const name = ref("");
const err = ref("");

function randomName() {
  name.value = SURNAME[Math.floor(Math.random() * SURNAME.length)] +
    GIVEN[Math.floor(Math.random() * GIVEN.length)];
}

async function create() {
  err.value = "";
  const n = (name.value || "").trim();
  if (!NAME_RE.test(n)) { err.value = "角色名需 2-8 位中文/字母/数字"; return; }
  await actions.createCharacter(cls.value, n);
}
</script>

<template>
  <div class="view create-view">
    <h1 class="title">选择职业 · 创建角色</h1>
    <div class="classes">
      <div v-for="c in CLASSES" :key="c.id" class="cls-card panel" :class="{ on: cls === c.id }" @click="cls = c.id">
        <div class="cls-icon">{{ c.icon }}</div>
        <div class="cls-name">{{ c.name }}</div>
        <pre class="cls-desc">{{ c.desc }}</pre>
        <div v-if="cls === c.id" class="picked">✓</div>
      </div>
    </div>
    <div class="row">
      <div class="field grow">
        <label>角色名（2-8 位中文/字母/数字）</label>
        <input v-model="name" maxlength="8" placeholder="起个响亮的名号" />
      </div>
      <button class="btn ghost" style="margin-top: 18px" @click="randomName">🎲 随机</button>
    </div>
    <div class="row2">
      <div v-if="err" class="err">{{ err }}</div>
      <button class="btn primary create-btn" :disabled="state.busy" @click="create">
        {{ state.busy ? "创建中…" : "踏入玛法大陆" }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.create-view { gap: 14px; justify-content: center; align-items: stretch; max-width: 720px; margin: 0 auto; }
.title { text-align: center; color: var(--gold); letter-spacing: 4px; font-size: 18px; }
.classes { display: flex; gap: 12px; }
.cls-card {
  flex: 1;
  position: relative;
  padding: 12px 8px;
  text-align: center;
  border: 1px solid var(--line);
  cursor: pointer;
}
.cls-card.on { border-color: var(--gold); box-shadow: 0 0 12px rgba(217, 164, 65, 0.25) inset; }
.cls-icon { font-size: 34px; }
.cls-name { color: var(--gold); font-size: 16px; font-weight: 700; margin: 4px 0; }
.cls-desc { font-size: 11px; color: var(--text-dim); line-height: 1.5; white-space: pre-wrap; font-family: inherit; }
.picked { position: absolute; top: 4px; right: 8px; color: var(--gold); }
.row { display: flex; gap: 10px; align-items: flex-start; }
.grow { flex: 1; }
.row2 { display: flex; align-items: center; justify-content: space-between; }
.err { color: var(--bad); font-size: 12px; }
.create-btn { min-width: 180px; }
</style>
