import { useCameraFrame, useTick } from "../video";

const STALE_MS = 5000;

export default function LiveFeed({ camera, size = "small", onClick, showMeta = true }) {
  const frame = useCameraFrame(camera.camera_id);
  useTick(1000);
  const live = frame && Date.now() - frame.at < STALE_MS;
  const Tag = onClick ? "button" : "div";

  return (
    <Tag className={`feed-box feed-${size} ${live ? "" : "feed-nosignal"}`} onClick={onClick}
      aria-label={onClick ? `ดูภาพจาก ${camera.camera_name} แบบขยาย` : undefined}>
      {frame && <img src={frame.url} alt={`ภาพสดจาก ${camera.camera_name}`} draggable="false" />}
      {!live && (
        <div className="feed-empty">
          <span>ไม่มีสัญญาณภาพ</span>
          <small>{frame ? "ภาพหยุดส่งมาเกิน 5 วินาที" : "รอระบบ AI ส่งภาพจากกล้องนี้"}</small>
        </div>
      )}
      {showMeta && (
        <div className="feed-meta">
          <span className={`feed-live ${live ? "on" : ""}`}>{live ? "สด" : "ออฟไลน์"}</span>
          <span className="feed-name">{camera.camera_name}</span>
          <span className={`feed-dir feed-dir-${camera.direction}`}>{camera.direction === "in" ? "ขาเข้า" : "ขาออก"}</span>
          {live && size !== "small" && <span className="feed-fps">{frame.fps} fps</span>}
        </div>
      )}
    </Tag>
  );
}
