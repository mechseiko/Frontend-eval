// Hardening trap: confirmations are folded into the base in apply order instead of confirm order
export function createOptimisticStore(initialState) {
  let base = initialState;
  let pending = [];
  let seq = 0;
  let confirmed = [];
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
      pending = [...pending, { id, update, n: seq++ }];
      visible = next;
      notify();
    },
    confirm(id) {
      const m = pending.find((x) => x.id === id);
      if (!m) return false;
      pending = pending.filter((x) => x !== m);
      confirmed = [...confirmed, m].sort((x, y) => x.n - y.n);
      base = confirmed.reduce((s, c) => c.update(s), initialState);
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
