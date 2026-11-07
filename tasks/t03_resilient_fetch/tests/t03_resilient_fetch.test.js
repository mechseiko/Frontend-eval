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

// ---------------------------------------------------------------------------------------------
// Hardening. {L2} = flaky 2G edge cases, {L3} = interacting rules, plus a seeded differential fuzz.
import { createResilientFetch as referenceFetch } from "../__ref__/solution";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("createResilientFetch hardening", () => {
  test("[backoff] {L2} a long 2G outage: delays double, then stay at the cap", async () => {
    const h = harness([netErr(), netErr(), netErr(), netErr(), netErr(), res(200)], { maxAttempts: 6, maxDelayMs: 1000, random: () => 0.999 });
    expect((await h.rfetch("/a")).status).toBe(200);
    expect(h.delays.map((d) => d.ms)).toEqual([199, 399, 799, 999, 999]);
  });

  test("[retry-status] {L2} a mixed flaky sequence of errors and statuses ends in success", async () => {
    const h = harness([netErr(), res(503), res(408), netErr(), res(200)], { maxAttempts: 5 });
    expect((await h.rfetch("/a")).status).toBe(200);
    expect(h.calls).toHaveLength(5);
    expect(h.delays).toHaveLength(4);
  });

  test("[abort] {L3} abort fired during the backoff wait stops a keyed POST even when sleep ignores the signal", async () => {
    const calls = [];
    const delays = [];
    const c = new AbortController();
    const fetch = async () => { calls.push(1); return res(503, { "Retry-After": "1" }); };
    const sleep = async (ms) => { delays.push(ms); c.abort(); };
    const rfetch = createResilientFetch({ fetch, sleep, random: () => 0.5 });
    await expect(rfetch("/pay", { method: "POST", headers: { "Idempotency-Key": "k1" }, signal: c.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toHaveLength(1);
    expect(delays).toEqual([1000]);
  });

  test("[abort] {L3} an AbortError from fetch on a later attempt is rethrown without another retry", async () => {
    const h = harness([res(503), abortErr(), res(200)]);
    await expect(h.rfetch("/a", { method: "PUT" })).rejects.toMatchObject({ name: "AbortError" });
    expect(h.calls).toHaveLength(2);
    expect(h.delays).toHaveLength(1);
  });

  test("[abort] {L3} a non-abort sleep failure propagates immediately with no further attempt", async () => {
    const calls = [];
    const fetch = async () => { calls.push(1); return res(503); };
    const sleep = async () => { throw new Error("timer broke"); };
    const rfetch = createResilientFetch({ fetch, sleep, random: () => 0.5 });
    await expect(rfetch("/a")).rejects.toThrow("timer broke");
    expect(calls).toHaveLength(1);
  });

  test("[abort] {L3} a signal already aborted rejects with AbortError before any fetch, even for an unsafe POST", async () => {
    const c = new AbortController();
    c.abort();
    const h = harness([res(200)]);
    await expect(h.rfetch("/a", { method: "POST", signal: c.signal })).rejects.toMatchObject({ name: "AbortError" });
    expect(h.calls).toHaveLength(0);
  });

  test("[exhaustion] {L3} if the last attempt is a network error it is thrown, not the earlier 503", async () => {
    const h = harness([res(503), res(503), netErr("last-one")], { maxAttempts: 3 });
    await expect(h.rfetch("/a")).rejects.toThrow("last-one");
    expect(h.calls).toHaveLength(3);
  });

  test("[exhaustion] {L3} if the last attempt is a response it is returned, not the earlier network error", async () => {
    const h = harness([netErr(), netErr(), res(503)], { maxAttempts: 3 });
    const r = await h.rfetch("/a");
    expect(r.status).toBe(503);
    expect(h.calls).toHaveLength(3);
  });

  test("[retry-after] {L3} Retry-After 0 sleeps exactly 0 ms instead of a jittered delay", async () => {
    const h = harness([res(429, { "Retry-After": "0" }), res(200)]);
    await h.rfetch("/a");
    expect(h.delays.map((d) => d.ms)).toEqual([0]);
  });

  test("[retry-after] {L3} an oversized Retry-After on a keyed POST returns the response without sleeping", async () => {
    const h = harness([res(503, { "retry-after": "6" }), res(200)]);
    const r = await h.rfetch("/pay", { method: "POST", headers: { "idempotency-key": "k" } });
    expect(r.status).toBe(503);
    expect(h.calls).toHaveLength(1);
    expect(h.delays).toHaveLength(0);
  });

  test("[post-idempotency] {L3} lower-case method, lower-case key header and upper-case Retry-After all combine", async () => {
    const h = harness([res(503, { "RETRY-AFTER": "2" }), res(200)]);
    const r = await h.rfetch("/a", { method: "patch", headers: { "idempotency-key": "k" } });
    expect(r.status).toBe(200);
    expect(h.delays.map((d) => d.ms)).toEqual([2000]);
  });

  test("[fuzz-sequence] {L3} 250 random failure, header and abort scripts behave exactly like the reference", async () => {
    const methods = ["GET", "post", "PUT", "PATCH", "DELETE", "head", "POST", undefined];
    const hdrs = [undefined, { "Idempotency-Key": "k" }, { "idempotency-key": "k" }, { "X-Other": "1" }];
    const retryAfters = ["1", "0", "7", "abc", "-1", "1.5", "2"];
    const r = rng(424242);
    const pick = (a) => a[Math.floor(r() * a.length)];
    for (let i = 0; i < 250; i++) {
      // Plain data, generated once: both implementations must see the identical script.
      const script = Array.from({ length: 1 + Math.floor(r() * 6) }, () => {
        const x = r();
        if (x < 0.15) return { k: "ok" };
        if (x < 0.25) return { k: "res", s: pick([400, 401, 404, 501]) };
        if (x < 0.55) return { k: "res", s: pick([408, 429, 500, 502, 503, 504]), ra: r() < 0.4 ? pick(retryAfters) : null };
        if (x < 0.9) return { k: "net" };
        return { k: "abort" };
      });
      const scenario = {
        script, method: pick(methods), headers: pick(hdrs), maxAttempts: 1 + Math.floor(r() * 5),
        abortAt: r() < 0.3 ? Math.floor(r() * 3) : -1, sleepRejects: r() < 0.5, seed: Math.floor(r() * 1e9),
      };
      const run = async (create) => {
        const calls = [];
        const delays = [];
        const c = new AbortController();
        const rand = rng(scenario.seed);
        const fetch = async () => {
          const d = scenario.script[Math.min(calls.length, scenario.script.length - 1)];
          calls.push(1);
          if (d.k === "net") throw netErr();
          if (d.k === "abort") throw abortErr();
          return d.k === "ok" ? res(200) : res(d.s, d.ra == null ? {} : { "Retry-After": d.ra });
        };
        const sleep = async (ms, signal) => {
          delays.push(ms);
          if (scenario.abortAt === delays.length) {
            c.abort();
            if (scenario.sleepRejects) throw abortErr();
          } else if (signal && signal.aborted) throw abortErr();
        };
        if (scenario.abortAt === 0) c.abort();
        const rfetch = create({ fetch, sleep, random: rand, maxAttempts: scenario.maxAttempts, maxDelayMs: 3000 });
        const options = { signal: c.signal };
        if (scenario.method) options.method = scenario.method;
        if (scenario.headers) options.headers = scenario.headers;
        // The spec fixes the abort error name, not its text, so only the name is compared for aborts.
        let outcome;
        try { outcome = "resolved:" + (await rfetch("/x", options)).status; } catch (e) { outcome = "rejected:" + e.name + (e.name === "AbortError" ? "" : ":" + e.message); }
        return { outcome, calls: calls.length, delays };
      };
      const want = await run(referenceFetch);
      const got = await run(createResilientFetch);
      try { expect(got).toEqual(want); } catch (e) { e.message = `fuzz case ${i} ${JSON.stringify({ ...scenario, script: scenario.script.length })}\n` + e.message; throw e; }
    }
  });
});

describe("createResilientFetch default limits", () => {
  test("[retry-after] {L2} with default settings Retry-After 5 is honoured (5000 ms is not above the cap)", async () => {
    const h = harness([res(503, { "Retry-After": "5" }), res(200)]);
    expect((await h.rfetch("/a")).status).toBe(200);
    expect(h.delays.map((d) => d.ms)).toEqual([5000]);
  });

  test("[backoff] {L2} the default 5000 ms cap applies to a long outage", async () => {
    const h = harness([...Array(7).fill(0).map(() => netErr()), res(200)], { maxAttempts: 8, random: () => 0.999 });
    await h.rfetch("/a");
    expect(h.delays.map((d) => d.ms)).toEqual([199, 399, 799, 1598, 3196, 4995, 4995]);
  });
});
