import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api, fmtDateTime, shiftISO, todayISO } from "../api";
import { Empty, Tag } from "../components/ui";
import AlertDetail, { FaceThumb } from "../components/AlertDetail";

const PAGE = 20;

export default function History() {
  const [params] = useSearchParams();
  const [f, setF] = useState({
    category: params.get("category") || "", acknowledged: "", camera_id: "",
    date_from: shiftISO(todayISO(), -13), date_to: todayISO(), q: "",
  });
  const [page, setPage] = useState(0);
  const [res, setRes] = useState(null);
  const [cams, setCams] = useState([]);
  const [error, setError] = useState("");
  const [detail, setDetail] = useState(null);

  useEffect(() => { api("/api/cameras").then(setCams).catch(() => {}); }, []);
  useEffect(() => {
    const qs = new URLSearchParams({ limit: PAGE, offset: page * PAGE });
    Object.entries(f).forEach(([k, v]) => v !== "" && qs.set(k, v));
    const t = setTimeout(() => api(`/api/alerts?${qs}`).then((r) => { setRes(r); setError(""); }).catch((e) => setError(e.message)), 200);
    return () => clearTimeout(t);
  }, [f, page]);

  const set = (k) => (e) => { setPage(0); setF({ ...f, [k]: e.target.value }); };
  const pages = res ? Math.ceil(res.total / PAGE) : 0;

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>ประวัติการตรวจพบบุคคล</h1>
          <p className="muted">{res ? `พบ ${res.total} รายการตามเงื่อนไขที่เลือก` : "กำลังค้นหา…"}</p>
        </div>
      </header>

      <div className="filters">
        <label>ค้นหาชื่อ<input value={f.q} onChange={set("q")} placeholder="พิมพ์ชื่อบุคคล" /></label>
        <label>ประเภท
          <select value={f.category} onChange={set("category")}>
            <option value="">ทั้งหมด</option><option value="blacklist">Blacklist</option><option value="vip">VIP</option>
          </select>
        </label>
        <label>กล้อง
          <select value={f.camera_id} onChange={set("camera_id")}>
            <option value="">ทุกกล้อง</option>
            {cams.map((c) => <option key={c.camera_id} value={c.camera_id}>{c.camera_name}</option>)}
          </select>
        </label>
        <label>สถานะ
          <select value={f.acknowledged} onChange={set("acknowledged")}>
            <option value="">ทั้งหมด</option><option value="false">รอรับทราบ</option><option value="true">รับทราบแล้ว</option>
          </select>
        </label>
        <label>ตั้งแต่<input type="date" value={f.date_from} max={f.date_to} onChange={set("date_from")} /></label>
        <label>ถึง<input type="date" value={f.date_to} min={f.date_from} max={todayISO()} onChange={set("date_to")} /></label>
      </div>

      {error && <Empty title="ค้นหาไม่สำเร็จ">{error}</Empty>}
      {res && (res.items.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr><th>บุคคล</th><th>ประเภท</th><th>กล้อง / ตำแหน่ง</th><th>เวลาที่พบ</th><th className="num">ความคล้าย</th><th>สถานะ</th><th /></tr>
            </thead>
            <tbody>
              {res.items.map((a) => (
                <tr key={a.alert_id}>
                  <td><div className="who"><FaceThumb alert={a} size={36} onClick={() => setDetail(a)} />{a.person.full_name}</div></td>
                  <td><Tag category={a.person.category} /></td>
                  <td>{a.camera.camera_name} <span className="muted">{a.camera.location}</span></td>
                  <td>{fmtDateTime(a.detected_at)}</td>
                  <td className="num">{Math.round(a.similarity * 100)}%</td>
                  <td>{a.is_acknowledged ? <span className="done-mark">รับทราบแล้ว</span> : <span className="pending-mark">รอรับทราบ</span>}</td>
                  <td><button className="btn btn-small" onClick={() => setDetail(a)}>ดูภาพ</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty title="ไม่พบรายการ">ลองขยายช่วงวันที่หรือล้างตัวกรองบางรายการ</Empty>
      ))}

      {detail && (
        <AlertDetail alert={detail} onClose={() => setDetail(null)}
          onAck={(x) => setRes((r) => ({ ...r, items: r.items.map((y) => (y.alert_id === x.alert_id ? x : y)) }))} />
      )}

      {pages > 1 && (
        <nav className="pager" aria-label="เปลี่ยนหน้า">
          <button className="btn" disabled={page === 0} onClick={() => setPage(page - 1)}>ก่อนหน้า</button>
          <span>หน้า {page + 1} จาก {pages}</span>
          <button className="btn" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>ถัดไป</button>
        </nav>
      )}
    </div>
  );
}
