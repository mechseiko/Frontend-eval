// Plausible but wrong: traps Tab and restores focus, but steals focus on re-render, wrong scroll restore, ignores data-autofocus and the drag-release case.
import { useEffect, useId, useRef } from "react";

const SEL = "a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex='-1'])";
export function Dialog({ open, onClose, title, children }) {
  const id = useId();
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement;
    document.body.style.overflow = "hidden";
    const list = ref.current.querySelectorAll(SEL);
    (list[0] || ref.current).focus();
    return () => {
      document.body.style.overflow = "auto";
      prev && prev.focus && prev.focus();
    };
  }, [open, title, onClose]);
  if (!open) return null;
  const onKeyDown = (e) => {
    if (e.key === "Escape") onClose();
    if (e.key === "Tab") {
      const list = ref.current.querySelectorAll(SEL);
      if (!list.length) return;
      const last = list[list.length - 1], first = list[0];
      if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    }
  };
  return (
    <div data-testid="backdrop" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} onKeyDown={onKeyDown}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
