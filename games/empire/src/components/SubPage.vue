<script setup>
defineProps({
  title: { type: String, required: true }
});
const emit = defineEmits(["back"]);
</script>

<template>
  <div class="subpage">
    <div class="subpage-head">
      <button class="back-btn" @click="emit('back')">‹</button>
      <div class="subpage-title">{{ title }}</div>
      <slot name="action"></slot>
    </div>
    <div class="subpage-body">
      <slot></slot>
    </div>
  </div>
</template>
