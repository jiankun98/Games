<script setup>
import { computed, ref } from "vue";
import { useGame } from "../store.js";
import { fmtMoney, fmtPrice, fmtSignedPct, fmtQty, fmtPct } from "../format.js";
import SubPage from "./SubPage.vue";
import EntryCard from "./EntryCard.vue";
import DetailSheet from "./DetailSheet.vue";
import Sparkline from "./Sparkline.vue";
import { TAX } from "../data.js";

const { state, actions } = useGame();
const snap = computed(() => state.snap);

// 页面栈：home → mine / market:domestic / market:overseas
const view = ref("home");
const mineSort = ref("pnlPct");   // pnlPct | value | chgDay
const mktSort = ref("div");       // div | chg | cap
const selected = ref(null);
const buyQty = ref("");
const sellQty = ref("");

const REGION_NAME = { domestic: "国内", overseas: "海外" };

const stock = computed(() => {
  if (!selected.value) return null;
  return snap.value.stocks.market.find((s) => s.id === selected.value) || null;
});

const mineList = computed(() => {
  const arr = [...snap.value.stocks.holdings];
  if (mineSort.value === "pnlPct") arr.sort((a, b) => b.pnlPct - a.pnlPct);
  else if (mineSort.value === "value") arr.sort((a, b) => b.value - a.value);
  else arr.sort((a, b) => b.chgDay - a.chgDay);
  return arr;
});

function marketList(region) {
  let arr = snap.value.stocks.market.filter((s) => s.region === region);
  if (mktSort.value === "div") arr = [...arr].sort((a, b) => b.divYieldDay - a.divYieldDay);
  else if (mktSort.value === "chg") arr = [...arr].sort((a, b) => b.chgDay - a.chgDay);
  else arr = [...arr].sort((a, b) => b.marketCap - a.marketCap);
  return arr;
}

const maxBuy = computed(() => (stock.value ? Math.floor(snap.value.cash / stock.value.price) : 0));

function openDetail(id) {
  selected.value = id;
  buyQty.value = "";
  sellQty.value = "";
}
function doBuy() {
  const r = actions.buyStock(selected.value, parseInt(buyQty.value, 10));
  if (r.ok) buyQty.value = "";
}
function doBuyMax() { actions.buyStock(selected.value, "max"); }
function doSell() {
  const r = actions.sellStock(selected.value, parseInt(sellQty.value, 10));
  if (r.ok) sellQty.value = "";
}
function doSellAll() { actions.sellStock(selected.value, "all"); }

const MINE_SORTS = [
  { id: "pnlPct", name: "收益率" },
  { id: "value", name: "持有金额" },
  { id: "chgDay", name: "今日涨幅" }
];
const MKT_SORTS = [
  { id: "div", name: "分红" },
  { id: "chg", name: "涨幅" },
  { id: "cap", name: "市值" }
];
</script>

