<script setup>
defineProps({
  icon: { type: String, required: true },
  color: { type: String, default: "gold" },   // gold red green blue purple brown
  name: { type: String, required: true },
  sub: { type: String, default: "" },
  badge: { type: [String, Number], default: "" }
});
const emit = defineEmits(["click"]);
</script>

<template>
  <div class="entry-wrap">
    <div class="entry" @click="emit('click')">
      <div class="entry-icon" :class="color">{{ icon }}</div>
      <div class="entry-main">
        <div class="entry-name">{{ name }}</div>
        <div class="entry-sub" v-if="sub">{{ sub }}</div>
      </div>
      <div class="entry-badge" v-if="badge !== ''">{{ badge }}</div>
      <div class="entry-arrow">›</div>
    </div>
  </div>
</template>
