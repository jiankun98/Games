<script setup>
defineProps({
  title: { type: String, default: "" },
  visible: { type: Boolean, default: false }
});
const emit = defineEmits(["close"]);
</script>

<template>
  <template v-if="visible">
    <div class="mask" @click="emit('close')"></div>
    <div class="sheet" @click.stop>
      <div class="sheet-grab"></div>
      <button class="sheet-close" @click="emit('close')">✕</button>
      <slot></slot>
    </div>
  </template>
</template>
