# Accessible modal dialog

Replace the basic `Dialog` in `src/solution.jsx` with a fully accessible modal (named export `Dialog`, function component, React 18, hooks allowed, no other libraries).

```jsx
<Dialog open={open} onClose={onClose} title="Settings">{children}</Dialog>
```

Markup
```
<div data-testid="backdrop">
  <div role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}>
    <h2 id={id}>{title}</h2>
    {children}
  </div>
</div>
```
Render the markup in place (no portal). When `open` is false render nothing. The `id` must be unique per component instance (use `useId`).

Behaviour
1. **Initial focus** when `open` becomes true: focus the first element inside the dialog that has the attribute `data-autofocus`; otherwise the first focusable element in DOM order; if there are none, focus the dialog element itself. Initial focus happens only when the dialog opens, not on re-renders (a re-render with a new `title`, new `children` or a new `onClose` function must not move focus).
2. **Focus trap**: Tab on the last focusable element moves focus to the first, and Shift+Tab on the first moves focus to the last (call `preventDefault`). If the focus is on the dialog element itself, Tab goes to the first focusable and Shift+Tab to the last. If there are no focusable elements, Tab and Shift+Tab keep focus on the dialog element. Focusable means: `a[href]`, `button`, `input`, `select`, `textarea` that are not disabled (and `input` not of type hidden), and any element with a `tabindex` other than `-1`.
3. **Escape** calls `onClose` once per key press, wherever focus is inside the dialog.
4. **Backdrop**: a click closes the dialog only if the press **and** the click both happened on the backdrop element itself. A click inside the dialog never closes it. If the user presses the mouse button inside the dialog and releases it on the backdrop (the click event then targets the backdrop), do **not** close.
5. **Restore focus**: remember `document.activeElement` at the moment the dialog opens. When the dialog closes (`open` becomes false) or unmounts while open, focus that element again if it is still in the document and is not `document.body`.
6. **Scroll lock**: while open set `document.body.style.overflow = "hidden"`. When the dialog closes or unmounts, restore the exact previous inline value (including the empty string).
