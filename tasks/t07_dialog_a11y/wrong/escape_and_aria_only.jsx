// Plausible but wrong: ARIA and Escape done, initial focus done, but no trap, no restore, no scroll lock, backdrop closes on any click.
import { useEffect, useId, useRef } from "react";

export function Dialog({ open, onClose, title, children }) {
  const id = useId();
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const el = ref.current.querySelector("button, input, a[href], select, textarea") || ref.current;
    el.focus();
    const h = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div data-testid="backdrop" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
