<script setup>
/* E~SSS 评级徽章 */
const props = defineProps({
  name: { type: String, default: "E" }
});
const colors = {
  E: "#9AA3AF", D: "#5BB98C", C: "#5B8DEF", B: "#A06BE0",
  A: "#E0A93C", S: "#E07B3C", SS: "#E05B5B", SSS: "#B45309"
};
</script>

<template>
  <span class="rating-badge" :style="{ background: colors[name] || '#9AA3AF' }">{{ name }}</span>
</template>

<style scoped>
.rating-badge {
  display: inline-block; min-width: 28px; padding: 2px 7px; border-radius: 7px;
  font-size: 12.5px; font-weight: 800; color: #fff; vertical-align: 2px; margin-left: 5px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.18);
}
</style>
