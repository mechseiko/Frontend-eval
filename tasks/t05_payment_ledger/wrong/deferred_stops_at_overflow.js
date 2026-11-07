// Hardening trap: one overflowing deferred refund discards all later ones
const TYPES = ["charge.success", "charge.failed", "charge.abandoned", "refund.processed"];
const TERMINAL = new Set(["success", "partially_refunded", "refunded", "amount_mismatch"]);

export function createLedger({ expectedAmounts = {} } = {}) {
  const seen = new Set();
  const txs = new Map();
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const posInt = (n) => Number.isInteger(n) && n > 0;

  function ensure(ref) {
    if (!txs.has(ref)) {
      txs.set(ref, { reference: ref, status: "pending", amountKobo: has(expectedAmounts, ref) ? expectedAmounts[ref] : null, refundedKobo: 0, deferred: [] });
    }
    return txs.get(ref);
  }

  function applyRefund(tx, amt) {
    const total = tx.refundedKobo + amt;
    if (total > tx.amountKobo) return false;
    tx.refundedKobo = total;
    tx.status = total === tx.amountKobo ? "refunded" : "partially_refunded";
    return true;
  }

  function handle(ev) {
    if (!ev || !TYPES.includes(ev.type)) return { applied: false, reason: "unknown-type", status: null };
    const cur = txs.get(ev.reference);
    if (seen.has(ev.id)) return { applied: false, reason: "duplicate", status: cur ? cur.status : null };
    if ((ev.type === "charge.success" || ev.type === "refund.processed") && !posInt(ev.amountKobo)) {
      return { applied: false, reason: "invalid-amount", status: cur ? cur.status : null };
    }
    seen.add(ev.id);
    const tx = ensure(ev.reference);
    const res = (applied, reason) => ({ applied, reason, status: tx.status });

    if (ev.type === "refund.processed") {
      if (tx.status === "success" || tx.status === "partially_refunded") {
        return applyRefund(tx, ev.amountKobo) ? res(true, null) : res(false, "over-refund");
      }
      if (tx.status === "refunded") return res(false, "over-refund");
      if (tx.status === "amount_mismatch") return res(false, "terminal");
      tx.deferred.push(ev.amountKobo);
      return res(false, "deferred");
    }

    if (TERMINAL.has(tx.status)) return res(false, "terminal");
    if (ev.type === "charge.failed") {
      if (tx.status === "failed") return res(false, "stale");
      tx.status = "failed";
      return res(true, null);
    }
    if (ev.type === "charge.abandoned") {
      if (tx.status !== "pending") return res(false, "stale");
      tx.status = "abandoned";
      return res(true, null);
    }
    // charge.success
    if (has(expectedAmounts, ev.reference) && ev.amountKobo !== expectedAmounts[ev.reference]) {
      tx.status = "amount_mismatch";
      tx.deferred = [];
      return res(true, "amount-mismatch");
    }
    tx.status = "success";
    tx.amountKobo = has(expectedAmounts, ev.reference) ? expectedAmounts[ev.reference] : ev.amountKobo;
    for (const amt of tx.deferred) { if (!applyRefund(tx, amt)) break; }
    tx.deferred = [];
    return res(true, null);
  }

  function get(reference) {
    const t = txs.get(reference);
    return t ? { reference: t.reference, status: t.status, amountKobo: t.amountKobo, refundedKobo: t.refundedKobo } : undefined;
  }

  return { handle, get };
}
