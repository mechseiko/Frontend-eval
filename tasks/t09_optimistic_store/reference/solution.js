export function createOptimisticStore(initialState) {
  let base = initialState;
  let pending = [];
  let visible = initialState;
  const listeners = [];

  const recompute = () => pending.reduce((s, m) => m.update(s), base);
  function notify() {
    for (const l of listeners.slice()) {
      try {
        if (listeners.includes(l)) l();
      } catch {
        /* swallow */
      }
    }
  }

  return {
    getState: () => visible,
    apply(id, update) {
      if (pending.some((m) => m.id === id)) throw new Error("duplicate id " + id);
      const next = update(visible);
      pending = [...pending, { id, update }];
      visible = next;
      notify();
    },
    confirm(id) {
      const m = pending.find((x) => x.id === id);
      if (!m) return false;
      pending = pending.filter((x) => x !== m);
      base = m.update(base);
      visible = recompute();
      notify();
      return true;
    },
    rollback(id) {
      const m = pending.find((x) => x.id === id);
      if (!m) return false;
      pending = pending.filter((x) => x !== m);
      visible = recompute();
      notify();
      return true;
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };
}
