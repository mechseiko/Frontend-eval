// Plausible but wrong: correct statuses and jitter, but retries POST and ignores abort and Retry-After limits.
const RETRY = new Set([408, 429, 500, 502, 503, 504]);
export function createResilientFetch({ fetch, sleep, random = Math.random, maxAttempts = 4, baseDelayMs = 200, maxDelayMs = 5000 }) {
  return async function rfetch(url, options = {}) {
    let last, lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const res = await fetch(url, options);
        if (res.ok || !RETRY.has(res.status)) return res;
        last = res; lastErr = undefined;
        const ra = res.headers.get("retry-after");
        if (attempt < maxAttempts) {
          const d = ra && /^\d+$/.test(ra) ? Number(ra) * 1000 : Math.floor(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
          await sleep(d, options.signal);
        }
      } catch (e) {
        lastErr = e; last = undefined;
        if (attempt < maxAttempts) await sleep(Math.floor(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))), options.signal);
      }
    }
    if (last) return last;
    throw lastErr;
  };
}
