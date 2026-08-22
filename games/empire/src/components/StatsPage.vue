<script setup>
import { computed, ref } from "vue";
import { useGame } from "../store.js";
import { fmtMoney, fmtPct, fmtSignedMoney, fmtDur } from "../format.js";
import SubPage from "./SubPage.vue";
import EntryCard from "./EntryCard.vue";
import { TAX_META, TITLES } from "../data.js";

const { state, actions } = useGame();
const snap = computed(() => state.snap);

const view = ref("home");     // home | composition | flow | tax | save
const showImport = ref(false);
const importText = ref("");
const fileInput = ref(null);

const composition = computed(() => {
  const s = snap.value;
  const parts = [
    { name: "现金", icon: "💰", value: s.cash, color: "#C9B99C" },
    { name: "股票", icon: "📈", value: s.stocks.totalValue, color: "#E5484D" },
    { name: "房产", icon: "🏠", value: s.props.totalValue, color: "#4F7CFF" },
    { name: "产业", icon: "🏪", value: s.industries.reduce((a, b) => a + b.value, 0), color: "#F59E0B" },
    { name: "藏品", icon: "💎", value: s.items.totalValue, color: "#10B981" }
  ];
  const total = Math.max(1, s.netWorth);
  return { parts, total };
});

const flows = computed(() => {
  const s = snap.value;
  const ind = s.industries.reduce((a, b) => a + b.incomePerHour, 0);
  return [
    { name: "股票分红", icon: "📈", v: s.stocks.divPerHour },
    { name: "房产租金", icon: "🏠", v: s.props.rentPerHour },
    { name: "产业利润", icon: "🏪", v: ind }
  ];
});

const nextTitle = computed(() => {
  const idx = TITLES.findIndex((t) => t.name === snap.value.title);
  return TITLES[idx + 1] || null;
});
const titleProgress = computed(() => {
  if (!nextTitle.value) return 100;
  const cur = TITLES.find((t) => t.name === snap.value.title);
  const lo = cur ? cur.worth : 0;
  const hi = nextTitle.value.worth;
  return Math.min(100, Math.max(0, (snap.value.netWorth - lo) / (hi - lo) * 100));
});

const gameTime = computed(() => fmtDur(snap.value.t));

