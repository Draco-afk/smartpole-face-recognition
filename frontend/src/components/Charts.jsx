import { useState } from "react";
import { fmtDate, fmtNum } from "../api";

/** Entries rise above the line, exits hang below it: the gate in chart form. */
export function HourlyMirror({ data, currentHour }) {
  const [hover, setHover] = useState(null);
  const W = 960, H = 280, mid = 140, pad = 34, top = 18;
  const max = Math.max(5, ...data.map((d) => Math.max(d.in, d.out)));
  const step = (W - pad * 2) / 24;
  const bw = step * 0.62;
  const sc = (v) => (v / max) * (mid - top - 6);
  const tick = Math.ceil(max / 2 / 5) * 5 || 5;

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="จำนวนคนเข้าและออกรายชั่วโมง">
        {[tick, tick * 2].filter((t) => t <= max).map((t) => (
          <g key={t} className="grid">
            <line x1={pad} x2={W - pad} y1={mid - sc(t)} y2={mid - sc(t)} />
            <line x1={pad} x2={W - pad} y1={mid + sc(t)} y2={mid + sc(t)} />
            <text x={pad - 6} y={mid - sc(t)} textAnchor="end" dominantBaseline="middle">{t}</text>
            <text x={pad - 6} y={mid + sc(t)} textAnchor="end" dominantBaseline="middle">{t}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = pad + i * step + (step - bw) / 2;
          const now = d.hour === currentHour;
          return (
            <g key={d.hour} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)}>
              <rect x={pad + i * step} y={top} width={step} height={H - top - 24} fill="transparent" />
              {now && <rect x={pad + i * step} y={top} width={step} height={H - top - 24} className="now-col" />}
              <rect x={x} y={mid - sc(d.in)} width={bw} height={sc(d.in)} className="bar-in" rx="2" />
              <rect x={x} y={mid} width={bw} height={sc(d.out)} className="bar-out" rx="2" />
              {i % 3 === 0 && <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="axis">{String(d.hour).padStart(2, "0")}:00</text>}
            </g>
          );
        })}
        <line x1={pad} x2={W - pad} y1={mid} y2={mid} className="gate-line" />
      </svg>
      <div className="chart-legend">
        <span><i className="sw sw-in" />เข้า (เหนือเส้น)</span>
        <span><i className="sw sw-out" />ออก (ใต้เส้น)</span>
        <span className="chart-hover" aria-live="polite">
          {hover ? `${String(hover.hour).padStart(2, "0")}:00–${String(hover.hour).padStart(2, "0")}:59  เข้า ${fmtNum(hover.in)}  ออก ${fmtNum(hover.out)}` : "ชี้ที่แท่งเพื่อดูตัวเลข"}
        </span>
      </div>
    </div>
  );
}

export function DailyBars({ rows }) {
  const [hover, setHover] = useState(null);
  const W = 960, H = 260, pad = 40, top = 14, base = H - 30;
  const max = Math.max(5, ...rows.map((r) => Math.max(r.in, r.out)));
  const step = (W - pad * 2) / Math.max(rows.length, 1);
  const bw = Math.min(18, step * 0.36);
  const sc = (v) => (v / max) * (base - top);
  const every = Math.ceil(rows.length / 12);

  return (
    <div className="chart-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label="จำนวนคนเข้าและออกรายวัน">
        {[0.5, 1].map((f) => (
          <g key={f} className="grid">
            <line x1={pad} x2={W - pad} y1={base - sc(max * f)} y2={base - sc(max * f)} />
            <text x={pad - 6} y={base - sc(max * f)} textAnchor="end" dominantBaseline="middle">{Math.round(max * f)}</text>
          </g>
        ))}
        {rows.map((r, i) => {
          const cx = pad + i * step + step / 2;
          return (
            <g key={r.date} onMouseEnter={() => setHover(r)} onMouseLeave={() => setHover(null)}>
              <rect x={pad + i * step} y={top} width={step} height={base - top} fill="transparent" />
              <rect x={cx - bw - 1} y={base - sc(r.in)} width={bw} height={sc(r.in)} className="bar-in" rx="2" />
              <rect x={cx + 1} y={base - sc(r.out)} width={bw} height={sc(r.out)} className="bar-out" rx="2" />
              {i % every === 0 && <text x={cx} y={H - 8} textAnchor="middle" className="axis">{fmtDate(r.date).replace(/ \d+$/, "")}</text>}
            </g>
          );
        })}
        <line x1={pad} x2={W - pad} y1={base} y2={base} className="axis-line" />
      </svg>
      <div className="chart-legend">
        <span><i className="sw sw-in" />เข้า</span>
        <span><i className="sw sw-out" />ออก</span>
        <span className="chart-hover" aria-live="polite">
          {hover ? `${fmtDate(hover.date)}  เข้า ${fmtNum(hover.in)}  ออก ${fmtNum(hover.out)}` : "ชี้ที่แท่งเพื่อดูตัวเลข"}
        </span>
      </div>
    </div>
  );
}
