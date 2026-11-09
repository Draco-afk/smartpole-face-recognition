import { useEffect, useState } from "react";
import { session } from "./api";

/*
 * One shared WebSocket carries video for every camera on screen.
 * Each binary message = 1 byte camera_id + JPEG bytes.
 */
const subs = new Map(); // camId -> Set(callback)
const latest = new Map(); // camId -> { url, at, fps }
const history = new Map(); // camId -> [timestamps] for fps
let ws = null;
let wsCams = "";
let reconnectTimer = null;

function wantedCams() {
  return [...subs.keys()].filter((id) => subs.get(id).size).sort((a, b) => a - b).join(",");
}

function sync() {
  const cams = wantedCams();
  if (cams === wsCams && ws) return;
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  wsCams = cams;
  clearTimeout(reconnectTimer);
  if (!cams || !session.token) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws/video?cams=${cams}&fps=12&token=${encodeURIComponent(session.token)}`);
  ws.binaryType = "arraybuffer";
  ws.onmessage = (e) => {
    const bytes = new Uint8Array(e.data);
    const cam = bytes[0];
    const url = URL.createObjectURL(new Blob([bytes.subarray(1)], { type: "image/jpeg" }));
    const now = Date.now();
    const h = (history.get(cam) || []).filter((t) => now - t < 2000);
    h.push(now);
    history.set(cam, h);
    const prev = latest.get(cam);
    // keep the previous blob alive a moment so an <img> still decoding it doesn't flash
    if (prev) setTimeout(() => URL.revokeObjectURL(prev.url), 1000);
    const frame = { url, at: now, fps: Math.round(h.length / 2) };
    latest.set(cam, frame);
    subs.get(cam)?.forEach((fn) => fn(frame));
  };
  ws.onclose = () => {
    ws = null;
    reconnectTimer = setTimeout(() => { wsCams = ""; sync(); }, 2000);
  };
}

/** Latest frame for one camera: { url, at, fps } or null. */
export function useCameraFrame(camId) {
  const [frame, setFrame] = useState(() => latest.get(camId) || null);
  useEffect(() => {
    if (!camId) return;
    if (!subs.has(camId)) subs.set(camId, new Set());
    subs.get(camId).add(setFrame);
    sync();
    return () => {
      subs.get(camId).delete(setFrame);
      // let a page that re-subscribes right away keep the same socket
      setTimeout(sync, 300);
    };
  }, [camId]);
  return frame;
}

/** Re-renders every second so "no signal" can appear when frames stop. */
export function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const t = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}
