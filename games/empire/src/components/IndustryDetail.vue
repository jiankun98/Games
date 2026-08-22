<script setup>
/* 公司详情：按 typeId 分 9 类渲染（便利店 + 快递/银行/租车/房地产/经销商/IT/石油/俱乐部） */
import { computed, ref, watch } from "vue";
import { useGame } from "../store.js";
import { fmtMoney, fmtPct } from "../format.js";
import SubPage from "./SubPage.vue";
import RatingBadge from "./RatingBadge.vue";
import TreasuryBar from "./TreasuryBar.vue";

const props = defineProps({
  ind: { type: Object, required: true }
});
const emit = defineEmits(["back"]);
const { actions } = useGame();

const ind = computed(() => props.ind);

/* 银行利率本地态（避免直接改 props） */
const depositRate = ref(ind.value.depositRate || 0.03);
const loanRate = ref(ind.value.loanRate || 0.10);
watch(() => ind.value.depositRate, (v) => { if (v != null) depositRate.value = v; });
watch(() => ind.value.loanRate, (v) => { if (v != null) loanRate.value = v; });
function commitRates() {
  actions.industryAction(ind.value.uid, "setRates", { depositRate: depositRate.value, loanRate: loanRate.value });
}

/* 快递/租车机队进度（里程 / 维修 / 停机） */
function fleetBar(f) {
  if (f.status === "repairing") {
    const total = f.repairHours || 1;
    return { pct: Math.min(100, (1 - f.repairLeft / total) * 100), cls: "warn", text: `维修中 剩 ${Math.max(0, f.repairLeft)}h / ${total}h` };
  }
  if (f.status === "down") return { pct: 100, cls: "bad", text: "里程满 · 停机待修" };
  return { pct: Math.min(100, (f.hours || 0) / (f.maxHours || 1) * 100), cls: "", text: `里程 ${f.hours || 0}/${f.maxHours}h` };
}

/* 俱乐部胜率 */
const winRate = computed(() => {
  const r = ind.value.record;
  return r.matches ? (r.rate * 100).toFixed(0) + "%" : "-";
});

/* 下一评级将解锁的内容（从市场清单中筛选） */
const nextUnlocks = computed(() => {
  const i = ind.value;
  if (!i.nextRating) return [];
  const nextIdx = ["E", "D", "C", "B", "A", "S", "SS", "SSS"].indexOf(i.nextRating.name);
  const list = i.market || [];
  return list.filter((m) => m.locked && m.rating === nextIdx).slice(0, 3).map((m) => m.name);
});
</script>

