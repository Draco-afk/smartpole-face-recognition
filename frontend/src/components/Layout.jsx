import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../App";
import { api, ROLE_LABEL } from "../api";
import { connectLive, useLive, useLiveStatus } from "../live";
import AlertBanner from "./AlertBanner";

const NAV = [
  { to: "/", label: "แดชบอร์ด", end: true },
  { to: "/live", label: "ภาพสดจากกล้อง" },
  { to: "/alerts", label: "การแจ้งเตือน", badge: true },
  { to: "/history", label: "ประวัติการตรวจพบ" },
  { to: "/reports", label: "รายงาน", roles: ["admin", "executive"] },
  { to: "/persons", label: "รายชื่อเฝ้าระวัง", roles: ["admin", "executive"] },
  { to: "/cameras", label: "กล้อง", roles: ["admin"] },
  { to: "/users", label: "ผู้ใช้งาน", roles: ["admin"] },
];

const LIVE_TEXT = { online: "เชื่อมต่อแบบเรียลไทม์", connecting: "กำลังเชื่อมต่อ…", offline: "ขาดการเชื่อมต่อ" };

export default function Layout() {
  const { user, logout } = useAuth();
  const live = useLiveStatus();
  const [pending, setPending] = useState(0);
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  const refreshPending = () =>
    api("/api/alerts?acknowledged=false&limit=1").then((r) => setPending(r.total)).catch(() => {});

  useEffect(() => { connectLive(); refreshPending(); }, []);
  useEffect(() => setOpen(false), [loc.pathname]);
  useLive("alert", refreshPending);
  useLive("alert_ack", refreshPending);

  return (
    <div className="shell">
      <aside className={`side ${open ? "side-open" : ""}`}>
        <div className="brand">
          <svg width="28" height="40" viewBox="0 0 28 40" aria-hidden="true">
            <rect x="12" y="8" width="4" height="32" rx="1" fill="currentColor" opacity=".55" />
            <rect x="4" y="12" width="20" height="5" rx="2" fill="currentColor" opacity=".8" />
            <circle cx="14" cy="6" r="5" fill="#3FBF8C" />
          </svg>
          <div>
            <strong>Smart Pole</strong>
            <span>ระบบเฝ้าระวังทางเข้า-ออก</span>
          </div>
        </div>

        <nav className="nav" aria-label="เมนูหลัก">
          {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="nav-link">
              <span>{n.label}</span>
              {n.badge && pending > 0 && <span className="nav-badge" aria-label={`รอรับทราบ ${pending} รายการ`}>{pending}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="side-foot">
          <p className={`live live-${live}`}><span className="live-dot" />{LIVE_TEXT[live]}</p>
          <div className="me">
            <strong>{user.full_name}</strong>
            <span>{ROLE_LABEL[user.role]} ({user.username})</span>
          </div>
          <button className="btn btn-ghost-dark" onClick={logout}>ออกจากระบบ</button>
        </div>
      </aside>

      <div className="topbar">
        <button className="icon-btn" onClick={() => setOpen((o) => !o)} aria-label="เปิดเมนู" aria-expanded={open}>☰</button>
        <strong>Smart Pole</strong>
        {pending > 0 && <NavLink to="/alerts" className="nav-badge">{pending}</NavLink>}
      </div>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}

      <main className="main">
        <Outlet />
      </main>
      <AlertBanner />
    </div>
  );
}
