// Plausible but wrong: rank-based and amount-checked, but drops early refunds, allows over-refunds, and no id dedupe across references.
export function createLedger({ expectedAmounts = {} } = {}) {
  const txs = new Map();
  const seen = new Map();
  return {
    handle(ev) {
      const key = ev.reference + ":" + ev.id;
      if (seen.has(key)) return { applied: false, reason: "duplicate", status: txs.get(ev.reference)?.status ?? null };
      seen.set(key, true);
      const tx = txs.get(ev.reference) || { reference: ev.reference, status: "pending", amountKobo: expectedAmounts[ev.reference] ?? null, refundedKobo: 0 };
      txs.set(ev.reference, tx);
      const done = ["success", "partially_refunded", "refunded", "amount_mismatch"];
      if (ev.type === "refund.processed") {
        if (!["success", "partially_refunded"].includes(tx.status)) return { applied: false, reason: "invalid", status: tx.status };
        tx.refundedKobo += ev.amountKobo;
        tx.status = tx.refundedKobo >= tx.amountKobo ? "refunded" : "partially_refunded";
        return { applied: true, reason: null, status: tx.status };
      }
      if (done.includes(tx.status)) return { applied: false, reason: "terminal", status: tx.status };
      if (ev.type === "charge.success") {
        const exp = expectedAmounts[ev.reference];
        tx.status = exp !== undefined && exp !== ev.amountKobo ? "amount_mismatch" : "success";
        tx.amountKobo = exp ?? ev.amountKobo;
      } else if (ev.type === "charge.failed") tx.status = "failed";
      else if (ev.type === "charge.abandoned" && tx.status === "pending") tx.status = "abandoned";
      return { applied: true, reason: null, status: tx.status };
    },
    get(ref) { const t = txs.get(ref); return t && { ...t }; },
  };
}