<template>
  <SubPage :title="ind.name" @back="emit('back')">
    <!-- ===== 通用信息卡 ===== -->
    <div class="card" style="text-align:center;overflow:hidden">
      <div style="font-size:42px;line-height:1.2">{{ ind.icon }}</div>
      <div style="font-size:22px;font-weight:800;margin:4px 0 2px">
        {{ ind.name }}<RatingBadge :name="ind.ratingName" />
      </div>
      <div style="font-size:12.5px;color:var(--ink-2)">{{ ind.typeName }}</div>
      <div style="font-size:13px;color:var(--ink-2);margin:10px 0 2px">
        每小时利润 <b class="up">+{{ fmtMoney(ind.incomePerHour) }}</b>
        <span style="opacity:.7"> · 估值 {{ fmtMoney(ind.value) }}</span>
      </div>
      <div v-if="ind.nextRating" style="margin:10px 6px 2px">
        <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-2);margin-bottom:5px">
          <span>累计利润 {{ fmtMoney(ind.profit) }}</span>
          <span>升 {{ ind.nextRating.name }} 需 {{ fmtMoney(ind.nextRating.need) }}</span>
        </div>
        <div class="bar"><i :style="{ width: (ind.nextRating.progress * 100).toFixed(1) + '%' }"></i></div>
        <div v-if="nextUnlocks.length" class="hint-line" style="margin-top:5px">🔓 {{ ind.nextRating.name }} 级解锁：{{ nextUnlocks.join("、") }}<template v-if="(ind.market || []).filter(m => m.locked && m.rating === ['E','D','C','B','A','S','SS','SSS'].indexOf(ind.nextRating.name)).length > 3"> 等</template></div>
      </div>
      <div v-else class="hint-line" style="margin:8px 0 0">已达最高评级 SSS 🏆</div>
    </div>

    <!-- 公司池（8 家新公司） -->
    <TreasuryBar v-if="ind.typeId !== 'cstore'" :ind="ind" />

    <!-- ========== 便利店 ========== -->
    <template v-if="ind.typeId === 'cstore'">
      <div class="card" style="text-align:center">
        <div style="font-size:26px;font-weight:800;margin:6px 0 2px">{{ ind.stores }} <span style="font-size:14px;color:var(--ink-2)">/ {{ ind.maxStores }} 家门店</span></div>
        <div style="margin:14px 6px 4px">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink-2);margin-bottom:5px">
            <span>下一个规模加成：<template v-if="ind.nextMilestone">{{ ind.nextMilestone.stores }} 家 +{{ fmtPct(ind.nextMilestone.bonus, 0) }}</template><template v-else>已满</template></span>
            <span v-if="ind.bonus > 0">当前 +{{ fmtPct(ind.bonus, 0) }}</span>
          </div>
          <div class="bar"><i :style="{ width: (ind.stores / ind.maxStores * 100).toFixed(2) + '%' }"></i></div>
        </div>
        <button class="btn primary" :disabled="!ind.nextExpand" @click="actions.industryAction(ind.uid, 'expand')">
          <template v-if="ind.nextExpand">扩充 +{{ ind.nextExpand.count }} 家（{{ fmtMoney(ind.nextExpand.cost) }}）</template>
          <template v-else>已达上限</template>
        </button>
      </div>
    </template>

    <!-- ========== 快递 ========== -->
    <template v-else-if="ind.typeId === 'express'">
      <div class="card" style="background:var(--card-2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:14px;font-weight:800">🚚 车队（{{ ind.fleet.length }}）</div>
        </div>
        <div class="slotbars" style="margin-bottom:8px">
          <div class="sb">
            <span>车位 {{ ind.vehiclesUsed }}/{{ ind.vehicles }}</span>
            <div class="fbar"><i :style="{ width: Math.min(100, ind.vehiclesUsed / ind.vehicles * 100) + '%' }"></i></div>
            <button class="btn sm ghost" style="margin-top:5px;padding:4px 10px;font-size:11.5px" @click="actions.industryAction(ind.uid, 'expandSlot', { kind: 'vehicle' })">+车位 {{ fmtMoney(ind.vehicleCost) }} / {{ ind.vehicleHours }}h</button>
          </div>
          <div class="sb">
            <span>机位 {{ ind.planesUsed }}/{{ ind.planes }}</span>
            <div class="fbar"><i :style="{ width: Math.min(100, ind.planesUsed / ind.planes * 100) + '%' }"></i></div>
            <button class="btn sm ghost" style="margin-top:5px;padding:4px 10px;font-size:11.5px" @click="actions.industryAction(ind.uid, 'expandSlot', { kind: 'plane' })">+机位 {{ fmtMoney(ind.planeCost) }} / {{ ind.planeHours }}h</button>
          </div>
        </div>
        <div v-for="(p, i) in ind.slotPending || []" :key="'sp' + i" class="hint-line" style="margin-bottom:6px">
          🏗️ {{ p.kind === 'plane' ? '机位' : '车位' }} 建造中 剩 {{ Math.max(0, p.left) }}h / {{ p.total }}h
          <div class="fbar warn"><i :style="{ width: Math.min(100, (1 - p.left / p.total) * 100) + '%' }"></i></div>
        </div>
        <div v-if="!ind.fleet.length" class="hint-line" style="margin:0 0 8px">还没有载具，去下方购买</div>
        <div v-for="f in ind.fleet" :key="f.fid || f.fleetId" class="row-item" style="cursor:default">
          <div class="row-icon">{{ f.kind === "plane" ? "✈️" : "🚚" }}</div>
          <div class="row-main">
            <div class="row-name">{{ f.name }}</div>
            <div class="row-sub">{{ fleetBar(f).text }} · +{{ fmtMoney(f.incomePerHour) }}/时</div>
            <div class="fbar" :class="fleetBar(f).cls"><i :style="{ width: fleetBar(f).pct + '%' }"></i></div>
          </div>
          <div class="row-right">
            <button v-if="f.status === 'down'" class="btn sm" @click="actions.industryAction(ind.uid, 'repair', { fid: f.fid || f.fleetId })">
              维修 {{ fmtMoney(f.repairCost) }}
            </button>
            <span v-else class="chip" :class="{ on: f.status === 'running' }">{{ f.status === "running" ? "运营中" : "维修中" }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🛒 载具市场（30 档，同款可重复购买）</div>
        <div class="cat-grid">
          <button v-for="v in ind.market" :key="v.id" class="cat-cell"
            :class="{ locked: v.locked }"
            :disabled="v.locked"
            @click="actions.industryAction(ind.uid, 'buy', { fleetId: v.id })">
            <span class="cc-name">{{ v.name }}<em v-if="v.ownedCount" class="cc-owned">×{{ v.ownedCount }}</em></span>
            <span class="cc-sub">+{{ fmtMoney(v.incomePerHour) }}/时 · 里程 {{ v.maxHours }}h</span>
            <span class="cc-req" v-if="v.locked">🔒 {{ ['E','D','C','B','A','S','SS','SSS'][v.rating] }}</span>
            <span class="cc-req" v-else>{{ fmtMoney(v.cost) }}<template v-if="v.ownedCount"> · 已有 {{ v.ownedCount }}</template></span>
          </button>
        </div>
      </div>
    </template>

    <!-- ========== 银行 ========== -->
    <template v-else-if="ind.typeId === 'bank'">
      <div class="card" style="background:var(--card-2)">
        <div style="font-size:14px;font-weight:800;margin-bottom:6px">🏦 存贷款利率（息差决定盈亏）</div>
        <div style="margin-bottom:10px">
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-2);margin-bottom:4px">
            <span>存款利率（1%~10%）</span><b style="color:var(--gold-text)">{{ (depositRate * 100).toFixed(1) }}%</b>
          </div>
          <input type="range" min="0.01" max="0.10" step="0.005" v-model.number="depositRate"
            :style="{ width: '100%' }" @change="commitRates" />
        </div>
        <div>
          <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--ink-2);margin-bottom:4px">
            <span>贷款利率（5%~20%）</span><b style="color:var(--gold-text)">{{ (loanRate * 100).toFixed(1) }}%</b>
          </div>
          <input type="range" min="0.05" max="0.20" step="0.005" v-model.number="loanRate"
            :style="{ width: '100%' }" @change="commitRates" />
        </div>
      </div>

      <!-- 当前存贷余额 -->
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">💰 当前存贷余额</div>
        <div style="display:flex;gap:10px">
          <div class="mini-stat">
            <div class="ms-label">当前存款（金库 {{ (ind.deposits / ind.vault * 100).toFixed(0) }}%）</div>
            <div class="ms-value">{{ fmtMoney(ind.deposits) }}</div>
            <div class="fbar"><i :style="{ width: Math.min(100, ind.deposits / ind.vault * 100) + '%' }"></i></div>
            <div class="ms-sub">+{{ fmtMoney(ind.depIn) }}/时 流入</div>
            <div class="ms-sub down">-{{ fmtMoney(ind.depOut) }}/时 到期提取</div>
          </div>
          <div class="mini-stat">
            <div class="ms-label">当前贷款（放贷率 {{ (ind.loans / Math.max(1, ind.deposits) * 100).toFixed(0) }}%）</div>
            <div class="ms-value">{{ fmtMoney(ind.loans) }}</div>
            <div class="fbar warn"><i :style="{ width: Math.min(100, ind.loans / Math.max(1, ind.deposits) * 100) + '%' }"></i></div>
            <div class="ms-sub">+{{ fmtMoney(ind.loanNew) }}/时 新放贷</div>
            <div class="ms-sub down">-{{ fmtMoney(ind.loanPay) }}/时 还贷</div>
          </div>
        </div>
      </div>

      <!-- 每小时利息收支 -->
      <div class="card" style="background:var(--card-2)">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">📈 每小时利息收支</div>
        <table class="kv-table">
          <tr><td>贷款利息收入</td><td class="up">+{{ fmtMoney(ind.interestIncome) }}/时</td></tr>
          <tr><td>存款利息支出</td><td class="down">-{{ fmtMoney(ind.interestCost) }}/时</td></tr>
          <tr style="border-top:2px solid var(--gold-text)">
            <td><b>净息差</b></td>
            <td><b :class="ind.netInterest >= 0 ? 'up' : 'down'">{{ (ind.netInterest >= 0 ? '+' : '') + fmtMoney(ind.netInterest) }}/时</b></td>
          </tr>
        </table>
        <div class="hint-line" style="margin-top:6px">每游戏日结算一次（约 2 分钟），存贷余额随利率动态变化</div>
      </div>

      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:800">🔐 金库</div>
            <div class="hint-line" style="margin:2px 0 0">存款上限 {{ fmtMoney(ind.vault) }}</div>
          </div>
          <button class="btn sm" @click="actions.industryAction(ind.uid, 'upgradeVault')">扩容 {{ fmtMoney(ind.vaultUpgradeCost) }}</button>
        </div>
      </div>
    </template>

    <!-- ========== 租车 ========== -->
    <template v-else-if="ind.typeId === 'rental'">
      <div class="card" style="background:var(--card-2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:14px;font-weight:800">🚗 车队（{{ ind.fleet.length }}）</div>
          <button class="btn sm ghost" @click="actions.industryAction(ind.uid, 'expandGarage')">+车库 {{ fmtMoney(ind.garageCost) }}</button>
        </div>
        <div class="sb" style="margin-bottom:10px">
          <span>车库 {{ ind.garageUsed }}/{{ ind.garage }}</span>
          <div class="fbar"><i :style="{ width: Math.min(100, ind.garageUsed / ind.garage * 100) + '%' }"></i></div>
        </div>
        <div v-if="!ind.fleet.length" class="hint-line" style="margin:0 0 8px">还没有车，去下方购买</div>
        <div v-for="f in ind.fleet" :key="f.fid || f.fleetId" class="row-item" style="cursor:default">
          <div class="row-icon">🚗</div>
          <div class="row-main">
            <div class="row-name">{{ f.name }}</div>
            <div class="row-sub">{{ fleetBar(f).text }} · +{{ fmtMoney(f.incomePerHour) }}/时</div>
            <div class="fbar" :class="fleetBar(f).cls"><i :style="{ width: fleetBar(f).pct + '%' }"></i></div>
          </div>
          <div class="row-right">
            <button v-if="f.status === 'down'" class="btn sm" @click="actions.industryAction(ind.uid, 'repair', { fid: f.fid || f.fleetId })">
              维修 {{ fmtMoney(f.repairCost) }}
            </button>
            <span v-else class="chip" :class="{ on: f.status === 'running' }">{{ f.status === "running" ? "出租中" : "维修中" }}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🛒 车型市场（30 档，同款可重复购买）</div>
        <div class="cat-grid">
          <button v-for="v in ind.market" :key="v.id" class="cat-cell"
            :class="{ locked: v.locked }"
            :disabled="v.locked"
            @click="actions.industryAction(ind.uid, 'buy', { fleetId: v.id })">
            <span class="cc-name">{{ v.name }}<em v-if="v.ownedCount" class="cc-owned">×{{ v.ownedCount }}</em></span>
            <span class="cc-sub">+{{ fmtMoney(v.incomePerHour) }}/时</span>
            <span class="cc-req" v-if="v.locked">🔒 {{ ['E','D','C','B','A','S','SS','SSS'][v.rating] }}</span>
            <span class="cc-req" v-else>{{ fmtMoney(v.cost) }}<template v-if="v.ownedCount"> · 已有 {{ v.ownedCount }}</template></span>
          </button>
        </div>
      </div>
    </template>

    <!-- ========== 房地产 ========== -->
    <template v-else-if="ind.typeId === 'realestate'">
      <div class="card" style="background:var(--card-2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:800">🏗️ 建筑队 {{ ind.teams }}/{{ ind.teamMax }}</div>
            <div class="hint-line" style="margin:2px 0 0">忙队工资 {{ fmtMoney(ind.teamWage) }}/时</div>
          </div>
          <button v-if="ind.nextTeamCost" class="btn sm" @click="actions.industryAction(ind.uid, 'hireTeam')">+1 队 {{ fmtMoney(ind.nextTeamCost) }}</button>
        </div>
        <div v-for="p in ind.projects" :key="p.projId" class="row-item" style="cursor:default">
          <div class="row-icon">🏗️</div>
          <div class="row-main">
            <div class="row-name">{{ p.name }}</div>
            <div class="row-sub">竣工回款 {{ fmtMoney(p.totalIncome) }} · {{ p.cycle - p.progress }} 小时</div>
            <div class="bar" style="margin-top:6px"><i :style="{ width: (p.progressPct * 100).toFixed(1) + '%' }"></i></div>
          </div>
          <div class="row-right"><span class="row-chg up">{{ (p.progressPct * 100).toFixed(0) }}%</span></div>
        </div>
        <div v-if="!ind.projects.length" class="hint-line" style="margin:0">无在建项目，选项目开工（公司池需有开发费）</div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">📐 项目库（30 档，评级+建筑队解锁）</div>
        <div class="cat-grid">
          <button v-for="p in ind.market" :key="p.id" class="cat-cell"
            :class="{ locked: p.locked, building: p.building }"
            :disabled="p.locked || p.building"
            @click="actions.industryAction(ind.uid, 'build', { projId: p.id })">
            <span class="cc-name">{{ p.name }}</span>
            <span class="cc-sub">回款 {{ fmtMoney(p.totalIncome) }} · {{ p.cycle }}h</span>
            <span class="cc-req" v-if="p.locked">🔒 {{ ['E','D','C','B','A','S','SS','SSS'][p.rating] }}/{{ p.teams }}队</span>
            <span class="cc-req" v-else-if="p.building">在建</span>
            <span class="cc-req" v-else>{{ fmtMoney(p.cost) }}</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ========== 汽车经销商 ========== -->
    <template v-else-if="ind.typeId === 'dealer'">
      <div class="card" style="background:var(--card-2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:14px;font-weight:800">🛒 二手车市场（每小时刷 {{ 3 }} 辆）</div>
          <div style="font-size:11.5px;color:var(--ink-2)">车间 {{ ind.workshop }} · 销售台 {{ ind.stalls }}</div>
        </div>
        <div v-for="c in ind.market" :key="c.carId" class="row-item">
          <div class="row-icon">🚘</div>
          <div class="row-main">
            <div class="row-name">{{ c.name }}</div>
            <div class="row-sub">损耗 {{ (c.wear * 100).toFixed(0) }}%</div>
          </div>
          <div class="row-right">
            <button class="btn sm" @click="actions.industryAction(ind.uid, 'buy', { carId: c.carId })">收 {{ fmtMoney(c.price) }}</button>
          </div>
        </div>
        <div v-if="!ind.market.length" class="hint-line" style="margin:0">市场暂无车（下小时刷新）</div>
        <div style="display:flex;gap:8px;margin-top:10px">
          <button class="btn sm ghost" @click="actions.industryAction(ind.uid, 'expand', { kind: 'workshop' })">+车间 {{ fmtMoney(ind.workshopCost) }}</button>
          <button class="btn sm ghost" @click="actions.industryAction(ind.uid, 'expand', { kind: 'stall' })">+销售台 {{ fmtMoney(ind.stallCost) }}</button>
        </div>
      </div>
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:14px;font-weight:800">🚧 库存（{{ ind.lots.length }}/{{ ind.stalls }}）</div>
        </div>
        <div class="sb" style="margin-bottom:10px">
          <span>车位占用 {{ ind.lots.length }}/{{ ind.stalls }}</span>
          <div class="fbar" :class="{ bad: ind.lots.length >= ind.stalls }"><i :style="{ width: Math.min(100, ind.lots.length / ind.stalls * 100) + '%' }"></i></div>
        </div>
        <div v-for="l in ind.lots" :key="l.carId" class="row-item">
          <div class="row-icon">🚗</div>
          <div class="row-main">
            <div class="row-name">{{ l.name }}</div>
            <div class="row-sub">
              <template v-if="l.status === 'repairing'">维修中 剩 {{ l.repairLeft }}h / {{ l.repairHours }}h</template>
              <template v-else-if="l.wear > 0">待维修（{{ (l.wear * 100).toFixed(0) }}% 损耗，约 {{ l.repairHours }}h）</template>
              <template v-else>已修复 · 售 {{ fmtMoney(l.sellPrice) }}</template>
            </div>
            <div v-if="l.status === 'repairing'" class="fbar warn"><i :style="{ width: Math.min(100, (1 - l.repairLeft / Math.max(1, l.repairHours)) * 100) + '%' }"></i></div>
          </div>
          <div class="row-right">
            <button v-if="l.status === 'stored' && l.wear > 0" class="btn sm" @click="actions.industryAction(ind.uid, 'repair', { carId: l.carId })">维修</button>
            <button v-else-if="l.status === 'stored'" class="btn sm" @click="actions.industryAction(ind.uid, 'sell', { carId: l.carId })">出售</button>
          </div>
        </div>
        <div v-if="!ind.lots.length" class="hint-line" style="margin:0">库存为空</div>
      </div>
    </template>

    <!-- ========== 信息技术 ========== -->
    <template v-else-if="ind.typeId === 'itcorp'">
      <div class="card" style="background:var(--card-2)">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🧑‍💻 团队（时薪 {{ fmtMoney(ind.wagePerHour) }}）</div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <div v-for="s in [{ k: 'pm', n: 'PM', v: ind.staff.pm }, { k: 'dev', n: '程', v: ind.staff.dev }, { k: 'design', n: '设', v: ind.staff.design }, { k: 'test', n: '测', v: ind.staff.test }]" :key="s.k" class="staff-chip">
            <span>{{ s.n }}×{{ s.v }}</span>
            <button class="btn sm" style="padding:3px 8px;font-size:11px" @click="actions.industryAction(ind.uid, 'hire', { kind: s.k })">雇</button>
            <button class="btn sm" style="padding:3px 8px;font-size:11px;background:var(--down-soft);color:var(--down);box-shadow:none" :disabled="(s.k === 'pm' ? s.v <= 10 : s.v <= 0)" @click="actions.industryAction(ind.uid, 'layoff', { kind: s.k })">解</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🖥️ 项目</div>
        <div v-for="p in ind.projects" :key="p.projId" class="row-item" style="cursor:default">
          <div class="row-icon">💻</div>
          <div class="row-main">
            <div class="row-name">{{ p.name }}</div>
            <div class="row-sub">
              <template v-if="p.operating">运营中 +{{ fmtMoney(p.incomePerHour) }}/时 · 剩 {{ Math.max(0, p.opLeft) }}h / {{ p.opHours }}h<template v-if="p.opLeft <= 0">（已衰减 ×10%）</template></template>
              <template v-else>研发中 {{ p.progress }}/{{ p.cycle }}h<template v-if="p.stalledLeft"> · 瓶颈停滞 {{ p.stalledLeft }}h</template></template>
            </div>
            <div v-if="p.operating" class="fbar full"><i :style="{ width: Math.max(0, p.opLeft / p.opHours * 100) + '%' }"></i></div>
            <div v-else class="bar" style="margin-top:6px"><i :style="{ width: (p.progressPct * 100).toFixed(1) + '%' }"></i></div>
          </div>
          <div class="row-right"><span class="row-chg" :class="p.operating ? 'up' : 'flat'">{{ p.operating ? "运营" : (p.progressPct * 100).toFixed(0) + "%" }}</span></div>
        </div>
        <div v-if="!ind.projects.length" class="hint-line" style="margin:0">无项目，选一个开工（公司池需有研发费）</div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">📦 作品库（30 档，评级+PM 解锁）</div>
        <div class="cat-grid">
          <button v-for="p in ind.market" :key="p.id" class="cat-cell"
            :class="{ locked: p.locked, dev: p.dev }"
            :disabled="p.locked || p.dev"
            @click="actions.industryAction(ind.uid, 'startProject', { projId: p.id })">
            <span class="cc-name">{{ p.name }}</span>
            <span class="cc-sub">运营 +{{ fmtMoney(p.incomePerHour) }}/时 · {{ p.opHours }}h</span>
            <span class="cc-req" v-if="p.locked">🔒 {{ ['E','D','C','B','A','S','SS','SSS'][p.rating] }} / PM{{ p.pmAbility }}</span>
            <span class="cc-req" v-else-if="p.dev">研发中</span>
            <span class="cc-req" v-else>{{ fmtMoney(p.cost) }} · {{ p.cycle }}h</span>
          </button>
        </div>
      </div>
    </template>

    <!-- ========== 石油 ========== -->
    <template v-else-if="ind.typeId === 'oil'">
      <div class="card" style="background:var(--card-2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div>
            <div style="font-size:14px;font-weight:800">🛢️ 国际油价 <b style="color:var(--gold-text)">${{ ind.price }}</b>/桶</div>
            <div class="hint-line" style="margin:2px 0 0">每 6h 波动（${{ ind.priceRange[0] }}~${{ ind.priceRange[1] }}）</div>
          </div>
          <button class="btn sm" @click="actions.industryAction(ind.uid, 'explore')">⛏️ 勘探 {{ fmtMoney(ind.exploreCost) }}</button>
        </div>
        <div v-for="f in ind.fields" :key="f.id" class="row-item" style="cursor:default">
          <div class="row-icon">⛽</div>
          <div class="row-main">
            <div class="row-name">油田 {{ f.id }} <span style="font-size:11px;color:var(--ink-2)">剩余 {{ fmtMoney(f.reserve) }} 桶（{{ (f.reserve / f.reserve0 * 100).toFixed(0) }}%）</span></div>
            <div class="fbar"><i :style="{ width: Math.min(100, f.reserve / f.reserve0 * 100) + '%' }"></i></div>
          </div>
          <div class="row-right">
            <template v-if="ind.platforms.find((p) => p.fieldId === f.id)">
              <span class="chip on" style="font-size:10.5px">平台已部署</span>
            </template>
            <template v-else>
              <button class="btn sm" @click="actions.industryAction(ind.uid, 'buildPlatform', { fieldId: f.id })">部署平台 {{ fmtMoney(ind.platformCost) }}</button>
            </template>
          </div>
        </div>
        <div v-for="pl in ind.platforms" :key="pl.id" class="row-item" style="cursor:default">
          <div class="row-icon">🏗️</div>
          <div class="row-main">
            <div class="row-name">平台 {{ pl.id }} <span class="chip" :class="{ on: pl.status === 'pumping' }">{{ pl.status === "pumping" ? "开采中" : "闲置（枯竭）" }}</span></div>
            <div class="row-sub">绑定油田储量 {{ fmtMoney(pl.reserve) }} 桶</div>
          </div>
          <div class="row-right">
            <div v-if="pl.status !== 'pumping'" style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">
              <button v-for="tf in ind.fields.filter((x) => !ind.platforms.some((p) => p.fieldId === x.id) && x.reserve > 0)" :key="tf.id" class="btn sm" @click="actions.industryAction(ind.uid, 'movePlatform', { platformId: pl.id, fieldId: tf.id })">搬运→{{ tf.id }}</button>
              <span v-if="!ind.fields.some((x) => !ind.platforms.some((p) => p.fieldId === x.id) && x.reserve > 0)" class="hint-line">无可用油田</span>
            </div>
          </div>
        </div>
        <div v-if="!ind.fields.length" class="hint-line" style="margin:0">还没有油田——勘探有 30% 成功率</div>
        <div class="hint-line" style="margin-top:6px">平台：产 {{ ind.platformOutput }} 桶/时 · 维护费 {{ fmtMoney(ind.platformMaintain) }}/时（不论产出）</div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">🛢️ 储油与精炼</div>
        <div class="hint-line" style="margin:0 0 4px">
          储油罐 {{ fmtMoney(ind.tank.stock) }} / {{ fmtMoney(ind.tank.capacity) }} 桶（{{ (ind.tank.stock / ind.tank.capacity * 100).toFixed(0) }}%）
          <template v-if="ind.tank.hoarding"> · <b class="up">囤油中（产出入罐）</b></template>
        </div>
        <div class="fbar" style="margin-bottom:10px"><i :style="{ width: Math.min(100, ind.tank.stock / ind.tank.capacity * 100) + '%' }"></i></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button class="btn sm" @click="actions.industryAction(ind.uid, 'toggleHoarding')">{{ ind.tank.hoarding ? "停止囤油" : "开启囤油" }}</button>
          <button class="btn sm" :disabled="ind.tank.stock <= 0" @click="actions.industryAction(ind.uid, 'dumpTank')">抛售 {{ fmtMoney(ind.tank.stock * ind.price) }}</button>
          <button class="btn sm ghost" @click="actions.industryAction(ind.uid, 'upgradeTank')">扩容罐</button>
          <button class="btn sm" :disabled="ind.refinery" @click="actions.industryAction(ind.uid, 'buildRefinery')">{{ ind.refinery ? "✅ 炼油厂" : "建炼油厂 " + fmtMoney(ind.refineryCost) }}</button>
        </div>
      </div>
    </template>

    <!-- ========== 俱乐部 ========== -->
    <template v-else-if="ind.typeId === 'club'">
      <div class="card" style="background:var(--card-2)">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div>
            <div style="font-size:14px;font-weight:800">⚽ 战绩 {{ ind.record.wins }}胜/{{ ind.record.matches }}场（{{ winRate }}）</div>
            <div class="hint-line" style="margin:2px 0 0">声望 {{ ind.rep }} · 时薪 {{ fmtMoney(ind.wagePerHour) }}</div>
          </div>
          <button class="btn sm" @click="actions.industryAction(ind.uid, 'upgradeAcademy')">青训 Lv{{ ind.academy.level }} 升级</button>
        </div>
        <div class="hint-line" style="margin:0 0 4px">赞助 {{ fmtMoney(ind.sponsorPerHour) }}/时 · 门票 {{ fmtMoney(ind.ticketPerHour) }}/时</div>
        <div v-if="ind.nextStadium" style="margin-top:8px">
          <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--ink-2);margin-bottom:4px">
            <span>声望 {{ ind.rep }} / {{ ind.nextStadium.need }}</span>
            <span>下一体育场 +{{ fmtMoney(ind.nextStadium.income) }}/时</span>
          </div>
          <div class="fbar full"><i :style="{ width: (ind.nextStadium.progress * 100).toFixed(1) + '%' }"></i></div>
        </div>
        <div v-else class="hint-line" style="margin-top:6px">🏟️ 已解锁最高级体育场</div>
        <div v-if="ind.academy.progress > 0 && ind.academy.progress <= ind.academy.cycle" class="bar" style="margin-top:8px"><i :style="{ width: (ind.academy.progress / ind.academy.cycle * 100).toFixed(1) + '%' }"></i></div>
        <div v-if="ind.academy.progress > 0 && ind.academy.progress <= ind.academy.cycle" class="hint-line" style="margin-top:3px">青训 {{ ind.academy.progress }}/{{ ind.academy.cycle }}h 产出下一名球员</div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">⭐ 阵容（{{ ind.players.length }} · 总能力 {{ ind.teamAbility }}）</div>
        <div v-for="p in ind.players" :key="p.id || p.name" class="row-item">
          <div class="row-icon">🧑‍💼</div>
          <div class="row-main">
            <div class="row-name">{{ p.name }} <span class="chip on" style="font-size:10.5px">能力 {{ p.ability }}</span></div>
            <div class="row-sub">身价 {{ fmtMoney(p.price) }} · 工资 {{ fmtMoney(p.wage) }}/时</div>
          </div>
          <div class="row-right">
            <button class="btn sm ghost" @click="actions.industryAction(ind.uid, 'sellPlayer', { id: p.id, name: p.name })">卖 {{ fmtMoney(p.price * 0.8) }}</button>
          </div>
        </div>
        <div v-if="!ind.players.length" class="hint-line" style="margin:0">阵容为空，青训或转会买入</div>
      </div>
      <div class="card">
        <div style="font-size:14px;font-weight:800;margin-bottom:8px">⚡ 转会市场（每小时刷 3 名）</div>
        <div v-for="p in ind.market" :key="p.id || p.name" class="row-item">
          <div class="row-icon">🆕</div>
          <div class="row-main">
            <div class="row-name">{{ p.name }} <span class="chip" style="font-size:10.5px">能力 {{ p.ability }}</span></div>
            <div class="row-sub">身价 {{ fmtMoney(p.price) }} · 工资 {{ fmtMoney(p.wage) }}/时</div>
          </div>
          <div class="row-right">
            <button class="btn sm" @click="actions.industryAction(ind.uid, 'buyPlayer', { id: p.id, name: p.name })">签 {{ fmtMoney(p.price) }}</button>
          </div>
        </div>
        <div v-if="!ind.market.length" class="hint-line" style="margin:0">暂无挂牌球员</div>
      </div>
    </template>

    <!-- ===== 经营说明 ===== -->
    <div class="card">
      <div style="font-size:14px;font-weight:800;margin-bottom:8px">📖 经营说明</div>
      <div class="hint-line" style="margin:0 0 8px">{{ ind.desc }}</div>
      <table class="kv-table">
        <tr><td>公司评级</td><td>{{ ind.ratingName }}（{{ ind.ratingText }}）</td></tr>
        <tr><td>累计净利润</td><td>{{ fmtMoney(ind.profit) }}</td></tr>
        <tr><td>累计投入</td><td>{{ fmtMoney(ind.invested) }}</td></tr>
        <tr><td>公司估值</td><td>{{ fmtMoney(ind.value) }}</td></tr>
      </table>
    </div>
  </SubPage>
