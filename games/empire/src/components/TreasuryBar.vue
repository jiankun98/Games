<script setup>
/* 公司现金池条：余额 + 注资/分红 + 停摆警告 + 上市操作（8 家新公司通用） */
import { ref } from "vue";
import { useGame } from "../store.js";
import { fmtMoney } from "../format.js";

const props = defineProps({
  ind: { type: Object, required: true }
});
const { actions } = useGame();

const showInvest = ref(false);
const showDivest = ref(false);
const investAmt = ref("");
const divestAmt = ref("");

function doInvest() {
  const amt = Number(investAmt.value) || 0;
  if (amt <= 0) return;
  const r = actions.industryAction(props.ind.uid, "invest", { amount: amt });
  if (r.ok) { showInvest.value = false; investAmt.value = ""; }
}
function doDivest() {
  const amt = Number(divestAmt.value) || 0;
  if (amt <= 0) return;
  const r = actions.industryAction(props.ind.uid, "divest", { amount: amt });
  if (r.ok) { showDivest.value = false; divestAmt.value = ""; }
}
</script>

<template>
  <div class="card treasury" :class="{ stalled: ind.stalled }">
    <!-- 停摆警告 -->
    <div v-if="ind.stalled" class="stall-banner">⛔ 公司池亏空，已停摆（产出冻结）——注资即恢复</div>

    <div class="t-row">
      <div class="t-left">
        <div class="t-label">公司现金池</div>
        <div class="t-value" :class="{ neg: ind.treasury < 0 }">{{ fmtMoney(ind.treasury) }}</div>
      </div>
      <div class="t-right">
        <button class="btn sm" @click="showInvest = true">💼 注资</button>
        <button class="btn sm ghost" style="margin-left:6px" :disabled="ind.treasury <= 0" @click="showDivest = true">💵 分红</button>
      </div>
    </div>

    <!-- 上市/资本操作 -->
    <div class="t-row" style="margin-top:8px;border-top:1.5px solid var(--line);padding-top:8px">
      <template v-if="ind.listed">
        <div class="t-left">
          <div class="t-label">📈 上市市值</div>
          <div class="t-value">{{ fmtMoney(ind.listed.mcap) }} <span v-if="ind.listed.groupId" style="font-size:11px;color:var(--ink-2)">· 集团成员</span></div>
        </div>
        <div class="t-right">
          <button class="btn sm ghost" @click="actions.industryAction(ind.uid, 'issue')">增发</button>
          <button class="btn sm ghost" style="margin-left:6px" @click="actions.industryAction(ind.uid, 'buyback')">回购退市</button>
        </div>
      </template>
      <template v-else>
        <div class="t-left">
          <div class="t-label">上市条件</div>
          <div class="t-value" style="font-size:12px;color:var(--ink-2)">
            A 级 + 估值 ≥ 10 亿<template v-if="!ind.canList">（当前 {{ ind.ratingName }} / {{ fmtMoney(ind.value) }}）</template>
          </div>
        </div>
        <div class="t-right">
          <button class="btn sm" :disabled="!ind.canList" @click="actions.industryAction(ind.uid, 'ipo')">上市</button>
          <button class="btn sm danger" style="margin-left:6px" @click="actions.industryAction(ind.uid, 'liquidate')">清算</button>
        </div>
      </template>
    </div>

    <!-- 注资弹层 -->
    <template v-if="showInvest">
      <div class="mask" @click="showInvest = false"></div>
      <div class="modal-card">
        <h3>💼 注资 {{ ind.name }}</h3>
        <input class="text-input" type="number" v-model.number="investAmt" placeholder="输入金额" />
        <div class="quick-row">
          <button class="btn sm" @click="investAmt = 1e6">100万</button>
          <button class="btn sm" @click="investAmt = 1e7">1000万</button>
          <button class="btn sm" @click="investAmt = 1e8">1亿</button>
        </div>
        <div class="modal-btns">
          <button class="btn ghost" @click="showInvest = false">取消</button>
          <button class="btn primary" :disabled="!investAmt" @click="doInvest">确认注资</button>
        </div>
      </div>
    </template>
    <template v-if="showDivest">
      <div class="mask" @click="showDivest = false"></div>
      <div class="modal-card">
        <h3>💵 分红提取</h3>
        <input class="text-input" type="number" v-model.number="divestAmt" placeholder="输入金额" />
        <div class="quick-row">
          <button class="btn sm" @click="divestAmt = 1e6">100万</button>
          <button class="btn sm" @click="divestAmt = 1e7">1000万</button>
          <button class="btn sm" @click="divestAmt = ind.treasury">全部</button>
        </div>
        <div class="modal-btns">
          <button class="btn ghost" @click="showDivest = false">取消</button>
          <button class="btn primary" :disabled="!divestAmt" @click="doDivest">确认提取</button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.treasury.stalled { border-color: var(--down); }
.stall-banner {
  background: var(--down-soft); color: var(--down); font-size: 12.5px; font-weight: 700;
  padding: 8px 10px; border-radius: 10px; margin-bottom: 10px; text-align: center;
}
.t-row { display: flex; align-items: center; gap: 10px; }
.t-left { flex: 1; min-width: 0; }
.t-label { font-size: 11.5px; color: var(--ink-2); }
.t-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.t-value.neg { color: var(--down); }
.t-right { flex: none; }
.quick-row { display: flex; gap: 8px; margin: 10px 0; }
.quick-row .btn { flex: 1; }
</style>
