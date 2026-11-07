// Plausible but wrong: replays correctly on rollback, but confirm just drops the change from pending (never folds into base),
// returns a new object on every getState, and has no duplicate-id or error handling.
export function createOptimisticStore(initialState) {
  const base = initialState;
  let pending = [];
  const ls = [];
  const emit = () => ls.forEach((l) => l());
  return {
    getState: () => pending.reduce((s, m) => m.update(s), base),
    apply(id, update) { pending.push({ id, update }); emit(); },
    confirm(id) { const had = pending.some((m) => m.id === id); pending = pending.filter((m) => m.id !== id); had && emit(); return had; },
    rollback(id) { const had = pending.some((m) => m.id === id); pending = pending.filter((m) => m.id !== id); had && emit(); return had; },
    subscribe(l) { ls.push(l); return () => ls.splice(ls.indexOf(l), 1); },
  };
}
