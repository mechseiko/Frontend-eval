// Plausible but wrong: rollback restores the snapshot taken before the change, erasing later optimistic changes.
export function createOptimisticStore(initialState) {
  let state = initialState;
  const snaps = new Map();
  const listeners = new Set();
  const notify = () => listeners.forEach((l) => l());
  return {
    getState: () => state,
    apply(id, update) { snaps.set(id, state); state = update(state); notify(); },
    confirm(id) { if (!snaps.has(id)) return false; snaps.delete(id); notify(); return true; },
    rollback(id) { if (!snaps.has(id)) return false; state = snaps.get(id); snaps.delete(id); notify(); return true; },
    subscribe(l) { listeners.add(l); return () => listeners.delete(l); },
  };
}
