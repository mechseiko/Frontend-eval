# How the graders are validated

An eval is only worth the trust you can put in its grader. Four independent checks are
run on this suite; three of them are automated, and all four are reproducible from the
repository without an API key.

## 1. Reference solution passes, stub fails, plausible wrong answers are rejected

```bash
python run_eval.py selftest
```

For every task this grades three kinds of answer with the same hidden tests:

- the **reference solution** in `tasks/<id>/reference/`, which must pass every check;
- the **untouched starter stub** in `tasks/<id>/starter/`, which must fail at least one
  check (otherwise the task is solvable by doing nothing);
- every **plausible-but-wrong** solution in `tasks/<id>/wrong/`, each of which must fail.

A task fails the selftest if any of those three properties breaks. The output is written
to `results/selftest.json`, and the command exits non-zero if anything regressed.

The `wrong/` files are written the way a competent model actually gets things wrong:
rounding the total instead of each line, retrying a POST without an idempotency key,
letting the last webhook win, snapshot rollback in an optimistic store. Each one is a
realistic near-miss rather than a broken program.

## 2. Mutation testing: the tests that catch small injected bugs

```bash
python run_eval.py mutate --max 15
```

This injects small, mechanical bugs into each reference solution (flipped comparison
operators, `&&`/`||` swaps, off-by-one number literals, `+`/`-` swaps) and counts how
many the hidden tests catch. A mutant that survives is either a missing check or a
genuinely unobservable change; the command lists each survivor with its line number so
it can be reviewed by hand rather than trusted blindly.

Survivors found by an earlier pass produced real test additions: default limits in
t03 and t04, lone weekend holidays in t08, leftover-kobo ordering in t01. The score is
written to `results/mutation.json` and included in `results/report.md`.

## 3. Randomized differential checks

Tasks t01, t03, t05 and t09 opt in with `"differential": true` in `meta.json`. For those
tasks the reference implementation is copied into the sandbox as `__ref__/solution.js`
and the tests generate a few hundred seeded random inputs, comparing the model's output
with the reference output case by case. The seed is fixed, so the same inputs are used on
every run and a failure is reproducible.

The comparison is limited strictly to behaviour the prompt fixes. For example, t03
compares an abort error by `name` and not by message, because the prompt never specifies
the message text. A fuzz check that compares more than the specification is a grader bug,
not a model failure.

## 4. Difficulty tiers, so partial credit is not one number

Every check carries a tier in its title: unmarked is **L1** (happy path), `{L2}` is an
edge case that a careful engineer would test, and `{L3}` is an adversarial case where two
rules interact (an abort signal firing during a backoff delay, a deferred refund
duplicated by a replayed webhook). The report shows the pass rate per tier, which
separates "cannot write the function" from "writes it, then misses the interacting rule".

## Invalid runs are not failures

A model answer that is empty, or whose code block never closes because the output was cut
off, measures the harness rather than the model. Those runs are marked `INVALID`, listed
separately in the report, and excluded from every score. The runner records the reason
for each one.

## Timezone pinning

Every graded run uses `TZ=America/Los_Angeles`, set both in `jest.global-setup.js` and in
the environment the grader subprocess inherits. That zone has DST and sits behind UTC, so
code that does local-time arithmetic drifts by a day on the spring-forward and fall-back
dates that t08 checks. A machine in a zone without DST (West Africa Time, for example)
would otherwise let a naive implementation pass.
