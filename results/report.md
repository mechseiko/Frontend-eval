# Frontend-eval results

Generated 2026-11-06 23:46 by `python run_eval.py report`. Full-pass = every hidden test for the task passed. Invalid runs (empty or truncated answers) are excluded from every number below.

| Model | Trials per task | Tasks attempted |
|---|---|---|
| gpt-4o | 1 | 9 / 9 |
| qwen2.5-coder-7b-local | 1 | 9 / 9 |
| gpt-6.1-sol | 3 | 9 / 9 |
| gpt-6-astra | 3 | 9 / 9 |
| gpt-5.6-sol | 3 | 9 / 9 |

## Summary by model

| Model | Tasks fully passed | Mean test score | L1 happy path | L2 edge cases | L3 adversarial | Avg latency (s) | Est. cost (USD) |
|---|---|---|---|---|---|---|---|
| gpt-4o | 2.0 / 9 | 86% | 91% (200/220) | 72% (38/53) | 84% (31/37) | 6.1 | 0.074 |
| qwen2.5-coder-7b-local | 0.0 / 9 | 48% | 62% (117/190) | 62% (32/52) | 32% (12/37) | 350.5 | 0.000 |
| gpt-6.1-sol | 9.0 / 9 | 100% | 100% (470/470) | 100% (107/107) | 100% (74/74) | 236.5 | 0.000 |
| gpt-6-astra | 9.0 / 9 | 100% | 100% (551/551) | 100% (109/109) | 100% (89/89) | 269.3 | 0.000 |
| gpt-5.6-sol | 9.0 / 9 | 100% | 100% (642/642) | 100% (129/129) | 100% (105/105) | 195.9 | 0.000 |

## Task grid (full-pass rate, with mean test score)

