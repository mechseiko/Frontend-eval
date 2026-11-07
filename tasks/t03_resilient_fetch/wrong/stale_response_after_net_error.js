// Hardening trap: returns an earlier response instead of throwing the final network error
const RETRY_STATUS = new Set([408, 429, 500, 502, 503, 504]);
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS", "PUT", "DELETE"]);

function abortError() {
  const e = new Error("Aborted");
  e.name = "AbortError";
  return e;
}

function hasIdempotencyKey(headers) {
  if (!headers) return false;
  if (typeof headers.has === "function") return headers.has("Idempotency-Key");
  return Object.keys(headers).some((k) => k.toLowerCase() === "idempotency-key");
}

export function createResilientFetch({ fetch, sleep, random = Math.random, maxAttempts = 4, baseDelayMs = 200, maxDelayMs = 5000 }) {
  return async function rfetch(url, options = {}) {
    const method = String(options.method || "GET").toUpperCase();
    const canRetry = SAFE_METHODS.has(method) || hasIdempotencyKey(options.headers);
    const signal = options.signal;
    let lastError;
    let lastResponse;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      if (signal && signal.aborted) throw abortError();
      let response;
      try {
        response = await fetch(url, options);
      } catch (err) {
        if (err && err.name === "AbortError") throw err;
        if (!canRetry) throw err;
        lastError = err;
      }
      let retryAfterMs = null;
      if (response) {
        if (response.ok) return response;
        if (!RETRY_STATUS.has(response.status) || !canRetry) return response;
        lastResponse = response;
        lastError = undefined;
        const ra = response.headers && response.headers.get ? response.headers.get("retry-after") : null;
        if (typeof ra === "string" && /^\d+$/.test(ra.trim())) {
          retryAfterMs = parseInt(ra.trim(), 10) * 1000;
          if (retryAfterMs > maxDelayMs) return response;
        }
      }
      if (attempt === maxAttempts) break;
      const delay = retryAfterMs !== null ? retryAfterMs : Math.floor(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
      await sleep(delay, signal);
    }
    if (lastResponse) return lastResponse;
    throw lastError;
  };
}
