// Plausible but wrong: persists only on enqueue, continues after failures, no single-flight, no dedupe.
export function createOfflineQueue({ storage, send, key = "queue:v1", maxAttempts = 5 }) {
  let items = [];
  try { items = JSON.parse(storage.getItem(key) || "[]"); } catch { items = []; }
  return {
    enqueue(a) { items.push({ ...a, attempts: 0 }); storage.setItem(key, JSON.stringify(items)); },
    async flush() {
      const sent = [], failed = [], keep = [];
      for (const it of items) {
        try {
          const r = await send({ id: it.id, type: it.type, payload: it.payload });
          if (r && r.ok) sent.push(it.id);
          else if (r && r.retryable === false) failed.push({ id: it.id, reason: "rejected" });
          else keep.push(it);
        } catch { keep.push(it); }
      }
      items = keep;
      storage.setItem(key, JSON.stringify(items));
      return { sent, failed, remaining: items.length };
    },
    size: () => items.length,
    peek: () => items.map((i) => ({ ...i })),
  };
}
