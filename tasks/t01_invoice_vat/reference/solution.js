const isInt = (n) => Number.isInteger(n);

export function computeInvoice({ lines, discountKobo = 0 } = {}) {
  if (!Array.isArray(lines)) throw new RangeError("lines must be an array");
  if (!isInt(discountKobo) || discountKobo < 0) throw new RangeError("bad discount");
  for (const l of lines) {
    if (!isInt(l.unitPriceKobo) || l.unitPriceKobo < 0) throw new RangeError("bad price");
    if (!isInt(l.qty) || l.qty < 1) throw new RangeError("bad qty");
  }
  const subs = lines.map((l) => l.unitPriceKobo * l.qty);
  const subtotal = subs.reduce((a, b) => a + b, 0);
  const applied = Math.min(discountKobo, subtotal);
  const alloc = subs.map(() => 0);
  if (subtotal > 0 && applied > 0) {
    // BigInt: applied * lineSubtotal can exceed 2^53 on large invoices.
    const S = BigInt(subtotal);
    const A = BigInt(applied);
    const rem = [];
    let used = 0;
    subs.forEach((s, i) => {
      const num = A * BigInt(s);
      alloc[i] = Number(num / S);
      rem.push({ i, r: num % S });
      used += alloc[i];
    });
    const left = applied - used;
    rem.sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
    for (let k = 0; k < left; k++) alloc[rem[k].i] += 1;
  }
  let vat = 0;
  const out = lines.map((l, i) => {
    const net = subs[i] - alloc[i];
    const v = l.vatExempt ? 0 : Math.floor((net * 75 + 500) / 1000);
    vat += v;
    return { sku: l.sku, subtotalKobo: subs[i], discountKobo: alloc[i], netKobo: net, vatKobo: v };
  });
  return {
    subtotalKobo: subtotal,
    discountKobo: applied,
    vatKobo: vat,
    totalKobo: subtotal - applied + vat,
    lines: out,
  };
}
