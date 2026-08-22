<script setup>
import { computed } from "vue";

const props = defineProps({
  hist: { type: Array, required: true },
  up: { type: Boolean, default: true },      // true 红（涨）false 绿（跌）
  height: { type: Number, default: 76 }
});

const W = 320;
const color = computed(() => (props.up ? "#ff5257" : "#00c48c"));

const points = computed(() => {
  const h = props.hist;
  if (!h || h.length < 2) return { line: "", area: "", first: 0, last: 0 };
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  const span = hi - lo || 1;
  const pad = 6;
  const step = W / (h.length - 1);
  const xy = h.map((v, i) => {
    const x = (i * step).toFixed(1);
    const y = (pad + (1 - (v - lo) / span) * (props.height - pad * 2)).toFixed(1);
    return `${x},${y}`;
  });
  return {
    line: "M" + xy.join(" L"),
    area: `M0,${props.height} L` + xy.join(" L") + ` L${W},${props.height} Z`,
    first: h[0],
    last: h[h.length - 1]
  };
});
</script>

<template>
  <div class="spark-wrap">
    <svg :viewBox="`0 0 ${W} ${height}`" :height="height" width="100%" preserveAspectRatio="none">
      <defs>
        <linearGradient :id="`g-${up ? 'u' : 'd'}`" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" :stop-color="color" stop-opacity="0.28" />
          <stop offset="100%" :stop-color="color" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="points.area" :fill="`url(#g-${up ? 'u' : 'd'})`" />
      <path :d="points.line" fill="none" :stroke="color" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    </svg>
  </div>
</template>
