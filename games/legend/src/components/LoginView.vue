<script setup>
// 登录/注册页（横屏居中卡片）
import { ref } from "vue";
import { useGame } from "../store.js";

const props = defineProps({ loading: Boolean });
const { state, actions } = useGame();

const mode = ref("login");       // login | register
const username = ref(state.username || "");
const password = ref("");
const err = ref("");

async function submit() {
  err.value = "";
  if (!username.value || !password.value) { err.value = "请输入用户名和密码"; return; }
  const r = mode.value === "login"
    ? await actions.login(username.value.trim(), password.value)
    : await actions.register(username.value.trim(), password.value);
  if (r && !r.ok) err.value = r.msg || "操作失败";
}
</script>

<template>
  <div class="view login-view">
    <div class="login-panel panel">
      <div class="logo">
        <div class="logo-icon">🗡️</div>
        <h1>传奇觉醒</h1>
        <p class="sub">玛法大陆 · 横屏挂机传奇</p>
      </div>

      <div class="tabs">
        <button class="tab" :class="{ on: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button class="tab" :class="{ on: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>

      <div class="field">
        <label>用户名（2-16 位中文/字母/数字）</label>
        <input v-model="username" maxlength="16" placeholder="输入用户名" autocomplete="username" />
      </div>
      <div class="field">
        <label>密码（6-32 位）</label>
        <input v-model="password" type="password" maxlength="32" placeholder="输入密码"
               autocomplete="current-password" @keyup.enter="submit" />
      </div>

      <div v-if="err" class="err">{{ err }}</div>

      <button class="btn primary submit" :disabled="state.busy || props.loading" @click="submit">
        {{ props.loading ? "连接服务器…" : state.busy ? "请稍候…" : mode === "login" ? "进入游戏" : "注册并开始" }}
      </button>
      <p class="hint">账号与云存档保存在你电脑的 SQLite 数据库里</p>
    </div>
  </div>
</template>

<style scoped>
.login-view { align-items: center; justify-content: center; }
.login-panel {
  width: min(420px, 92vw);
  max-height: 96vh;
  padding: 18px 26px 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.logo { text-align: center; }
.logo-icon { font-size: 34px; }
h1 {
  font-size: 26px;
  letter-spacing: 6px;
  color: var(--gold);
  text-shadow: 0 0 12px rgba(217, 164, 65, 0.35);
}
.sub { font-size: 11px; color: var(--text-dim); letter-spacing: 2px; margin-top: 2px; }
.tabs { display: flex; gap: 8px; }
.tab {
  flex: 1;
  min-height: 38px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: transparent;
  color: var(--text-dim);
  font-size: 14px;
}
.tab.on { background: rgba(217, 164, 65, 0.12); color: var(--gold); border-color: var(--gold-dim); }
.err { color: var(--bad); font-size: 12px; text-align: center; min-height: 14px; }
.submit { width: 100%; min-height: 48px; font-size: 16px; }
.hint { font-size: 11px; color: var(--text-dim); text-align: center; }
</style>
