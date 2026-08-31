// 后端 API 封装：token 管理 + 统一请求（同源，开发期由 vite proxy 转发到根服务器）
const TOKEN_KEY = "legend_token";

export function getToken() {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; }
}
export function setToken(t) {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
}

async function request(method, path, body) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers["x-token"] = token;
  let res;
  try {
    res = await fetch("/api/legend" + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  } catch (e) {
    return { ok: false, msg: "无法连接服务器（请确认已启动 node run/game.js）" };
  }
  let data = null;
  try { data = await res.json(); } catch (e) { /* 空响应 */ }
  if (!res.ok) return { ok: false, msg: (data && data.msg) || `请求失败（${res.status}）`, status: res.status };
  return data;
}

export const api = {
  register: (username, password) => request("POST", "/auth/register", { username, password }),
  login: (username, password) => request("POST", "/auth/login", { username, password }),
  logout: () => request("POST", "/auth/logout"),
  getSave: () => request("GET", "/save"),
  createCharacter: (state) => request("POST", "/character", { state }),
  saveGame: (state, battlePower, force) =>
    request("POST", "/save", { state, battlePower, level: state.level, force: !!force }),
  rank: (type) => request("GET", `/rank?type=${type || "power"}`)
};
