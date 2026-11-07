const RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY = 86400000;

function parse(s) {
  if (typeof s !== "string") throw new RangeError("date must be a string");
  const m = RE.exec(s);
  if (!m) throw new RangeError("bad date: " + s);
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) throw new RangeError("bad date: " + s);
  return Math.round(t / DAY);
}
const fmt = (n) => new Date(n * DAY).toISOString().slice(0, 10);
const weekday = (n) => (((n + 4) % 7) + 7) % 7; // 0 = Sunday
const isWeekend = (n) => weekday(n) === 0 || weekday(n) === 6;

function observed(holidays) {
  if (!Array.isArray(holidays)) throw new RangeError("holidays must be an array");
  const days = holidays.map(parse);
  const set = new Set(days.filter((d) => !isWeekend(d)));
  const weekend = days.filter(isWeekend).sort((a, b) => a - b);
  for (const h of weekend) {
    let c = h + ((8 - weekday(h)) % 7 || 7); // next Monday
    if (weekday(h) === 6) c = h + 2;
    if (weekday(h) === 0) c = h + 1;
    while (set.has(c) || isWeekend(c)) c += 1;
    set.add(c);
  }
  return set;
}

export function isBusinessDay(date, holidays = []) {
  const d = parse(date);
  const obs = observed(holidays);
  return !isWeekend(d) && !obs.has(d);
}

export function addBusinessDays(date, n, holidays = []) {
  const start = parse(date);
  if (!Number.isInteger(n)) throw new RangeError("n must be an integer");
  const obs = observed(holidays);
  const ok = (d) => !isWeekend(d) && !obs.has(d);
  let d = start;
  if (n === 0) {
    while (!ok(d)) d += 1;
    return fmt(d);
  }
  const step = n > 0 ? 1 : -1;
  let left = Math.abs(n);
  while (left > 0) {
    d += step;
    if (ok(d)) left -= 1;
  }
  return fmt(d);
}

export function businessDaysBetween(start, end, holidays = []) {
  const a = parse(start);
  const b = parse(end);
  const obs = observed(holidays);
  if (b < a) return -businessDaysBetween(end, start, holidays);
  let count = 0;
  for (let d = a + 1; d <= b; d++) if (!isWeekend(d) && !obs.has(d)) count++;
  return count;
}
