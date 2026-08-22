<script setup>
import { computed, ref, watch } from "vue";
import { useGame } from "../store.js";
import { fmtMoney } from "../format.js";
import EntryCard from "./EntryCard.vue";
import IndustryDetail from "./IndustryDetail.vue";
import { INDUSTRY_TYPES } from "../data.js";

const { state, actions } = useGame();
const snap = computed(() => state.snap);

const view = ref("home");        // home | detail:<uid>
const openModal = ref(false);
const newName = ref("");
const pickType = ref(INDUSTRY_TYPES[0].id);
const showGroup = ref(false);
const groupUids = ref([]);
const groupName = ref("");

const totalIncome = computed(() => snap.value.industries.reduce((a, b) => a + b.incomePerHour, 0));
const totalValue = computed(() => snap.value.industries.reduce((a, b) => a + b.value, 0));

const current = computed(() => {
  if (!view.value.startsWith("detail:")) return null;
  const uid = parseInt(view.value.slice(7), 10);
  return snap.value.industries.find((i) => i.uid === uid) || null;
});

// 公司被清算/移除后自动返回入口页（避免空白详情页）
watch(current, (v) => { if (!v && view.value.startsWith("detail:")) view.value = "home"; });

const openType = computed(() => INDUSTRY_TYPES.find((t) => t.id === pickType.value) || INDUSTRY_TYPES[0]);

const listedCompanies = computed(() => snap.value.industries.filter((i) => i.listed));
const groupable = computed(() => listedCompanies.value.filter((i) => !i.listed.groupId));

function confirmOpen() {
  const r = actions.openIndustry(pickType.value, newName.value);
  if (r.ok) { openModal.value = false; newName.value = ""; pickType.value = INDUSTRY_TYPES[0].id; }
}

function confirmGroup() {
  const uid = groupable.value[0] ? groupable.value[0].uid : null;
  if (uid == null) return;
  const r = actions.industryAction(uid, "formGroup", { uids: groupUids.value.filter((u) => u !== uid), name: groupName.value });
  if (r.ok) { showGroup.value = false; groupUids.value = []; groupName.value = ""; }
}

function toggleGroupUid(uid) {
  const i = groupUids.value.indexOf(uid);
  if (i >= 0) groupUids.value.splice(i, 1);
  else groupUids.value.push(uid);
}

// 首家上市公司自动作为发起方计入
const pickedCount = computed(() => {
  const first = groupable.value[0];
  if (!first) return 0;
  const sel = new Set(groupUids.value);
  sel.add(first.uid);
  return sel.size;
});

function subLine(ind) {
  const parts = [`${ind.ratingName} 级`];
  if (ind.typeId === "cstore") parts.push(`${ind.stores} 家门店`);
  else if (ind.typeId === "express") parts.push(`${ind.fleet.length} 台车 · 池 ${fmtMoney(ind.treasury)}`);
  else if (ind.typeId === "rental") parts.push(`${ind.fleet.length} 台车 · 池 ${fmtMoney(ind.treasury)}`);
  else if (ind.typeId === "dealer") parts.push(`库存 ${ind.lots.length} · 池 ${fmtMoney(ind.treasury)}`);
  else if (ind.typeId === "realestate") parts.push(`${ind.teams} 队${ind.projects.length ? ` · ${ind.projects.length} 在建` : ""}`);
  else if (ind.typeId === "itcorp") parts.push(`${ind.projects.length} 项目 · 池 ${fmtMoney(ind.treasury)}`);
  else if (ind.typeId === "oil") parts.push(`油田 ${ind.fields.length} · 平台 ${ind.platforms.length}`);
  else if (ind.typeId === "club") parts.push(`${ind.players.length} 名球员 · 声望 ${ind.rep}`);
  else if (ind.typeId === "bank") parts.push(`存 ${fmtMoney(ind.deposits)} · 池 ${fmtMoney(ind.treasury)}`);
  if (ind.stalled) parts.push("⛔ 停摆");
  if (ind.listed) parts.push("📈 已上市");
  parts.push(`+${fmtMoney(ind.incomePerHour)}/时`);
  return parts.join(" · ");
}
</script>

