<script setup>
import { useGame } from "./store.js";
import { fmtMoney, fmtSignedMoney, fmtDur } from "./format.js";
import TabBar from "./components/TabBar.vue";
import StockPage from "./components/StockPage.vue";
import PropertyPage from "./components/PropertyPage.vue";
import IndustryPage from "./components/IndustryPage.vue";
import WalletPage from "./components/WalletPage.vue";
import ShopPage from "./components/ShopPage.vue";
import StatsPage from "./components/StatsPage.vue";

const { state, actions } = useGame();
</script>

<template>
  <div class="app-shell">
    <!-- 游戏 HUD：玩家状态条 -->
    <header class="hud" v-if="state.snap">
      <div class="hud-avatar">🎩</div>
      <div class="hud-main">
        <div class="hud-title">{{ state.snap.title }} <span style="opacity:.6">· 商业帝国</span></div>
        <div class="hud-worth">{{ fmtMoney(state.snap.netWorth) }}</div>
        <div class="hud-flow">
          <span>每小时现金流</span>
          <span class="up">{{ fmtSignedMoney(state.snap.flowPerHour) }}</span>
        </div>
      </div>
    </header>

    <main class="page">
      <div v-if="state.snap && state.snap.news" class="news-bar">
        <span>📢</span>
        <span class="nb-text">{{ state.snap.news.text }}</span>
      </div>

      <StockPage v-show="state.tab === 'stock'" />
      <PropertyPage v-show="state.tab === 'prop'" />
      <IndustryPage v-show="state.tab === 'industry'" />
      <WalletPage v-show="state.tab === 'wallet'" />
      <ShopPage v-show="state.tab === 'shop'" />
      <StatsPage v-show="state.tab === 'stats'" />
    </main>

    <TabBar v-model="state.tab" />

    <div v-if="state.toast" class="toast" :class="state.toast.kind">{{ state.toast.text }}</div>

    <!-- 离线收益弹窗 -->
    <template v-if="state.offline">
      <div class="mask" style="z-index:70"></div>
      <div class="modal-card" style="z-index:71">
        <h3>🌙 欢迎回来</h3>
        <p>离线 {{ fmtDur(state.offline.seconds) }}，资产持续运转</p>
        <div class="detail-grid" style="grid-template-columns:1fr">
          <div class="dg" v-for="d in state.offline.details" :key="d.name">
            <div style="display:flex;justify-content:space-between">
              <span class="k">{{ d.name }}</span>
              <span class="v up">+{{ fmtMoney(d.amount) }}</span>
            </div>
          </div>
        </div>
        <button class="btn primary" @click="actions.closeOffline()">领取 {{ fmtMoney(state.offline.cash) }}</button>
      </div>
    </template>
  </div>
</template>
