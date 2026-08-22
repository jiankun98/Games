<script setup>
import { computed, ref } from "vue";
import { useGame } from "../store.js";
import { fmtMoney, fmtSignedPct, fmtPct } from "../format.js";
import SubPage from "./SubPage.vue";
import EntryCard from "./EntryCard.vue";
import DetailSheet from "./DetailSheet.vue";
import Sparkline from "./Sparkline.vue";
import { TAX, COLLECT_CATS } from "../data.js";

const { state, actions } = useGame();
const snap = computed(() => state.snap);

const view = ref("home");     // home | cat:<id>
const selected = ref(null);
const buyQty = ref("");
const sellQty = ref("");

const CAT_COLORS = { car: "red", plane: "blue", yacht: "green", antique: "brown", luxury: "purple" };

const item = computed(() => {
  if (!selected.value) return null;
  return snap.value.items.market.find((i) => i.id === selected.value) || null;
});

const catList = computed(() => {
  const catId = view.value.slice(4);
  return snap.value.items.market
    .filter((i) => i.cat === catId)
    .sort((a, b) => b.price - a.price);
});

const maxBuy = computed(() => (item.value ? Math.floor(snap.value.cash / (item.value.price * (1 + TAX.consume))) : 0));

function openDetail(id) {
  selected.value = id;
  buyQty.value = "";
  sellQty.value = "";
}
function doBuy() {
  const r = actions.buyItem(selected.value, parseInt(buyQty.value, 10) || 1);
  if (r.ok) buyQty.value = "";
}
function doSell() {
  const r = actions.sellItem(selected.value, parseInt(sellQty.value, 10));
  if (r.ok) sellQty.value = "";
}
</script>

<template>
  <div v-if="snap">
    <!-- ===== 入口页：五大分类 ===== -->
    <template v-if="view === 'home'">
      <div class="hero purple">
        <div class="h-label">藏品总价值</div>
        <div class="h-value">{{ fmtMoney(snap.items.totalValue) }}</div>
        <div class="h-row">
          <span>已实现盈亏 <b>{{ snap.items.realized >= 0 ? "+" : "" }}{{ fmtMoney(snap.items.realized) }}</b></span>
        </div>
      </div>

      <div class="entries">
        <EntryCard v-for="c in COLLECT_CATS" :key="c.id" :icon="c.icon" :color="CAT_COLORS[c.id]"
          :name="c.name" :sub="snap.items.cats[c.id].count ? `持有 ${snap.items.cats[c.id].count} 件 · 价值 ${fmtMoney(snap.items.cats[c.id].value)}` : '低买高卖赚差价'"
          :badge="snap.items.cats[c.id].count || ''" @click="view = 'cat:' + c.id" />
      </div>

      <div class="hint-line" style="text-align:center;margin-top:16px">
        买入消费税 {{ fmtPct(TAX.consume, 0) }} · 卖出交易税 {{ fmtPct(TAX.trade, 0) }} · 价格慢波动，长线增值
      </div>
    </template>

    <!-- ===== 分类列表 ===== -->
    <SubPage v-else :title="COLLECT_CATS.find(c => 'cat:' + c.id === view)?.name || '藏品'" @back="view = 'home'">
      <div v-for="i in catList" :key="i.id" class="row-item" @click="openDetail(i.id)">
        <div class="row-main">
          <div class="row-name">{{ i.name }} <span class="tag hot" v-if="i.qty">持 {{ i.qty }}</span></div>
          <div class="row-sub" v-if="i.qty">成本 {{ fmtMoney(i.cost) }} · 浮盈 {{ fmtMoney(i.qty * i.price - i.cost) }}</div>
          <div class="row-sub" v-else>{{ i.desc }}</div>
        </div>
        <div class="row-right">
          <div class="row-price">{{ fmtMoney(i.price) }}</div>
          <span class="row-chg" :class="i.chgDay > 0 ? 'up' : i.chgDay < 0 ? 'down' : 'flat'">{{ fmtSignedPct(i.chgDay) }}</span>
        </div>
      </div>
    </SubPage>

    <!-- ===== 详情弹层 ===== -->
    <DetailSheet :visible="!!item" @close="selected = null">
      <template v-if="item">
        <h3>{{ item.catName }} · {{ item.name }}</h3>
        <div class="blurb">{{ item.desc }}</div>

        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
          <span style="font-size:30px;font-weight:800">{{ fmtMoney(item.price) }}</span>
          <span class="row-chg" style="font-size:14px" :class="item.chgDay > 0 ? 'up' : item.chgDay < 0 ? 'down' : 'flat'">
            {{ fmtSignedPct(item.chgDay) }} 今日
          </span>
        </div>

        <Sparkline :hist="item.hist" :up="item.chgDay >= 0" />

        <div class="detail-grid">
          <div class="dg"><div class="k">买入消费税</div><div class="v">{{ fmtPct(item.consumeRate, 0) }}（{{ fmtMoney(item.price * item.consumeRate) }}）</div></div>
          <div class="dg"><div class="k">卖出交易税</div><div class="v">{{ fmtPct(item.tradeRate, 0) }}（{{ fmtMoney(item.price * item.tradeRate) }}）</div></div>
          <div class="dg" v-if="item.qty"><div class="k">持有数量</div><div class="v">{{ item.qty }}</div></div>
          <div class="dg" v-if="item.qty"><div class="k">持有成本</div><div class="v">{{ fmtMoney(item.cost) }}</div></div>
        </div>

        <div class="trade-box">
          <div class="tb-title"><span>买入</span><span style="color:var(--ink-2);font-weight:600">可用 {{ fmtMoney(snap.cash) }}</span></div>
          <div class="qty-row">
            <input class="qty-input" type="number" inputmode="numeric" v-model="buyQty" placeholder="数量" min="1" />
            <button class="btn sm ghost" @click="actions.buyItem(selected, 'max')">最大 {{ maxBuy }}</button>
          </div>
          <button class="btn primary" :disabled="+buyQty < 1" @click="doBuy">
            买入（含税 {{ fmtMoney((+buyQty || 1) * item.price * (1 + item.consumeRate)) }}）
          </button>
        </div>

        <div class="trade-box" v-if="item.qty > 0">
          <div class="tb-title"><span>卖出</span><span style="color:var(--ink-2);font-weight:600">持有 {{ item.qty }}</span></div>
          <div class="qty-row">
            <input class="qty-input" type="number" inputmode="numeric" v-model="sellQty" placeholder="数量" min="1" />
            <button class="btn sm ghost" @click="actions.sellItem(selected, 'all')">全部卖出</button>
          </div>
          <button class="btn danger" :disabled="+sellQty < 1" @click="doSell">
            卖出（净得 {{ fmtMoney((+sellQty || 0) * item.price * (1 - item.tradeRate)) }}）
          </button>
        </div>
      </template>
    </DetailSheet>
  </div>
</template>
