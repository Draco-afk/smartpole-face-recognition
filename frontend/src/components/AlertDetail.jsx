import { useState } from "react";
import { api, fmtDateTime } from "../api";
import { Avatar, Modal, Tag } from "./ui";

/** Face crop as captured by the camera (rectangular, unlike the round registered photo). */
export function FaceThumb({ alert: a, size = 56, onClick }) {
  const h = Math.round(size * 1.2);
  const style = { width: size, height: h };
  const cls = `face-thumb face-thumb-${a.person.category}`;
  const inner = a.snapshot_url
    ? <img src={a.snapshot_url} alt={`ภาพใบหน้าที่กล้องจับได้ของ ${a.person.full_name}`} />
    : <span className="face-thumb-none">ไม่มีภาพ</span>;
  if (!onClick) return <span className={cls} style={style}>{inner}</span>;
  return <button className={cls} style={style} onClick={onClick} aria-label="ดูภาพเหตุการณ์">{inner}</button>;
}

export default function AlertDetail({ alert: a, onClose, onAck }) {
  const [busy, setBusy] = useState(false);
  const [acked, setAcked] = useState(a.is_acknowledged);
  const ack = async () => {
    setBusy(true);
    try {
      const r = await api(`/api/alerts/${a.alert_id}/ack`, { method: "POST" });
      setAcked(true);
      onAck?.(r);
    } finally { setBusy(false); }
  };
  const isBlack = a.person.category === "blacklist";

  return (
    <Modal title={isBlack ? "เหตุการณ์: พบบุคคลในรายชื่อ Blacklist" : "เหตุการณ์: บุคคลสำคัญ (VIP) มาถึง"} onClose={onClose} wide
      footer={<>
        {a.frame_url && <a className="btn" href={a.frame_url} download={`alert_${a.alert_id}_frame.jpg`}>ดาวน์โหลดภาพเต็ม</a>}
        <button className="btn" onClick={onClose}>ปิด</button>
        {!acked && <button className={`btn ${isBlack ? "btn-danger" : "btn-primary"}`} onClick={ack} disabled={busy}>{busy ? "กำลังบันทึก…" : "รับทราบ"}</button>}
      </>}>
      <div className="detail">
        <figure className="detail-frame">
          {a.frame_url
            ? <img src={a.frame_url} alt={`ภาพเต็มจาก ${a.camera.camera_name} ขณะตรวจพบ`} />
            : <div className="detail-noframe">ระบบ AI ไม่ได้ส่งภาพเต็มของเหตุการณ์นี้มา</div>}
          <figcaption>ภาพจาก {a.camera.camera_name} ({a.camera.location}) เวลา {fmtDateTime(a.detected_at)}</figcaption>
        </figure>

        <div className="detail-side">
          <div className="compare">
            <figure>
              <FaceThumb alert={a} size={120} />
              <figcaption>ใบหน้าที่กล้องจับได้</figcaption>
            </figure>
            <div className={`compare-sim compare-${a.person.category}`}>
              <strong>{Math.round(a.similarity * 100)}%</strong>
              <span>ความคล้าย</span>
            </div>
            <figure>
              <Avatar name={a.person.full_name} url={a.person.photo_url} category={a.person.category} size={120} />
              <figcaption>รูปที่ลงทะเบียนไว้</figcaption>
            </figure>
          </div>
          <dl className="facts">
            <dt>ชื่อ</dt><dd>{a.person.full_name} <Tag category={a.person.category} /></dd>
            {a.person.note && <><dt>หมายเหตุ</dt><dd>{a.person.note}</dd></>}
            <dt>กล้อง</dt><dd>{a.camera.camera_name} ({a.camera.direction === "in" ? "ขาเข้า" : "ขาออก"})</dd>
            <dt>ตำแหน่ง</dt><dd>{a.camera.location}</dd>
            <dt>เวลา</dt><dd>{fmtDateTime(a.detected_at)}</dd>
            <dt>สถานะ</dt><dd>{acked ? <span className="done-mark">รับทราบแล้ว</span> : <span className="pending-mark">รอรับทราบ</span>}</dd>
          </dl>
        </div>
      </div>
    </Modal>
  );
}
