import { createLedger } from "../src/solution";

let n = 0;
const ev = (type, reference, amountKobo = 0, extra = {}) => ({ id: extra.id || "e" + ++n, reference, type, amountKobo, createdAt: extra.createdAt ?? n, });
const S = "charge.success", F = "charge.failed", A = "charge.abandoned", R = "refund.processed";

describe("createLedger", () => {
  test("[happy] success sets status and amount", () => {
    const l = createLedger();
    const r = l.handle(ev(S, "r1", 5000));
    expect(r).toEqual({ applied: true, reason: null, status: "success" });
    expect(l.get("r1")).toMatchObject({ reference: "r1", status: "success", amountKobo: 5000, refundedKobo: 0 });
  });

  test("[happy] unknown reference returns undefined; new reference starts pending", () => {
    const l = createLedger({ expectedAmounts: { r1: 100 } });
    expect(l.get("nope")).toBeUndefined();
    l.handle(ev(F, "r1", 0));
    expect(l.get("r1")).toMatchObject({ status: "failed", amountKobo: 100, refundedKobo: 0 });
  });

  test("[happy] amountKobo is null until success when not expected", () => {
    const l = createLedger();
    l.handle(ev(A, "r1"));
    expect(l.get("r1")).toMatchObject({ status: "abandoned", amountKobo: null });
  });

  test("[duplicate] the same event id is applied once", () => {
    const l = createLedger();
    const e = ev(S, "r1", 5000, { id: "dup" });
    l.handle(e);
    expect(l.handle(e)).toEqual({ applied: false, reason: "duplicate", status: "success" });
  });

  test("[duplicate] a duplicate refund does not double count", () => {
    const l = createLedger();
    l.handle(ev(S, "r1", 1000));
    const refund = ev(R, "r1", 300, { id: "ref1" });
    l.handle(refund);
    l.handle(refund);
    expect(l.get("r1")).toMatchObject({ refundedKobo: 300, status: "partially_refunded" });
  });

  test("[duplicate] event ids are global across references", () => {
    const l = createLedger();
    l.handle(ev(S, "r1", 100, { id: "same" }));
    expect(l.handle(ev(S, "r2", 100, { id: "same" }))).toMatchObject({ applied: false, reason: "duplicate" });
    expect(l.get("r2")).toBeUndefined();
  });

  test("[out-of-order] failed after success is ignored as terminal", () => {
    const l = createLedger();
    l.handle(ev(S, "r1", 100));
    expect(l.handle(ev(F, "r1"))).toEqual({ applied: false, reason: "terminal", status: "success" });
    expect(l.get("r1").status).toBe("success");
  });

  test("[out-of-order] success after failed is accepted", () => {
    const l = createLedger();
    l.handle(ev(F, "r1"));
    expect(l.handle(ev(S, "r1", 100))).toEqual({ applied: true, reason: null, status: "success" });
  });

  test("[out-of-order] abandoned after failed is stale; failed after abandoned applies", () => {
    const l = createLedger();
    l.handle(ev(F, "r1"));
    expect(l.handle(ev(A, "r1"))).toEqual({ applied: false, reason: "stale", status: "failed" });
    const l2 = createLedger();
    l2.handle(ev(A, "r2"));
    expect(l2.handle(ev(F, "r2"))).toEqual({ applied: true, reason: null, status: "failed" });
  });

  test("[out-of-order] repeated failed with a new id is stale", () => {
    const l = createLedger();
    l.handle(ev(F, "r1"));
    expect(l.handle(ev(F, "r1"))).toEqual({ applied: false, reason: "stale", status: "failed" });
  });

  test("[no-time-ordering] createdAt must not decide the outcome", () => {
    const l = createLedger();
    l.handle(ev(F, "r1", 0, { createdAt: 2000 }));
    expect(l.handle(ev(S, "r1", 100, { createdAt: 1000 }))).toMatchObject({ applied: true, status: "success" });
    const l2 = createLedger();
    l2.handle(ev(S, "r2", 100, { createdAt: 1000 }));
    expect(l2.handle(ev(F, "r2", 0, { createdAt: 9999 }))).toMatchObject({ applied: false, reason: "terminal" });
  });

  test("[amount-mismatch] wrong paid amount is flagged, not success", () => {
    const l = createLedger({ expectedAmounts: { r1: 5000 } });
    expect(l.handle(ev(S, "r1", 4000))).toEqual({ applied: true, reason: "amount-mismatch", status: "amount_mismatch" });
    expect(l.get("r1")).toMatchObject({ status: "amount_mismatch", amountKobo: 5000 });
  });

  test("[amount-mismatch] mismatch is terminal for later charge and refund events", () => {
    const l = createLedger({ expectedAmounts: { r1: 5000 } });
    l.handle(ev(S, "r1", 4000));
    expect(l.handle(ev(S, "r1", 5000))).toEqual({ applied: false, reason: "terminal", status: "amount_mismatch" });
    expect(l.handle(ev(R, "r1", 100))).toEqual({ applied: false, reason: "terminal", status: "amount_mismatch" });
  });

  test("[amount-mismatch] matching amount succeeds and uses the expected amount", () => {
    const l = createLedger({ expectedAmounts: { r1: 5000 } });
    expect(l.handle(ev(S, "r1", 5000))).toEqual({ applied: true, reason: null, status: "success" });
    expect(l.get("r1").amountKobo).toBe(5000);
  });

  test("[amount-mismatch] references without an expected amount accept the event amount", () => {
    const l = createLedger({ expectedAmounts: { other: 1 } });
    l.handle(ev(S, "r1", 777));
    expect(l.get("r1")).toMatchObject({ status: "success", amountKobo: 777 });
  });

  test("[refund] partial then full refund", () => {
    const l = createLedger();
    l.handle(ev(S, "r1", 1000));
    expect(l.handle(ev(R, "r1", 400))).toEqual({ applied: true, reason: null, status: "partially_refunded" });
    expect(l.handle(ev(R, "r1", 600))).toEqual({ applied: true, reason: null, status: "refunded" });
    expect(l.get("r1")).toMatchObject({ status: "refunded", refundedKobo: 1000 });
  });

  test("[refund] over-refund is rejected without changing state", () => {
    const l = createLedger();
    l.handle(ev(S, "r1", 1000));
    l.handle(ev(R, "r1", 700));
    expect(l.handle(ev(R, "r1", 400))).toEqual({ applied: false, reason: "over-refund", status: "partially_refunded" });
    expect(l.get("r1")).toMatchObject({ refundedKobo: 700, status: "partially_refunded" });
  });

  test("[refund] any refund on a fully refunded transaction is over-refund", () => {
    const l = createLedger();
    l.handle(ev(S, "r1", 1000));
    l.handle(ev(R, "r1", 1000));
    expect(l.handle(ev(R, "r1", 1))).toEqual({ applied: false, reason: "over-refund", status: "refunded" });
  });

  test("[terminal] charge events after a refund are ignored", () => {
    const l = createLedger();
    l.handle(ev(S, "r1", 1000));
    l.handle(ev(R, "r1", 1000));
    expect(l.handle(ev(F, "r1"))).toEqual({ applied: false, reason: "terminal", status: "refunded" });
    expect(l.handle(ev(S, "r1", 1000))).toEqual({ applied: false, reason: "terminal", status: "refunded" });
  });

  test("[deferred-refund] a refund before success is deferred, then applied on success", () => {
    const l = createLedger();
    expect(l.handle(ev(R, "r1", 300))).toEqual({ applied: false, reason: "deferred", status: "pending" });
    expect(l.get("r1")).toMatchObject({ status: "pending", refundedKobo: 0 });
    expect(l.handle(ev(S, "r1", 1000))).toEqual({ applied: true, reason: null, status: "partially_refunded" });
    expect(l.get("r1")).toMatchObject({ status: "partially_refunded", amountKobo: 1000, refundedKobo: 300 });
  });

  test("[deferred-refund] a full deferred refund makes the final status refunded", () => {
    const l = createLedger();
    l.handle(ev(R, "r1", 1000));
    expect(l.handle(ev(S, "r1", 1000))).toEqual({ applied: true, reason: null, status: "refunded" });
  });

  test("[deferred-refund] deferred refunds apply in arrival order; those that no longer fit are dropped", () => {
    const l = createLedger();
    l.handle(ev(R, "r1", 600));
    l.handle(ev(R, "r1", 600));
    l.handle(ev(R, "r1", 300));
    l.handle(ev(S, "r1", 1000));
    expect(l.get("r1")).toMatchObject({ status: "partially_refunded", refundedKobo: 900 });
  });

  test("[deferred-refund] refund deferred while failed or abandoned too", () => {
    const l = createLedger();
    l.handle(ev(F, "r1"));
    expect(l.handle(ev(R, "r1", 100))).toEqual({ applied: false, reason: "deferred", status: "failed" });
    l.handle(ev(S, "r1", 500));
    expect(l.get("r1")).toMatchObject({ refundedKobo: 100 });
  });

  test("[deferred-refund] a mismatched success never applies deferred refunds", () => {
    const l = createLedger({ expectedAmounts: { r1: 1000 } });
    l.handle(ev(R, "r1", 100));
    l.handle(ev(S, "r1", 900));
    expect(l.get("r1")).toMatchObject({ status: "amount_mismatch", refundedKobo: 0 });
  });

  test("[deferred-refund] duplicate deferred refund is not counted twice", () => {
    const l = createLedger();
    const r = ev(R, "r1", 400, { id: "d1" });
    l.handle(r);
    l.handle(r);
    l.handle(ev(S, "r1", 1000));
    expect(l.get("r1").refundedKobo).toBe(400);
  });

  test("[validation] unknown type changes nothing and creates no reference", () => {
    const l = createLedger();
    expect(l.handle({ id: "x", reference: "r9", type: "charge.refunded", amountKobo: 1, createdAt: 1 })).toEqual({ applied: false, reason: "unknown-type", status: null });
    expect(l.get("r9")).toBeUndefined();
    expect(l.handle(undefined)).toMatchObject({ applied: false, reason: "unknown-type" });
  });

  test.each([0, -5, 1.5, "100", null])("[validation] invalid amount %j", (amt) => {
    const l = createLedger();
    l.handle(ev(S, "r1", 1000));
    expect(l.handle(ev(R, "r1", amt))).toEqual({ applied: false, reason: "invalid-amount", status: "success" });
    expect(l.get("r1").refundedKobo).toBe(0);
    const l2 = createLedger();
    expect(l2.handle(ev(S, "r2", amt))).toEqual({ applied: false, reason: "invalid-amount", status: null });
    expect(l2.get("r2")).toBeUndefined();
  });

  test("[validation] an invalid-amount event id is not recorded, so a corrected resend works", () => {
    const l = createLedger();
    l.handle({ id: "x1", reference: "r1", type: S, amountKobo: 0, createdAt: 1 });
    expect(l.handle({ id: "x1", reference: "r1", type: S, amountKobo: 100, createdAt: 2 })).toMatchObject({ applied: true, status: "success" });
  });

  test("[independence] references do not affect each other", () => {
    const l = createLedger();
    l.handle(ev(S, "a", 100));
    l.handle(ev(F, "b"));
    expect(l.get("a").status).toBe("success");
    expect(l.get("b").status).toBe("failed");
  });
});
