# Invoice totals with VAT and exact discount allocation

Implement `computeInvoice` in `src/solution.js` (named export, CommonJS or ES module syntax both fine).

```js
computeInvoice({ lines, discountKobo }) -> {
  subtotalKobo, discountKobo, vatKobo, totalKobo,
  lines: [{ sku, subtotalKobo, discountKobo, netKobo, vatKobo }]
}
```

All money is an integer number of kobo (1 naira = 100 kobo). Use integer arithmetic only.

Input
- `lines`: array of `{ sku: string, unitPriceKobo: integer >= 0, qty: integer >= 1, vatExempt: boolean }`.
- `discountKobo`: integer >= 0, a single discount for the whole invoice (defaults to 0 if missing).

Rules
1. Line subtotal = `unitPriceKobo * qty`. Invoice subtotal is the sum of line subtotals.
2. The applied discount is `min(discountKobo, invoice subtotal)`.
3. Allocate the applied discount across lines in proportion to line subtotal using the **largest remainder method**:
   - Each line first gets `floor(applied * lineSubtotal / invoiceSubtotal)`.
   - The leftover kobo (applied minus the sum of those floors) are given one each to the lines with the largest fractional remainders. Break ties in favour of the **earlier line**.
   - Allocations must sum exactly to the applied discount. If the invoice subtotal is 0, every allocation is 0.
4. `netKobo = line subtotal - line discount`.
5. VAT is 7.5%, charged only on lines where `vatExempt` is false. VAT is computed **per line** on `netKobo`, rounded **half up** to a whole kobo. Exempt lines have `vatKobo` 0.
6. `vatKobo` (invoice) is the sum of line VAT. `totalKobo = subtotal - applied discount + vatKobo`.
7. Validation: throw a `RangeError` if `lines` is not an array, a unit price is not a non-negative integer, `qty` is not a positive integer, or `discountKobo` is not a non-negative integer. An empty `lines` array is valid and returns all zeros.
8. Do not mutate the input.
