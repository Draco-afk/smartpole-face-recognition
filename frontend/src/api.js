const TOKEN_KEY = "sp_token";
const USER_KEY = "sp_user";

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export const session = {
  get token() { return read(TOKEN_KEY); },
  get user() { try { return JSON.parse(read(USER_KEY)); } catch { return null; } },
  save(token, user) {
    try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch { /* private mode */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch { /* ignore */ }
  },
};

export async function api(path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  let payload;
  if (form) payload = form;
  else if (body !== undefined) { headers["Content-Type"] = "application/json"; payload = JSON.stringify(body); }

  let res;
  try {
    res = await fetch(path, { method, headers, body: payload });
  } catch {
    throw new Error("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ตรวจสอบว่า Backend ทำงานอยู่");
  }
  if (res.status === 401 && !path.startsWith("/api/auth/login")) {
    session.clear();
    window.location.assign("/login");
    throw new Error("กรุณาเข้าสู่ระบบใหม่");
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) {
    const d = data?.detail;
    throw new Error(typeof d === "string" ? d : "ข้อมูลไม่ถูกต้อง ตรวจสอบแล้วลองอีกครั้ง");
  }
  return data;
}

export const ROLE_LABEL = { admin: "ผู้ดูแลระบบ", executive: "ผู้บริหาร", security: "เจ้าหน้าที่ รปภ." };
export const CATEGORY_LABEL = { blacklist: "Blacklist", vip: "VIP" };
export const DIRECTION_LABEL = { in: "ขาเข้า", out: "ขาออก" };

export const todayISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
export const shiftISO = (iso, days) => {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const nf = new Intl.NumberFormat("th-TH");
export const fmtNum = (n) => nf.format(n ?? 0);
export const fmtTime = (s) => new Date(s).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (s) => new Date(s).toLocaleString("th-TH", { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" });
export const fmtDate = (s) => new Date(s.length === 10 ? s + "T00:00:00" : s).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
export const fmtDateLong = (s) => new Date(s + "T00:00:00").toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

const rtf = new Intl.RelativeTimeFormat("th", { numeric: "auto" });
export function fmtAgo(s) {
  const sec = Math.round((new Date(s) - Date.now()) / 1000);
  if (Math.abs(sec) < 60) return "เมื่อสักครู่";
  const min = Math.round(sec / 60);
  if (Math.abs(min) < 60) return rtf.format(min, "minute");
  const hr = Math.round(min / 60);
  if (Math.abs(hr) < 24) return rtf.format(hr, "hour");
  return fmtDateTime(s);
}
