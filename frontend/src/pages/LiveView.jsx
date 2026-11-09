import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fmtAgo, session } from "../api";
import { useLive } from "../live";
import LiveFeed from "../components/LiveFeed";
import AlertTicket from "../components/AlertTicket";
import { Empty } from "../components/ui";

export default function LiveView() {
  const [params, setParams] = useSearchParams();
  const [cams, setCams] = useState(null);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState([]);
  const focusRef = useRef(null);
  const focusId = Number(params.get("cam")) || null;
  const focus = cams?.find((c) => c.camera_id === focusId);

  useEffect(() => {
    const load = () => api("/api/cameras").then(setCams).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!focusId) return;
    api(`/api/alerts?camera_id=${focusId}&limit=6`).then((r) => setRecent(r.items)).catch(() => setRecent([]));
  }, [focusId]);
  useLive("alert", (a) => { if (a.camera.camera_id === focusId) setRecent((xs) => [a, ...xs].slice(0, 6)); });
  useLive("alert_ack", (a) => setRecent((xs) => xs.map((x) => (x.alert_id === a.alert_id ? a : x))));

  const open = (id) => setParams(id ? { cam: String(id) } : {});
  const fullscreen = () => focusRef.current?.requestFullscreen?.();

  if (error) return <Empty title="โหลดรายการกล้องไม่สำเร็จ">{error}</Empty>;
  if (!cams) return <p className="loading">กำลังโหลด…</p>;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{focus ? `ภาพสดจาก ${focus.camera_name}` : "ภาพสดจากกล้อง"}</h1>
          <p className="muted">
            {focus ? `${focus.location} (${focus.direction === "in" ? "ขาเข้า" : "ขาออก"})` : "ภาพที่ระบบ AI ประมวลผลแล้ว พร้อมกรอบใบหน้าและเส้นเสมือนนับคน กดที่ภาพเพื่อขยาย"}
          </p>
        </div>
        {focus && (
          <div className="head-actions">
            <button className="btn" onClick={() => open(null)}>ดูทุกกล้อง</button>
            <a className="btn" href={`/api/cameras/${focus.camera_id}/latest.jpg?token=${encodeURIComponent(session.token || "")}`} download>บันทึกภาพ</a>
            <button className="btn btn-primary" onClick={fullscreen}>เต็มจอ</button>
          </div>
        )}
      </header>

      {focus ? (
        <div className="live-focus">
          <div ref={focusRef} className="live-focus-main">
            <LiveFeed camera={focus} size="large" />
          </div>
          <aside className="live-focus-side">
            <div className="live-others">
              {cams.filter((c) => c.camera_id !== focus.camera_id).map((c) => (
                <LiveFeed key={c.camera_id} camera={c} size="small" onClick={() => open(c.camera_id)} />
              ))}
            </div>
            <section className="panel">
              <h2>ตรวจพบล่าสุดจากกล้องนี้</h2>
              {recent.length ? (
                <div className="feed">{recent.map((a) => <AlertTicket key={a.alert_id} alert={a} compact />)}</div>
              ) : (
                <Empty title="ยังไม่พบบุคคลเฝ้าระวังจากกล้องนี้" />
              )}
            </section>
          </aside>
        </div>
      ) : (
        <div className="live-grid">
          {cams.map((c) => (
            <div key={c.camera_id} className="live-cell">
              <LiveFeed camera={c} size="medium" onClick={() => open(c.camera_id)} />
              <p className="live-cell-cap">
                <span>{c.location}</span>
                <span className="muted">{c.last_seen ? `ส่งข้อมูลล่าสุด ${fmtAgo(c.last_seen)}` : ""}</span>
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