| Task | Category | gpt-4o | qwen2.5-coder-7b-local | gpt-6.1-sol | gpt-6-astra | gpt-5.6-sol |
|---|---|---|---|---|---|---|
| t01_invoice_vat (medium) | money-and-payments | 0% (67%) | 0% (43%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t02_ng_phone (medium) | local-input-handling | 0% (84%) | 0% (71%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t03_resilient_fetch (hard) | network-resilience | 0% (88%) | 0% (72%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t04_offline_queue (hard) | network-resilience | 0% (74%) | 0% (0%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t05_payment_ledger (hard) | money-and-payments | 0% (90%) | 0% (56%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t06_search_box (hard) | async-ui-state | 0% (88%) | 0% (62%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t07_dialog_a11y (hard) | accessibility | 0% (85%) | 0% (4%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t08_business_days (medium) | dates-and-time | 100% (100%) | 0% (50%) | 100% (100%) | 100% (100%) | 100% (100%) |
| t09_optimistic_store (hard) | async-ui-state | 100% (100%) | 0% (74%) | 100% (100%) | 100% (100%) | 100% (100%) |

## Failure categories (share of hidden checks passed, by tag)

| Tag | gpt-4o | qwen2.5-coder-7b-local | gpt-6.1-sol | gpt-6-astra | gpt-5.6-sol |
|---|---|---|---|---|---|
| abort | 100% (10/10) | 60% (6/10) | 100% (20/20) | 100% (20/20) | 100% (30/30) |
| add | 100% (3/3) | 0% (0/3) | 100% (6/6) | 100% (9/9) | 100% (9/9) |
| allocation | 0% (0/3) | 100% (3/3) | 100% (6/6) | 100% (6/6) | 100% (9/9) |
| amount-mismatch | 100% (5/5) | 80% (4/5) | 100% (10/10) | 100% (15/15) | 100% (15/15) |
| apply | 100% (2/2) | 100% (2/2) | 100% (4/4) | 100% (6/6) | 100% (6/6) |
| args | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| aria | 100% (3/3) | 33% (1/3) | 100% (6/6) | 100% (6/6) | 100% (3/3) |
| backdrop | 100% (2/2) | 0% (0/2) | 100% (4/4) | 100% (4/4) | 100% (2/2) |
| backdrop-drag | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (1/1) |
| backoff | 60% (3/5) | 60% (3/5) | 100% (10/10) | 100% (10/10) | 100% (15/15) |
| bad-update | 100% (2/2) | 0% (0/2) | 100% (4/4) | 100% (6/6) | 100% (6/6) |
| between | 100% (3/3) | 33% (1/3) | 100% (6/6) | 100% (9/9) | 100% (9/9) |
| clamp | 50% (1/2) | 0% (0/2) | 100% (4/4) | 100% (4/4) | 100% (6/6) |
| confirm-order | 100% (4/4) | 100% (4/4) | 100% (8/8) | 100% (12/12) | 100% (12/12) |
| corrupt-storage | 100% (5/5) | - | 100% (15/15) | 100% (15/15) | 100% (15/15) |
| country-zero | 20% (1/5) | 100% (5/5) | 100% (10/10) | 100% (10/10) | 100% (15/15) |
| debounce | 100% (3/3) | 100% (3/3) | 100% (6/6) | 100% (6/6) | 100% (9/9) |
| dedupe | 67% (2/3) | - | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| dedupe-query | 33% (1/3) | 33% (1/3) | 100% (6/6) | 100% (6/6) | 100% (9/9) |
| deferred-refund | 100% (10/10) | 10% (1/10) | 100% (20/20) | 100% (30/30) | 100% (30/30) |
| discount-allocation | 80% (4/5) | 80% (4/5) | 100% (10/10) | 100% (10/10) | 100% (15/15) |
| display | 50% (1/2) | 50% (1/2) | 100% (4/4) | 100% (4/4) | 100% (6/6) |
| duplicate | 100% (4/4) | 75% (3/4) | 100% (8/8) | 100% (12/12) | 100% (12/12) |
| duplicate-id | 100% (2/2) | 50% (1/2) | 100% (4/4) | 100% (6/6) | 100% (6/6) |
| empty | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| empty-flush | 100% (1/1) | - | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| enqueue-during-flush | 100% (1/1) | - | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| error | 0% (0/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| escape | 100% (2/2) | 0% (0/2) | 100% (4/4) | 100% (4/4) | 100% (2/2) |
| exempt | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| exhaust | 75% (3/4) | 50% (2/4) | 100% (8/8) | 100% (8/8) | 100% (12/12) |
| exhaustion | 50% (1/2) | 50% (1/2) | 100% (4/4) | 100% (4/4) | 100% (6/6) |
| fifo-stop | 60% (3/5) | - | 100% (15/15) | 100% (15/15) | 100% (15/15) |
| focus-trap | 83% (5/6) | 0% (0/6) | 100% (12/12) | 100% (12/12) | 100% (6/6) |
| formats | 82% (9/11) | 45% (5/11) | 100% (22/22) | 100% (22/22) | 100% (33/33) |
| fuzz-kobo | 0% (0/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| fuzz-large | 0% (0/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| fuzz-ops | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| fuzz-sequence | 0% (0/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| fuzz-stream | 0% (0/1) | 0% (0/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| garbage | 92% (12/13) | 85% (11/13) | 100% (26/26) | 100% (26/26) | 100% (39/39) |
| happy | 100% (7/7) | 80% (4/5) | 100% (16/16) | 100% (19/19) | 100% (21/21) |
| holidays | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| idempotent-id | 100% (1/1) | - | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| in-flight-dedupe | 100% (2/2) | - | 100% (6/6) | 100% (6/6) | 100% (6/6) |
| independence | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| initial | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| initial-focus | 100% (4/4) | 0% (0/4) | 100% (8/8) | 100% (8/8) | 100% (4/4) |
| invalid-amount | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| keep-results | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| large-values | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| leap | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| length | 100% (7/7) | 100% (7/7) | 100% (14/14) | 100% (14/14) | 100% (21/21) |
| listener-error | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| loading | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| max-attempts | 0% (0/3) | - | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| memo | 100% (2/2) | 0% (0/2) | 100% (4/4) | 100% (6/6) | 100% (6/6) |
| min-chars | 100% (4/4) | 75% (3/4) | 100% (8/8) | 100% (8/8) | 100% (12/12) |
| no-mutation | 100% (3/3) | 100% (2/2) | 100% (7/7) | 100% (8/8) | 100% (9/9) |
| no-refocus | 100% (2/2) | 0% (0/2) | 100% (4/4) | 100% (4/4) | 100% (2/2) |
| no-retry-status | 100% (7/7) | 100% (7/7) | 100% (14/14) | 100% (14/14) | 100% (21/21) |
| no-time-ordering | 0% (0/1) | 100% (1/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| notify | 100% (3/3) | 100% (3/3) | 100% (6/6) | 100% (9/9) | 100% (9/9) |
| observed | 100% (8/8) | 38% (3/8) | 100% (16/16) | 100% (24/24) | 100% (24/24) |
| out-of-order | 75% (3/4) | 100% (4/4) | 100% (8/8) | 100% (12/12) | 100% (12/12) |
| permanent-failure | 100% (1/1) | - | 100% (3/3) | 100% (3/3) | 100% (3/3) |
| persistence | 67% (2/3) | - | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| post-idempotency | 80% (8/10) | 50% (5/10) | 100% (20/20) | 100% (20/20) | 100% (30/30) |
| prefix | 100% (11/11) | 55% (6/11) | 100% (22/22) | 100% (22/22) | 100% (33/33) |
| refund | 100% (3/3) | 0% (0/3) | 100% (6/6) | 100% (9/9) | 100% (9/9) |
| render | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| restore-focus | 50% (2/4) | 0% (0/4) | 100% (8/8) | 100% (8/8) | 100% (4/4) |
| retry | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| retry-after | 100% (12/12) | 83% (10/12) | 100% (24/24) | 100% (24/24) | 100% (36/36) |
| retry-status | 100% (9/9) | 100% (9/9) | 100% (18/18) | 100% (18/18) | 100% (27/27) |
| rollback-middle | 100% (5/5) | 100% (5/5) | 100% (10/10) | 100% (15/15) | 100% (15/15) |
| scroll-lock | 67% (2/3) | 0% (0/3) | 100% (6/6) | 100% (6/6) | 100% (3/3) |
| single-flight | 67% (2/3) | - | 100% (9/9) | 100% (9/9) | 100% (9/9) |
| stale-response | 100% (3/3) | 0% (0/3) | 100% (6/6) | 100% (6/6) | 100% (9/9) |
| success | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| terminal | 0% (0/1) | 0% (0/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| timezone | 100% (2/2) | 0% (0/2) | 100% (4/4) | 100% (6/6) | 100% (6/6) |
| trim | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (2/2) | 100% (3/3) |
| unknown-id | 100% (1/1) | 100% (1/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| unmount | 100% (2/2) | 100% (2/2) | 100% (4/4) | 100% (4/4) | 100% (6/6) |
| unsubscribe | 100% (2/2) | 50% (1/2) | 100% (4/4) | 100% (6/6) | 100% (6/6) |
| validation | 100% (18/18) | 83% (15/18) | 100% (36/36) | 100% (53/53) | 100% (54/54) |
| vat-rounding | 100% (3/3) | 0% (0/3) | 100% (6/6) | 100% (6/6) | 100% (9/9) |
| weekdays | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |
| zero | 100% (1/1) | 0% (0/1) | 100% (2/2) | 100% (3/3) | 100% (3/3) |

## Most common failing checks

- `t01_invoice_vat`: [clamp] zero subtotal with a discount stays zero (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t01_invoice_vat`: [fuzz-kobo] {L2} 200 random invoices match the reference to the kobo (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t01_invoice_vat`: [fuzz-large] {L3} 150 random invoices whose intermediate products exceed 2^53 stay exact (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t02_ng_phone`: [formats] "8031234567" -> +2348031234567 (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t02_ng_phone`: [display] formats valid numbers as 0XXX XXX XXXX (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t03_resilient_fetch`: [backoff] defaults: base 200, 4 attempts (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t03_resilient_fetch`: [backoff] no sleep after the final attempt (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t03_resilient_fetch`: [post-idempotency] POST without a key is never retried (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t03_resilient_fetch`: [post-idempotency] PATCH without a key is not retried (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t03_resilient_fetch`: [fuzz-sequence] {L3} 250 random failure, header and abort scripts behave exactly like the reference (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t05_payment_ledger`: [terminal] charge events after a refund are ignored (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t05_payment_ledger`: [fuzz-stream] {L3} 300 random webhook streams (duplicates, out-of-order, bad amounts) match the reference (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t06_search_box`: [error] failure clears results and shows alert with Retry (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t06_search_box`: [dedupe-query] {L3} a trailing space does not trigger a new request (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)
- `t06_search_box`: [dedupe-query] {L3} typing away and back to the in-flight query does not re-request (failed by 2 model(s): gpt-4o, qwen2.5-coder-7b-local)

## Grader strength (mutation testing)

Small bugs were injected into each reference solution; the hidden tests caught 92 of 100 (92%). Survivors may be equivalent (harmless) changes.

| Task | Bugs injected | Caught | Survivors |
|---|---|---|---|
| t01_invoice_vat | 15 | 12 | 3 |
| t02_ng_phone | 15 | 15 | 0 |
| t03_resilient_fetch | 15 | 15 | 0 |
| t04_offline_queue | 15 | 15 | 0 |
| t05_payment_ledger | 15 | 15 | 0 |
| t08_business_days | 15 | 11 | 4 |
| t09_optimistic_store | 10 | 9 | 1 |

## Excluded runs (not model failures)

These answers were empty or cut off, so they say nothing about the model and are left out of every score above.

- gpt-6.1-sol / t02_ng_phone: None
- gpt-6.1-sol / t01_invoice_vat: None
- gpt-6.1-sol / t03_resilient_fetch: None
- gpt-6.1-sol / t05_payment_ledger: None
- gpt-6.1-sol / t06_search_box: None
- gpt-6.1-sol / t08_business_days: None
- gpt-6.1-sol / t09_optimistic_store: None
- gpt-6-astra / t01_invoice_vat: None
- gpt-6-astra / t02_ng_phone: None
- gpt-6-astra / t03_resilient_fetch: None
- gpt-6.1-sol / t07_dialog_a11y: None
- gpt-6-astra / t06_search_box: None
- gpt-6-astra / t07_dialog_a11y: None
- gpt-5.6-sol / t07_dialog_a11y: code block never closed: the output was cut off (raise max_tokens and re-run with --refresh)
