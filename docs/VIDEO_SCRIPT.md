# Video script (5 minutes max)

Screen-record the terminal and `results/report.html`. You do not need to show your face. An AI voice is allowed.

| Time | Show | Say |
|---|---|---|
| 0:00 to 0:30 | README top | AI coding models are tested on generic puzzles, but products for mobile-first, low-bandwidth markets fail in specific ways. |
| 0:30 to 1:30 | README task table | The nine tasks by category and why each failure costs real money or locks users out. |
| 1:30 to 2:30 | One `prompt.md` and its tagged test file | How a task works: written spec, hidden tests, tags. Everything graded is written in the prompt. |
| 2:30 to 3:15 | Terminal: `python run_eval.py selftest` | How I know the grader is right: reference passes, stub fails, plausible wrong solutions are rejected. |
| 3:15 to 4:30 | `report.html` | Results across models. Point at the lowest cells. Show one real failing code snippet and the exact rule it broke. |
| 4:30 to 5:00 | README limitations and run commands | How to reproduce: `npm ci`, `selftest`, `run --offline`. Limits and next steps. |

Checklist: audible, under 5:00, link opens without login.
