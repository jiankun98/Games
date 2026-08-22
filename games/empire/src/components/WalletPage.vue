<script setup>
import { computed, ref } from "vue";
import { useGame } from "../store.js";
import { fmtMoney, fmtSignedMoney } from "../format.js";
import SubPage from "./SubPage.vue";
import EntryCard from "./EntryCard.vue";
import { FORMULA } from "../data.js";

const { state, actions } = useGame();
const snap = computed(() => state.snap);
const view = ref("home");   // home | records
const salaryPerHour = FORMULA.baseSalary * FORMULA.hourDays;

function recIcon(r) {
  return { income: "💰", buy: "🛒", sell: "💱", open: "🏪", expand: "🏬" }[r.kind] || "•";
}
function recTime(t) {
  const d = Math.floor(t / 60);
  const h = Math.floor(d / 60);
  return h > 0 ? `${h}时${d % 60}分前` : d > 0 ? `${d}分前` : "刚刚";
}
</script>

<template>
  <div v-if="snap">
    <!-- ===== 入口页：银行卡视觉焦点 ===== -->
    <template v-if="view === 'home'">
      <div class="bank-card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span class="bc-label">EMPIRE BANK</span>
          <span style="font-size:20px">🎩</span>
        </div>
        <div class="bc-chip"></div>
        <div class="bc-label">可用余额（元）</div>
        <div class="bc-amount">{{ fmtMoney(snap.cash) }}</div>
        <div class="bc-row">
          <span>每小时净现金流 <b style="color:#C9FFE3">{{ fmtSignedMoney(snap.flowPerHour) }}/时</b></span>
          <span>···8888</span>
        </div>
      </div>

      <!-- 新手引导 -->
      <div v-if="snap.industries.length === 0" class="card" style="margin-top:16px;border-color:#F5DFAE;background:var(--card-2)">
        <div style="font-size:15px;font-weight:800">🚀 开始你的商业帝国</div>
        <div class="hint-line" style="margin:6px 0 12px">
          <template v-if="snap.cash >= 30000">手上的 {{ fmtMoney(snap.cash) }} 足够开一家便利店（3 万），迈出第一步。</template>
          <template v-else>开一家便利店需要 3 万。钱不够时先靠打工保底（每小时 {{ fmtMoney(salaryPerHour) }}）慢慢攒，或等分红到账。</template>
          <br />之后可依次解锁快递（20 万）、银行（50 万）、租车（100 万）…共 9 类公司。
        </div>
        <button class="btn primary" @click="actions.setTab('industry')">去开设公司</button>
      </div>

      <div class="entries" style="margin-top:16px">
        <EntryCard icon="📋" color="brown" name="收支流水"
          :sub="snap.records.length ? `最近 ${snap.records.length} 条交易与结算记录` : '暂无记录'"
          @click="view = 'records'" />
      </div>
    </template>

    <!-- ===== 收支流水 ===== -->
    <SubPage v-else title="收支流水" @back="view = 'home'">
      <div v-if="snap.records.length === 0" class="empty">
        <span class="e-icon">📋</span>
        暂无交易记录
      </div>
      <div v-for="(r, i) in snap.records" :key="i" class="row-item" style="cursor:default">
        <div class="row-icon">{{ recIcon(r) }}</div>
        <div class="row-main">
          <div class="row-name" style="font-size:14px">{{ r.text }}</div>
          <div class="row-sub">{{ recTime(r.t) }}</div>
        </div>
        <div class="row-right">
          <div class="row-price" :class="r.amt >= 0 ? 'up' : ''" style="font-size:14.5px">
            {{ r.amt >= 0 ? "+" : "" }}{{ fmtMoney(r.amt) }}
          </div>
        </div>
      </div>
    </SubPage>
  </div>
</template>