<template>
  <div v-if="snap">
    <!-- ===== 入口页 ===== -->
    <template v-if="view === 'home'">
      <div class="hero" style="background:
          radial-gradient(ellipse 90% 120% at 100% -20%, rgba(255,255,255,0.28), transparent 55%),
          linear-gradient(135deg, #6EE7B7 0%, #10B981 55%, #059669 100%);
          box-shadow: 0 10px 26px rgba(5, 150, 105, 0.3), inset 0 -3px 8px rgba(6, 78, 59, 0.2);">
        <div class="h-label">产业总资产</div>
        <div class="h-value">{{ fmtMoney(totalValue) }}</div>
        <div class="h-row">
          <span>每小时利润 <b>+{{ fmtMoney(totalIncome) }}</b></span>
          <span>公司 <b>{{ snap.industries.length }}</b> 家</span>
        </div>
      </div>

      <button class="btn primary" style="margin-bottom:18px;font-size:16px" @click="openModal = true">
        ➕ 新开公司
      </button>

      <div v-if="snap.industries.length === 0" class="empty">
        <span class="e-icon">🏪</span>
        还没有产业<br />开一家便利店，迈出第一步
      </div>

      <!-- 已有集团 -->
      <div v-for="g in snap.groups" :key="g.id" class="card" style="background:var(--card-2);margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14.5px;font-weight:800">🏢 {{ g.name }}</div>
            <div class="hint-line" style="margin:3px 0 0">
              <template v-for="(m, i) in g.members" :key="m.uid">{{ i ? ' · ' : '' }}{{ m.icon }}{{ m.name }}</template>
            </div>
          </div>
          <div style="text-align:right">
            <div style="font-size:12px;color:var(--ink-2)">集团市值</div>
            <div style="font-weight:800">{{ fmtMoney(g.mcap) }}</div>
          </div>
        </div>
        <div class="hint-line" style="margin-top:6px">协同生效：成员公司收益 +10%、成本 -10%</div>
      </div>

      <!-- 组建集团入口 -->
      <div v-if="listedCompanies.length >= 3" class="row-item" style="border-style:dashed;justify-content:center;color:#9db8ff;margin-bottom:14px" @click="showGroup = true">
        <span style="font-size:20px">🏢</span>
        <span style="font-weight:700">组建集团（需 3 家上市公司 · 享协同加成与市值溢价）</span>
      </div>

      <div class="entries">
        <EntryCard v-for="ind in snap.industries" :key="ind.uid"
          :icon="ind.icon" :color="ind.color || 'gold'"
          :name="ind.name"
          :sub="subLine(ind)"
          :badge="ind.stalled ? '⛔' : ind.ratingName"
          @click="view = 'detail:' + ind.uid" />
      </div>
    </template>

    <!-- ===== 公司详情 ===== -->
    <IndustryDetail v-else-if="current" :ind="current" @back="view = 'home'" />

    <!-- 开设弹窗 -->
    <template v-if="openModal">
      <div class="mask" @click="openModal = false"></div>
      <div class="modal-card">
        <h3>🏭 新开公司</h3>
        <div class="type-picker">
          <button v-for="t in INDUSTRY_TYPES" :key="t.id"
            class="tp-cell" :class="{ on: t.id === pickType }"
            @click="pickType = t.id">
            <span class="tp-icon">{{ t.icon }}</span>
            <span class="tp-name">{{ t.name }}</span>
            <span class="tp-cost">{{ fmtMoney(t.openCost) }}</span>
          </button>
        </div>
        <p style="margin-top:4px">{{ openType.desc }}</p>
        <input class="text-input" v-model.trim="newName" maxlength="12" placeholder="为公司取个名字（≤12字）"
          @keyup.enter="confirmOpen" />
        <div class="modal-btns">
          <button class="btn ghost" @click="openModal = false">取消</button>
          <button class="btn primary" :disabled="!newName" @click="confirmOpen">确认开设（{{ fmtMoney(openType.openCost) }}）</button>
        </div>
      </div>
    </template>

    <!-- 组建集团弹窗 -->
    <template v-if="showGroup">
      <div class="mask" @click="showGroup = false"></div>
      <div class="modal-card" style="width:min(92%,380px)">
        <h3>🏢 组建集团</h3>
        <p>勾选 3 家及以上未入团的上市公司（协同：收益 +10% / 成本 -10%，市值 ×1.2）</p>
        <div style="max-height:44dvh;overflow-y:auto;margin-bottom:10px">
          <div v-for="c in groupable" :key="c.uid" class="row-item" @click="toggleGroupUid(c.uid)">
            <div class="row-icon">{{ c.icon }}</div>
            <div class="row-main">
              <div class="row-name">{{ c.name }} <span class="tag gold">{{ c.ratingName }}</span></div>
              <div class="row-sub">市值 {{ fmtMoney(c.listed.mcap) }}</div>
            </div>
            <span class="chip" :class="{ on: groupUids.includes(c.uid) }">{{ groupUids.includes(c.uid) ? '✓ 已选' : '选择' }}</span>
          </div>
        </div>
        <input class="text-input" v-model.trim="groupName" maxlength="10" placeholder="集团名称（选填）" />
        <div class="hint-line" style="text-align:center;margin-bottom:10px">已选 {{ pickedCount }} 家（首家公司自动计入）</div>
        <button class="btn primary" :disabled="pickedCount < 3" @click="confirmGroup">确认组建</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.type-picker { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 12px 0 8px; }
.tp-cell {
  display: flex; align-items: center; gap: 8px; padding: 9px 10px;
  border-radius: 12px; border: 1.5px solid var(--line); background: var(--card);
  cursor: pointer; transition: all .15s; text-align: left;
}
.tp-cell.on { border-color: var(--gold-text); background: #FDF1DC; }
.tp-icon { font-size: 20px; }
.tp-name { font-size: 13.5px; font-weight: 800; flex: 1; }
.tp-cost { font-size: 11.5px; color: var(--ink-2); font-variant-numeric: tabular-nums; }
</style>
