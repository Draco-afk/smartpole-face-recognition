import { useEffect, useRef } from "react";
import { CATEGORY_LABEL } from "../api";

export function Avatar({ name, url, category, size = 44 }) {
  const initials = (name || "?").replace(/^(นาย|นาง|นางสาว)/, "").trim().slice(0, 2);
  const style = { width: size, height: size, fontSize: size * 0.36 };
  if (url) return <img className={`avatar avatar-${category || "none"}`} src={url} alt={name} style={style} />;
  return <span className={`avatar avatar-${category || "none"}`} style={style} aria-hidden="true">{initials}</span>;
}

export function Tag({ category }) {
  return <span className={`tag tag-${category}`}>{CATEGORY_LABEL[category]}</span>;
}

export function Dir({ d }) {
  return <span className={`dir dir-${d}`}>{d === "in" ? "ขาเข้า" : "ขาออก"}</span>;
}

export function Empty({ title, children }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {children && <p className="empty-text">{children}</p>}
    </div>
  );
}

export function Modal({ title, onClose, children, footer, wide = false }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement;
    ref.current?.querySelector("input, select, textarea, button")?.focus();
    const onKey = (e) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <header className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="ปิด">✕</button>
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </div>
  );
}

export function Field({ label, hint, children }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function ErrorNote({ error }) {
  if (!error) return null;
  return <p className="error-note" role="alert">{error}</p>;
}
