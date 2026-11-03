// Plausible but wrong: validates well but mishandles the trunk 0 after the country code and 00 prefix.
export function normalizeNigerianPhone(input) {
  if (typeof input !== "string") return null;
  const s = input.replace(/[\s-]/g, "");
  let rest;
  if (/^\+234\d{10}$/.test(s)) rest = s.slice(4);
  else if (/^234\d{10}$/.test(s)) rest = s.slice(3);
  else if (/^0\d{10}$/.test(s)) rest = s.slice(1);
  else return null;
  return /^[789][01]\d{8}$/.test(rest) ? "+234" + rest : null;
}
export function formatNigerianPhone(input) {
  const e = normalizeNigerianPhone(input);
  if (!e) return null;
  const n = "0" + e.slice(4);
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}
