# Frontend-eval

**Can an AI coding model write frontend logic that survives production in a mobile-first, low-bandwidth market: money to the kobo, flaky networks, messy local input, and keyboard-only users?**

This is an eval of nine spec-driven frontend tasks. Each task gives a model one written specification and one stub file, and asks for one source file back. Hidden Jest tests then score the answer check by check, and every check carries a tag naming the production rule it tests.

- **Author:** MECHSEIKO (Abdulqoyum Olohuntomi Amuda)
- **Event:** micro1 Eval Hackathon 2026, individual entry
- **Domain and expertise:** I am a 3+ year experienced Frontend Engineer for Nigerian consumer products: checkout and payment flows, offline-first field apps, OTP and phone-number handling, and low-end-device accessibility. Every task here is a problem that shows up in production in this market.
- **Video walkthrough:** `https://drive.google.com/file/d/1_F3GTsiU-zwDRVnIPqaFrRVKuif_oSyh/view?usp=drive_link`
- **Short description:** see [Short description](#short-description)

---

## Short description

AI coding models look impressive on generic frontend tasks, but products for mobile-first, low-bandwidth markets fail in specific, expensive ways: a total that is one kobo off the payment gateway, a retried POST that double-charges, a webhook handled out of order, a phone number typed `+234(0)803...` that never normalises, a modal that strands keyboard users.

Frontend-eval measures those failures with nine self-contained tasks drawn from Nigerian production frontend work, graded by 310 hidden Jest checks that are tagged by production rule and tiered by difficulty. Every grader is validated three ways: reference solutions pass 100%, 24 deliberately plausible-but-wrong solutions are rejected, and mutation testing shows the tests catch 92 of 100 injected bugs. Three 2026 frontier models -- `gpt-6.1-sol`, `gpt-6-astra` and `gpt-5.6-sol` -- each ran every task three times and passed all 310 checks on all nine tasks. The same suite still separates capability: GPT-4o (2024) fully passed 2 of 9 and a local Qwen2.5-Coder-7B passed none, failing on exactly the production rules the newer models have learned. The whole eval is reproducible offline from cached model answers, with no API key and no network.

---

## The gap

A senior frontend engineer in this market reliably does all of the following. Current models mostly do not:

- allocate a discount across invoice lines so the parts sum exactly to the discount, and charge VAT per line, rounded half up, in integer kobo;
- normalise `+234(0)803…`, `234803…`, `0803-123-4567`, `00234…` and a bare `803…` to one canonical number, and reject the rest;
- retry a `GET` on a 503 but **never** retry an unkeyed `POST`, honour `Retry-After`, and stop immediately when the caller aborts;
- keep an offline queue that survives a reload, never double-sends during overlapping flushes, and stops at the first retryable failure;
- process payment webhooks that arrive twice and out of order, without marking an unpaid order paid or dropping a refund that arrives before its charge;
- keep a search box honest when responses arrive late: abort, ignore stale results, dedupe a trailing space, survive unmount;
- restore focus when a modal closes, including on unmount and on backdrop click;
- do business-day arithmetic that is correct across DST and weekend holidays.

Each of those is a written rule in the task's prompt. Nothing is graded that the prompt does not state, so a failure is always a specification violation rather than a guess at a hidden trick.

---

## What it measures

| # | Task | Category | Why it matters in practice | Checks |
|---|---|---|---|---|
| 1 | Invoice totals: 7.5% VAT per line, discount by largest remainder, integer kobo | money-and-payments | Totals must match the payment gateway to the kobo | 21 |
| 2 | Normalise Nigerian mobile numbers (`+234(0)803…`, `0803-123-4567`, `00234…`) | local-input-handling | OTP and sign-up flows break on inconsistent numbers | 49 |
| 3 | Resilient `fetch`: backoff with jitter, `Retry-After`, no blind POST retry, abort | network-resilience | A naive retry wrapper can double-charge a customer | 60 |
| 4 | Persistent offline action queue: dedupe, single-flight flush, FIFO stop | network-resilience | Offline-first apps lose or duplicate user data | 31 |
| 5 | Payment webhook ledger: duplicates, out-of-order events, amount checks, refunds before success | money-and-payments | Gateways deliver webhooks twice and out of order | 41 |
| 6 | React search box: debounce, abort, stale responses, retry, unmount safety | async-ui-state | Responses arrive late and out of order on slow networks | 24 |
| 7 | React modal: focus trap, focus restore, scroll lock, backdrop drag-release | accessibility | Keyboard and screen-reader users get lost behind a modal | 27 |
| 8 | Business-day arithmetic with observed holidays, timezone and DST safe | dates-and-time | Due dates and delivery promises depend on it | 30 |
| 9 | Optimistic updates with correct rollback and out-of-order confirmation | async-ui-state | Rolling back one failed save must not erase other pending changes | 27 

**310 checks in total.** Every prompt states the full specification, the exact file path, the exported names and the return shape, so the eval measures spec adherence under many interacting rules rather than requirement discovery.

---

## How an answer is scored

1. The runner builds a prompt from `tasks/<id>/prompt.md` plus the current contents of the stub file, and asks for one complete file back in a single fenced code block.
2. The answer is written into a fresh sandbox with the task's hidden tests, and Jest runs.
3. Each test title carries a rule tag (`[post-idempotency]`, `[vat-rounding]`, …) and an optional tier: unmarked = **L1** happy path, `{L2}` = an edge case a careful engineer would test, `{L3}` = adversarial, where two rules interact.
4. **Full pass** means every check in the task passed. **Mean test score** is the share of checks passed, so partial work is visible rather than collapsed to zero.
5. An answer that is empty, or whose code block never closes because it was cut off, is recorded as **INVALID**, excluded from every score, and listed separately in the report. A truncation must never masquerade as a model weakness.
6. Every graded run uses `TZ=America/Los_Angeles`: a DST zone behind UTC, so local-time arithmetic drifts by a day on the exact dates t08 checks.

Scoring is fully automated. There is **no LLM judge** and no rubric that needs interpretation, so the same answer always scores the same.

---

## How to run

Requirements: **Node 20+** and **Python 3.9+**. No Python packages, no Docker, no database.

```bash
npm ci                                  # pinned Jest, React, Testing Library, Babel
python run_eval.py selftest             # validates every grader: 1-2 minutes, no API key
python run_eval.py list                 # the nine tasks
python run_eval.py show-prompt t03      # the exact prompt a model receives
```

Grade the submitted results with **no API key and no network**:

```bash
python run_eval.py run --offline        # re-grades results/raw/*, the cached model answers
python run_eval.py report               # writes results/report.md and results/report.html
```

Query the models yourself (needs your own key, see [`.env.example`](.env.example)):

```bash
cp models.example.json models.json      # edit ids if you like
export AGENTROUTER_API_KEY=...          # PowerShell: $env:AGENTROUTER_API_KEY="..."
python run_eval.py run --models models.json --runs 3 --refresh
python run_eval.py report
```

Other entry points:

```bash
python run_eval.py grade-file t03 my_solution.js   # grade one file by hand
python run_eval.py mutate --max 15                 # inject bugs, measure grader strength
python run_eval.py battle --endpoint http://localhost:18789 --name MyAgent       # bring your own agent
```

`battle` runs any HTTP agent through every task and writes a shareable scorecard
(`results/battle_<name>.html`). It speaks an OpenAI-style `/chat/completions` endpoint by default,
or `--protocol simple` for `POST {prompt, system}` endpoints.

**Cost and runtime of the submitted run:** the three frontier models were billed through AgentRouter at **$100.63** for the run of 6 Nov 2026 (gateway usage dashboard; roughly $0.60 to $0.64 per answer once a reasoning model spends its full 32k output budget). GPT-4o cost **$0.074** for its nine answers and the local 7B cost **$0.00**. Wall-clock time is dominated by the gateway's reasoning models, which take two to ten minutes per answer, so the 81 frontier calls run in the background for a couple of hours; the local 7B takes about six minutes per answer on a CPU-only laptop. Grading is 3 to 5 seconds per task, and a full offline re-grade of every cached answer plus the report takes about a minute.

The per-model "Est. cost" column in `results/report.md` reads $0.000 for the three frontier models: the gateway bills per request rather than per token, so no per-token price applies. The dashboard total above is the authoritative figure.

---

## Models tested

| Model | Exact ID | Endpoint | Settings | Trials/task | Answers collected | Cost |
|---|---|---|---|---|---|---|
| GPT-6.1 Sol | `gpt-6.1-sol` | AgentRouter (`/v1/responses`) | temperature 0, max_output_tokens 16000-32000 (raised mid-run; reasoning was eating the budget) | 3 | 6 Nov 2026 | share of $100.63 |
| GPT-6 Astra | `gpt-6-astra` | AgentRouter (`/v1/responses`) | temperature 0, max_output_tokens 16000-32000 (raised mid-run; reasoning was eating the budget) | 3 | 6 Nov 2026 | share of $100.63 |
| GPT-5.6 Sol | `gpt-5.6-sol` | AgentRouter (`/v1/responses`) | temperature 0, max_output_tokens 16000-32000 (raised mid-run; reasoning was eating the budget) | 3 | 6 Nov 2026 | share of $100.63 |
| GPT-4o | `openai/gpt-4o` | OpenRouter (`/v1/chat/completions`) | temperature 0, max_tokens 1200 as collected | 1 | 3 Nov 2026 | $0.074 |
| Qwen2.5-Coder-7B | `qwen2.5-coder:7b` | local Ollama (`localhost:11434/v1`) | temperature 0, max_tokens 2048 | 1 | 6 Nov 2026 | $0.00 |

The three frontier models all go through AgentRouter, which speaks the OpenAI **Responses** API rather than chat completions and allowlists its clients by `User-Agent`. Both quirks are recorded per model in [`models.json`](models.json), so a re-run with a key of your own works without editing code. AgentRouter bills per request rather than per token, so the report's per-token cost column reads $0.000 for those rows and the gateway's own usage total -- **$100.63**  -- is the figure to trust. The GPT-4o row shows the metered price of its own run.

The GPT-4o row and the local Qwen row are baseline comparisons with **one trial each**: GPT-4o's answers were collected earlier, against the same prompts that ship in `tasks/*/prompt.md`, and Qwen runs on a CPU-only laptop at roughly six minutes per answer. Every score on this page comes from the final, hardened test suite. No answer in `results/raw/` is empty or truncated; the runner would flag such a run `INVALID` and exclude it.

To add a model: copy an entry in [`models.json`](models.json), set `name`, `base_url`, `model`, `protocol` (`chat` is the default, `responses` for this gateway) and the environment variable that holds the key, then run `python run_eval.py run --models models.json --only <name> --runs 3`.

---

## Results

Source: [`results/report.md`](results/report.md) and the interactive [`results/report.html`](results/report.html) (filter by tag and tier, read each answer and its diff against the reference).

<!-- RESULTS:START -->
| Model | Trials/task | Tasks fully passed | Mean test score | L1 happy path | L2 edge cases | L3 adversarial |
|---|---|---|---|---|---|---|
| gpt-4o | 1 | **2.0 / 9** | 86% | 91% (200/220) | 72% (38/53) | 84% (31/37) |
| qwen2.5-coder-7b-local | 1 | **0.0 / 9** | 48% | 62% (117/190) | 62% (32/52) | 32% (12/37) |
| gpt-6.1-sol | 3 | **9.0 / 9** | 100% | 100% (470/470) | 100% (107/107) | 100% (74/74) |
| gpt-6-astra | 3 | **9.0 / 9** | 100% | 100% (551/551) | 100% (109/109) | 100% (89/89) |
| gpt-5.6-sol | 3 | **9.0 / 9** | 100% | 100% (642/642) | 100% (129/129) | 100% (105/105) |

| Task | Category | gpt-4o | qwen2.5-coder-7b-local | gpt-6.1-sol | gpt-6-astra | gpt-5.6-sol |
|---|---|---|---|---|---|---|
| `t01_invoice_vat` | money-and-payments | 0% (67%) | 0% (43%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t02_ng_phone` | local-input-handling | 0% (84%) | 0% (71%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t03_resilient_fetch` | network-resilience | 0% (88%) | 0% (72%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t04_offline_queue` | network-resilience | 0% (74%) | 0% (0%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t05_payment_ledger` | money-and-payments | 0% (90%) | 0% (56%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t06_search_box` | async-ui-state | 0% (88%) | 0% (62%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t07_dialog_a11y` | accessibility | 0% (85%) | 0% (4%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t08_business_days` | dates-and-time | 100% (100%) | 0% (50%) | 100% (100%) | 100% (100%) | 100% (100%) |
| `t09_optimistic_store` | async-ui-state | 100% (100%) | 0% (74%) | 100% (100%) | 100% (100%) | 100% (100%) |

*Where a model returned no usable answer, the cell counts what it did return: `gpt-6.1-sol` / `t01_invoice_vat` returned 2 usable answer(s); `gpt-6.1-sol` / `t02_ng_phone` returned 2 usable answer(s); `gpt-6.1-sol` / `t03_resilient_fetch` returned 2 usable answer(s); `gpt-6.1-sol` / `t05_payment_ledger` returned 2 usable answer(s); `gpt-6.1-sol` / `t06_search_box` returned 2 usable answer(s); `gpt-6.1-sol` / `t07_dialog_a11y` returned 2 usable answer(s); `gpt-6.1-sol` / `t08_business_days` returned 2 usable answer(s); `gpt-6.1-sol` / `t09_optimistic_store` returned 2 usable answer(s); `gpt-6-astra` / `t01_invoice_vat` returned 2 usable answer(s); `gpt-6-astra` / `t02_ng_phone` returned 2 usable answer(s); `gpt-6-astra` / `t03_resilient_fetch` returned 2 usable answer(s); `gpt-6-astra` / `t06_search_box` returned 2 usable answer(s); `gpt-6-astra` / `t07_dialog_a11y` returned 2 usable answer(s); `gpt-5.6-sol` / `t07_dialog_a11y` returned 1 usable answer(s). Those answers are excluded, never scored as failures.*

Best: **gpt-6.1-sol**, 9.0/9 tasks fully passed at 100% of checks. Lowest: **qwen2.5-coder-7b-local**, 0.0/9 at 48%.
<!-- RESULTS:END -->

The headline is **saturation, and where it stops**. Three 2026 frontier models pass the entire suite -- every check, every trial -- so the eval no longer separates them from each other. What it still separates is capability below the frontier: GPT-4o (2024) writes code that runs on every task and still misses 41 of 310 checks, and the 7B local model fails the tasks that need state kept across renders and reloads (t04 0%, t07 4%). A benchmark that every current frontier model passes is still useful if it is honest about that: it sets the bar, and it shows which rules a model one generation old still gets wrong.


---

## Failure analysis

These five are worked examples from the GPT-4o run, chosen because each failure is visible in the model's own code, and because they are the rules the 2026 frontier models now pass on every trial. Each was verified by reading that code in `results/raw/gpt-4o/`, confirming the prompt states the rule, and confirming the reference solution passes the same check. These are model errors, not grader errors.

### 1. t03 — retries an unkeyed POST, because the idempotency guard only covers one of two retry paths

**Rule (prompt, t03):** never retry a `POST` or `PATCH` unless the request carries an `Idempotency-Key` header.

GPT-4o defines the rule correctly at the top of the file:

```js
const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS', 'PUT', 'DELETE']);
const idempotentMethods = new Set(['POST', 'PATCH']);
// ...
const canRetryMethod = safeMethods.has(method) ||
  (idempotentMethods.has(method) && headers.has('Idempotency-Key'));
```

But the guard is only consulted in the `catch` block (network error). The response path retries any retryable status with no method check at all:

```js
const status = response.status;
if (!retryableStatuses.has(status)) return response;
const retryAfter = response.headers.get('Retry-After');
if (retryAfter && /^\d+$/.test(retryAfter)) {
  await sleep(retryAfterMs, options.signal);     // POST retried, no key check
} else {
  await sleep(delay, options.signal);            // POST retried, no key check
}
```

**Why this should not fail:** the model wrote the correct predicate and applied it to one of the two branches. A payments engineer would call that a bug the first time a gateway returned 503 on a charge. **Fails:** `[post-idempotency] POST without a key is never retried`, `PATCH without a key is not retried`.

### 2. t01 — the tie-break comparator compares a line object to an allocation object, so it is always `-1`

**Rule (prompt, t01, rule 3):** "The leftover kobo are given one each to the lines with the largest fractional remainders. Break ties in favour of the earlier line."

```js
allocations.sort((a, b) => b.remainder - a.remainder || lines.indexOf(a) - lines.indexOf(b));
```

`a` and `b` are allocation records; `lines` holds the original line inputs. `indexOf` returns `-1` for both, so the tie-break evaluates to `0` and the sort never restores original order.

**Why this should not fail:** the prompt states the tie-break explicitly, and the same function already implements the largest-remainder allocation correctly. This is the last line of a rule the model understood. **Fails:** `[allocation] equal remainders: the earlier line gets the leftover kobo`, plus four more allocation and fuzz checks.

### 3. t01 — VAT is computed with float multiplication and `Math.round`, not integer half-up

**Rule (prompt, t01, rule 5):** "VAT is computed per line on `netKobo`, rounded half up to a whole kobo. Use integer arithmetic only."

```js
const lineVatKobo = vatExempt ? 0 : Math.round(netKobo * 0.075);
```

`netKobo * 0.075` is a binary float; an exact half can land a hair below and round down. The prompt ships the intended integer formula.

**Why this should not fail:** rounding money in floats is the first thing a payments reviewer looks for, and the spec says "integer arithmetic only" in plain words. **Fails:** `[vat-rounding] exact halves round up`, `[fuzz-kobo] 200 random invoices match the reference to the kobo`.

### 4. t02 — a bare national number and the `00234` prefix are mishandled

**Rule (prompt, t02):** the accepted inputs include `+234(0)803…`, `234803…`, `0803-123-4567`, `00234…` and a bare `8031234567`.

```js
if (digits.startsWith('234'))        digits = digits.slice(3);
else if (digits.startsWith('00234')) digits = digits.slice(5);
else if (digits.startsWith('0'))     digits = digits.slice(1);
```

`00234 0803 123 4567` strips the international prefix but leaves the trunk `0`, producing 11 digits and a rejection. A bare `8031234567` matches no branch, so it never gets its trunk digit added and is rejected too.

**Why this should not fail:** both shapes are listed as valid input in the prompt, and every Nigerian engineer has seen all five shapes in a support ticket. **Fails:** `[formats] "8031234567" -> +2348031234567`, `[formats] 00234 international prefix`, plus four `[country-zero]` checks.

### 5. t07 — scroll lock captures the previous value once, at mount

**Rule (prompt, t07):** lock background scrolling while open and restore the exact previous `body.style.overflow` value on close, including on unmount.

```js
const initialBodyOverflow = useRef(document.body.style.overflow);   // captured on first render
// ...
document.body.style.overflow = 'hidden';
// on close:
document.body.style.overflow = initialBodyOverflow.current;
```

If the dialog mounts while another overlay has already set `overflow: hidden`, or the body value changes while open, the captured value is stale and "restore" writes back the wrong value.

**Why this should not fail:** it is a two-line effect with a cleanup function, and the prompt names the exact property. It only breaks when two overlays stack, which is the case the check covers. **Fails:** `[scroll-lock] an empty previous value is restored to empty, also on unmount`, `[restore-focus] restores focus on unmount while open`.

### What this says about the gap

The failures are not "cannot write JavaScript". GPT-4o produced runnable files for all nine tasks. The failures are **the second rule**: the guard that must apply to both retry paths, the tie-break after the allocation, the cleanup on unmount, the trunk digit after the country code. That is what a senior engineer's review catches and a single generation pass misses, which is why the eval grades rules rather than the happy path.

---

## Why the graders can be trusted

Four independent checks, all reproducible from this repository with no API key:

1. **`python run_eval.py selftest` → `SELFTEST PASSED`.** For all 9 tasks: the reference solution passes 100% (310/310), the untouched stub fails, and **24 plausible-but-wrong solutions are rejected**. Example: `wrong/no_post_safety` still passes 48 of 60 checks and is rejected by exactly `[post-idempotency]`, `[retry-after]`, `[abort]` and `[fuzz-sequence]`.
2. **`python run_eval.py mutate --max 15` → 92 of 100 injected bugs caught.** Flipped operators, `&&`/`||` swaps and off-by-one literals are injected into each reference solution. Survivors are listed with line numbers and were reviewed: they are equivalent changes (a comparison both sides of a boundary treat identically, a redundant recomputation, arithmetic inside an error message).
3. **Randomized differential checks** in t01, t03, t05 and t09: 150 to 300 seeded random cases compared case by case against the reference implementation, so rare ordering and rounding drift cannot hide. The comparison is limited to what the prompt fixes (t03 compares an abort error by `name`, not by message).
4. **Invalid runs are excluded**, not scored as failures: an empty or cut-off answer is recorded `INVALID` with a reason and left out of every number.

[`docs/METHOD.md`](docs/METHOD.md) documents each layer.

---

## Limitations

- **The suite is saturated at the frontier.** All three 2026 models pass all 310 checks in all three trials, so this eval cannot rank them against each other; its remaining discrimination is between the frontier and older or smaller models. Reopening that gap needs harder interacting-rule checks, and validating them needs new paid runs.
- **Trials are not uniform.** The three frontier models have three trials per task each, so their spread is meaningful. The two baseline rows (GPT-4o and the local 7B) carry one trial each, because their answers were collected under an earlier budget and a CPU-only constraint; the report prints trials per model rather than hiding the difference.
- **The frontier ids are a snapshot.** They are the three models the gateway exposes today. A re-run against successor ids will not reproduce these numbers exactly.
- **Single file, unit-tested.** Tasks are graded by unit tests, so the eval does not cover visual layout, multi-file refactors or whole-app integration.
- **Prompts contain the full spec.** This measures spec adherence under many interacting rules, not requirement discovery.
- **Domain simplifications.** The 7.5% VAT rate, the phone prefix table and the holiday observance rule are the task's own stated definitions, not a model of real regulation.
- **Model versions move.** Results are tied to the ids and settings above; a re-run against a newer build will differ.

---

## Prior work and sources

- **Original work.** The nine tasks, all nine prompts, all reference solutions, all 24 wrong solutions and all test files were written for this hackathon. No existing benchmark task, dataset or grader was copied, adapted or wrapped, and I published no prior eval before this event.
- **No borrowed data.** Every input is synthetic and written for the task: invoice lines, phone strings, webhook streams, holiday lists, and seeded pseudo-random generators for the differential checks. Nothing comes from an employer, a client or a real customer.
- **Design inspiration, no code reuse.** The shape of the task format (a written instruction, a starting state, hidden tests and a reference solution) follows public practice established by Terminal-Bench and SWE-bench; grading the outcome rather than the path, and difficulty tiers, follow common eval practice and Anthropic's published guidance on eval design. The implementation here is original.
- **Libraries.** Jest 29, React 18, Testing Library and Babel, pinned in `package.json` and `package-lock.json`. Python standard library only.

---

## How AI tools were used

AI coding assistants (Deepseek v-4.1-flash) were used while building this repository: drafting the harness, the test files and initial versions of the prompts, and as a second reviewer of the grading rules.

Everything that decides a score was reviewed and edited by me before submission:

- every prompt was read against its reference solution and its tests, so that no check grades a rule the prompt does not state;
- every reference solution was run through `selftest` and must pass 100%;
- every wrong solution was run and must be rejected, and the rejecting tags were read one by one;
- mutation survivors were reviewed and classified as equivalent or as missing coverage, and missing coverage was closed with new tests;
- the failure analysis above was written from reading the model answers themselves, not from the aggregate numbers.

The eval was built during the hackathon window. The AI tools were used as an assistant. I am responsible for every task, reference answer and grading rule in it.

---

## Layout

```
run_eval.py                 runner: selftest, run (--offline, --consensus), battle, mutate, report, grade-file, show-prompt
tasks/<id>/                 prompt.md, starter/ (the stub the model edits), tests/ (hidden), reference/, wrong/, meta.json
results/                    runs.json, raw/ (cached answers = transcripts), report.md, report.html, selftest.json, mutation.json
tools/mock_server.py        a local mock model, for testing the pipeline without any key
tools/report_template.html  the interactive report (tag filters, tier filters, diffs vs reference, dark mode)
docs/METHOD.md              how the graders are validated
models.json                 the models behind the results above (ids and env-var names only, never keys)
models.example.json         a template for trying your own model
.env.example                the environment variable names this eval can use
requirements.txt            Python dependencies: none (standard library only)
```

## Transcripts

Every model answer is stored verbatim in `results/raw/<model>/<task>__r<k>.json`: the exact text the model returned, its token usage, its latency and its model id. `results/report.html` renders each one next to a diff against the reference solution and its failing checks with tags, so a reader can see exactly what went wrong without re-running anything.
