export function normalizeNigerianPhone(input) {
  if (typeof input !== "string") return null;
  const s = input.replace(/[\s().-]/g, "");
  if (!/^\+?\d+$/.test(s)) return null;
  let rest;
  const dropTrunk = (r) => (r.startsWith("0") ? r.slice(1) : r);
  if (s.startsWith("+")) {
    if (!s.startsWith("+234")) return null;
    rest = dropTrunk(s.slice(4));
  } else if (s.startsWith("00234")) {
    rest = dropTrunk(s.slice(5));
  } else if (s.startsWith("234")) {
    rest = dropTrunk(s.slice(3));
  } else if (s.startsWith("0")) {
    rest = s.slice(1);
  } else {
    rest = s;
  }
  if (!/^[789][01]\d{8}$/.test(rest)) return null;
  return "+234" + rest;
}

export function formatNigerianPhone(input) {
  const e164 = normalizeNigerianPhone(input);
  if (!e164) return null;
  const n = "0" + e164.slice(4);
  return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
}
