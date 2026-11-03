# If frontier models pass too much

Make tasks harder in ways that stay fair (every rule is written in the prompt):

1. **Add interacting rules**, not obscure facts. Failures come from combining rules (for example retry rules x idempotency x abort).
2. **Add a randomized differential check.** In a test, generate 500 random inputs and compare the model's output with the reference implementation. This catches rare rounding or ordering bugs without you guessing them.
3. **Add difficulty tiers inside a task.** Tag checks `[l1-...]`, `[l2-...]`, `[l3-...]` so the report shows where capability breaks even if top models pass the first levels.
4. **Raise realism.** Add a second collaborating function to the same file, or require a hook plus the component that uses it.
5. **Add new tasks from your own experience.** Ideas: list key and virtualization rules, resumable chunked uploads, Paystack-style inline checkout state, mapping server field errors onto form fields, pluralization and number formatting for Yoruba, Hausa and Igbo labels, a low-bandwidth data-saver mode.

For any new task: write the prompt, the reference, the tests, then 2 plausible wrong solutions, and run `python run_eval.py selftest`. Do not ship a task whose wrong solutions pass.

Do not weaken a task just because a model failed it. First confirm the failure is a real spec violation.
