# FieldReady-FE

**An eval of whether AI coding models can write production-grade frontend logic that survives real-world conditions: flaky networks, slow devices, rounding to the kobo, messy local input, and keyboard-only users.**

Author: MECHSEIKO (Abdulqoyum Olohuntomi Amuda), micro1 Eval Hackathon 2026, individual entry.

## What it tests

Nine self-contained tasks. Each gives a model a written specification and a stub file. The model returns one source file. Hidden Jest tests then decide, check by check, whether the code meets every rule of the spec.

| # | Task | Category | Why it matters in practice |
|---|---|---|---|
| 1 | Invoice totals: 7.5% VAT per line, discount allocated by largest remainder, integer kobo | money-and-payments | Totals must match the payment gateway to the kobo |
| 2 | Normalise Nigerian mobile numbers (`+234(0)803...`, `0803-123-4567`, ...) | local-input-handling | OTP and sign-up flows break on inconsistent numbers |
| 3 | Retrying `fetch` wrapper: backoff with jitter, `Retry-After`, no blind POST retry, abort | network-resilience | A bad retry wrapper can double-charge a customer |
| 4 | Persistent offline action queue: dedupe, single-flight flush, FIFO stop | network-resilience | Offline-first apps lose or duplicate user data |
| 5 | Payment webhook ledger: duplicate and out-of-order events, amount check, refunds before success | money-and-payments | Gateways deliver webhooks twice and out of order |
| 6 | React search box: debounce, abort, stale responses, retry, unmount safety | async-ui-state | Responses arrive late and out of order on slow networks |
| 7 | React modal: focus trap, focus restore, scroll lock, drag-release on backdrop | accessibility | Keyboard and screen-reader users get lost behind modals |
| 8 | Business-day arithmetic with observed holidays, timezone and DST safe | dates-and-time | Due dates and delivery promises |
| 9 | Optimistic updates with correct rollback and out-of-order confirm | async-ui-state | Rolling back one failed save must not erase other pending changes |

**Who it is for:** teams choosing or evaluating AI coding assistants for products used in low-bandwidth, mobile-first markets, and model builders who want a failure-focused frontend benchmark.

**Not a trick benchmark.** Every rule a model is graded on is written in the task prompt. Failures therefore measure careful, complete spec-following on realistic engineering problems, not guessing a hidden gotcha.

## Design

- **Objective graders.** Hidden Jest tests only. No LLM judge.
- **Tagged checks.** Every test title carries a tag such as `[stale-response]` or `[vat-rounding]`. Reports show which kinds of requirement models miss, not only a pass rate.
- **Validated graders.** `python run_eval.py selftest` proves, for every task, that the reference solution passes 100% of checks, the untouched stub fails, and each plausible-but-wrong solution in `tasks/*/wrong/` is rejected. Output is saved to `results/selftest.json`.
- **Difficulty tiers.** Every check is L1 (happy path, unmarked), L2 (emerging-market edge cases) or L3 (adversarial, interacting rules), marked `{L2}` / `{L3}` in the test title. Reports show the pass rate per tier, so you can see where a model's reasoning breaks even when it passes the basics. Tasks t01, t03, t05 and t09 also carry **seeded randomized differential checks** (200 to 300 random cases compared with the reference implementation), which catch rare ordering and rounding drift without anyone guessing the case.
- **Partial credit and strict credit.** A task is *fully passed* only if every check passes. The mean share of checks passed is reported alongside.
- **Timezone-hardened.** Tests run under `America/Los_Angeles` (DST) regardless of your machine.
- **Reproducible offline.** Raw model answers are cached in `results/raw/`. `python run_eval.py run --offline` re-grades them with no API key and no network (add `--jobs N` to grade in parallel).
- **Invalid runs are not failures.** An answer that is empty (a reasoning model spent its whole budget thinking) or cut off mid code block is flagged `INVALID`, excluded from every score and listed in the report, so a too-small `max_tokens` cannot masquerade as a model weakness.

## Run it

Requirements: Node 20+, Python 3.9+ (standard library only). No pip packages.

```bash
npm ci                                  # installs pinned Jest, React, Testing Library
python run_eval.py selftest             # validates every grader (about 1 to 2 minutes, no API needed)
python run_eval.py list
python run_eval.py show-prompt t03      # prints the exact prompt a model gets

cp models.example.json models.json      # edit: pick models, enable the ones you want
export OPENROUTER_API_KEY=...           # Windows PowerShell: $env:OPENROUTER_API_KEY="..."
python run_eval.py run --models models.json --runs 1
python run_eval.py report               # writes results/report.md and results/report.html
python run_eval.py run --offline        # re-grade cached answers without any API call
```

### Multi-agent consensus gauntlet

```bash
python run_eval.py run --models models.json --consensus --drafter claude-sonnet --reviewer gpt-4o
```

The drafter writes a solution (its cached answer is reused), the reviewer critiques it against every numbered rule and proposes a fix, and the drafter merges. The merged code is graded by the same hidden tests. The report lists checks that the drafter, the reviewer **and** the consensus all still fail: blind spots that debate did not remove.

### Bring your own agent

```bash
python run_eval.py battle --endpoint http://localhost:18789 --name MechAgent
```

Runs any HTTP agent through every task and writes a shareable `results/battle_<name>.html` scorecard of the production traps it walked into. The default protocol is an OpenAI-style `/v1/chat/completions` endpoint (`--model`, `--api-key-env` optional). For anything else use `--protocol simple`: the runner POSTs `{"prompt", "system"}` and accepts JSON with `text`, `response` or `output`, or a plain-text reply. Battle results are saved in `results/battles/` and also appear in the main report.

Model-written code runs on your machine inside `sandbox/`. For isolation use the optional `Dockerfile`.

Approximate cost and runtime: each task prompt is about 1.5k tokens in and 1k to 3k tokens out, so a full run of 9 tasks per model is roughly 15k tokens in and 25k out. Local models cost nothing; paid frontier models typically cost a few cents to a few dollars per full run depending on price and `--runs`. Grading takes about 3 to 5 seconds per task.

## Results

> **FILL IN AFTER RUNNING:** paste the tables from `results/report.md` here, then add the failure analysis below.

RESULTS_PLACEHOLDER

### Failure analysis

> For each frontier-model failure explain: which spec rule was missed, why that rule matters in production, and confirm it was a model error (the spec is unambiguous and the grader is correct). Keep only conclusions you verified by reading the model's code.

ANALYSIS_PLACEHOLDER

## Limitations

- Tasks are single-file and graded by unit tests, so they do not cover visual layout or multi-file refactors.
- Prompts include the full specification, so this measures spec adherence under many interacting rules, not requirement discovery.
- The VAT rate (7.5%), phone-prefix pattern and holiday observance rule are stated in the prompts as the task's own definitions and simplify real-world regulation.
- Results depend on the model versions and settings recorded in `results/runs.json`.

## Layout

```
run_eval.py          runner: selftest, run (--offline, --consensus), battle, report, grade-file, show-prompt
tasks/<id>/          prompt.md, starter/, tests/ (hidden), reference/, wrong/, meta.json
results/             runs.json, raw/ (cached answers), report.md, report.html, selftest.json
tools/mock_server.py local mock model used to test the pipeline without keys
tools/report_template.html  template for the interactive report (tag filters, diffs vs reference, dark mode)
```
