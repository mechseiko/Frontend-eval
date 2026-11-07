// Plausible but wrong: good FIFO and persistence, but dedupes the in-flight item, has no single-flight, and ignores max attempts.
export function createOfflineQueue({ storage, send, key = "queue:v1" }) {
  let items = [];
  try { const p = JSON.parse(storage.getItem(key) || "[]"); items = Array.isArray(p) ? p : []; } catch { items = []; }
  const save = () => storage.setItem(key, JSON.stringify(items));
  return {
    enqueue(a) {
      if (items.some((i) => i.id === a.id)) return;
      const ex = a.dedupeKey != null ? items.find((i) => i.dedupeKey === a.dedupeKey) : null;
      if (ex) { ex.type = a.type; ex.payload = a.payload; save(); return; }
      items.push({ id: a.id, type: a.type, payload: a.payload, dedupeKey: a.dedupeKey, attempts: 0 });
      save();
    },
    async flush() {
      const sent = [], failed = [];
      while (items.length) {
        const it = items[0];
        let r;
        try { r = await send({ id: it.id, type: it.type, payload: it.payload }); } catch { r = { ok: false }; }
        if (r && r.ok === true) { items.shift(); sent.push(it.id); }
        else if (r && r.retryable === false) { items.shift(); failed.push({ id: it.id, reason: "rejected" }); }
        else { it.attempts++; save(); break; }
        save();
      }
      return { sent, failed, remaining: items.length };
    },
    size: () => items.length,
    peek: () => items.map((i) => ({ ...i })),
  };
}
