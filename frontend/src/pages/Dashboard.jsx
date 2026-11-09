import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, fmtAgo, fmtDateLong, fmtNum, shiftISO, todayISO } from "../api";
import { useLive } from "../live";
import { HourlyMirror } from "../components/Charts";
import AlertTicket from "../components/AlertTicket";
import { Empty } from "../components/ui";
import LiveFeed from "../components/LiveFeed";
import { useCameraFrame, useTick } from "../video";

function Tally({ label, value, kind, sub }) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current !== value) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      prev.current = value;
      return () => clearTimeout(t);
    }
  }, [value]);
  return (
    <div className={`tally tally-${kind}`}>
      <span className="tally-label">{label}</span>
      <span className={`tally-num ${flash ? "tally-flash" : ""}`}>{fmtNum(value)}</span>
      {sub && <span className="tally-sub">{sub}</span>}
    </div>
  );
}

function CameraTile({ c }) {
  const nav = useNavigate();
  const frame = useCameraFrame(c.camera_id);
  useTick(2000);
  const status = frame && Date.now() - frame.at < 5000 ? "online" : c.status;
  return (
    <div className={`cam cam-${status}`}>
      <LiveFeed camera={c} size="small" showMeta={false} onClick={() => nav(`/live?cam=${c.camera_id}`)} />
      <div className="cam-head">
        <strong>{c.camera_name}</strong>
        <span className="cam-status">{status === "online" ? "ออนไลน์" : "ออฟไลน์"}</span>
      </div>
      <p className="cam-loc">{c.location}</p>
      <p className="cam-count"><span>{fmtNum(c.count)}</span> คน{c.direction === "in" ? "เข้า" : "ออก"}</p>
      <p className="cam-seen">{c.last_seen ? `ส่งข้อมูลล่าสุด ${fmtAgo(c.last_seen)}` : "ยังไม่เคยส่งข้อมูล"}</p>
    </div>
  );
}

export default function Dashboard() {
  const [day, setDay] = useState(todayISO());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const isToday = day === todayISO();

  const load = useCallback(() => {
    api(`/api/dashboard?d=${day}`).then((d) => { setData(d); setError(""); }).catch((e) => setError(e.message));
  }, [day]);
  useEffect(() => { load(); }, [load]);

  // keep "today" live; camera status refreshes every 30 s
  useEffect(() => {
    if (!isToday) return;
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [isToday, load]);

  useLive("count", (e) => {
    if (!isToday) return;
    setData((d) => d && {
      ...d, in: e.in, out: e.out, inside: e.inside,
      hourly: d.hourly.map((h) => (h.hour === e.hour ? { ...h, [e.direction]: h[e.direction] + 1 } : h)),
      cameras: d.cameras.map((c) => (c.camera_id === e.camera_id ? { ...c, count: c.count + 1, status: "online", last_seen: new Date().toISOString() } : c)),
    });
  });
  useLive("alert", (a) => {
    if (!isToday) return;
    setData((d) => d && {
      ...d, latest_alerts: [a, ...d.latest_alerts].slice(0, 8),
      alerts: { ...d.alerts, [a.person.category]: d.alerts[a.person.category] + 1, pending: d.alerts.pending + 1 },
    });
  });
  useLive("alert_ack", (a) => {
    setData((d) => d && {
      ...d, latest_alerts: d.latest_alerts.map((x) => (x.alert_id === a.alert_id ? a : x)),
      alerts: { ...d.alerts, pending: Math.max(0, d.alerts.pending - (d.latest_alerts.some((x) => x.alert_id === a.alert_id && !x.is_acknowledged) ? 1 : 0)) },
    });
  });

  if (error && !data) return <Empty title="โหลดแดชบอร์ดไม่สำเร็จ">{error}</Empty>;
  if (!data) return <p className="loading">กำลังโหลดข้อมูล…</p>;

  const camsIn = data.cameras.filter((c) => c.direction === "in");
  const camsOut = data.cameras.filter((c) => c.direction === "out");

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>ภาพรวมทางเข้า-ออก</h1>
          <p className="muted">{fmtDateLong(day)}{isToday && " (อัปเดตแบบเรียลไทม์)"}</p>
        </div>
        <div className="day-pick">
          <button className="btn" onClick={() => setDay(shiftISO(day, -1))} aria-label="วันก่อนหน้า">‹</button>
          <input type="date" value={day} max={todayISO()} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="เลือกวันที่" />
          <button className="btn" onClick={() => setDay(shiftISO(day, 1))} disabled={isToday} aria-label="วันถัดไป">›</button>
          {!isToday && <button className="btn" onClick={() => setDay(todayISO())}>วันนี้</button>}
        </div>
      </header>

      <section className="gate" aria-label="สรุปจำนวนคน">
        <Tally label="เข้า" value={data.in} kind="in" sub="ผ่านกล้อง 1 และ 2" />
        <Tally label={isToday ? "อยู่ในพื้นที่ตอนนี้" : "คงค้างในพื้นที่ ณ สิ้นวัน"} value={data.inside} kind="inside" sub="คำนวณจาก เข้า − ออก" />
        <Tally label="ออก" value={data.out} kind="out" sub="ผ่านกล้อง 3" />
        <div className="gate-alerts">
          <Link to="/history?category=blacklist" className="ga ga-blacklist"><span>{data.alerts.blacklist}</span>Blacklist</Link>
          <Link to="/history?category=vip" className="ga ga-vip"><span>{data.alerts.vip}</span>VIP</Link>
          <Link to="/alerts" className="ga ga-pending"><span>{data.alerts.pending}</span>รอรับทราบ</Link>
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel">
          <h2>จำนวนคนรายชั่วโมง</h2>
          <HourlyMirror data={data.hourly} currentHour={isToday ? new Date().getHours() : -1} />
        </section>

        <section className="panel panel-feed">
          <div className="panel-head">
            <h2>การแจ้งเตือนล่าสุด</h2>
            <Link to="/history" className="link">ดูทั้งหมด</Link>
          </div>
          {data.latest_alerts.length ? (
            <div className="feed">
              {data.latest_alerts.map((a) => <AlertTicket key={a.alert_id} alert={a} compact />)}
            </div>
          ) : (
            <Empty title="ยังไม่พบบุคคลเฝ้าระวังในวันนี้">เมื่อกล้องจดจำใบหน้าบุคคล Blacklist หรือ VIP ได้ จะแสดงที่นี่ทันที</Empty>
          )}
        </section>
      </div>

      <section className="panel">
        <h2>สถานะกล้องบนเสาอัจฉริยะ</h2>
        <div className="pole-strip">
          <div className="lane">
            <p className="lane-title lane-in">ช่องทางเข้า</p>
            <div className="lane-cams">{camsIn.map((c) => <CameraTile key={c.camera_id} c={c} />)}</div>
          </div>
          <div className="pole-mark" aria-hidden="true"><span /></div>
          <div className="lane">
            <p className="lane-title lane-out">ช่องทางออก</p>
            <div className="lane-cams">{camsOut.map((c) => <CameraTile key={c.camera_id} c={c} />)}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
