# Runbook: now until submission

Deadline: **9 Nov 2026, 06:15 AM WAT** (05:15 GMT). Submission is final once sent. Aim to submit by the evening of **8 Nov**.

## Tonight (2 Nov)
1. Unzip, open a terminal in the folder.
2. `npm ci` then `python run_eval.py selftest`. It must print `SELFTEST PASSED`.
3. On HackerRank open the **Instructions** tab and read the submission format, rubric and reference examples fully. Paste the rubric and the "Questions" section to Claude so the README can be matched to it.
4. Email hackathon@micro1.ai only if something in the format is unclear.

## 3 Nov: first real results
1. Make an OpenRouter account. Add a small amount of credit if you want frontier models (the FAQ says clear failures on frontier models impress judges most).
2. `cp models.example.json models.json` (Windows: `copy models.example.json models.json`). Enable your local `qwen2.5-coder:7b`, one free model, and **two frontier models** from different vendors. Copy exact ids from openrouter.ai/models.
3. `python run_eval.py run --models models.json` then `python run_eval.py report`. Open `results/report.html`.

## 4 to 5 Nov: make the failures meaningful
For every failing check of a frontier model, open `results/raw/<model>/<task>__r1.json`, read the code, and classify:
- **Model error**: spec is clear, grader correct. Keep. This is your evidence.
- **Ambiguous spec**: fix `prompt.md` so there is one defensible answer.
- **Grader bug**: fix the test, then rerun `selftest`.

If frontier models pass nearly everything, harden (see `docs/HARDENING.md`). Re-run `selftest` after every change.

## 6 Nov: freeze
1. Stop editing tasks. Final runs: `python run_eval.py run --models models.json --runs 3 --refresh`.
2. `python run_eval.py report`. Paste tables into README `RESULTS_PLACEHOLDER`.

## 7 Nov: write up and record
1. Fill `ANALYSIS_PLACEHOLDER` in README (3 to 5 verified findings). Use `docs/DESCRIPTION.md` for the short description.
2. Record the video with `docs/VIDEO_SCRIPT.md` (max 5 minutes; YouTube unlisted or Drive with open access; check it plays without login).

## 8 Nov: package and submit
1. Delete `node_modules`, `sandbox`, `__pycache__`. Keep `results/raw` (small) so judges can re-grade offline. Make sure no API keys are in any file.
2. Zip, check the size is under 50 MB, unzip in a fresh folder, run `npm ci`, `python run_eval.py selftest` and `python run_eval.py run --offline`.
3. Submit ZIP, video link and description. Confirm the submission shows as complete. Re-submitting before the deadline is allowed (latest complete one counts).
