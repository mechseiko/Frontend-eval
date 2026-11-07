// Plausible but wrong: floors everything, no validation, no clamp.
export function computeInvoice({ lines, discountKobo = 0 }) {
  const subs = lines.map((l) => l.unitPriceKobo * l.qty);
  const subtotal = subs.reduce((a, b) => a + b, 0);
  const alloc = subs.map((s) => (subtotal ? Math.floor((discountKobo * s) / subtotal) : 0));
  let vat = 0;
  const out = lines.map((l, i) => {
    const net = subs[i] - alloc[i];
    const v = l.vatExempt ? 0 : Math.floor(net * 0.075);
    vat += v;
    return { sku: l.sku, subtotalKobo: subs[i], discountKobo: alloc[i], netKobo: net, vatKobo: v };
  });
  const applied = alloc.reduce((a, b) => a + b, 0);
  return { subtotalKobo: subtotal, discountKobo: applied, vatKobo: vat, totalKobo: subtotal - applied + vat, lines: out };
}
