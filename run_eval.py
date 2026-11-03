#!/usr/bin/env python3
"""FieldReady-FE runner. Python standard library only.

Commands
  list                         show tasks
  selftest                     prove every grader: reference passes, wrong solutions fail
  show-prompt TASK             print the exact prompt a model receives
  grade-file TASK FILE         grade a solution file you have on disk
  run --models models.json     query models, grade the answers, store results
  report                       build results/report.md and results/report.html

See README.md for the full walkthrough.
"""
import argparse
import html
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS_DIR = ROOT / "tasks"
SANDBOX = ROOT / "sandbox"
RESULTS = ROOT / "results"
RAW = RESULTS / "raw"
TAG_RE = re.compile(r"\[([a-z0-9-]+)\]")

SYSTEM_PROMPT = (
    "You are an expert JavaScript and React engineer. Follow the specification exactly, including every edge case. "
    "Reply with exactly one fenced code block containing the complete contents of the requested file, and no other text."
)


# ----------------------------------------------------------------------------- tasks
def load_tasks(selected=None):
    tasks = []
    for d in sorted(TASKS_DIR.iterdir()):
        if not (d / "meta.json").exists():
            continue
        meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
        if selected and not any(meta["id"].startswith(s) for s in selected):
            continue
        meta["dir"] = d
        tasks.append(meta)
    return tasks


def starter_text(task):
    p = task["dir"] / "starter" / task["target"]
    return p.read_text(encoding="utf-8") if p.exists() else ""


def build_prompt(task):
    spec = (task["dir"] / "prompt.md").read_text(encoding="utf-8").strip()
    lang = "jsx" if task["target"].endswith(".jsx") else "js"
    return (
        f"{spec}\n\n## File to write: `{task['target']}`\n\nCurrent contents:\n\n```{lang}\n{starter_text(task).rstrip()}\n```\n\n"
        f"Return the complete new contents of `{task['target']}` in a single code block. Use named exports exactly as specified. "
        f"Do not import anything except what the task allows."
    )


def extract_code(text):
    blocks = re.findall(r"```[a-zA-Z0-9_+-]*[ \t]*\r?\n(.*?)```", text, re.S)
    if not blocks:
        return text.strip() + "\n"
    return max(blocks, key=len)


# ----------------------------------------------------------------------------- grading
def node_bin():
    n = shutil.which("node")
    if not n:
        sys.exit("node was not found on PATH. Install Node 20+ and run `npm ci`.")
    return n


