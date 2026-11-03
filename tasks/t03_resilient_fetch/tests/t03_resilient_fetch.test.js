import { createResilientFetch } from "../src/solution";

const res = (status, headers = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {
    get: (k) => {
      const key = Object.keys(headers).find((h) => h.toLowerCase() === String(k).toLowerCase());
      return key === undefined ? null : headers[key];
    },
  },
});

function harness(script, opts = {}) {
  const calls = [];
  const delays = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    const item = script[Math.min(calls.length - 1, script.length - 1)];
    if (item instanceof Error) throw item;
    return item;
  };
  const sleep = async (ms, signal) => {
    delays.push({ ms, signal });
    if (signal && signal.aborted) {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }
  };
  const rfetch = createResilientFetch({ fetch, sleep, random: () => 0.5, ...opts });
  return { rfetch, calls, delays };
}
const netErr = (m = "net") => new TypeError(m);
const abortErr = () => Object.assign(new Error("Aborted"), { name: "AbortError" });

describe("createResilientFetch", () => {
  test("[success] ok response returned immediately without sleeping", async () => {
    const h = harness([res(200)]);
    const r = await h.rfetch("/a");
    expect(r.status).toBe(200);
    expect(h.calls).toHaveLength(1);
    expect(h.delays).toHaveLength(0);
  });

  test("[retry-status] retries retryable statuses until success", async () => {
    const h = harness([res(503), res(502), res(200)]);
    const r = await h.rfetch("/a");
    expect(r.status).toBe(200);
    expect(h.calls).toHaveLength(3);
  });

  test.each([408, 429, 500, 502, 503, 504])("[retry-status] %i is retryable", async (s) => {
    const h = harness([res(s), res(200)]);
    expect((await h.rfetch("/a")).status).toBe(200);
    expect(h.calls).toHaveLength(2);
  });

  test("[retry-status] network errors are retried", async () => {
    const h = harness([netErr(), res(200)]);
    expect((await h.rfetch("/a")).status).toBe(200);
    expect(h.calls).toHaveLength(2);
  });

  test.each([400, 401, 403, 404, 422, 501, 505])("[no-retry-status] %i returned immediately", async (s) => {
    const h = harness([res(s), res(200)]);
    const r = await h.rfetch("/a");
    expect(r.status).toBe(s);
    expect(h.calls).toHaveLength(1);
    expect(h.delays).toHaveLength(0);
  });

  test("[backoff] full jitter doubles and is capped", async () => {
    const h = harness([res(500), res(500), res(500), res(200)], { baseDelayMs: 1000, maxDelayMs: 3000, maxAttempts: 4 });
    await h.rfetch("/a");
    // random 0.5: r1 cap 1000 -> 500 ; r2 cap 2000 -> 1000 ; r3 cap min(3000,4000)=3000 -> 1500
    expect(h.delays.map((d) => d.ms)).toEqual([500, 1000, 1500]);
  });

  test("[backoff] defaults: base 200, 4 attempts", async () => {
    const h = harness([res(503)]);
    const r = await h.rfetch("/a");
    expect(r.status).toBe(503);
    expect(h.calls).toHaveLength(4);
    expect(h.delays.map((d) => d.ms)).toEqual([100, 200, 400]);
  });

  test("[backoff] no sleep after the final attempt", async () => {
    const h = harness([res(500)], { maxAttempts: 2 });
    await h.rfetch("/a");
    expect(h.calls).toHaveLength(2);
    expect(h.delays).toHaveLength(1);
  });

  test("[exhaust] returns the last retryable response", async () => {
    const h = harness([res(500), res(502), res(503)], { maxAttempts: 3 });
    expect((await h.rfetch("/a")).status).toBe(503);
  });

  test("[exhaust] throws the last network error", async () => {
    const h = harness([netErr("e1"), netErr("e2"), netErr("e3")], { maxAttempts: 3 });
    await expect(h.rfetch("/a")).rejects.toThrow("e3");
    expect(h.calls).toHaveLength(3);
  });

  test("[exhaust] network error then final response returns the response", async () => {
    const h = harness([netErr("e1"), res(503)], { maxAttempts: 2 });
    expect((await h.rfetch("/a")).status).toBe(503);
  });

  test("[exhaust] response then final network error throws the error", async () => {
    const h = harness([res(503), netErr("last")], { maxAttempts: 2 });
    await expect(h.rfetch("/a")).rejects.toThrow("last");
  });

  test("[retry-after] seconds header replaces jitter, case-insensitive", async () => {
    const h = harness([res(429, { "retry-after": "2" }), res(503, { "Retry-After": "0" }), res(200)]);
    await h.rfetch("/a");
    expect(h.delays.map((d) => d.ms)).toEqual([2000, 0]);
  });

  test("[retry-after] longer than maxDelayMs returns immediately", async () => {
    const h = harness([res(429, { "Retry-After": "30" }), res(200)], { maxDelayMs: 5000 });
    const r = await h.rfetch("/a");
    expect(r.status).toBe(429);
    expect(h.calls).toHaveLength(1);
    expect(h.delays).toHaveLength(0);
  });

  test("[retry-after] exactly maxDelayMs is allowed", async () => {
    const h = harness([res(503, { "Retry-After": "5" }), res(200)], { maxDelayMs: 5000 });
    expect((await h.rfetch("/a")).status).toBe(200);
    expect(h.delays[0].ms).toBe(5000);
  });

  test.each(["soon", "1.5", "-5", "Wed, 21 Oct 2026 07:28:00 GMT", "", "2s"])("[retry-after] ignores invalid value %j", async (v) => {
    const h = harness([res(503, { "Retry-After": v }), res(200)]);
    await h.rfetch("/a");
    expect(h.delays[0].ms).toBe(100);
  });

  test("[post-idempotency] POST without a key is never retried", async () => {
    const h1 = harness([res(503), res(200)]);
    expect((await h1.rfetch("/pay", { method: "POST" })).status).toBe(503);
    expect(h1.calls).toHaveLength(1);
    expect(h1.delays).toHaveLength(0);

    const h2 = harness([netErr("boom"), res(200)]);
    await expect(h2.rfetch("/pay", { method: "post" })).rejects.toThrow("boom");
    expect(h2.calls).toHaveLength(1);
  });

  test("[post-idempotency] PATCH without a key is not retried", async () => {
    const h = harness([res(500), res(200)]);
    expect((await h.rfetch("/x", { method: "PATCH" })).status).toBe(500);
    expect(h.calls).toHaveLength(1);
  });

  test("[post-idempotency] POST with an Idempotency-Key is retried (plain object, any case)", async () => {
    const h = harness([res(503), res(200)]);
    const r = await h.rfetch("/pay", { method: "POST", headers: { "idempotency-key": "abc" } });
    expect(r.status).toBe(200);
    expect(h.calls).toHaveLength(2);
  });

  test("[post-idempotency] POST with a Headers instance carrying the key is retried", async () => {
    const h = harness([netErr(), res(200)]);
    const headers = new Headers({ "Idempotency-Key": "k1" });
    expect((await h.rfetch("/pay", { method: "POST", headers })).status).toBe(200);
    expect(h.calls).toHaveLength(2);
  });

  test.each(["PUT", "DELETE", "HEAD", "OPTIONS", "get"])("[post-idempotency] %s is retried by default", async (m) => {
    const h = harness([res(503), res(200)]);
    expect((await h.rfetch("/x", { method: m })).status).toBe(200);
    expect(h.calls).toHaveLength(2);
  });

  test("[abort] already-aborted signal rejects without calling fetch", async () => {
    const h = harness([res(200)]);
    const c = new AbortController();
    c.abort();
    await expect(h.rfetch("/a", { signal: c.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(h.calls).toHaveLength(0);
  });

  test("[abort] fetch rejecting with AbortError is not retried", async () => {
    const h = harness([abortErr(), res(200)]);
    await expect(h.rfetch("/a")).rejects.toMatchObject({ name: "AbortError" });
    expect(h.calls).toHaveLength(1);
  });

  test("[abort] abort during the wait stops further attempts", async () => {
    const calls = [];
    const c = new AbortController();
    const fetch = async () => { calls.push(1); return res(503); };
    const sleep = (ms, signal) =>
      new Promise((_, reject) => {
        signal.addEventListener("abort", () => reject(abortErr()));
      });
    const rfetch = createResilientFetch({ fetch, sleep, random: () => 0.5 });
    const p = rfetch("/a", { signal: c.signal });
    await new Promise((r) => setImmediate(r));
    expect(calls).toHaveLength(1);
    c.abort();
    await expect(p).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(1);
  });

  test("[abort] signal aborted by the time the wait ends stops before the next fetch", async () => {
    const calls = [];
    const c = new AbortController();
    const fetch = async () => { calls.push(1); return res(503); };
    const sleep = async () => { c.abort(); };
    const rfetch = createResilientFetch({ fetch, sleep, random: () => 0.5 });
    await expect(rfetch("/a", { signal: c.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(1);
  });

  test("[args] sleep receives the signal and fetch receives the same options", async () => {
    const h = harness([res(503), res(200)]);
    const c = new AbortController();
    const options = { method: "GET", signal: c.signal };
    await h.rfetch("/a", options);
    expect(h.delays[0].signal).toBe(c.signal);
    expect(h.calls[0].options).toBe(options);
    expect(h.calls[1].options).toBe(options);
    expect(options).toEqual({ method: "GET", signal: c.signal });
  });
});
