import { useState } from "react";
import { api, fmtAgo, fmtDateTime } from "../api";
import { Avatar, Tag } from "./ui";
import AlertDetail, { FaceThumb } from "./AlertDetail";

export default function AlertTicket({ alert: a, compact = false, onAck }) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const ack = async () => {
    setBusy(true);
    try { onAck?.(await api(`/api/alerts/${a.alert_id}/ack`, { method: "POST" })); } finally { setBusy(false); }
  };
  return (
    <article className={`ticket ticket-${a.person.category} ${a.is_acknowledged ? "ticket-done" : ""}`}>
      <div className="ticket-faces">
        <FaceThumb alert={a} size={compact ? 44 : 60} onClick={() => setOpen(true)} />
        {!compact && <Avatar name={a.person.full_name} url={a.person.photo_url} category={a.person.category} size={52} />}
      </div>
      <div className="ticket-body">
        <p className="ticket-name">{a.person.full_name} <Tag category={a.person.category} /></p>
        <p className="ticket-meta">
          {a.camera.camera_name} {a.camera.location}
        </p>
        <p className="ticket-meta">
          <time dateTime={a.detected_at} title={fmtDateTime(a.detected_at)}>{compact ? fmtAgo(a.detected_at) : fmtDateTime(a.detected_at)}</time>
          <span className="sim">ความคล้าย {Math.round(a.similarity * 100)}%</span>
        </p>
        {!compact && a.person.note && <p className="ticket-note">{a.person.note}</p>}
        {!compact && <button className="btn-text" onClick={() => setOpen(true)}>ดูภาพเหตุการณ์</button>}
      </div>
      <div className="ticket-side">
        {a.is_acknowledged ? (
          <span className="done-mark">รับทราบแล้ว</span>
        ) : (
          <button className="btn btn-small" onClick={ack} disabled={busy}>{busy ? "กำลังบันทึก…" : "รับทราบ"}</button>
        )}
      </div>
      {open && <AlertDetail alert={a} onClose={() => setOpen(false)} onAck={onAck} />}
    </article>
  );
}
