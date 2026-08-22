/* 金额/百分比/数量格式化（中文单位：万 → 亿 → 万亿 → 亿亿） */

function trimNum(x, d) {
  let s = x.toFixed(d);
  if (s.includes(".")) s = s.replace(/\.?0+$/, "");
  return s;
}

export function fmtMoney(v) {
  if (!isFinite(v)) return "-";
  const neg = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (a >= 1e16) return neg + trimNum(a / 1e16, 2) + "亿亿";
  if (a >= 1e12) return neg + trimNum(a / 1e12, 2) + "万亿";
  if (a >= 1e8) return neg + trimNum(a / 1e8, 2) + "亿";
  if (a >= 1e4) return neg + trimNum(a / 1e4, 2) + "万";
  if (a >= 1) return neg + trimNum(a, a % 1 === 0 ? 0 : 2);
  return neg + a.toFixed(2);
}

export function fmtPrice(v) {
  if (v >= 1000) return trimNum(v, 1);
  if (v >= 1) return trimNum(v, 2);
  return v.toFixed(3);
}

export function fmtPct(v, d) {
  if (!isFinite(v)) return "-";
  return (v * 100).toFixed(d == null ? 2 : d) + "%";
}

export function fmtSignedPct(v, d) {
  const s = fmtPct(Math.abs(v), d);
  return (v > 0 ? "+" : v < 0 ? "-" : "") + s;
}

export function fmtSignedMoney(v) {
  return (v > 0 ? "+" : "") + fmtMoney(v);
}

export function fmtQty(n) {
  n = Math.floor(n);
  if (n >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (n >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return String(n);
}

/* 离线秒数 → "4小时23分" */
export function fmtDur(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 24) {
    const d = Math.floor(h / 24);
    return `${d}天${h % 24}小时`;
  }
  if (h > 0) return `${h}小时${m}分`;
  return `${m}分钟`;
}
