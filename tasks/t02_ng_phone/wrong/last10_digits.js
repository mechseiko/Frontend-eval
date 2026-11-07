// Plausible but wrong: strip non-digits and keep the last 10.
export function normalizeNigerianPhone(input) {
  if (typeof input !== "string") return null;
  const d = input.replace(/\D/g, "");
  const last10 = d.slice(-10);
  return /^[789]\d{9}$/.test(last10) ? "+234" + last10 : null;
}
export function formatNigerianPhone(input) {
  const e = normalizeNigerianPhone(input);
  if (!e) return null;
  const n = "0" + e.slice(4);
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}
