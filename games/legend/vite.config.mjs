import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// base:'./' 便于根目录静态托管；dev 端口避开根 express 的 5173，/api 代理到根服务器
export default defineConfig({
  base: "./",
  plugins: [vue()],
  server: {
    port: 5175,
    proxy: {
      "/api": "http://localhost:5173"
    }
  },
  build: {
    target: "es2018"
  }
});
