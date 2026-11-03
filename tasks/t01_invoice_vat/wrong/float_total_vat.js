// Plausible but wrong: floating point, VAT on the invoice total, Math.round discount split.
export function computeInvoice({ lines, discountKobo = 0 }) {
  const subs = lines.map((l) => l.unitPriceKobo * l.qty);
  const subtotal = subs.reduce((a, b) => a + b, 0);
  const applied = Math.min(discountKobo, subtotal);
  const alloc = subs.map((s) => (subtotal ? Math.round((applied * s) / subtotal) : 0));
  const out = lines.map((l, i) => {
    const net = subs[i] - alloc[i];
    return { sku: l.sku, subtotalKobo: subs[i], discountKobo: alloc[i], netKobo: net, vatKobo: l.vatExempt ? 0 : Math.round(net * 0.075) };
  });
  const taxableNet = out.filter((_, i) => !lines[i].vatExempt).reduce((a, l) => a + l.netKobo, 0);
  const vat = Math.round(taxableNet * 0.075);
  return { subtotalKobo: subtotal, discountKobo: applied, vatKobo: vat, totalKobo: subtotal - applied + vat, lines: out };
}
