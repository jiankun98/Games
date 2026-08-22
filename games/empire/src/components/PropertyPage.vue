<script setup>
import { computed, ref } from "vue";
import { useGame } from "../store.js";
import { fmtMoney, fmtSignedPct, fmtPct } from "../format.js";
import SubPage from "./SubPage.vue";
import EntryCard from "./EntryCard.vue";
import DetailSheet from "./DetailSheet.vue";
import Sparkline from "./Sparkline.vue";
import { TAX } from "../data.js";

const { state, actions } = useGame();
const snap = computed(() => state.snap);

const view = ref("home");        // home | mine | market:domestic | market:overseas
const selected = ref(null);

const REGION_NAME = { domestic: "国内", overseas: "海外" };
const ownedTotal = computed(() => snap.value.props.owned.reduce((a, b) => a + b.count, 0));

const prop = computed(() => {
  if (!selected.value) return null;
  return snap.value.props.market.find((p) => p.id === selected.value) || null;
});

function marketList(region) {
  return snap.value.props.market
    .filter((p) => p.region === region)
    .sort((a, b) => b.price - a.price);
}
function openDetail(id) { selected.value = id; }
</script>

<template>
  <div v-if="snap">
    <!-- ===== 入口页 ===== -->
    <template v-if="view === 'home'">
      <div class="hero" style="background:
          radial-gradient(ellipse 90% 120% at 100% -20%, rgba(255,255,255,0.25), transparent 55%),
          linear-gradient(135deg, #6FB1FF 0%, #4F7CFF 50%, #3D5AE0 100%);
          box-shadow: 0 10px 26px rgba(61, 90, 224, 0.3), inset 0 -3px 8px rgba(20, 40, 120, 0.2);">
        <div class="h-label">房产总资产</div>
        <div class="h-value">{{ fmtMoney(snap.props.totalValue) }}</div>
        <div class="h-row">
          <span>每小时租金 <b>+{{ fmtMoney(snap.props.rentPerHour) }}</b></span>
          <span>持有 <b>{{ ownedTotal }}</b> 套</span>
        </div>
      </div>

      <div class="entries">
        <EntryCard icon="🏘️" color="green" name="我的房产"
          :sub="ownedTotal ? `${ownedTotal} 套房产 · 每小时租金 ${fmtMoney(snap.props.rentPerHour)}` : '买入房产即可持续收取租金'"
          :badge="ownedTotal || ''" @click="view = 'mine'" />
        <EntryCard icon="🏙️" color="gold" name="国内楼盘" sub="7 种 · 从老破小到购物中心" @click="view = 'market:domestic'" />
        <EntryCard icon="🌍" color="purple" name="海外置业" sub="3 种 · 曼哈顿 · 银座 · 私人海岛" @click="view = 'market:overseas'" />
      </div>

      <div class="hint-line" style="text-align:center;margin-top:16px">
        租金每 2 分钟结算 · 契税 {{ fmtPct(TAX.deed, 1) }} · 卖出综合税 {{ fmtPct(TAX.propertySale, 0) }} · 租金税 {{ fmtPct(TAX.rent, 0) }}
      </div>
    </template>

    <!-- ===== 我的房产 ===== -->
    <SubPage v-else-if="view === 'mine'" title="我的房产" @back="view = 'home'">
      <div v-if="snap.props.owned.length === 0" class="empty">
        <span class="e-icon">🏘️</span>
        暂无房产<br />买入房产即可持续收取租金
      </div>
      <div v-for="p in snap.props.owned" :key="p.id" class="row-item" @click="openDetail(p.id)">
        <div class="row-icon">{{ p.icon }}</div>
        <div class="row-main">
          <div class="row-name">{{ p.name }} <span class="tag">×{{ p.count }}</span></div>
          <div class="row-sub">成本 {{ fmtMoney(p.cost) }}</div>
        </div>
        <div class="row-right">
          <div class="row-price">{{ fmtMoney(p.value) }}</div>
          <span class="row-chg up">+{{ fmtMoney(p.rentPerHour) }}/时</span>
        </div>
      </div>
    </SubPage>

    <!-- ===== 楼盘市场 ===== -->
    <SubPage v-else :title="view === 'market:domestic' ? '国内楼盘' : '海外置业'" @back="view = 'home'">
      <div class="hint-line" style="margin:0 2px 10px">按价值排序</div>
      <div v-for="p in marketList(view === 'market:domestic' ? 'domestic' : 'overseas')" :key="p.id" class="row-item" @click="openDetail(p.id)">
        <div class="row-icon">{{ p.icon }}</div>
        <div class="row-main">
          <div class="row-name">{{ p.name }} <span class="tag hot" v-if="p.count">持 {{ p.count }}</span></div>
          <div class="row-sub">日租金率 {{ fmtPct(p.yieldDay, 2) }} · 时租 {{ fmtMoney(p.rentPerHourEach) }}</div>
        </div>
        <div class="row-right">
          <div class="row-price">{{ fmtMoney(p.price) }}</div>
          <span class="row-chg" :class="p.chgDay > 0 ? 'up' : p.chgDay < 0 ? 'down' : 'flat'">{{ fmtSignedPct(p.chgDay) }}</span>
        </div>
      </div>
    </SubPage>

    <!-- ===== 详情弹层 ===== -->
    <DetailSheet :visible="!!prop" @close="selected = null">
      <template v-if="prop">
        <h3>{{ prop.icon }} {{ prop.name }} <span class="tag">{{ REGION_NAME[prop.region] }}</span></h3>
        <div class="blurb">{{ prop.desc }}</div>

        <div style="display:flex;align-items:baseline;gap:10px;margin-bottom:10px">
          <span style="font-size:30px;font-weight:800">{{ fmtMoney(prop.price) }}</span>
          <span class="row-chg" style="font-size:14px" :class="prop.chgDay > 0 ? 'up' : prop.chgDay < 0 ? 'down' : 'flat'">
            {{ fmtSignedPct(prop.chgDay) }} 今日
          </span>
        </div>

        <Sparkline :hist="prop.hist" :up="prop.chgDay >= 0" />

        <div class="detail-grid">
          <div class="dg"><div class="k">每小时出租收益(税后)</div><div class="v up">+{{ fmtMoney(prop.rentPerHourEach) }}</div></div>
          <div class="dg"><div class="k">每日租金率</div><div class="v">{{ fmtPct(prop.yieldDay, 2) }}</div></div>
          <div class="dg"><div class="k">购买契税</div><div class="v">{{ fmtPct(prop.deedRate, 1) }}（{{ fmtMoney(prop.price * prop.deedRate) }}）</div></div>
          <div class="dg"><div class="k">卖出综合税</div><div class="v">{{ fmtPct(prop.saleRate, 0) }}（{{ fmtMoney(prop.price * prop.saleRate) }}）</div></div>
          <div class="dg"><div class="k">持有数量</div><div class="v">{{ prop.count }} 套</div></div>
          <div class="dg"><div class="k">当前价值</div><div class="v">{{ fmtMoney(prop.price) }}</div></div>
        </div>

        <button class="btn primary" @click="actions.buyProperty(prop.id)">
          买入（含契税共 {{ fmtMoney(prop.price * (1 + prop.deedRate)) }}）
        </button>
        <button class="btn danger" style="margin-top:10px" :disabled="!prop.count" @click="actions.sellProperty(prop.id)">
          卖出（净得 {{ fmtMoney(prop.price * (1 - prop.saleRate)) }}）
        </button>
      </template>
    </DetailSheet>
  </div>
</template>