def grade(task, code, tag, timeout=120):
    """Write code into a fresh sandbox, run the hidden tests with Jest, return per-test outcomes."""
    safe = re.sub(r"[^a-zA-Z0-9_.-]+", "_", tag)
    box = SANDBOX / f"{task['id']}__{safe}"
    if box.exists():
        shutil.rmtree(box)
    (box / "tests").mkdir(parents=True)
    starter_dir = task["dir"] / "starter"
    if starter_dir.exists():
        shutil.copytree(starter_dir, box, dirs_exist_ok=True)
    target = box / task["target"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(code, encoding="utf-8")
    for t in (task["dir"] / "tests").glob("*.test.js"):
        shutil.copy(t, box / "tests" / t.name)
    test_file = next((box / "tests").glob("*.test.js"))
    out = box / "jest-result.json"
    cmd = [node_bin(), str(ROOT / "node_modules" / "jest" / "bin" / "jest.js"), "--config", "jest.config.js",
           "--runTestsByPath", test_file.relative_to(ROOT).as_posix(), "--json", f"--outputFile={out}", "--silent", "--ci"]
    t0 = time.time()
    try:
        proc = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
        stderr = proc.stderr[-800:]
    except subprocess.TimeoutExpired:
        return {"passed": 0, "total": task.get("n_tests", 0), "tests": [], "error": "timeout", "seconds": round(time.time() - t0, 1)}
    res = {"passed": 0, "total": 0, "tests": [], "error": None, "seconds": round(time.time() - t0, 1)}
    if out.exists():
        data = json.loads(out.read_text(encoding="utf-8"))
        suite = data["testResults"][0] if data.get("testResults") else {}
        for a in suite.get("assertionResults", []):
            m = TAG_RE.search(a["title"])
            res["tests"].append({"title": a["title"], "status": a["status"], "tag": m.group(1) if m else "untagged",
                                 "message": (a.get("failureMessages") or [""])[0][:300]})
        res["passed"] = sum(1 for t in res["tests"] if t["status"] == "passed")
        res["total"] = len(res["tests"])
        if not res["tests"]:
            res["error"] = ((suite.get("message") or stderr) or "suite failed to run")[:400]
            res["total"] = task.get("n_tests", 0)
    else:
        res["error"] = stderr or "jest produced no output"
        res["total"] = task.get("n_tests", 0)
    shutil.rmtree(box, ignore_errors=True)
    return res


# ----------------------------------------------------------------------------- selftest
def cmd_selftest(args):
    tasks = load_tasks(args.tasks)
    ok_all = True
    report = []
    print(f"{'task':28} {'solution':26} {'passed':>8}  verdict")
    for task in tasks:
        ref = next((task["dir"] / "reference").glob("solution.*"))
        r = grade(task, ref.read_text(encoding="utf-8"), "reference")
        verdict = "OK" if r["total"] and r["passed"] == r["total"] else "REFERENCE FAILS"
        ok_all &= verdict == "OK"
        print(f"{task['id']:28} {'reference':26} {r['passed']:>3}/{r['total']:<4}  {verdict}")
        if verdict != "OK":
            for t in r["tests"]:
                if t["status"] != "passed":
                    print("     FAIL:", t["title"], "|", t["message"].replace("\n", " ")[:160])
            if r["error"]:
                print("     ERROR:", r["error"][:200])
        meta_path = task["dir"] / "meta.json"
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if r["total"] and meta.get("n_tests") != r["total"]:
            meta["n_tests"] = r["total"]
            meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
        entry = {"task": task["id"], "reference": {"passed": r["passed"], "total": r["total"]}, "wrong": [], "starter": None}
        s = grade(task, starter_text(task), "starter")
        sv = "OK (stub fails)" if s["passed"] < s["total"] else "STARTER PASSES"
        ok_all &= s["passed"] < s["total"]
        print(f"{'':28} {'starter':26} {s['passed']:>3}/{s['total']:<4}  {sv}")
        entry["starter"] = {"passed": s["passed"], "total": s["total"]}
        for w in sorted((task["dir"] / "wrong").glob("*.js*")):
            wr = grade(task, w.read_text(encoding="utf-8"), "wrong_" + w.stem)
            failed_tags = sorted({t["tag"] for t in wr["tests"] if t["status"] != "passed"})
            v = "OK (rejected)" if wr["passed"] < wr["total"] else "WRONG SOLUTION PASSES"
            ok_all &= wr["passed"] < wr["total"]
            print(f"{'':28} {'wrong/' + w.stem:26} {wr['passed']:>3}/{wr['total']:<4}  {v}  caught by: {', '.join(failed_tags) or '-'}")
            entry["wrong"].append({"name": w.stem, "passed": wr["passed"], "total": wr["total"], "caught_by": failed_tags})
        report.append(entry)
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "selftest.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print("\nSELFTEST", "PASSED" if ok_all else "FAILED")
    return 0 if ok_all else 1


# ----------------------------------------------------------------------------- models
def slug(s):
    return re.sub(r"[^a-zA-Z0-9_.-]+", "_", s).strip("_")


def call_model(m, prompt):
    url = m["base_url"].rstrip("/") + "/chat/completions"
    body = {
        "model": m["model"],
        "temperature": m.get("temperature", 0),
        "max_tokens": m.get("max_tokens", 4096),
        "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": prompt}],
    }
    headers = {"Content-Type": "application/json"}
    env = m.get("api_key_env")
    if env:
        key = os.environ.get(env)
        if not key:
            sys.exit(f"Environment variable {env} is not set (needed for model '{m['name']}').")
        headers["Authorization"] = "Bearer " + key
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    last = None
    for attempt in range(5):
        try:
            t0 = time.time()
            with urllib.request.urlopen(req, timeout=m.get("timeout_s", 300)) as r:
                data = json.loads(r.read().decode())
            msg = data["choices"][0]["message"]
            return {"text": msg.get("content") or "", "usage": data.get("usage", {}), "latency_s": round(time.time() - t0, 1)}
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read().decode(errors='replace')[:200]}"
            if e.code not in (408, 429, 500, 502, 503, 504):
                break
        except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError) as e:
            last = repr(e)
        time.sleep(min(30, 2 ** attempt * 2))
    raise RuntimeError(last)


