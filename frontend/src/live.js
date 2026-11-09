import { useEffect, useRef, useState } from "react";
import { session } from "./api";

// One shared WebSocket for the whole app; components subscribe to events.
const listeners = new Map(); // event -> Set(fn)
const statusListeners = new Set();
let ws = null;
let status = "offline";
let retry = 0;
let timer = null;
let pinger = null;

function setStatus(s) {
  status = s;
  statusListeners.forEach((fn) => fn(s));
}

export function connectLive() {
  if (ws || !session.token) return;
  const proto = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(session.token)}`);
  setStatus("connecting");
  ws.onopen = () => {
    retry = 0;
    setStatus("online");
    pinger = setInterval(() => ws?.readyState === 1 && ws.send("ping"), 25000);
  };
  ws.onmessage = (e) => {
    try {
      const { event, data } = JSON.parse(e.data);
      listeners.get(event)?.forEach((fn) => fn(data));
    } catch { /* ignore malformed */ }
  };
  ws.onclose = () => {
    clearInterval(pinger);
    ws = null;
    setStatus("offline");
    if (!session.token) return;
    retry = Math.min(retry + 1, 6);
    timer = setTimeout(connectLive, 1000 * 2 ** (retry - 1));
  };
}

export function disconnectLive() {
  clearTimeout(timer);
  clearInterval(pinger);
  if (ws) { ws.onclose = null; ws.close(); ws = null; }
  setStatus("offline");
}

export function useLive(event, handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = (d) => ref.current(d);
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  }, [event]);
}

export function useLiveStatus() {
  const [s, setS] = useState(status);
  useEffect(() => {
    statusListeners.add(setS);
    return () => statusListeners.delete(setS);
  }, []);
  return s;
}
