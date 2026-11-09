import { useEffect, useState } from "react";
import { useAuth } from "../App";
import { api, fmtDate, ROLE_LABEL } from "../api";
import { ErrorNote, Field, Modal } from "../components/ui";

function UserForm({ u, onClose, onSaved }) {
  const [f, setF] = useState({ username: u?.username || "", full_name: u?.full_name || "", role: u?.role || "security", password: "" });
  const [error, setError] = useState("");
  const save = async () => {
    try {
      const body = { ...f, password: f.password || null };
      onSaved(await api(u ? `/api/users/${u.user_id}` : "/api/users", { method: u ? "PUT" : "POST", body }));
    } catch (e) { setError(e.message); }
  };
  return (
    <Modal title={u ? `แก้ไขผู้ใช้ ${u.username}` : "เพิ่มผู้ใช้งาน"} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>ยกเลิก</button><button className="btn btn-primary" onClick={save}>บันทึก</button></>}>
      <Field label="ชื่อผู้ใช้"><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoComplete="off" /></Field>
      <Field label="ชื่อ-นามสกุล"><input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
      <Field label="บทบาท">
        <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {Object.entries(ROLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </Field>
      <Field label={u ? "รหัสผ่านใหม่" : "รหัสผ่าน"} hint={u ? "เว้นว่างไว้หากไม่ต้องการเปลี่ยน" : "อย่างน้อย 6 ตัวอักษร"}>
        <input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
      </Field>
      <ErrorNote error={error} />
    </Modal>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [error, setError] = useState("");
  const load = () => api("/api/users").then(setUsers).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const remove = async () => {
    try { await api(`/api/users/${removing.user_id}`, { method: "DELETE" }); setRemoving(null); load(); }
    catch (e) { setError(e.message); setRemoving(null); }
  };

  return (
    <div className="page page-narrow">
      <header className="page-head">
        <div>
          <h1>ผู้ใช้งาน</h1>
          <p className="muted">ผู้บริหารดูรายงานได้ เจ้าหน้าที่ รปภ. รับการแจ้งเตือน ผู้ดูแลระบบจัดการได้ทุกส่วน</p>
        </div>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>เพิ่มผู้ใช้งาน</button>
      </header>
      <ErrorNote error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>ชื่อ</th><th>ชื่อผู้ใช้</th><th>บทบาท</th><th>สร้างเมื่อ</th><th /></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.user_id}>
                <td><strong>{u.full_name}</strong>{u.user_id === me.user_id && <span className="muted"> (คุณ)</span>}</td>
                <td>{u.username}</td>
                <td><span className={`role role-${u.role}`}>{ROLE_LABEL[u.role]}</span></td>
                <td>{fmtDate(u.created_at)}</td>
                <td className="row-actions">
                  <button className="btn btn-small" onClick={() => setEditing(u)}>แก้ไข</button>
                  {u.user_id !== me.user_id && <button className="btn btn-small btn-danger-ghost" onClick={() => setRemoving(u)}>ลบ</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {editing && <UserForm u={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
      {removing && (
        <Modal title="ลบผู้ใช้งาน" onClose={() => setRemoving(null)}
          footer={<><button className="btn" onClick={() => setRemoving(null)}>ยกเลิก</button><button className="btn btn-danger" onClick={remove}>ลบ {removing.username}</button></>}>
          <p>บัญชี <strong>{removing.username}</strong> จะเข้าสู่ระบบไม่ได้อีก</p>
        </Modal>
      )}
    </div>
  );
}
