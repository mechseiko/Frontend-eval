// Plausible but wrong: local-time Date arithmetic (breaks across DST) and no weekend-holiday observance.
const toDate = (s) => new Date(s + "T00:00:00");
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function isBusinessDay(date, holidays = []) {
  const d = toDate(date);
  return d.getDay() !== 0 && d.getDay() !== 6 && !holidays.includes(date);
}
export function addBusinessDays(date, n, holidays = []) {
  let d = toDate(date);
  let left = Math.abs(n);
  const step = n < 0 ? -1 : 1;
  while (left > 0) {
    d = new Date(d.getTime() + step * 86400000);
    if (isBusinessDay(iso(d), holidays)) left--;
  }
  return iso(d);
}
export function businessDaysBetween(start, end, holidays = []) {
  let c = 0;
  let d = toDate(start);
  const e = toDate(end);
  while (d < e) { d = new Date(d.getTime() + 86400000); if (isBusinessDay(iso(d), holidays)) c++; }
  return c;
}
