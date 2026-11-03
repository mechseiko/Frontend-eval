// Plausible but wrong: orders by createdAt, last event wins, no amount check, no deferral.
export function createLedger({ expectedAmounts = {} } = {}) {
  const seen = new Set();
  const txs = new Map();
  return {
    handle(ev) {
      if (seen.has(ev.id)) return { applied: false, reason: "duplicate", status: txs.get(ev.reference)?.status ?? null };
      seen.add(ev.id);
      const tx = txs.get(ev.reference) || { reference: ev.reference, status: "pending", amountKobo: expectedAmounts[ev.reference] ?? null, refundedKobo: 0, at: -1 };
      if (ev.createdAt < tx.at) return { applied: false, reason: "stale", status: tx.status };
      tx.at = ev.createdAt;
      if (ev.type === "charge.success") { tx.status = "success"; tx.amountKobo = ev.amountKobo; }
      else if (ev.type === "charge.failed") tx.status = "failed";
      else if (ev.type === "charge.abandoned") tx.status = "abandoned";
      else if (ev.type === "refund.processed") { tx.refundedKobo += ev.amountKobo; tx.status = tx.refundedKobo >= tx.amountKobo ? "refunded" : "partially_refunded"; }
      txs.set(ev.reference, tx);
      return { applied: true, reason: null, status: tx.status };
    },
    get(ref) { const t = txs.get(ref); return t && { reference: t.reference, status: t.status, amountKobo: t.amountKobo, refundedKobo: t.refundedKobo }; },
  };
}
