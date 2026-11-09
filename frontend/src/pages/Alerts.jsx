import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useLive } from "../live";
import AlertTicket from "../components/AlertTicket";
import { Empty } from "../components/ui";

const TABS = [
  { key: "", label: "ทั้งหมด" },
  { key: "blacklist", label: "Blacklist" },
  { key: "vip", label: "VIP" },
];

export default function Alerts() {
  const [items, setItems] = useState(null);
  const [tab, setTab] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    api("/api/alerts?acknowledged=false&limit=200").then((r) => setItems(r.items)).catch((e) => setError(e.message));
  }, []);

  useLive("alert", (a) => setItems((xs) => (xs ? [a, ...xs] : xs)));
  useLive("alert_ack", (a) => setItems((xs) => xs?.filter((x) => x.alert_id !== a.alert_id)));

  const shown = (items || []).filter((a) => !tab || a.person.category === tab);
  const count = (k) => (items || []).filter((a) => !k || a.person.category === k).length;

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1>การแจ้งเตือนที่รอรับทราบ</h1>
          <p className="muted">เมื่อตรวจสอบพื้นที่แล้ว กด “รับทราบ” เพื่อย้ายรายการไปยังประวัติ</p>
        </div>
        <Link to="/history" className="btn">ดูประวัติทั้งหมด</Link>
      </header>

      <div className="tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`tab ${tab === t.key ? "tab-on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label} <span className="tab-count">{count(t.key)}</span>
          </button>
        ))}
      </div>

      {error && <Empty title="โหลดการแจ้งเตือนไม่สำเร็จ">{error}</Empty>}
      {!items && !error && <p className="loading">กำลังโหลด…</p>}
      {items && (shown.length ? (
        <div className="ticket-list">
          {shown.map((a) => (
            <AlertTicket key={a.alert_id} alert={a} onAck={(x) => setItems((xs) => xs.filter((y) => y.alert_id !== x.alert_id))} />
          ))}
        </div>
      ) : (
        <Empty title="ไม่มีการแจ้งเตือนค้างอยู่">การแจ้งเตือนใหม่จะปรากฏที่นี่และที่ด้านบนของทุกหน้าทันทีที่กล้องตรวจพบ</Empty>
      ))}
    </div>
  );
}
