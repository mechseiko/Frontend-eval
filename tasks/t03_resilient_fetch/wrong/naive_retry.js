// Plausible but wrong: retries everything with plain exponential backoff, ignores Retry-After, method safety and abort.
export function createResilientFetch({ fetch, sleep, random = Math.random, maxAttempts = 4, baseDelayMs = 200, maxDelayMs = 5000 }) {
  return async function rfetch(url, options = {}) {
    let lastErr;
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(url, options);
        if (res.ok) return res;
        lastErr = new Error("HTTP " + res.status);
      } catch (e) {
        lastErr = e;
      }
      await sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** i));
    }
    throw lastErr;
  };
}
