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
