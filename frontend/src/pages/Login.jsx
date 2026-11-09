import { useState } from "react";
import { useAuth } from "../App";
import { api } from "../api";
import { ErrorNote, Field } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api("/api/auth/login", { method: "POST", body: form });
      login(r.token, r.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <svg viewBox="0 0 400 520" className="login-pole">
          <line x1="40" y1="300" x2="360" y2="300" className="lp-line" />
          <rect x="190" y="70" width="20" height="420" rx="3" className="lp-pole" />
          <rect x="120" y="96" width="160" height="16" rx="6" className="lp-arm" />
          <circle cx="200" cy="62" r="22" className="lp-lamp" />
          {[140, 190, 250].map((x, i) => (
            <g key={x}>
              <rect x={x - 14} y={120} width="28" height="18" rx="4" className="lp-cam" />
              <path d={i < 2 ? `M${x} 138 L${x - 50} 290 L${x + 50} 290 Z` : `M${x} 138 L${x - 50} 290 L${x + 50} 290 Z`} className={i < 2 ? "lp-cone-in" : "lp-cone-out"} />
            </g>
          ))}
        </svg>
        <div className="login-caption">
          <p>กล้อง 3 ตัวบนเสาอัจฉริยะ</p>
          <p>นับคนเข้า-ออก และแจ้งเตือนบุคคลเฝ้าระวังทันทีที่ตรวจพบ</p>
        </div>
      </section>

      <section className="login-form-wrap">
        <form className="login-form" onSubmit={submit}>
          <h1>เข้าสู่ระบบ</h1>
          <p className="muted">ระบบตรวจจับและจดจำใบหน้าบนเสาอัจฉริยะ</p>
          <Field label="ชื่อผู้ใช้">
            <input autoComplete="username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} required />
          </Field>
          <Field label="รหัสผ่าน">
            <input type="password" autoComplete="current-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          </Field>
          <ErrorNote error={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>{busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button>
          <p className="login-demo">บัญชีทดลอง: admin / admin123, executive / exec123, security / security123</p>
        </form>
      </section>
    </div>
  );
}