<template>
  <div v-if="snap">
    <!-- ===== 入口页 ===== -->
    <template v-if="view === 'home'">
      <div class="hero">
        <div class="h-label">股票总资产</div>
        <div class="h-value">{{ fmtMoney(snap.stocks.totalValue) }}</div>
        <div class="h-row">
          <span>总收益 <b :class="snap.stocks.totalGain >= 0 ? '' : ''">{{ snap.stocks.totalGain >= 0 ? "+" : "" }}{{ fmtMoney(snap.stocks.totalGain) }}</b></span>
          <span>每小时分红 <b>+{{ fmtMoney(snap.stocks.divPerHour) }}</b></span>
        </div>
      </div>

      <div class="entries">
        <EntryCard icon="💼" color="gold" name="我的持仓"
          :sub="snap.stocks.holdings.length ? `${snap.stocks.holdings.length} 支股票 · 每小时分红 ${fmtMoney(snap.stocks.divPerHour)}` : '还没有持仓，去市场看看'"
          :badge="snap.stocks.holdings.length || ''" @click="view = 'mine'" />
        <EntryCard icon="🇨🇳" color="red" name="国内股市" sub="30 支 A 股 · 蓝筹高息稳健" @click="view = 'market:domestic'" />
        <EntryCard icon="🌏" color="blue" name="海外股市" sub="15 支美股 · 高波动高弹性" @click="view = 'market:overseas'" />
      </div>

      <div class="hint-line" style="text-align:center;margin-top:16px">
        分红每 2 分钟结算 · 股息税 {{ fmtPct(TAX.dividend, 0) }} · 卖出印花税 {{ fmtPct(TAX.stamp, 1) }}
      </div>
    </template>

    <!-- ===== 我的持仓 ===== -->
    <SubPage v-else-if="view === 'mine'" title="我的持仓" @back="view = 'home'">
      <div class="chips">
        <button v-for="s in MINE_SORTS" :key="s.id" class="chip" :class="{ on: mineSort === s.id }" @click="mineSort = s.id">按{{ s.name }}</button>
      </div>
      <div v-if="mineList.length === 0" class="empty">
        <span class="e-icon">💼</span>
        暂无持仓<br />去股票市场买入第一支股票，坐等分红
      </div>
      <div v-for="s in mineList" :key="s.id" class="row-item" @click="openDetail(s.id)">
        <div class="row-main">
          <div class="row-name">{{ s.name }} <span class="tag">{{ s.sectorName }}</span></div>
          <div class="row-sub">{{ fmtQty(s.qty) }} 股 · 成本 {{ fmtMoney(s.cost) }}</div>
        </div>
        <div class="row-right">
          <div class="row-price">{{ fmtMoney(s.value) }}</div>
          <span class="row-chg" :class="s.pnl >= 0 ? 'up' : 'down'">
            {{ s.pnl >= 0 ? "+" : "" }}{{ fmtMoney(s.pnl) }}（{{ fmtSignedPct(s.pnlPct, 1) }}）
          </span>
        </div>
      </div>
    </SubPage>

    <!-- ===== 市场（国内/海外） ===== -->
    <SubPage v-else :title="view === 'market:domestic' ? '国内股市' : '海外股市'" @back="view = 'home'">
      <div class="chips">
        <button v-for="s in MKT_SORTS" :key="s.id" class="chip" :class="{ on: mktSort === s.id }" @click="mktSort = s.id">按{{ s.name }}</button>
      </div>
      <div v-for="s in marketList(view === 'market:domestic' ? 'domestic' : 'overseas')" :key="s.id" class="row-item" @click="openDetail(s.id)">
        <div class="row-main">
          <div class="row-name">
            {{ s.name }}
            <span class="tag hot" v-if="s.heldQty">持 {{ fmtQty(s.heldQty) }}</span>
          </div>
          <div class="row-sub">{{ s.sectorName }} · 股息 {{ fmtPct(s.divYieldDay, 2) }}/日 · 市值 {{ fmtMoney(s.marketCap) }}</div>
        </div>
        <div class="row-right">
          <div class="row-price">¥{{ fmtPrice(s.price) }}</div>
          <span class="row-chg" :class="s.chgDay > 0 ? 'up' : s.chgDay < 0 ? 'down' : 'flat'">{{ fmtSignedPct(s.chgDay) }}</span>
        </div>
      </div>
    </SubPage>

    <!-- ===== 详情弹层 ===== -->
    <DetailSheet :visible="!!stock" @close="selected = null">
      <template v-if="stock">
        <h3>{{ stock.name }} <span class="tag">{{ REGION_NAME[stock.region] }}</span></h3>
        <div class="blurb">{{ stock.blurb }}</div>

        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
          <span style="font-size:30px;font-weight:800">¥{{ fmtPrice(stock.price) }}</span>
          <span class="row-chg" style="font-size:14px" :class="stock.chgDay > 0 ? 'up' : stock.chgDay < 0 ? 'down' : 'flat'">
            {{ fmtSignedPct(stock.chgDay) }} 今日
          </span>
        </div>

        <Sparkline :hist="stock.hist" :up="stock.chgDay >= 0" />

        <div class="detail-grid">
          <div class="dg"><div class="k">总市值</div><div class="v">{{ fmtMoney(stock.marketCap) }}</div></div>
          <div class="dg"><div class="k">每日股息率</div><div class="v">{{ fmtPct(stock.divYieldDay, 3) }}</div></div>
          <div class="dg"><div class="k">每万股日分红</div><div class="v">{{ fmtMoney(stock.price * stock.divYieldDay * 1e4) }}</div></div>
          <div class="dg"><div class="k">卖出印花税</div><div class="v">{{ fmtPct(TAX.stamp, 1) }}</div></div>
        </div>

        <template v-if="stock.heldQty > 0">
          <div class="detail-grid">
            <div class="dg"><div class="k">持仓数量</div><div class="v">{{ fmtQty(stock.heldQty) }} 股</div></div>
            <div class="dg"><div class="k">持仓成本</div><div class="v">{{ fmtMoney(stock.heldQty ? (snap.stocks.holdings.find(h => h.id === stock.id)?.cost || 0) : 0) }}</div></div>
            <div class="dg"><div class="k">持仓市值</div><div class="v">{{ fmtMoney(stock.heldQty * stock.price) }}</div></div>
            <div class="dg"><div class="k">每小时分红(税后)</div><div class="v up">+{{ fmtMoney(stock.divPerHour) }}</div></div>
          </div>
        </template>

        <div class="trade-box">
          <div class="tb-title"><span>买入</span><span style="color:var(--ink-2);font-weight:600">可用 {{ fmtMoney(snap.cash) }}</span></div>
          <div class="qty-row">
            <input class="qty-input" type="number" inputmode="numeric" v-model="buyQty" placeholder="数量（股）" min="1" />
            <button class="btn sm ghost" @click="doBuyMax">最大 {{ fmtQty(maxBuy) }}</button>
          </div>
          <button class="btn primary" :disabled="!buyQty || +buyQty <= 0" @click="doBuy">
            买入（{{ fmtMoney(+buyQty * stock.price || 0) }}）
          </button>
        </div>

        <div class="trade-box" v-if="stock.heldQty > 0">
          <div class="tb-title"><span>卖出</span><span style="color:var(--ink-2);font-weight:600">持有 {{ fmtQty(stock.heldQty) }} 股</span></div>
          <div class="qty-row">
            <input class="qty-input" type="number" inputmode="numeric" v-model="sellQty" placeholder="数量（股）" min="1" />
            <button class="btn sm ghost" @click="doSellAll">全部卖出</button>
          </div>
          <button class="btn danger" :disabled="!sellQty || +sellQty <= 0" @click="doSell">
            卖出（净得 {{ fmtMoney(+sellQty * stock.price * (1 - TAX.stamp) || 0) }}）
          </button>
        </div>
      </template>
    </DetailSheet>
  </div>
</template>
