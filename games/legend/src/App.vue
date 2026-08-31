<script setup>
// 根组件：按 boot 流程切换 登录 → 建角 → 游戏
import { useGame } from "./store.js";
import LoginView from "./components/LoginView.vue";
import CreateView from "./components/CreateView.vue";
import GameShell from "./components/GameShell.vue";

const { state } = useGame();
</script>

<template>
  <LoginView v-if="state.view === 'login' || state.view === 'loading'" :loading="state.view === 'loading'" />
  <CreateView v-else-if="state.view === 'create'" />
  <GameShell v-else />
  <div v-if="state.toast" class="toast" :class="state.toast.kind">{{ state.toast.text }}</div>
</template>
