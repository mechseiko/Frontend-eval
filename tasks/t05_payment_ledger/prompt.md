# Payment webhook ledger

Implement `createLedger` in `src/solution.js` (named export). It tracks payment state per transaction reference from webhook events that may be duplicated or arrive out of order.

```js
const ledger = createLedger({ expectedAmounts = {} });   // expectedAmounts: { [reference]: kobo }
ledger.handle(event) -> { applied: boolean, reason: string | null, status: string | null }
ledger.get(reference) -> { reference, status, amountKobo, refundedKobo } | undefined
```

Event: `{ id: string, reference: string, type, amountKobo: integer, createdAt: number }` where `type` is one of `"charge.success"`, `"charge.failed"`, `"charge.abandoned"`, `"refund.processed"`.

Statuses: `"pending"`, `"abandoned"`, `"failed"`, `"success"`, `"amount_mismatch"`, `"partially_refunded"`, `"refunded"`.

A reference first seen in any valid event is created with status `"pending"`, `refundedKobo` 0, and `amountKobo` equal to `expectedAmounts[reference]` if present, otherwise `null` (until a successful charge sets it from the event).

**Do not use `createdAt` to order events.** Decide only from the rules below, in arrival order.

`handle` checks in this order:
1. Unknown `type` (or no event): `{ applied: false, reason: "unknown-type", status: null }`, no state change.
2. `event.id` already handled before (ids are global across references): `{ applied: false, reason: "duplicate", status: <current status of event.reference or null> }`.
3. Invalid amount: `charge.success` or `refund.processed` where `amountKobo` is not a positive integer: `{ applied: false, reason: "invalid-amount", status: <current or null> }`, no state change, and the id is **not** recorded as handled.
4. Otherwise record the id as handled, create the reference if needed, and apply the rules below.

Charge events
- If the status is `success`, `partially_refunded`, `refunded` or `amount_mismatch`, ignore: `{ applied: false, reason: "terminal", status }`.
- `charge.failed`: from `pending` or `abandoned` become `failed` (applied). If already `failed`, ignore with reason `"stale"`.
- `charge.abandoned`: from `pending` become `abandoned` (applied). If already `abandoned` or `failed`, ignore with reason `"stale"`.
- `charge.success`: if `expectedAmounts` has an entry for the reference and `event.amountKobo` differs, the status becomes `amount_mismatch` (applied, reason `"amount-mismatch"`). Otherwise the status becomes `success`, `amountKobo` is the expected amount if known else the event's amount, and then any **deferred refunds** (below) are applied (applied, reason `null`, `status` is the final status after deferred refunds).

Refund events (`refund.processed`)
- If the status is `success` or `partially_refunded`: add the amount to `refundedKobo`. If the new total would exceed `amountKobo`, reject: `{ applied: false, reason: "over-refund", status }` with no change. Otherwise the status becomes `refunded` when the total equals `amountKobo`, else `partially_refunded` (applied, reason `null`).
- If the status is `refunded`: any refund is `"over-refund"`.
- If the status is `pending`, `abandoned` or `failed` (the charge success has not arrived yet): **defer** the refund. Return `{ applied: false, reason: "deferred", status }`. When a later `charge.success` is accepted (not a mismatch), apply deferred refunds in arrival order using the same rules; any that would exceed `amountKobo` are silently dropped.
- If the status is `amount_mismatch`: ignore with reason `"terminal"` (deferred refunds are never applied).
