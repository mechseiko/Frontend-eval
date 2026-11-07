import { computeInvoice } from "../src/solution";

const L = (sku, unitPriceKobo, qty = 1, vatExempt = false) => ({ sku, unitPriceKobo, qty, vatExempt });

describe("computeInvoice", () => {
  test("[happy] single taxable line, no discount", () => {
    const r = computeInvoice({ lines: [L("a", 10000, 2)] });
    expect(r).toEqual({
      subtotalKobo: 20000, discountKobo: 0, vatKobo: 1500, totalKobo: 21500,
      lines: [{ sku: "a", subtotalKobo: 20000, discountKobo: 0, netKobo: 20000, vatKobo: 1500 }],
    });
  });

  test("[happy] empty invoice returns zeros", () => {
    expect(computeInvoice({ lines: [] })).toEqual({ subtotalKobo: 0, discountKobo: 0, vatKobo: 0, totalKobo: 0, lines: [] });
  });

  test("[exempt] exempt lines carry no VAT", () => {
    const r = computeInvoice({ lines: [L("a", 10000), L("b", 10000, 1, true)] });
    expect(r.lines.map((l) => l.vatKobo)).toEqual([750, 0]);
    expect(r.vatKobo).toBe(750);
    expect(r.totalKobo).toBe(20750);
  });

  test("[vat-rounding] VAT rounds half up per line", () => {
    // 10 -> 0.75 -> 1 ; 6 -> 0.45 -> 0 ; 20 -> 1.5 -> 2 ; 2 -> 0.15 -> 0
    const r = computeInvoice({ lines: [L("a", 10), L("b", 6), L("c", 20), L("d", 2)] });
    expect(r.lines.map((l) => l.vatKobo)).toEqual([1, 0, 2, 0]);
    expect(r.vatKobo).toBe(3);
  });

  test("[vat-rounding] VAT is per line, not on the invoice total", () => {
    // Three lines of 6: per line 0.45 -> 0 each. On the total 18 * 0.075 = 1.35 -> 1.
    const r = computeInvoice({ lines: [L("a", 6), L("b", 6), L("c", 6)] });
    expect(r.vatKobo).toBe(0);
    expect(r.totalKobo).toBe(18);
  });

  test("[vat-rounding] exact halves round up", () => {
    // 100 -> 7.5 -> 8 ; 300 -> 22.5 -> 23
    const r = computeInvoice({ lines: [L("a", 100), L("b", 300)] });
    expect(r.lines.map((l) => l.vatKobo)).toEqual([8, 23]);
  });

  test("[discount-allocation] allocations sum exactly to the discount (thirds)", () => {
    const r = computeInvoice({ lines: [L("a", 100), L("b", 100), L("c", 100)], discountKobo: 100 });
    expect(r.lines.map((l) => l.discountKobo)).toEqual([34, 33, 33]);
    expect(r.discountKobo).toBe(100);
  });

  test("[discount-allocation] equal remainders go to earlier lines", () => {
    const lines = Array.from({ length: 7 }, (_, i) => L("s" + i, 1));
    const r = computeInvoice({ lines, discountKobo: 3 });
    expect(r.lines.map((l) => l.discountKobo)).toEqual([1, 1, 1, 0, 0, 0, 0]);
  });

  test("[discount-allocation] largest remainders win", () => {
    // subs 5000,3000,2000 total 10000, discount 333 -> raw 166.5, 99.9, 66.6 -> floors 166,99,66 (sum 331), left 2
    // remainders .5 (a), .9 (b), .6 (c) -> b and c get +1
    const r = computeInvoice({ lines: [L("a", 5000), L("b", 3000), L("c", 2000)], discountKobo: 333 });
    expect(r.lines.map((l) => l.discountKobo)).toEqual([166, 100, 67]);
  });

  test("[discount-allocation] VAT is charged on the discounted net", () => {
    // subs 5000,5000, discount 1000 -> 500 each, net 4500 -> VAT 337.5 -> 338 each
    const r = computeInvoice({ lines: [L("a", 5000), L("b", 5000)], discountKobo: 1000 });
    expect(r.lines.map((l) => l.netKobo)).toEqual([4500, 4500]);
    expect(r.lines.map((l) => l.vatKobo)).toEqual([338, 338]);
    expect(r.totalKobo).toBe(10000 - 1000 + 676);
  });

  test("[discount-allocation] zero-priced line gets no discount", () => {
    const r = computeInvoice({ lines: [L("free", 0), L("a", 1000)], discountKobo: 100 });
    expect(r.lines.map((l) => l.discountKobo)).toEqual([0, 100]);
  });

  test("[clamp] discount larger than the subtotal is clamped", () => {
    const r = computeInvoice({ lines: [L("a", 500), L("b", 500)], discountKobo: 5000 });
    expect(r.discountKobo).toBe(1000);
    expect(r.lines.map((l) => l.netKobo)).toEqual([0, 0]);
    expect(r.vatKobo).toBe(0);
    expect(r.totalKobo).toBe(0);
  });

  test("[clamp] zero subtotal with a discount stays zero", () => {
    const r = computeInvoice({ lines: [L("a", 0)], discountKobo: 50 });
    expect(r.discountKobo).toBe(0);
    expect(r.totalKobo).toBe(0);
  });

  test("[large-values] allocations stay exact on large amounts", () => {
    const r = computeInvoice({ lines: [L("a", 999999999, 3), L("b", 123456789, 7)], discountKobo: 123456789 });
    expect(r.lines.reduce((a, l) => a + l.discountKobo, 0)).toBe(123456789);
    expect(Number.isInteger(r.totalKobo)).toBe(true);
    expect(r.totalKobo).toBe(r.subtotalKobo - r.discountKobo + r.vatKobo);
  });

  test("[validation] rejects bad input with RangeError", () => {
    expect(() => computeInvoice({ lines: "x" })).toThrow(RangeError);
    expect(() => computeInvoice({ lines: [L("a", 10.5)] })).toThrow(RangeError);
    expect(() => computeInvoice({ lines: [L("a", -1)] })).toThrow(RangeError);
    expect(() => computeInvoice({ lines: [L("a", 10, 0)] })).toThrow(RangeError);
    expect(() => computeInvoice({ lines: [L("a", 10, 1.5)] })).toThrow(RangeError);
    expect(() => computeInvoice({ lines: [L("a", 10)], discountKobo: -5 })).toThrow(RangeError);
    expect(() => computeInvoice({ lines: [L("a", 10)], discountKobo: 1.5 })).toThrow(RangeError);
  });

  test("[no-mutation] frozen input is accepted", () => {
    const input = { lines: [Object.freeze(L("a", 1000))], discountKobo: 10 };
    Object.freeze(input.lines);
    Object.freeze(input);
    expect(() => computeInvoice(input)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------------
// Hardening. {L2} = emerging-market edge cases, {L3} = adversarial. Randomized differential checks
// compare against the reference implementation with a seeded generator, so every run is identical.
import { computeInvoice as referenceInvoice } from "../__ref__/solution";

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

function fuzzInvoice(r, maxPrice, maxQty) {
  const n = ri(r, 0, 6);
  const lines = Array.from({ length: n }, (_, i) => ({
    sku: "s" + i,
    unitPriceKobo: r() < 0.1 ? 0 : ri(r, 1, maxPrice),
    qty: ri(r, 1, maxQty),
    vatExempt: r() < 0.3,
  }));
  const subtotal = lines.reduce((a, l) => a + l.unitPriceKobo * l.qty, 0);
  const mode = r();
  const discountKobo = mode < 0.15 ? 0 : mode < 0.3 ? subtotal + ri(r, 0, 1000) : ri(r, 0, subtotal);
  return { lines, discountKobo };
}

function expectSame(input, i) {
  const want = referenceInvoice(JSON.parse(JSON.stringify(input)));
  let got;
  try {
    got = computeInvoice(JSON.parse(JSON.stringify(input)));
    expect(got).toEqual(want);
  } catch (e) {
    e.message = `fuzz case ${i} input=${JSON.stringify(input)}\n` + e.message;
    throw e;
  }
}

describe("computeInvoice hardening", () => {
  test("[fuzz-kobo] {L2} 200 random invoices match the reference to the kobo", () => {
    const r = rng(20261104);
    for (let i = 0; i < 200; i++) expectSame(fuzzInvoice(r, 500000, 9), i);
  });

  test("[fuzz-large] {L3} 150 random invoices whose intermediate products exceed 2^53 stay exact", () => {
    const r = rng(7);
    for (let i = 0; i < 150; i++) expectSame(fuzzInvoice(r, 40000000000, 50), i);
  });
});

describe("computeInvoice: leftover kobo goes to the largest remainder", () => {
  test("[allocation] {L2} the line with the largest remainder, not the first line, gets the extra kobo", () => {
    // shares of 100 over 200/100/300 are 33.33, 16.67, 50.00: the leftover kobo belongs to line 2
    const r = computeInvoice({
      lines: [
        { sku: "a", unitPriceKobo: 200, qty: 1, vatExempt: true },
        { sku: "b", unitPriceKobo: 100, qty: 1, vatExempt: true },
        { sku: "c", unitPriceKobo: 300, qty: 1, vatExempt: true },
      ],
      discountKobo: 100,
    });
    expect(r.lines.map((l) => l.discountKobo)).toEqual([33, 17, 50]);
  });

  const mk = (prices, discountKobo) => ({ lines: prices.map((p, i) => ({ sku: "s" + i, unitPriceKobo: p, qty: 1, vatExempt: true })), discountKobo });

  test("[allocation] {L2} two leftover kobo go to the two largest remainders, whichever lines they are on", () => {
    // exact shares 207.93, 472.51, 710.56: floors sum to 1389, so lines 1 and 3 (.93 and .56) get the 2 extra kobo
    expect(computeInvoice(mk([290, 659, 991], 1391)).lines.map((l) => l.discountKobo)).toEqual([208, 472, 711]);
  });

  test("[allocation] {L2} equal remainders: the earlier line gets the leftover kobo", () => {
    expect(computeInvoice(mk([100, 100, 100], 100)).lines.map((l) => l.discountKobo)).toEqual([34, 33, 33]);
    expect(computeInvoice(mk([100, 100, 101], 100)).lines.map((l) => l.discountKobo)).toEqual([33, 33, 34]);
  });
});
