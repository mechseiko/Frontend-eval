import { useEffect, useId, useRef } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children }) {
  const id = useId();
  const dialogRef = useRef(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const downOnBackdrop = useRef(false);

  useEffect(() => {
    if (!open) return undefined;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dlg = dialogRef.current;
    const focusables = () => Array.from(dlg.querySelectorAll(FOCUSABLE));
    const auto = dlg.querySelector("[data-autofocus]");
    const first = auto || focusables()[0] || dlg;
    first.focus();
    return () => {
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && previouslyFocused !== document.body && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  if (!open) return null;

  function onKeyDown(e) {
    if (e.key === "Escape") {
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const dlg = dialogRef.current;
    const list = Array.from(dlg.querySelectorAll(FOCUSABLE));
    if (list.length === 0) {
      e.preventDefault();
      dlg.focus();
      return;
    }
    const active = document.activeElement;
    if (e.shiftKey) {
      if (active === list[0] || active === dlg) {
        e.preventDefault();
        list[list.length - 1].focus();
      }
    } else if (active === list[list.length - 1] || active === dlg) {
      e.preventDefault();
      list[0].focus();
    }
  }

  return (
    <div
      data-testid="backdrop"
      onMouseDown={(e) => { downOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && downOnBackdrop.current) onCloseRef.current();
        downOnBackdrop.current = false;
      }}
    >
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1} onKeyDown={onKeyDown}>
        <h2 id={id}>{title}</h2>
        {children}
      </div>
    </div>
  );
}
