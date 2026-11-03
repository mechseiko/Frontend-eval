export function createResilientFetch({ fetch, sleep, random = Math.random, maxAttempts = 4, baseDelayMs = 200, maxDelayMs = 5000 }) {
  return async function rfetch(url, options = {}) {
    // TODO
    throw new Error("not implemented");
  };
}
