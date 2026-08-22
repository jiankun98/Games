import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// base:'./' 便于根目录静态托管与后续 Capacitor 封装
export default defineConfig({
  base: "./",
  plugins: [vue()],
  server: {
    port: 5174 // 避开根 express 的 5173
  },
  build: {
    target: "es2018"
  }
});
