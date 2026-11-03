# Retrying fetch wrapper

Implement `createResilientFetch` in `src/solution.js` (named export).

```js
const rfetch = createResilientFetch({ fetch, sleep, random = Math.random,
                                      maxAttempts = 4, baseDelayMs = 200, maxDelayMs = 5000 });
const response = await rfetch(url, options);
```

- `fetch(url, options)` is the injected fetch (returns a Response-like with `status`, `ok`, `headers.get(name)`).
- `sleep(ms, signal)` is injected and returns a Promise. Always call it as `sleep(delayMs, options.signal)`.
- `random()` returns a number in [0, 1).
- `maxAttempts` is the **total** number of attempts including the first.

Behaviour
1. A response with `ok === true` is returned immediately.
2. **Retryable failures**: a network error (fetch rejects), or a response with status 408, 429, 500, 502, 503 or 504. Any other non-ok response (400, 401, 404, 501, 505 ...) is returned immediately with no retry and no sleep.
3. **Backoff (full jitter)**: before retry number `r` (1 for the first retry), sleep `Math.floor(random() * Math.min(maxDelayMs, baseDelayMs * 2 ** (r - 1)))` ms.
4. **Retry-After**: if a retryable response has a `Retry-After` header that is a non-negative whole number of seconds (digits only), sleep exactly `seconds * 1000` ms instead of the jittered delay. If that value is greater than `maxDelayMs`, do not retry: return that response immediately without sleeping. Any other header value (HTTP dates, decimals, negatives, text) is ignored and normal backoff applies. Header names are case-insensitive (use `headers.get`).
5. **Exhaustion**: after `maxAttempts` attempts, return the last response if the last attempt produced one, or throw the last error if the last attempt was a network error.
6. **Method safety**: `options.method` defaults to `GET` and is case-insensitive. Only `GET`, `HEAD`, `OPTIONS`, `PUT` and `DELETE` are retried. `POST` and `PATCH` are retried **only if** the request has an `Idempotency-Key` header (name case-insensitive; `options.headers` may be a plain object or a `Headers` instance). For a non-retryable method, a network error is thrown immediately and a retryable status is returned immediately (never sleep).
7. **Abort**: if `options.signal` is already aborted before an attempt, reject with an error whose `name` is `"AbortError"` without calling `fetch`. If `fetch` rejects with an error named `AbortError`, rethrow it immediately (no retry). If `sleep` rejects (for example because the signal aborted during the wait), propagate that rejection immediately and make no further attempts.
8. Do not mutate `options`. Pass the same `options` object through to `fetch` on every attempt.
