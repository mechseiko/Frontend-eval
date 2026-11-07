// Plausible but wrong: timezone-safe, but weekend holidays collide, n=0 does not roll forward, no validation.
const p = (s) => { const [y, m, d] = s.split("-").map(Number); return Math.round(Date.UTC(y, m - 1, d) / 86400000); };
const f = (n) => new Date(n * 86400000).toISOString().slice(0, 10);
const wd = (n) => (((n + 4) % 7) + 7) % 7;
function obs(h) {
  const s = new Set();
  for (const x of h.map(p)) {
    if (wd(x) === 6) s.add(x + 2);
    else if (wd(x) === 0) s.add(x + 1);
    else s.add(x);
  }
  return s;
}
export function isBusinessDay(date, holidays = []) { const d = p(date); return wd(d) % 6 !== 0 && !obs(holidays).has(d); }
export function addBusinessDays(date, n, holidays = []) {
  let d = p(date);
  const o = obs(holidays);
  const step = n < 0 ? -1 : 1;
  for (let left = Math.abs(n); left > 0; ) { d += step; if (wd(d) % 6 !== 0 && !o.has(d)) left--; }
  return f(d);
}
export function businessDaysBetween(a, b, holidays = []) {
  const o = obs(holidays);
  let c = 0;
  for (let d = p(a) + 1; d <= p(b); d++) if (wd(d) % 6 !== 0 && !o.has(d)) c++;
  return b < a ? -businessDaysBetween(b, a, holidays) : c;
}