def cmd_run(args):
    cfg = json.loads(Path(args.models).read_text(encoding="utf-8"))
    models = [m for m in cfg["models"] if not m.get("disabled") and (not args.only or m["name"] in args.only)]
    tasks = load_tasks(args.tasks)
    RESULTS.mkdir(exist_ok=True)
    runs_path = RESULTS / "runs.json"
    runs = json.loads(runs_path.read_text(encoding="utf-8")) if runs_path.exists() else []
    index = {(r["model"], r["task"], r["run"]): i for i, r in enumerate(runs)}
    for m in models:
        for task in tasks:
            for k in range(1, args.runs + 1):
                raw_path = RAW / slug(m["name"]) / f"{task['id']}__r{k}.json"
                if raw_path.exists() and not args.refresh:
                    raw = json.loads(raw_path.read_text(encoding="utf-8"))
                    src = "cache"
                elif args.offline:
                    print(f"[skip] {m['name']} {task['id']} run {k}: no cached answer and --offline")
                    continue
                else:
                    try:
                        raw = call_model(m, build_prompt(task))
                    except RuntimeError as e:
                        print(f"[error] {m['name']} {task['id']}: {e}")
                        continue
                    raw.update({"model": m["name"], "model_id": m["model"], "task": task["id"], "run": k})
                    raw_path.parent.mkdir(parents=True, exist_ok=True)
                    raw_path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
                    src = "api"
                g = grade(task, extract_code(raw["text"]), f"{slug(m['name'])}_{k}")
                rec = {
                    "model": m["name"], "task": task["id"], "run": k, "passed": g["passed"], "total": g["total"],
                    "full_pass": bool(g["total"]) and g["passed"] == g["total"], "tests": g["tests"], "error": g["error"],
                    "usage": raw.get("usage", {}), "latency_s": raw.get("latency_s"),
                    "price_in": m.get("price_in_per_mtok"), "price_out": m.get("price_out_per_mtok"),
                }
                key = (m["name"], task["id"], k)
                if key in index:
                    runs[index[key]] = rec
                else:
                    index[key] = len(runs)
                    runs.append(rec)
                print(f"[{src}] {m['name']:28} {task['id']:24} run {k}: {g['passed']}/{g['total']} {'PASS' if rec['full_pass'] else 'fail'}")
                runs_path.write_text(json.dumps(runs, indent=1), encoding="utf-8")
    print("\nDone. Build the report with: python run_eval.py report")
    return 0


def cmd_grade_file(args):
    task = load_tasks([args.task])[0]
    g = grade(task, Path(args.file).read_text(encoding="utf-8"), "manual")
    print(f"{g['passed']}/{g['total']} passed")
    for t in g["tests"]:
        print(("  ok   " if t["status"] == "passed" else "  FAIL ") + t["title"])
    if g["error"]:
        print("error:", g["error"])
    return 0 if g["total"] and g["passed"] == g["total"] else 1


def cmd_show_prompt(args):
    task = load_tasks([args.task])[0]
    print("SYSTEM:\n" + SYSTEM_PROMPT + "\n\nUSER:\n" + build_prompt(task))
    return 0


def cmd_list(args):
    for t in load_tasks():
        print(f"{t['id']:26} {t['category']:24} {t['difficulty']:7} {t['title']}")
    return 0


# ----------------------------------------------------------------------------- report
def aggregate(runs, tasks):
    models = []
    for r in runs:
        if r["model"] not in models:
            models.append(r["model"])
    task_ids = [t["id"] for t in tasks]
    grid = {}
    for m in models:
        for t in task_ids:
            rs = [r for r in runs if r["model"] == m and r["task"] == t]
            if rs:
                grid[(m, t)] = {
                    "pass_rate": sum(1 for r in rs if r["full_pass"]) / len(rs),
                    "score": sum(r["passed"] / r["total"] for r in rs if r["total"]) / len(rs),
                    "n": len(rs),
                }
    summary = {}
    for m in models:
        cells = [grid[(m, t)] for t in task_ids if (m, t) in grid]
        rs = [r for r in runs if r["model"] == m]
        cost = 0.0
        for r in rs:
            u = r.get("usage") or {}
            if r.get("price_in") is not None and r.get("price_out") is not None:
                cost += (u.get("prompt_tokens", 0) * r["price_in"] + u.get("completion_tokens", 0) * r["price_out"]) / 1e6
        summary[m] = {
            "tasks_fully_passed": sum(c["pass_rate"] for c in cells),
            "tasks": len(cells),
            "mean_score": sum(c["score"] for c in cells) / len(cells) if cells else 0,
            "cost": cost,
            "avg_latency": (sum((r.get("latency_s") or 0) for r in rs) / len(rs)) if rs else 0,
        }
    tags = {}
    for m in models:
        for r in runs:
            if r["model"] != m:
                continue
            for t in r["tests"]:
                d = tags.setdefault(t["tag"], {}).setdefault(m, [0, 0])
                d[1] += 1
                d[0] += 1 if t["status"] == "passed" else 0
    return models, task_ids, grid, summary, tags