</template>

<style scoped>
.cat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.cat-cell {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  padding: 9px 10px; border-radius: 12px; border: 1.5px solid var(--line);
  background: var(--card); cursor: pointer; transition: all .15s; text-align: left; min-width: 0;
}
.cat-cell:active { transform: scale(0.97); }
.cat-cell.on { border-color: var(--gold-text); background: #FDF1DC; }
.cat-cell.locked { opacity: .55; cursor: not-allowed; }
.cat-cell.owned, .cat-cell.building, .cat-cell.dev { opacity: .6; }
.cc-name { font-size: 12.5px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.cc-sub { font-size: 11px; color: var(--ink-2); }
.cc-req { font-size: 10.5px; color: var(--ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.staff-chip {
  display: flex; align-items: center; gap: 4px; padding: 5px 8px; border-radius: 10px;
  background: var(--card); border: 1.5px solid var(--line); font-size: 12.5px; font-weight: 700;
}
.mini-stat {
  flex: 1; padding: 12px; border-radius: 12px; background: var(--bg-deep);
  border: 1.5px solid var(--line);
}
.ms-label { font-size: 11.5px; color: var(--ink-2); }
.ms-value { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; margin: 3px 0; }
.ms-sub { font-size: 11px; color: var(--ink-2); margin-top: 2px; }
.ms-sub.down { color: var(--down); }
.kv-table .up { color: var(--up); }
.kv-table .down { color: var(--down); }
/* 细进度条（里程/维修/储量/声望等通用） */
.fbar {
  height: 6px; border-radius: 3px; background: var(--bg-deep);
  overflow: hidden; margin-top: 5px;
}
.fbar > i {
  display: block; height: 100%; border-radius: 3px;
  background: linear-gradient(90deg, #FFC53D, #F59E0B);
  transition: width .3s;
}
.fbar.warn > i { background: linear-gradient(90deg, #7FB0FF, #4F7CFF); }
.fbar.bad > i { background: linear-gradient(90deg, #FF7A59, #E5484D); }
.fbar.full > i { background: linear-gradient(90deg, #6EE7B7, #10B981); }
.slotbars { display: flex; gap: 12px; }
.sb { flex: 1; min-width: 0; }
.sb > span { font-size: 11px; color: var(--ink-2); }
.cc-owned {
  font-style: normal; font-size: 10px; color: var(--gold-text);
  background: #FFF1D6; border-radius: 6px; padding: 0 5px; margin-left: 4px; font-weight: 800;
}
</style>
