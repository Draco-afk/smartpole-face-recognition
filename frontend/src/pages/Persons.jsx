import { useEffect, useState } from "react";
import { useAuth } from "../App";
import { api, fmtDate } from "../api";
import { Avatar, Empty, ErrorNote, Field, Modal, Tag } from "../components/ui";

function PersonForm({ person, onClose, onSaved }) {
  const [f, setF] = useState({ full_name: person?.full_name || "", category: person?.category || "blacklist", note: person?.note || "" });
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(person?.photo_url || null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const pick = (e) => {
    const x = e.target.files[0];
    setFile(x || null);
    if (x) setPreview(URL.createObjectURL(x));
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      let p = await api(person ? `/api/persons/${person.person_id}` : "/api/persons", { method: person ? "PUT" : "POST", body: f });
      if (file) {
        const form = new FormData();
        form.append("file", file);
        p = await api(`/api/persons/${p.person_id}/photo`, { method: "POST", form });
      }
      onSaved(p);
    } catch (e) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <Modal title={person ? "แก้ไขข้อมูลบุคคล" : "เพิ่มบุคคลในรายชื่อเฝ้าระวัง"} onClose={onClose}
      footer={<>
        <button className="btn" onClick={onClose}>ยกเลิก</button>
        <button className="btn btn-primary" onClick={save} disabled={busy || !f.full_name.trim()}>{busy ? "กำลังบันทึก…" : "บันทึก"}</button>
      </>}>
      <div className="person-form">
        <div className="photo-pick">
          <Avatar name={f.full_name || "?"} url={preview} category={f.category} size={112} />
          <label className="btn btn-small">
            {preview ? "เปลี่ยนรูปใบหน้า" : "อัปโหลดรูปใบหน้า"}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={pick} hidden />
          </label>
          <span className="field-hint">หน้าตรง แสงชัด ไม่เกิน 5 MB</span>
        </div>
        <div className="person-fields">
          <Field label="ชื่อ-นามสกุล"><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
          <fieldset className="seg">
            <legend className="field-label">ประเภท</legend>
            {["blacklist", "vip"].map((c) => (
              <label key={c} className={`seg-opt seg-${c} ${f.category === c ? "seg-on" : ""}`}>
                <input type="radio" name="category" value={c} checked={f.category === c} onChange={() => setF({ ...f, category: c })} />
                {c === "blacklist" ? "Blacklist (เฝ้าระวัง)" : "VIP (บุคคลสำคัญ)"}
              </label>
            ))}
          </fieldset>
          <Field label="หมายเหตุ"><textarea rows="3" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="เหตุผลที่เฝ้าระวัง หรือข้อมูลสำหรับการต้อนรับ" /></Field>
        </div>
      </div>
      <ErrorNote error={error} />
    </Modal>
  );
}

export default function Persons() {
  const { user } = useAuth();
  const canEdit = user.role === "admin";
  const [items, setItems] = useState(null);
  const [cat, setCat] = useState("");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | person
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");

  const load = () => api("/api/persons").then(setItems).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const shown = (items || []).filter((p) => (!cat || p.category === cat) && (!q || p.full_name.includes(q)));

  const remove = async () => {
    try {
      await api(`/api/persons/${removing.person_id}`, { method: "DELETE" });
      setItems((xs) => xs.filter((x) => x.person_id !== removing.person_id));
      setRemoving(null);
    } catch (e) { setError(e.message); setRemoving(null); }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>รายชื่อเฝ้าระวัง</h1>
          <p className="muted">บุคคลที่ระบบจะจดจำใบหน้าและแจ้งเตือนเมื่อตรวจพบ</p>
        </div>
        {canEdit && <button className="btn btn-primary" onClick={() => setEditing("new")}>เพิ่มบุคคล</button>}
      </header>

      <div className="filters">
        <label>ค้นหาชื่อ<input value={q} onChange={(e) => setQ(e.target.value)} placeholder="พิมพ์ชื่อบุคคล" /></label>
        <label>ประเภท
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">ทั้งหมด</option><option value="blacklist">Blacklist</option><option value="vip">VIP</option>
          </select>
        </label>
      </div>
      <ErrorNote error={error} />

      {!items && !error && <p className="loading">กำลังโหลด…</p>}
      {items && (shown.length ? (
        <div className="person-grid">
          {shown.map((p) => (
            <article key={p.person_id} className={`person person-${p.category}`}>
              <Avatar name={p.full_name} url={p.photo_url} category={p.category} size={64} />
              <div className="person-body">
                <p className="person-name">{p.full_name}</p>
                <Tag category={p.category} />
                {p.note && <p className="person-note">{p.note}</p>}
                <p className={`vec ${p.embedding_count ? "vec-ok" : "vec-wait"}`}>
                  {p.embedding_count ? `พร้อมจดจำ (${p.embedding_count} เวกเตอร์ใบหน้า)` : p.photo_url ? "รอระบบ AI สร้างเวกเตอร์ใบหน้า" : "ยังไม่มีรูปใบหน้า"}
                </p>
                <p className="muted small">เพิ่มเมื่อ {fmtDate(p.created_at)}</p>
              </div>
              {canEdit && (
                <div className="person-actions">
                  <button className="btn btn-small" onClick={() => setEditing(p)}>แก้ไข</button>
                  <button className="btn btn-small btn-danger-ghost" onClick={() => setRemoving(p)}>ลบ</button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title={items.length ? "ไม่พบบุคคลตามเงื่อนไข" : "ยังไม่มีรายชื่อเฝ้าระวัง"}>
          {canEdit && !items.length ? "กด “เพิ่มบุคคล” แล้วอัปโหลดรูปใบหน้าเพื่อเริ่มใช้งาน" : "ลองเปลี่ยนคำค้นหาหรือประเภท"}
        </Empty>
      ))}

      {editing && (
        <PersonForm person={editing === "new" ? null : editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }} />
      )}
      {removing && (
        <Modal title="ลบบุคคลออกจากรายชื่อ" onClose={() => setRemoving(null)}
          footer={<>
            <button className="btn" onClick={() => setRemoving(null)}>ยกเลิก</button>
            <button className="btn btn-danger" onClick={remove}>ลบ {removing.full_name}</button>
          </>}>
          <p>ระบบจะหยุดจดจำใบหน้าของ <strong>{removing.full_name}</strong> และลบประวัติการแจ้งเตือนของบุคคลนี้ทั้งหมด การลบนี้ย้อนกลับไม่ได้</p>
        </Modal>
      )}
    </div>
  );
}
