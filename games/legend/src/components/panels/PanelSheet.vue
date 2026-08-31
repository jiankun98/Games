<script setup>
// 面板外壳：近全屏 Sheet + 标题 + 关闭（横屏移动端）
defineProps({ title: String });
const emit = defineEmits(["close"]);
</script>

<template>
  <div class="sheet" @click.self="emit('close')">
    <div class="panel-box panel">
      <div class="head">
        <span class="t">{{ title }}</span>
        <button class="close" @click="emit('close')">✕</button>
      </div>
      <div class="body scroll">
        <slot />
      </div>
    </div>
  </div>
</template>

<style scoped>
.panel-box {
  width: min(760px, 96vw);
  height: min(340px, 92vh);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-bottom: 1px solid var(--line);
  flex: none;
}
.t { color: var(--gold); font-size: 15px; font-weight: 700; letter-spacing: 2px; }
.close {
  width: 34px; height: 34px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font-size: 15px;
}
.body { flex: 1; padding: 10px 14px; }
</style>
