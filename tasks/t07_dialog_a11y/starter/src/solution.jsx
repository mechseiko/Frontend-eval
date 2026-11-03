export function Dialog({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div data-testid="backdrop" onClick={onClose}>
      <div role="dialog">
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
