import { useEffect, useState } from "react";
import { api, fmtAgo } from "../api";
import { Dir, Empty, ErrorNote, Field, Modal } from "../components/ui";

function CameraForm({ cam, onClose, onSaved }) {
  const [f, setF] = useState({ camera_name: cam?.camera_name || "", location: cam?.location || "", direction: cam?.direction || "in", rtsp_url: cam?.rtsp_url || "" });
  const [error, setError] = useState("");
  const save = async () => {
    try {
      onSaved(await api(cam ? `/api/cameras/${cam.camera_id}` : "/api/cameras", { method: cam ? "PUT" : "POST", body: f }));
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={cam ? `ตั้งค่า ${cam.camera_name}` : "เพิ่มกล้อง"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" onClick={save} disabled={!f.camera_name.trim()}>บันทึก</button></>}>
      <Field label="ชื่อกล้อง"><input value={f.camera_name} onChange={(e) => setF({ ...f, camera_name: e.target.value })} /></Field>
      <Field label="ตำแหน่งติดตั้ง"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></Field>
      <Field label="ทิศทางที่นับ">
        <select value={f.direction} onChange={(e) => setF({ ...f, direction: e.target.value })}>
          <option value="in">ขาเข้า</option><option value="out">ขาออก</option>
        </select>
      </Field>
      <Field label="RTSP URL" hint="ระบบประมวลผล AI จะเปิดสตรีมภาพจากที่อยู่นี้">
        <input value={f.rtsp_url} onChange={(e) => setF({ ...f, rtsp_url: e.target.value })} placeholder="rtsp://192.168.1.101:554/stream1" />
      </Field>
      <ErrorNote error={error} />
    </Modal>
  );
}

export default function Cameras() {
  const [cams, setCams] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const load = () => api("/api/cameras").then(setCams).catch((e) => setError(e.message));
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>กล้อง</h1>
          <p className="muted">กล้อง IP บนเสาอัจฉริยะที่ส่งภาพให้ระบบประมวลผล AI</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>เพิ่มกล้อง</button>
      </header>
      <ErrorNote error={error} />
      {cams && (cams.length ? (
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>กล้อง</th><th>ตำแหน่ง</th><th>ทิศทาง</th><th>RTSP URL</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {cams.map((c) => (
                <tr key={c.camera_id}>
                  <td><strong>{c.camera_name}</strong></td>
                  <td>{c.location}</td>
                  <td><Dir d={c.direction} /></td>
                  <td className="mono-ish">{c.rtsp_url || "–"}</td>
                  <td>
                    <span className={`status status-${c.status}`}>{c.status === "online" ? "ออนไลน์" : "ออฟไลน์"}</span>
                    <span className="muted small block">{c.last_seen ? fmtAgo(c.last_seen) : "ยังไม่เคยส่งข้อมูล"}</span>
                  </td>
                  <td><button className="btn btn-small" onClick={() => setEditing(c)}>ตั้งค่า</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <Empty title="ยังไม่มีกล้อง">เพิ่มกล้องทั้ง 3 ตัวพร้อม RTSP URL เพื่อเริ่มใช้งาน</Empty>)}
      {editing && <CameraForm cam={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}