def pct(x):
    return f"{round(100 * x)}%"


def cmd_report(args):
    runs_path = RESULTS / "runs.json"
    if not runs_path.exists():
        sys.exit("No results yet. Run: python run_eval.py run --models models.json")
    runs = json.loads(runs_path.read_text(encoding="utf-8"))
    tasks = load_tasks()
    models, task_ids, grid, summary, tags = aggregate(runs, tasks)
    titles = {t["id"]: t for t in tasks}

    md = ["# FieldReady-FE results", "", "Generated by `python run_eval.py report`. Full-pass = every hidden test for the task passed.", ""]
    md += ["## Summary by model", "", "| Model | Tasks fully passed | Mean test score | Avg latency (s) | Est. cost (USD) |", "|---|---|---|---|---|"]
    for m in models:
        s = summary[m]
        md.append(f"| {m} | {s['tasks_fully_passed']:.1f} / {s['tasks']} | {pct(s['mean_score'])} | {s['avg_latency']:.1f} | {s['cost']:.3f} |")
    md += ["", "## Task grid (full-pass rate, with mean test score)", "", "| Task | Category | " + " | ".join(models) + " |",
           "|---|---|" + "---|" * len(models)]
    for t in task_ids:
        row = [f"{t} ({titles[t]['difficulty']})", titles[t]["category"]]
        for m in models:
            c = grid.get((m, t))
            row.append(f"{pct(c['pass_rate'])} ({pct(c['score'])})" if c else "-")
        md.append("| " + " | ".join(row) + " |")
    md += ["", "## Failure categories (share of hidden checks passed, by tag)", "", "| Tag | " + " | ".join(models) + " |", "|---|" + "---|" * len(models)]
    for tag in sorted(tags):
        row = [tag]
        for m in models:
            p, n = tags[tag].get(m, [0, 0])
            row.append(f"{pct(p / n)} ({p}/{n})" if n else "-")
        md.append("| " + " | ".join(row) + " |")
    md += ["", "## Most common failing checks", ""]
    fails = {}
    for r in runs:
        for t in r["tests"]:
            if t["status"] != "passed":
                fails.setdefault((r["task"], t["title"]), set()).add(r["model"])
    for (task, title), ms in sorted(fails.items(), key=lambda kv: -len(kv[1]))[:15]:
        md.append(f"- `{task}`: {title} (failed by {len(ms)} model(s): {', '.join(sorted(ms))})")
    (RESULTS / "report.md").write_text("\n".join(md) + "\n", encoding="utf-8")

    def cell(c):
        if not c:
            return '<td class="na">-</td>'
        cls = "ok" if c["pass_rate"] == 1 else ("mid" if c["score"] >= 0.6 else "bad")
        return f'<td class="{cls}"><b>{pct(c["pass_rate"])}</b><small>{pct(c["score"])} of checks</small></td>'

    rows = "".join(
        f"<tr><th><span class='tid'>{html.escape(t)}</span><small>{html.escape(titles[t]['title'])}</small></th>"
        f"<td>{html.escape(titles[t]['category'])}</td>" + "".join(cell(grid.get((m, t))) for m in models) + "</tr>"
        for t in task_ids)
    sum_rows = "".join(
        f"<tr><th>{html.escape(m)}</th><td>{summary[m]['tasks_fully_passed']:.1f} / {summary[m]['tasks']}</td><td>{pct(summary[m]['mean_score'])}</td>"
        f"<td>{summary[m]['avg_latency']:.1f}s</td><td>${summary[m]['cost']:.3f}</td></tr>" for m in models)
    tag_rows = "".join(
        f"<tr><th>{html.escape(tag)}</th>" + "".join(
            (lambda pn: f'<td class="{"ok" if pn[1] and pn[0] == pn[1] else ("mid" if pn[1] and pn[0] / pn[1] >= .6 else "bad")}">{pct(pn[0] / pn[1]) if pn[1] else "-"}</td>')(tags[tag].get(m, [0, 0]))
            for m in models) + "</tr>" for tag in sorted(tags))
    head = "".join(f"<th>{html.escape(m)}</th>" for m in models)
    page = f"""<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>FieldReady-FE results</title><style>
:root{{--bg:#fff;--fg:#111827;--mut:#4b5563;--line:#d1d5db;--acc:#0b5c8a;--ok:#dcfce7;--mid:#fef9c3;--bad:#fee2e2;--okt:#14532d;--midt:#713f12;--badt:#7f1d1d}}
@media (prefers-color-scheme:dark){{:root{{--bg:#0f172a;--fg:#e5e7eb;--mut:#9ca3af;--line:#334155;--acc:#7dd3fc;--ok:#14532d;--mid:#713f12;--bad:#7f1d1d;--okt:#dcfce7;--midt:#fef9c3;--badt:#fee2e2}}}}
body{{font:15px/1.5 system-ui,Segoe UI,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--fg);margin:0;padding:24px;max-width:1100px;margin-inline:auto}}
h1{{font-size:26px;margin:0 0 4px}}h2{{font-size:17px;color:var(--acc);margin:28px 0 8px}}p{{color:var(--mut);margin:4px 0 12px}}
.wrap{{overflow-x:auto}}table{{border-collapse:collapse;width:100%}}th,td{{border-bottom:1px solid var(--line);padding:8px 10px;text-align:left;vertical-align:top}}
thead th{{border-bottom:2px solid var(--acc)}}small{{display:block;color:var(--mut);font-weight:400}}.tid{{font-family:ui-monospace,Consolas,monospace;font-size:13px}}
td.ok{{background:var(--ok);color:var(--okt)}}td.mid{{background:var(--mid);color:var(--midt)}}td.bad{{background:var(--bad);color:var(--badt)}}td.na{{color:var(--mut)}}
td small{{color:inherit;opacity:.8}}</style></head><body>
<h1>FieldReady-FE results</h1><p>Full-pass = every hidden check for the task passed. Percent of checks shows partial credit.</p>
<h2>Summary by model</h2><div class="wrap"><table><thead><tr><th>Model</th><th>Tasks fully passed</th><th>Mean checks passed</th><th>Avg latency</th><th>Est. cost</th></tr></thead><tbody>{sum_rows}</tbody></table></div>
<h2>Task grid</h2><div class="wrap"><table><thead><tr><th>Task</th><th>Category</th>{head}</tr></thead><tbody>{rows}</tbody></table></div>
<h2>Failure categories</h2><p>Share of hidden checks passed per tag. Low cells show what models get wrong.</p>
<div class="wrap"><table><thead><tr><th>Tag</th>{head}</tr></thead><tbody>{tag_rows}</tbody></table></div></body></html>"""
    (RESULTS / "report.html").write_text(page, encoding="utf-8")
    print("Wrote results/report.md and results/report.html")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("list").set_defaults(fn=cmd_list)
    p = sub.add_parser("selftest")
    p.add_argument("--tasks", nargs="*")
    p.set_defaults(fn=cmd_selftest)
    p = sub.add_parser("show-prompt")
    p.add_argument("task")
    p.set_defaults(fn=cmd_show_prompt)
    p = sub.add_parser("grade-file")
    p.add_argument("task")
    p.add_argument("file")
    p.set_defaults(fn=cmd_grade_file)
    p = sub.add_parser("run")
    p.add_argument("--models", default="models.json")
    p.add_argument("--tasks", nargs="*")
    p.add_argument("--only", nargs="*", help="model names to run")
    p.add_argument("--runs", type=int, default=1)
    p.add_argument("--offline", action="store_true", help="grade cached answers only, make no API calls")
    p.add_argument("--refresh", action="store_true", help="ignore cached answers")
    p.set_defaults(fn=cmd_run)
    sub.add_parser("report").set_defaults(fn=cmd_report)
    args = ap.parse_args()
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
