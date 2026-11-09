import { useEffect, useState } from "react";
import { api, fmtDate, fmtNum, session, shiftISO, todayISO } from "../api";
import { DailyBars } from "../components/Charts";
import { Empty } from "../components/ui";

const PRESETS = [
  { label: "7 วัน", days: 7 },
  { label: "14 วัน", days: 14 },
  { label: "30 วัน", days: 30 },
];

export default function Reports() {
  const [range, setRange] = useState({ from: shiftISO(todayISO(), -13), to: todayISO() });
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setRows(null);
    api(`/api/reports/daily?date_from=${range.from}&date_to=${range.to}`).then((r) => { setRows(r); setError(""); }).catch((e) => setError(e.message));
  }, [range]);

  const sum = (k) => (rows || []).reduce((a, r) => a + r[k], 0);
  const peak = rows?.length ? rows.reduce((a, r) => (r.in > a.in ? r : a), rows[0]) : null;
  const csvHref = `/api/reports/daily.csv?date_from=${range.from}&date_to=${range.to}&token=${encodeURIComponent(session.token || "")}`;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>รายงานจำนวนคนเข้า-ออก</h1>
          <p className="muted">{fmtDate(range.from)} ถึง {fmtDate(range.to)}</p>
        </div>
        <a className="btn btn-primary" href={csvHref} download>ดาวน์โหลด CSV</a>
      </header>

      <div className="filters">
        {PRESETS.map((p) => (
          <button key={p.days} className={`btn ${range.to === todayISO() && range.from === shiftISO(todayISO(), -(p.days - 1)) ? "btn-on" : ""}`}
            onClick={() => setRange({ from: shiftISO(todayISO(), -(p.days - 1)), to: todayISO() })}>{p.label}ล่าสุด</button>
        ))}
        <label>ตั้งแต่<input type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && setRange({ ...range, from: e.target.value })} /></label>
        <label>ถึง<input type="date" value={range.to} min={range.from} max={todayISO()} onChange={(e) => e.target.value && setRange({ ...range, to: e.target.value })} /></label>
      </div>

      {error && <Empty title="สร้างรายงานไม่สำเร็จ">{error}</Empty>}
      {!rows && !error && <p className="loading">กำลังสร้างรายงาน…</p>}
      {rows && (
        <>
          <section className="summary">
            <div><span className="summary-num in">{fmtNum(sum("in"))}</span><span>คนเข้าทั้งหมด</span></div>
            <div><span className="summary-num out">{fmtNum(sum("out"))}</span><span>คนออกทั้งหมด</span></div>
            <div><span className="summary-num">{fmtNum(Math.round(sum("in") / rows.length))}</span><span>คนเข้าเฉลี่ยต่อวัน</span></div>
            <div><span className="summary-num">{peak ? fmtDate(peak.date) : "–"}</span><span>วันที่มีคนเข้ามากที่สุด ({fmtNum(peak?.in)} คน)</span></div>
            <div><span className="summary-num red">{sum("blacklist")}</span><span>แจ้งเตือน Blacklist</span></div>
            <div><span className="summary-num gold">{sum("vip")}</span><span>แจ้งเตือน VIP</span></div>
          </section>

          <section className="panel">
            <h2>จำนวนคนเข้า-ออกรายวัน</h2>
            <DailyBars rows={rows} />
          </section>

          <section className="panel">
            <h2>ตารางสรุปรายวัน</h2>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>วันที่</th><th className="num">เข้า</th><th className="num">ออก</th><th className="num">Blacklist</th><th className="num">VIP</th></tr></thead>
                <tbody>
                  {[...rows].reverse().map((r) => (
                    <tr key={r.date}>
                      <td>{fmtDate(r.date)}</td>
                      <td className="num">{fmtNum(r.in)}</td>
                      <td className="num">{fmtNum(r.out)}</td>
                      <td className="num">{r.blacklist || "–"}</td>
                      <td className="num">{r.vip || "–"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
