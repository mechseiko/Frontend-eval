export function createOfflineQueue({ storage, send, key = "queue:v1", maxAttempts = 5 }) {
  let items = load();
  let running = null;
  let inFlightId = null;

  function load() {
    try {
      const raw = storage.getItem(key);
      if (raw == null) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  const persist = () => storage.setItem(key, JSON.stringify(items));

  function enqueue(action) {
    if (items.some((i) => i.id === action.id)) return;
    if (action.dedupeKey != null) {
      const existing = items.find((i) => i.dedupeKey === action.dedupeKey && i.id !== inFlightId);
      if (existing) {
        existing.type = action.type;
        existing.payload = action.payload;
        existing.attempts = 0;
        persist();
        return;
      }
    }
    items.push({ id: action.id, type: action.type, payload: action.payload, dedupeKey: action.dedupeKey, attempts: 0 });
    persist();
  }

  async function run() {
    const sent = [];
    const failed = [];
    while (items.length > 0) {
      const item = items[0];
      inFlightId = item.id;
      let result;
      try {
        result = await send({ id: item.id, type: item.type, payload: item.payload });
      } catch {
        result = { ok: false, retryable: true };
      }
      inFlightId = null;
      if (result && result.ok === true) {
        items.shift();
        sent.push(item.id);
        persist();
      } else if (result && result.ok === false && result.retryable === false) {
        items.shift();
        failed.push({ id: item.id, reason: "rejected" });
        persist();
      } else {
        item.attempts += 1;
        if (item.attempts >= maxAttempts) {
          items.shift();
          failed.push({ id: item.id, reason: "max-attempts" });
        }
        persist();
        break;
      }
    }
    return { sent, failed, remaining: items.length };
  }

  function flush() {
    if (running) return running;
    if (items.length === 0) return Promise.resolve({ sent: [], failed: [], remaining: 0 });
    running = run().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    enqueue,
    flush,
    size: () => items.length,
    peek: () => items.map((i) => JSON.parse(JSON.stringify(i))),
  };
}
