import { useState } from "react";
import { api, fmtTime } from "../api";
import { useLive } from "../live";
import { Avatar } from "./ui";
import AlertDetail, { FaceThumb } from "./AlertDetail";

let audioCtx;
function chime(category) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = category === "blacklist" ? [880, 660, 880, 660] : [660, 990];
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.frequency.value = f;
      o.type = category === "blacklist" ? "square" : "sine";
      const t = audioCtx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.17);
    });
  } catch { /* audio not allowed yet */ }
}

/** Live alerts pop in at the top of every page. Blacklist stays until handled; VIP fades after 20 s. */
export default function AlertBanner() {
  const [items, setItems] = useState([]);
  const [detail, setDetail] = useState(null);

  const remove = (id) => setItems((xs) => xs.filter((x) => x.alert_id !== id));

  useLive("alert", (a) => {
    chime(a.person.category);
    setItems((xs) => [a, ...xs].slice(0, 3));
    if (a.person.category === "vip") setTimeout(() => remove(a.alert_id), 20000);
  });
  useLive("alert_ack", (a) => remove(a.alert_id));

  const ack = async (a) => {
    try { await api(`/api/alerts/${a.alert_id}/ack`, { method: "POST" }); } catch { /* banner stays */ }
  };

  if (!items.length && !detail) return null;
  return (
    <>
    {detail && <AlertDetail alert={detail} onClose={() => setDetail(null)} onAck={(x) => remove(x.alert_id)} />}
    <div className="banner-stack" aria-live="assertive">
      {items.map((a) => (
        <div key={a.alert_id} className={`banner banner-${a.person.category}`} role="alert">
          <div className="banner-faces">
            <FaceThumb alert={a} size={58} onClick={() => setDetail(a)} />
            <Avatar name={a.person.full_name} url={a.person.photo_url} category={a.person.category} size={40} />
          </div>
          <div className="banner-text">
            <p className="banner-title">
              {a.person.category === "blacklist" ? "พบบุคคลในรายชื่อ Blacklist" : "บุคคลสำคัญ (VIP) มาถึง"}
            </p>
            <p className="banner-name">{a.person.full_name}</p>
            <p className="banner-meta">
              {a.camera.camera_name} {a.camera.location} เวลา {fmtTime(a.detected_at)} น. ความคล้าย {Math.round(a.similarity * 100)}%
            </p>
          </div>
          <div className="banner-actions">
            <button className="btn btn-on-color" onClick={() => ack(a)}>รับทราบ</button>
            <button className="btn btn-link-light" onClick={() => setDetail(a)}>ดูภาพเหตุการณ์</button>
          </div>
          <button className="icon-btn banner-close" onClick={() => remove(a.alert_id)} aria-label="ซ่อนการแจ้งเตือนนี้">✕</button>
        </div>
      ))}
    </div>
    </>
  );
}
