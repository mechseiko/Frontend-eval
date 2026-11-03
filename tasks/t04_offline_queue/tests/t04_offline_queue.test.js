import { createOfflineQueue } from "../src/solution";

const memory = (init = {}) => {
  const m = { ...init };
  return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, _m: m };
};
const act = (id, extra = {}) => ({ id, type: "note.save", payload: { id }, ...extra });
const ok = { ok: true };
const tick = () => new Promise((r) => setImmediate(r));

function make(sendImpl, opts = {}) {
  const storage = opts.storage || memory();
  const calls = [];
  const send = async (a) => { calls.push(a.id); return sendImpl(a, calls); };
  const q = createOfflineQueue({ storage, send, ...opts.cfg });
  return { q, storage, calls, send };
}

describe("createOfflineQueue", () => {
  test("[empty-flush] empty queue resolves without sending", async () => {
    const h = make(async () => ok);
    await expect(h.q.flush()).resolves.toEqual({ sent: [], failed: [], remaining: 0 });
    expect(h.calls).toEqual([]);
  });

  test("[happy] sends in FIFO order and empties the queue", async () => {
    const h = make(async () => ok);
    ["a", "b", "c"].forEach((i) => h.q.enqueue(act(i)));
    expect(h.q.size()).toBe(3);
    const r = await h.q.flush();
    expect(h.calls).toEqual(["a", "b", "c"]);
    expect(r).toEqual({ sent: ["a", "b", "c"], failed: [], remaining: 0 });
    expect(h.q.size()).toBe(0);
  });

  test("[happy] send receives only id, type and payload", async () => {
    let seen;
    const h = make(async (a) => { seen = a; return ok; });
    h.q.enqueue(act("a", { dedupeKey: "k" }));
    await h.q.flush();
    expect(seen).toEqual({ id: "a", type: "note.save", payload: { id: "a" } });
  });

  test("[persistence] a new queue on the same storage sees pending items", () => {
    const storage = memory();
    const a = make(async () => ok, { storage });
    a.q.enqueue(act("a"));
    a.q.enqueue(act("b"));
    const b = make(async () => ok, { storage });
    expect(b.q.peek().map((i) => i.id)).toEqual(["a", "b"]);
    expect(b.q.size()).toBe(2);
  });

  test("[persistence] storage is updated after each item completes, not only at the end", async () => {
    const storage = memory();
    let release;
    const h = make((a) => (a.id === "a" ? Promise.resolve(ok) : new Promise((res) => { release = () => res(ok); })), { storage });
    h.q.enqueue(act("a"));
    h.q.enqueue(act("b"));
    const p = h.q.flush();
    await tick();
    const other = make(async () => ok, { storage });
    expect(other.q.peek().map((i) => i.id)).toEqual(["b"]);
    release();
    await p;
  });

  test("[persistence] attempts survive reload and persist after a retryable failure", async () => {
    const storage = memory();
    const h = make(async () => ({ ok: false }), { storage });
    h.q.enqueue(act("a"));
    await h.q.flush();
    const again = make(async () => ok, { storage });
    expect(again.q.peek()[0].attempts).toBe(1);
  });

  test.each(["{not json", "{}", "\"str\"", "123"])("[corrupt-storage] %j starts empty without throwing", (raw) => {
    const storage = memory({ "queue:v1": raw });
    expect(() => make(async () => ok, { storage })).not.toThrow();
    expect(make(async () => ok, { storage }).q.size()).toBe(0);
  });

  test("[corrupt-storage] custom key is honoured", () => {
    const storage = memory();
    const h = make(async () => ok, { storage, cfg: { key: "my-q" } });
    h.q.enqueue(act("a"));
    expect(Object.keys(storage._m)).toEqual(["my-q"]);
  });

  test("[idempotent-id] enqueue with an existing id is ignored", () => {
    const h = make(async () => ok);
    h.q.enqueue(act("a", { payload: { v: 1 } }));
    h.q.enqueue(act("a", { payload: { v: 2 } }));
    expect(h.q.peek()).toHaveLength(1);
    expect(h.q.peek()[0].payload).toEqual({ v: 1 });
  });

  test("[dedupe] same dedupeKey replaces payload in place and keeps position and id", () => {
    const h = make(async () => ok);
    h.q.enqueue(act("a", { dedupeKey: "doc1", payload: { v: 1 } }));
    h.q.enqueue(act("b"));
    h.q.enqueue(act("c", { dedupeKey: "doc1", type: "note.update", payload: { v: 3 } }));
    const items = h.q.peek();
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(items[0]).toMatchObject({ id: "a", type: "note.update", payload: { v: 3 }, attempts: 0 });
  });

  test("[dedupe] replacement resets attempts", async () => {
    const h = make(async () => ({ ok: false }));
    h.q.enqueue(act("a", { dedupeKey: "k" }));
    await h.q.flush();
    expect(h.q.peek()[0].attempts).toBe(1);
    h.q.enqueue(act("z", { dedupeKey: "k", payload: { v: 9 } }));
    expect(h.q.peek()[0]).toMatchObject({ id: "a", attempts: 0, payload: { v: 9 } });
  });

  test("[dedupe] items without a dedupeKey are never merged", () => {
    const h = make(async () => ok);
    h.q.enqueue(act("a"));
    h.q.enqueue(act("b"));
    expect(h.q.size()).toBe(2);
  });

  test("[in-flight-dedupe] an in-flight item is not replaced; the new action is appended", async () => {
    let release;
    const h = make((a) => (a.id === "a" ? new Promise((res) => { release = () => res(ok); }) : Promise.resolve(ok)));
    h.q.enqueue(act("a", { dedupeKey: "k", payload: { v: 1 } }));
    const p = h.q.flush();
    await tick();
    h.q.enqueue(act("b", { dedupeKey: "k", payload: { v: 2 } }));
    expect(h.q.peek().map((i) => i.id)).toEqual(["a", "b"]);
    release();
    const r = await p;
    expect(r.sent).toEqual(["a", "b"]);
  });

  test("[in-flight-dedupe] the same id as the in-flight item is ignored", async () => {
    let release;
    const h = make((a) => new Promise((res) => { release = () => res(ok); }));
    h.q.enqueue(act("a"));
    const p = h.q.flush();
    await tick();
    h.q.enqueue(act("a"));
    expect(h.q.size()).toBe(1);
    release();
    await p;
    expect(h.calls).toEqual(["a"]);
  });

  test("[fifo-stop] a retryable failure stops the flush and keeps order", async () => {
    const h = make(async (a) => (a.id === "b" ? { ok: false } : ok));
    ["a", "b", "c", "d"].forEach((i) => h.q.enqueue(act(i)));
    const r = await h.q.flush();
    expect(h.calls).toEqual(["a", "b"]);
    expect(r).toEqual({ sent: ["a"], failed: [], remaining: 3 });
    expect(h.q.peek().map((i) => i.id)).toEqual(["b", "c", "d"]);
    expect(h.q.peek()[0].attempts).toBe(1);
  });

  test.each([
    ["rejection", async () => { throw new Error("offline"); }],
    ["{ ok: false }", async () => ({ ok: false })],
    ["retryable true", async () => ({ ok: false, retryable: true })],
    ["undefined", async () => undefined],
  ])("[fifo-stop] %s is a retryable failure", async (_n, impl) => {
    const h = make(impl);
    h.q.enqueue(act("a"));
    h.q.enqueue(act("b"));
    const r = await h.q.flush();
    expect(r).toEqual({ sent: [], failed: [], remaining: 2 });
    expect(h.calls).toEqual(["a"]);
  });

  test("[permanent-failure] drops the item and continues with the next", async () => {
    const h = make(async (a) => (a.id === "b" ? { ok: false, retryable: false } : ok));
    ["a", "b", "c"].forEach((i) => h.q.enqueue(act(i)));
    const r = await h.q.flush();
    expect(r).toEqual({ sent: ["a", "c"], failed: [{ id: "b", reason: "rejected" }], remaining: 0 });
  });

  test("[max-attempts] item is dropped when attempts reach maxAttempts, flush still stops", async () => {
    const h = make(async () => ({ ok: false }), { cfg: { maxAttempts: 3 } });
    h.q.enqueue(act("a"));
    h.q.enqueue(act("b"));
    expect(await h.q.flush()).toEqual({ sent: [], failed: [], remaining: 2 });
    expect(await h.q.flush()).toEqual({ sent: [], failed: [], remaining: 2 });
    const r = await h.q.flush();
    expect(r).toEqual({ sent: [], failed: [{ id: "a", reason: "max-attempts" }], remaining: 1 });
    expect(h.q.peek().map((i) => i.id)).toEqual(["b"]);
    expect(h.calls).toEqual(["a", "a", "a"]);
  });

  test("[max-attempts] attempts accumulate across reloads", async () => {
    const storage = memory();
    for (let i = 0; i < 2; i++) {
      const h = make(async () => ({ ok: false }), { storage, cfg: { maxAttempts: 3 } });
      if (i === 0) h.q.enqueue(act("a"));
      await h.q.flush();
    }
    const h3 = make(async () => ({ ok: false }), { storage, cfg: { maxAttempts: 3 } });
    expect(await h3.q.flush()).toEqual({ sent: [], failed: [{ id: "a", reason: "max-attempts" }], remaining: 0 });
  });

  test("[single-flight] overlapping flushes never send an item twice", async () => {
    const h = make(async () => { await tick(); return ok; });
    ["a", "b", "c"].forEach((i) => h.q.enqueue(act(i)));
    const p1 = h.q.flush();
    const p2 = h.q.flush();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(h.calls).toEqual(["a", "b", "c"]);
    expect(r1).toEqual(r2);
    expect(r1.sent).toEqual(["a", "b", "c"]);
  });

  test("[single-flight] a flush after completion starts a fresh run", async () => {
    const h = make(async () => ok);
    h.q.enqueue(act("a"));
    await h.q.flush();
    h.q.enqueue(act("b"));
    const r = await h.q.flush();
    expect(r.sent).toEqual(["b"]);
  });

  test("[single-flight] flush after a failed run can retry", async () => {
    let fail = true;
    const h = make(async () => (fail ? { ok: false } : ok));
    h.q.enqueue(act("a"));
    await h.q.flush();
    fail = false;
    expect(await h.q.flush()).toEqual({ sent: ["a"], failed: [], remaining: 0 });
  });

  test("[enqueue-during-flush] items added while flushing are sent by the same flush", async () => {
    const h = make(async (a, calls) => {
      if (a.id === "a") h.q.enqueue(act("late"));
      return ok;
    });
    h.q.enqueue(act("a"));
    const r = await h.q.flush();
    expect(r).toEqual({ sent: ["a", "late"], failed: [], remaining: 0 });
  });

  test("[no-mutation] peek returns copies", () => {
    const h = make(async () => ok);
    h.q.enqueue(act("a"));
    h.q.peek()[0].id = "hacked";
    expect(h.q.peek()[0].id).toBe("a");
  });
});
