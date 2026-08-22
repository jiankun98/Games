<script setup>
defineProps({
  modelValue: { type: String, required: true }
});
const emit = defineEmits(["update:modelValue"]);
const tabs = [
  { id: "stock", icon: "📈", name: "股票" },
  { id: "prop", icon: "🏠", name: "房产" },
  { id: "industry", icon: "🏪", name: "产业" },
  { id: "wallet", icon: "💳", name: "余额" },
  { id: "shop", icon: "🛍️", name: "购物" },
  { id: "stats", icon: "📊", name: "总览" }
];
</script>

<template>
  <nav class="tabbar">
    <button v-for="t in tabs" :key="t.id" :class="{ on: modelValue === t.id }" @click="emit('update:modelValue', t.id)">
      <span class="ti">{{ t.icon }}</span>
      <span>{{ t.name }}</span>
    </button>
  </nav>
</template>