async function doExportCopy() {
  const text = actions.exportSave();
  try {
    await navigator.clipboard.writeText(text);
    alert("存档已复制到剪贴板，可粘贴保存到备忘录/文件");
  } catch (e) {
    window.prompt("复制以下存档文本：", text);
  }
}
function doExportFile() {
  const blob = new Blob([actions.exportSave()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `empire-save-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
function doImportText() {
  if (!importText.value.trim()) return;
  const r = actions.importSave(importText.value.trim());
  if (r.ok) { showImport.value = false; importText.value = ""; }
}
function onFileChange(e) {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = () => {
    const r = actions.importSave(String(reader.result));
    if (r.ok) { showImport.value = false; importText.value = ""; }
  };
  reader.readAsText(f);
  e.target.value = "";
}
</script>

<template>
  <div v-if="snap">
    <!-- ===== 入口页 ===== -->
    <template v-if="view === 'home'">
      <div class="hero">
        <div class="h-label">总资产 · {{ snap.won ? "🏆 已登顶世界首富" : "目标 1 万亿" }}</div>
        <div class="h-value">{{ fmtMoney(snap.netWorth) }}</div>
        <div style="margin:2px 0 12px">
          <div style="display:flex;justify-content:space-between;font-size:11.5px;opacity:.9;margin-bottom:5px">
            <span>👑 {{ snap.title }}</span>
            <span>{{ nextTitle ? `下一称号：${nextTitle.name}` : "已达最高称号" }}</span>
          </div>
          <div class="bar" style="background:rgba(120,60,0,.3)"><i :style="{ width: titleProgress + '%' }"></i></div>
        </div>
        <div class="h-row">
          <span>现金流 <b>{{ fmtSignedMoney(snap.flowPerHour) }}/时</b></span>
          <span>累计纳税 <b>{{ fmtMoney(snap.taxesTotal) }}</b></span>
        </div>
      </div>

      <div class="entries">
        <EntryCard icon="🧩" color="gold" name="资产构成" sub="现金 / 股票 / 房产 / 产业 / 藏品" @click="view = 'composition'" />
        <EntryCard icon="💸" color="green" name="现金流明细" :sub="`每小时 +${fmtMoney(snap.flowPerHour)}（税后）`" @click="view = 'flow'" />
        <EntryCard icon="🧾" color="red" name="税费明细" :sub="`累计纳税 ${fmtMoney(snap.taxesTotal)}`" @click="view = 'tax'" />
        <EntryCard icon="💾" color="purple" name="存档管理" :sub="`已经营 ${gameTime} · 导出 / 导入 / 重置`" @click="view = 'save'" />
      </div>
    </template>

    <!-- ===== 资产构成 ===== -->
    <SubPage v-else-if="view === 'composition'" title="资产构成" @back="view = 'home'">
      <div v-for="p in composition.parts" :key="p.name" class="card" style="margin-bottom:10px;padding:14px 16px">
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:22px">{{ p.icon }}</span>
          <span style="font-weight:800">{{ p.name }}</span>
          <span style="flex:1"></span>
          <span style="font-weight:800;font-variant-numeric:tabular-nums">{{ fmtMoney(p.value) }}</span>
          <span style="font-size:12.5px;color:var(--ink-2);width:40px;text-align:right">{{ (p.value / composition.total * 100).toFixed(0) }}%</span>
        </div>
        <div class="bar" style="margin-top:10px"><i :style="{ width: (p.value / composition.total * 100).toFixed(1) + '%', background: p.color }"></i></div>
      </div>
    </SubPage>

    <!-- ===== 现金流 ===== -->
    <SubPage v-else-if="view === 'flow'" title="现金流明细" @back="view = 'home'">
      <div class="hint-line" style="margin:0 0 10px">每小时现金流（已扣税）</div>
      <div v-for="f in flows" :key="f.name" class="row-item" style="cursor:default">
        <div class="row-icon">{{ f.icon }}</div>
        <div class="row-main"><div class="row-name">{{ f.name }}</div></div>
        <div class="row-right"><span class="row-chg up">+{{ fmtMoney(f.v) }}/时</span></div>
      </div>
      <div class="card" style="text-align:center;margin-top:14px">
        <div style="font-size:12.5px;color:var(--ink-2)">合计每小时</div>
        <div style="font-size:28px;font-weight:800" class="up">+{{ fmtMoney(snap.flowPerHour) }}</div>
        <div class="hint-line">累计净收益 {{ fmtMoney(snap.totalEarned) }}</div>
      </div>
    </SubPage>

    <!-- ===== 税费 ===== -->
    <SubPage v-else-if="view === 'tax'" title="税费明细" @back="view = 'home'">
      <div class="card" style="text-align:center">
        <div style="font-size:12.5px;color:var(--ink-2)">累计纳税总额</div>
        <div style="font-size:30px;font-weight:800;color:var(--gold-text)">{{ fmtMoney(snap.taxesTotal) }}</div>
      </div>
      <table class="kv-table">
        <tr v-for="t in TAX_META" :key="t.key">
          <td>{{ t.name }}</td>
          <td>{{ fmtMoney(snap.taxesPaid[t.key]) }}</td>
        </tr>
      </table>
    </SubPage>

    <!-- ===== 存档管理 ===== -->
    <SubPage v-else-if="view === 'save'" title="存档管理" @back="view = 'home'">
      <div class="hint-line" style="margin:0 2px 12px">自动保存于本机；换设备/防丢失请导出存档。</div>
      <button class="btn primary" @click="doExportFile">📥 下载存档文件</button>
      <button class="btn ghost" style="margin-top:10px" @click="doExportCopy">📋 复制存档文本</button>
      <button class="btn primary" style="margin-top:10px;background:linear-gradient(135deg,#A78BFA,#7C3AED);box-shadow:0 4px 0 #5B21B6;color:#fff" @click="showImport = true">📥 导入存档</button>
      <button class="btn danger" style="margin-top:24px" @click="state.confirmReset = true">🗑 重置游戏</button>
    </SubPage>

    <!-- 导入弹窗 -->
    <template v-if="showImport">
      <div class="mask" @click="showImport = false"></div>
      <div class="modal-card" style="width:min(92%,380px)">
        <h3>导入存档</h3>
        <p>粘贴存档文本，或选择存档文件（将覆盖当前进度）</p>
        <textarea class="text-input" v-model="importText" rows="4" placeholder="粘贴存档 JSON 文本…" style="resize:none"></textarea>
        <button class="btn primary" style="margin-top:10px" :disabled="!importText.trim()" @click="doImportText">确认导入</button>
        <button class="btn ghost" style="margin-top:10px" @click="fileInput && fileInput.click()">选择存档文件</button>
        <input ref="fileInput" type="file" accept=".json,.txt" style="display:none" @change="onFileChange" />
      </div>
    </template>

    <!-- 重置确认 -->
    <template v-if="state.confirmReset">
      <div class="mask" @click="state.confirmReset = false"></div>
      <div class="modal-card">
        <h3>⚠️ 重置游戏</h3>
        <p>将清空全部资产与进度，且无法恢复（除非已导出存档）。确定重置？</p>
        <div class="modal-btns">
          <button class="btn ghost" @click="state.confirmReset = false">取消</button>
          <button class="btn danger" @click="actions.resetGame()">确认重置</button>
        </div>
      </div>
    </template>
  </div>
</template>
