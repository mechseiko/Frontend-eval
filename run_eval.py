#!/usr/bin/env python3
"""Frontend-eval. Python standard library.

Commands
  list                         show tasks
  selftest                     prove every grader: reference passes, wrong solutions fail
  show-prompt TASK             print the exact prompt a model receives
  grade-file TASK FILE         grade a solution file you have on disk
  run --models models.json     query models, grade the answers, store results
      --offline                re-grade cached answers only (no network, no API keys)
      --consensus              also run a drafter+reviewer pair (multi-agent gauntlet)
      --jobs N                 grade N tasks in parallel
  battle --endpoint URL        bring your own agent: run it through every task, get a scorecard
  report                       build results/report.md and results/report.html

See README.md for the full walkthrough.
"""
import argparse
import concurrent.futures as cf
import difflib
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
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TASKS_DIR = ROOT / "tasks"
SANDBOX = ROOT / "sandbox"
RESULTS = ROOT / "results"
RAW = RESULTS / "raw"
TAG_RE = re.compile(r"\[([a-z0-9-]+)\]")
LEVEL_RE = re.compile(r"\{L([123])\}")  # difficulty tier marker in a test title; unmarked = L1
LOC_RE = re.compile(r"solution\.jsx?:(\d+):(\d+)")
# Every graded run of the suite uses a DST timezone so local-time bugs cannot hide on a
# machine whose own zone has no DST (West Africa Time, for example). See jest.global-setup.js.
EVAL_TZ = "America/Los_Angeles"

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


THOUGHT_RE = re.compile(r"<thought>.*?</thought>| thinking.*? response", re.S | re.I)


def extract_code(text):
    # Some models wrap the answer in a visible reasoning trace; that trace is not the answer.
    text = THOUGHT_RE.sub("", text or "")
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


def scrub_paths(text):
    """Drop the absolute checkout path from stored output so reports carry no local paths."""
    if not text:
        return text
    for prefix in (str(ROOT), str(ROOT).replace("\\", "/")):
        text = text.replace(prefix, "")
    text = re.sub(r"[A-Za-z]:[\\/][^\s\"']*?[\\/]sandbox[\\/]", "sandbox/", text)
    text = text.replace("\\sandbox\\", "sandbox/").replace("\\sandbox/", "sandbox/")
    return text


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
    if task.get("differential"):
        # Randomized differential checks compare the answer with the reference implementation.
        ref = next((task["dir"] / "reference").glob("solution.*"), None)
        if ref is not None:
            (box / "__ref__").mkdir(exist_ok=True)
            shutil.copy(ref, box / "__ref__" / ref.name)
    test_file = next((box / "tests").glob("*.test.js"))
    out = box / "jest-result.json"
    cmd = [node_bin(), str(ROOT / "node_modules" / "jest" / "bin" / "jest.js"), "--config", "jest.config.js",
           "--runTestsByPath", test_file.relative_to(ROOT).as_posix(), "--json", f"--outputFile={out}", "--silent", "--ci"]
    t0 = time.time()
    # Pin the zone for the Jest process itself, not only inside jest.global-setup.js, so the
    # DST-sensitive checks in t08 bite even when a worker starts before the setup module runs.
    env = dict(os.environ, TZ=EVAL_TZ)
    try:
        proc = subprocess.run(
            cmd,
            cwd=ROOT,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
            env=env,
        )
        stderr = (proc.stderr or "")[-800:]
    except subprocess.TimeoutExpired:
        return {"passed": 0, "total": task.get("n_tests", 0), "tests": [], "error": "timeout", "seconds": round(time.time() - t0, 1)}
    res = {"passed": 0, "total": 0, "tests": [], "error": None, "seconds": round(time.time() - t0, 1)}
    if out.exists():
        data = json.loads(out.read_text(encoding="utf-8"))
        suite = data["testResults"][0] if data.get("testResults") else {}
        for a in suite.get("assertionResults", []):
            m = TAG_RE.search(a["title"])
            lv = LEVEL_RE.search(a["title"])
            full = scrub_paths((a.get("failureMessages") or [""])[0])
            loc = LOC_RE.search(full)
            res["tests"].append({"title": a["title"], "status": a["status"], "tag": m.group(1) if m else "untagged",
                                 "level": int(lv.group(1)) if lv else 1,
                                 "message": full[:300], "line": int(loc.group(1)) if loc else None})
        res["passed"] = sum(1 for t in res["tests"] if t["status"] == "passed")
        res["total"] = len(res["tests"])
        if not res["tests"]:
            res["error"] = scrub_paths((suite.get("message") or stderr) or "suite failed to run")[:400]
            res["total"] = task.get("n_tests", 0)
    else:
        res["error"] = scrub_paths(stderr) or "jest produced no output"
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


def _extract_text(data):
    """Assistant text from an OpenAI chat reply, an OpenAI Responses reply, or a simple {"text": ...} reply."""
    if isinstance(data, str):
        return data
    if isinstance(data, dict):
        if data.get("choices"):
            ch = data["choices"][0]
            return (ch.get("message") or {}).get("content") or ch.get("text") or ""
        if isinstance(data.get("output"), list):
            # OpenAI Responses API: output[] items of type "message" hold the answer text.
            chunks = []
            for item in data["output"]:
                if isinstance(item, dict) and item.get("type") == "message":
                    for c in item.get("content") or []:
                        if isinstance(c, dict) and c.get("type") in ("output_text", "text"):
                            chunks.append(c.get("text") or "")
            if chunks:
                return "".join(chunks)
        for k in ("output_text", "text", "response", "content", "answer", "reply", "message"):
            v = data.get(k)
            if isinstance(v, str):
                return v
            if isinstance(v, dict) and isinstance(v.get("content"), str):
                return v["content"]
    raise KeyError("no assistant text found in the reply")


def _usage_of(data):
    """Normalise usage from chat (prompt/completion) or Responses (input/output) shapes."""
    u = data.get("usage") if isinstance(data, dict) else None
    if not isinstance(u, dict):
        return {}
    out = dict(u)
    out.setdefault("prompt_tokens", u.get("input_tokens", 0))
    out.setdefault("completion_tokens", u.get("output_tokens", 0))
    return out


def call_model(m, prompt, system=None, min_tokens=0):
    """One model call. protocol 'openai' (default) speaks /chat/completions; 'simple' POSTs {prompt, system}
    and accepts JSON with text/response/output/content or a plain-text body."""
    system = system or SYSTEM_PROMPT
    proto = m.get("protocol", "openai")
    if proto == "responses":
        url = m.get("url") or (m["base_url"].rstrip("/") + "/responses")
    else:
        url = m.get("url") or (m["base_url"].rstrip("/") + "/chat/completions")
    if proto == "simple":
        body = {"prompt": prompt, "system": system, "message": prompt}
    elif proto == "responses":
        body = {
            "model": m.get("model") or "default",
            "instructions": system,
            "input": prompt,
            "temperature": m.get("temperature", 0),
            "max_output_tokens": max(m.get("max_tokens", 4096), min_tokens),
        }
        if m.get("reasoning_effort"):
            body["reasoning"] = {"effort": m["reasoning_effort"]}
    else:
        body = {
            "model": m.get("model") or "default",
            "temperature": m.get("temperature", 0),
            "max_tokens": max(m.get("max_tokens", 4096), min_tokens),
            "messages": [{"role": "system", "content": system}, {"role": "user", "content": prompt}],
        }
        if m.get("reasoning_effort"):
            # Thinking models otherwise spend the whole output budget before writing any code,
            # which would be recorded as a model failure when it is really a harness setting.
            body["reasoning_effort"] = m["reasoning_effort"]
    headers = {"Content-Type": "application/json"}
    if m.get("user_agent"):
        # Some gateways allowlist clients by User-Agent and reject everything else.
        headers["User-Agent"] = m["user_agent"]
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
                payload = r.read().decode("utf-8", errors="replace")
            try:
                data = json.loads(payload)
            except json.JSONDecodeError:
                data = payload  # plain-text agent
            return {"text": _extract_text(data), "usage": _usage_of(data),
                    "latency_s": round(time.time() - t0, 1)}
        except urllib.error.HTTPError as e:
            last = f"HTTP {e.code}: {e.read().decode(errors='replace')[:200]}"
            if e.code not in (408, 429, 500, 502, 503, 504):
                break
        except (urllib.error.URLError, TimeoutError, KeyError, json.JSONDecodeError, OSError, Exception) as e:
            last = repr(e)
        time.sleep(min(30, 2 ** attempt * 2))
    raise RuntimeError(last)


def cost_of(usage, m):
    if m.get("price_in_per_mtok") is None or m.get("price_out_per_mtok") is None:
        return 0.0
    return ((usage or {}).get("prompt_tokens", 0) * m["price_in_per_mtok"] + (usage or {}).get("completion_tokens", 0) * m["price_out_per_mtok"]) / 1e6


# ----------------------------------------------------------------------------- consensus gauntlet
REVIEW_SYSTEM = (
    "You are a meticulous senior frontend reviewer. Check the draft against every numbered rule of the specification, "
    "one by one. First list each rule the draft violates or may violate (or write 'none found'). Then give the complete "
    "corrected file in exactly one fenced code block."
)


def review_prompt(spec_prompt, draft):
    return f"{spec_prompt}\n\n## Draft written by a colleague (review it)\n\n```js\n{draft.rstrip()}\n```\n"


def merge_prompt(spec_prompt, draft, review):
    return (f"{spec_prompt}\n\n## Your earlier draft\n\n```js\n{draft.rstrip()}\n```\n\n## Peer review of your draft\n\n{review.strip()}\n\n"
            "Decide which review points are correct against the specification. Return the final complete file in a single code block.")


def consensus_answer(m, task, k, args, by_name):
    """Drafter writes, reviewer critiques and refines, drafter merges. The final code is graded like any other answer."""
    a, b = by_name[m["consensus"]["drafter"]], by_name[m["consensus"]["reviewer"]]
    spec = build_prompt(task)
    draft_raw, _ = get_answer(a, task, k, args, by_name)
    if draft_raw is None:
        raise RuntimeError(f"no draft from {a['name']} to start the consensus from")
    draft = extract_code(draft_raw["text"])
    review = call_model(b, review_prompt(spec, draft), system=REVIEW_SYSTEM, min_tokens=3000)
    final = call_model(a, merge_prompt(spec, draft, review["text"]), min_tokens=3000)
    usage = {"prompt_tokens": sum((x.get("usage") or {}).get("prompt_tokens", 0) for x in (draft_raw, review, final)),
             "completion_tokens": sum((x.get("usage") or {}).get("completion_tokens", 0) for x in (draft_raw, review, final))}
    return {"text": final["text"], "draft": draft_raw["text"], "review": review["text"], "usage": usage,
            "latency_s": round(sum((x.get("latency_s") or 0) for x in (draft_raw, review, final)), 1),
            "cost_usd": cost_of(draft_raw.get("usage"), a) + cost_of(review.get("usage"), b) + cost_of(final.get("usage"), a),
            "consensus": m["consensus"]}


# ----------------------------------------------------------------------------- run pipeline
def raw_path_for(m, task, k):
    return RAW / slug(m["name"]) / f"{task['id']}__r{k}.json"


def get_answer(m, task, k, args, by_name):
    """Cached raw answer, or a fresh one. Returns (raw | None, source)."""
    path = raw_path_for(m, task, k)
    if path.exists() and not args.refresh:
        return json.loads(path.read_text(encoding="utf-8")), "cache"
    if args.offline:
        return None, "offline-miss"
    raw = consensus_answer(m, task, k, args, by_name) if m.get("consensus") else call_model(m, build_prompt(task))
    raw.update({"model": m["name"], "model_id": m.get("model"), "task": task["id"], "run": k})
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(raw, indent=2), encoding="utf-8")
    return raw, "api"


def invalid_reason(raw, m):
    """Why an answer says nothing about the model's ability (truncated or empty), else None."""
    text = raw.get("text") or ""
    if not extract_code(text).strip():
        return "empty response (reasoning models can spend the whole token budget thinking)"
    if text.count("```") % 2 == 1:
        return "code block never closed: the output was cut off (raise max_tokens and re-run with --refresh)"
    return None


def run_models(models, by_name, tasks, nruns, args, runs_path):
    """Phase 1: collect answers (cache or API). Phase 2: grade them, in parallel. Results go to runs_path."""
    RESULTS.mkdir(exist_ok=True)
    runs = json.loads(runs_path.read_text(encoding="utf-8")) if runs_path.exists() else []
    index = {(r["model"], r["task"], r["run"]): i for i, r in enumerate(runs)}
    total = len(models) * len(tasks) * nruns
    print(f"Phase 1 of 2: collecting answers. {len(models)} model(s) x {len(tasks)} task(s) x {nruns} run(s) = {total} calls.", flush=True)
    print("  Models: " + ", ".join(m["name"] for m in models), flush=True)
    print("  Cached answers are reused unless --refresh was given. Each finished call is printed below.", flush=True)
    items = [(m, task, k) for m in models for task in tasks for k in range(1, nruns + 1)]

    def fetch(item):
        m, task, k = item
        t0 = time.time()
        try:
            raw, src = get_answer(m, task, k, args, by_name)
        except RuntimeError as e:
            return item, None, "error", str(e), 0.0
        if raw is None:
            return item, None, "skip", "no cached answer and --offline", 0.0
        return item, raw, src, "", time.time() - t0

    work, done = [], 0
    # Several calls in flight at once: these models take tens of seconds each and are independent.
    call_workers = max(1, min(4, len(items)))
    with cf.ThreadPoolExecutor(max_workers=call_workers) as pool:
        for item, raw, src, note, secs in pool.map(fetch, items):
            done += 1
            m, task, k = item
            if raw is None:
                print(f"[{done}/{total}] [{src}] {m['name']} {task['id']} run {k}: {note}", flush=True)
                continue
            chars = len(raw.get("text") or "")
            print(f"[{done}/{total}] [{src}] {m['name']} {task['id']} run {k}: {chars} chars in {round(secs, 1)}s", flush=True)
            work.append((m, task, k, raw, src))

    print(f"\nPhase 2 of 2: grading {len(work)} answer(s) with Jest.", flush=True)

    def do(item):
        m, task, k, raw, src = item
        return item, grade(task, extract_code(raw["text"]), f"{slug(m['name'])}_{k}")

    jobs = max(1, args.jobs or (os.cpu_count() or 1))
    with cf.ThreadPoolExecutor(max_workers=jobs) as pool:
        for (m, task, k, raw, src), g in pool.map(do, work):
            rec = {
                "model": m["name"], "task": task["id"], "run": k, "passed": g["passed"], "total": g["total"],
                "full_pass": bool(g["total"]) and g["passed"] == g["total"], "tests": g["tests"], "error": g["error"],
                "usage": raw.get("usage", {}), "latency_s": raw.get("latency_s"), "cost": raw.get("cost_usd"),
                "price_in": m.get("price_in_per_mtok"), "price_out": m.get("price_out_per_mtok"),
                "consensus": m.get("consensus"), "byoa": bool(m.get("byoa")), "invalid": invalid_reason(raw, m),
            }
            key = (m["name"], task["id"], k)
            if key in index:
                runs[index[key]] = rec
            else:
                index[key] = len(runs)
                runs.append(rec)
            verdict = "INVALID" if rec["invalid"] else ("PASS" if rec["full_pass"] else "fail")
            print(f"[{src}] {m['name']:28} {task['id']:24} run {k}: {g['passed']}/{g['total']} {verdict}" + (f"  ({rec['invalid']})" if rec["invalid"] else ""))
            runs_path.parent.mkdir(parents=True, exist_ok=True)
            runs_path.write_text(json.dumps(runs, indent=1), encoding="utf-8")
    return runs


def cmd_run(args):
    cfg_path = Path(args.models)
    if not cfg_path.exists():
        # Offline re-grading only needs the model NAMES: results/raw/<name>/ is the cache key.
        # Rebuilding the list from results/runs.json keeps the submission reproducible even if
        # models.json is missing, and never falls back to the placeholder template.
        names = []
        runs_path = RESULTS / "runs.json"
        if args.offline and runs_path.exists():
            for r in json.loads(runs_path.read_text(encoding="utf-8")):
                if r["model"] not in names:
                    names.append(r["model"])
        if names:
            print(f"note: {cfg_path} not found; --offline rebuilds the model list from results/runs.json "
                  f"({len(names)} model(s): {', '.join(names)}).")
            cfg = {"models": [{"name": n} for n in names]}
        else:
            sys.exit(f"{cfg_path} not found. Copy models.example.json to models.json and edit it, "
                     f"or run with --offline to re-grade the answers already in results/raw/.")
    else:
        cfg = json.loads(cfg_path.read_text(encoding="utf-8"))
    by_name = {m["name"]: m for m in cfg["models"]}
    models = [m for m in cfg["models"] if not m.get("disabled") and (not args.only or m["name"] in args.only)]
    if args.consensus:
        a, b = by_name.get(args.drafter), by_name.get(args.reviewer)
        if not a or not b:
            sys.exit(f"--consensus needs two models from {args.models}; got drafter={args.drafter!r}, reviewer={args.reviewer!r} (set --drafter/--reviewer).")
        for needed in (a, b):  # their own runs are needed to show shared blind spots
            if needed not in models:
                models.append(needed)
        models.append({"name": f"consensus({a['name']}+{b['name']})", "model": "consensus",
                       "consensus": {"drafter": a["name"], "reviewer": b["name"]}})
    run_models(models, by_name, load_tasks(args.tasks), args.runs, args, RESULTS / "runs.json")
    print("\nDone. Build the report with: python run_eval.py report")
    return 0


# ----------------------------------------------------------------------------- bring your own agent
def normalise_endpoint(url, protocol):
    if protocol == "simple" or "/chat/completions" in url:
        return url
    u = url.rstrip("/")
    if re.match(r"^https?://[^/]+$", u):
        return u + "/v1/chat/completions"
    return u + "/chat/completions" if u.endswith("/v1") else u


def cmd_battle(args):
    name = args.name
    m = {"name": name, "model": args.model or name, "url": normalise_endpoint(args.endpoint, args.protocol), "protocol": args.protocol,
         "api_key_env": args.api_key_env, "max_tokens": args.max_tokens, "timeout_s": args.timeout, "byoa": True}
    tasks = load_tasks(args.tasks)
    runs_path = RESULTS / "battles" / f"{slug(name)}.json"
    print(f"BYOA battle: {name} -> {m['url']} ({args.protocol}), {len(tasks)} tasks x {args.runs} run(s)\n")
    runs = run_models([m], {name: m}, tasks, args.runs, args, runs_path)
    mine = [r for r in runs if r["model"] == name and not r.get("invalid")]
    skipped = [r for r in runs if r["model"] == name and r.get("invalid")]
    if not mine:
        print("No graded answers. Is the endpoint reachable? Try: python run_eval.py battle --help")
        return 1
    meta = {t["id"]: t for t in load_tasks()}
    full = sum(1 for r in mine if r["full_pass"])
    print(f"\n=== Scorecard: {name} ===")
    for r in mine:
        bad = sorted({t["tag"] for t in r["tests"] if t["status"] != "passed"})
        print(f"{r['task']:24} {r['passed']:>3}/{r['total']:<3} {'PASS' if r['full_pass'] else 'fail'}" + (f"   walked into: {', '.join(bad[:6])}" if bad else ""))
    for r in skipped:
        print(f"{r['task']:24} excluded: {r['invalid']}")
    print(f"\nfully passed {full}/{len(mine)} tasks; mean checks passed {pct(sum(r['passed'] / r['total'] for r in mine if r['total']) / len(mine))}")
    out = RESULTS / f"battle_{slug(name)}.html"
    write_report_html(build_report_data(runs, load_tasks(), focus=name, title=f"{name} vs Frontend-eval"), out)
    print(f"Shareable scorecard: {out.relative_to(ROOT).as_posix()}")
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
            if r.get("cost") is not None:
                cost += r["cost"]
            elif r.get("price_in") is not None and r.get("price_out") is not None:
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
                lv = summary[m].setdefault("levels", {}).setdefault(t.get("level", 1), [0, 0])
                lv[1] += 1
                lv[0] += 1 if t["status"] == "passed" else 0
    return models, task_ids, grid, summary, tags


ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def load_runs():
    """Main runs plus any bring-your-own-agent battles saved under results/battles/."""
    runs = []
    p = RESULTS / "runs.json"
    if p.exists():
        runs += json.loads(p.read_text(encoding="utf-8"))
    for f in sorted((RESULTS / "battles").glob("*.json")) if (RESULTS / "battles").exists() else []:
        runs += json.loads(f.read_text(encoding="utf-8"))
    return runs


def build_report_data(runs, tasks, focus=None, title="Frontend-eval results"):
    """Everything the interactive HTML report needs, as plain JSON (code, diffs vs the reference, failing checks)."""
    refs = {}
    for t in tasks:
        ref = next((t["dir"] / "reference").glob("solution.*"), None)
        refs[t["id"]] = ref.read_text(encoding="utf-8") if ref else ""
    out = []
    for r in runs:
        raw_p = RAW / slug(r["model"]) / f"{r['task']}__r{r['run']}.json"
        code = extract_code(json.loads(raw_p.read_text(encoding="utf-8"))["text"]) if raw_p.exists() else ""
        ref = refs.get(r["task"], "")
        diff = "\n".join(difflib.unified_diff(ref.splitlines(), code.splitlines(), "reference", r["model"], lineterm="", n=3)) if code and ref else ""
        out.append({
            "model": r["model"], "task": r["task"], "run": r["run"], "passed": r["passed"], "total": r["total"],
            "full": r["full_pass"], "latency": r.get("latency_s"), "cost": r.get("cost"), "price_in": r.get("price_in"),
            "price_out": r.get("price_out"), "usage": r.get("usage") or {}, "consensus": r.get("consensus"), "byoa": r.get("byoa", False),
            "error": r.get("error"), "invalid": r.get("invalid"),
            "tests": [{"t": t["title"], "s": t["status"], "tag": t["tag"], "lv": t.get("level", 1),
                       "msg": ANSI_RE.sub("", t.get("message") or "")[:240], "line": t.get("line")} for t in r["tests"]],
            "code": code, "diff": diff,
        })
    selftest = []
    st = RESULTS / "selftest.json"
    if st.exists():
        selftest = json.loads(st.read_text(encoding="utf-8"))
    return {
        "title": title, "focus": focus, "generated": time.strftime("%Y-%m-%d %H:%M"), "runs": out, "selftest": selftest,
        "tasks": [{"id": t["id"], "title": t["title"], "category": t["category"], "difficulty": t["difficulty"],
                   "why": t.get("why_it_matters", ""), "expected": t.get("expected_failure_mode", ""), "n": t.get("n_tests", 0)} for t in tasks],
    }


def write_report_html(data, path):
    tpl = ROOT / "tools" / "report_template.html"
    if not tpl.exists():
        path.write_text("<p>tools/report_template.html is missing.</p>", encoding="utf-8")
        return
    blob = json.dumps(data, ensure_ascii=False).replace("</", "<\\/")
    path.write_text(tpl.read_text(encoding="utf-8").replace("__DATA__", blob), encoding="utf-8")


def pct(x):
    return f"{round(100 * x)}%"


# ----------------------------------------------------------------------------- grader strength (mutation testing)
MUTATORS = [
    ("===", "!=="), ("!==", "==="), ("<=", "<"), (">=", ">"), ("&&", "||"), ("||", "&&"),
    (r"(?<![<=!>])<(?![<=])", "<="), (r"(?<![=>\-])>(?![>=])", ">="),
    (r"(?<![+\-])\+(?![+=])", "-"), (r"(?<![\-])-(?![\->=])", "+"),
]


def _in_string(line, pos):
    q = None
    for ch in line[:pos]:
        if q is None and ch in "'\"`":
            q = ch
        elif q == ch:
            q = None
    return q is not None


def mutants_of(source):
    """Single-edit mutants of a JS source: flipped operators and off-by-one number literals."""
    lines, out = source.split("\n"), []
    for ln, line in enumerate(lines):
        if line.lstrip().startswith(("//", "*", "/*", "import ", "export {")):
            continue
        cmt = line.find("//")
        for pat, rep in MUTATORS:
            for m in re.finditer(pat if pat.startswith("(?") else re.escape(pat), line):
                if _in_string(line, m.start()) or (cmt != -1 and m.start() > cmt):
                    continue
                out.append((ln + 1, f"{m.group(0)} -> {rep}", "\n".join(lines[:ln] + [line[:m.start()] + rep + line[m.end():]] + lines[ln + 1:])))
        for m in re.finditer(r"(?<![\w.])\d+(?![\w.])", line):
            if _in_string(line, m.start()) or (cmt != -1 and m.start() > cmt):
                continue
            n = int(m.group(0))
            for new in {n + 1, max(0, n - 1)} - {n}:
                out.append((ln + 1, f"{n} -> {new}", "\n".join(lines[:ln] + [line[:m.start()] + str(new) + line[m.end():]] + lines[ln + 1:])))
    return out


def cmd_mutate(args):
    """Grader strength: apply small bugs to each reference solution; a strong grader fails every one."""
    import random
    results, rng = [], random.Random(args.seed)
    for task in load_tasks(args.tasks):
        ref = next((task["dir"] / "reference").glob("solution.js"), None)
        if ref is None:
            continue
        cand = mutants_of(ref.read_text(encoding="utf-8"))
        rng.shuffle(cand)
        cand = cand[: args.max]
        with cf.ThreadPoolExecutor(max_workers=max(1, args.jobs or (os.cpu_count() or 1))) as pool:
            graded = list(pool.map(lambda x: grade(task, x[1][2], f"mut_{x[0]}"), enumerate(cand)))
        rows, killed, invalid = [], 0, 0
        for (line, what, _), g in zip(cand, graded):
            if g["total"] == 0:
                invalid += 1
                continue
            dead = g["passed"] < g["total"]
            killed += dead
            tags = sorted({t["tag"] for t in g["tests"] if t["status"] != "passed"})[:4]
            rows.append({"line": line, "mutation": what, "killed": dead, "by": tags})
        valid = len(rows)
        results.append({"task": task["id"], "mutants": valid, "killed": killed, "invalid": invalid,
                        "rate": killed / valid if valid else None, "survivors": [r for r in rows if not r["killed"]]})
        print(f"{task['id']:24} killed {killed}/{valid}  ({pct(killed / valid) if valid else '-'})" + (f"   {invalid} unparsable skipped" if invalid else ""))
        for r in results[-1]["survivors"]:
            print(f"    survived: line {r['line']}  {r['mutation']}")
    RESULTS.mkdir(exist_ok=True)
    (RESULTS / "mutation.json").write_text(json.dumps(results, indent=1), encoding="utf-8")
    tot, k = sum(r["mutants"] for r in results), sum(r["killed"] for r in results)
    print(f"\nOverall: the hidden tests caught {k}/{tot} injected bugs ({pct(k / tot) if tot else '-'}). Survivors may be harmless equivalent mutants; review them.")
    return 0


def blind_spots(runs):
    """Checks that every non-consensus model that attempted the task failed (needs 2+ models)."""
    by = {}
    for r in runs:
        if r.get("consensus"):
            continue
        for t in r["tests"]:
            by.setdefault((r["task"], t["title"]), {}).setdefault(r["model"], []).append(t["status"] == "passed")
    out = []
    for (task, title), per in by.items():
        if len(per) >= 2 and all(not any(v) for v in per.values()):
            out.append((task, title, sorted(per)))
    return sorted(out)


def readme_block(models, task_ids, grid, summary, trials, titles, short_cells=None):
    """The Results tables that `report --sync-readme` writes into README.md."""
    def lv(m, n):
        p, t = summary[m].get("levels", {}).get(n, [0, 0])
        return f"{pct(p / t)} ({p}/{t})" if t else "-"

    lines = ["| Model | Trials/task | Tasks fully passed | Mean test score | L1 happy path | L2 edge cases | L3 adversarial |",
             "|---|---|---|---|---|---|---|"]
    for m in models:
        s = summary[m]
        lines.append(f"| {m} | {trials.get(m, 0)} | **{s['tasks_fully_passed']:.1f} / {s['tasks']}** | "
                     f"{pct(s['mean_score'])} | {lv(m, 1)} | {lv(m, 2)} | {lv(m, 3)} |")
    lines += ["", "| Task | Category | " + " | ".join(models) + " |", "|---|---|" + "---|" * len(models)]
    for t in task_ids:
        row = [f"`{t}`", titles[t]["category"]]
        for m in models:
            c = grid.get((m, t))
            row.append(f"{pct(c['pass_rate'])} ({pct(c['score'])})" if c else "-")
        lines.append("| " + " | ".join(row) + " |")
    if short_cells:
        lines += ["", "*Where a model returned no usable answer, the cell counts what it did return: "
                      + "; ".join(short_cells) + ". Those answers are excluded, never scored as failures.*"]
    ranked = sorted(models, key=lambda m: (summary[m]["tasks_fully_passed"], summary[m]["mean_score"]), reverse=True)
    best, worst = ranked[0], ranked[-1]
    if best != worst:
        lines += ["", f"Best: **{best}**, {summary[best]['tasks_fully_passed']:.1f}/{summary[best]['tasks']} tasks fully "
                      f"passed at {pct(summary[best]['mean_score'])} of checks. Lowest: **{worst}**, "
                      f"{summary[worst]['tasks_fully_passed']:.1f}/{summary[worst]['tasks']} at {pct(summary[worst]['mean_score'])}."]
    return lines


def sync_readme(lines):
    p = ROOT / "README.md"
    if not p.exists():
        return
    text = p.read_text(encoding="utf-8")
    start, end = "<!-- RESULTS:START -->", "<!-- RESULTS:END -->"
    if start not in text or end not in text:
        print("README.md has no RESULTS markers; skipped --sync-readme.")
        return
    block = start + "\n" + "\n".join(lines) + "\n" + end
    text = re.sub(re.escape(start) + r".*?" + re.escape(end), lambda _: block, text, flags=re.S)
    p.write_text(text, encoding="utf-8")
    print("Updated the results block in README.md.")


PKG_SKIP_DIRS = {"node_modules", ".git", ".vscode", "_internal", "sandbox", "__pycache__", ".pytest_cache", "dist"}
PKG_SKIP_FILES = {".gitignore", ".DS_Store", "Thumbs.db", "VIDEO_SCRIPT.md"}
# Built at runtime so the checker does not match its own source.
PKG_LEAK_NEEDLES = [b"C:" + os.sep.encode() + b"Users" + os.sep.encode(), b"One" + b"Drive"]


def cmd_package(args):
    """Build the submission ZIP, refusing to ship a README with no results or a leaked path/key."""
    readme_path = ROOT / "README.md"
    readme = readme_path.read_text(encoding="utf-8")
    start, end = "<!-- RESULTS:START -->", "<!-- RESULTS:END -->"
    if start not in readme or end not in readme:
        sys.exit("README.md has no RESULTS markers; cannot verify the results section.")
    block = readme.split(start, 1)[1].split(end, 1)[0].strip()
    if not block or block.startswith("<!-- Filled in"):
        sys.exit("README.md has no results yet. Run: python run_eval.py report --sync-readme")

    out = Path(args.output) if args.output else ROOT / "dist" / "frontend-eval-submission.zip"
    out.parent.mkdir(parents=True, exist_ok=True)
    secrets = [os.environ.get(v) for v in ("AGENTROUTER_API_KEY", "OPENROUTER_API_KEY", "ANTHROPIC_API_KEY")]
    secrets = [k for k in secrets if k and len(k) > 12]
    leaks, count = [], 0
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for path in sorted(ROOT.rglob("*")):
            rel = path.relative_to(ROOT)
            if any(part in PKG_SKIP_DIRS for part in rel.parts):
                continue
            if rel.name in PKG_SKIP_FILES or rel.suffix == ".zip":
                continue
            if not path.is_file():
                continue
            data = path.read_bytes()
            if any(n in data for n in PKG_LEAK_NEEDLES) or any(k.encode() in data for k in secrets):
                leaks.append(rel.as_posix())
            z.write(path, rel.as_posix())
            count += 1

    size_mb = out.stat().st_size / (1024 * 1024)
    print(f"Wrote {out}")
    print(f"  entries: {count}   size: {size_mb:.2f} MB   README at root: {'README.md' in zipfile.ZipFile(out).namelist()}")
    if leaks:
        print("  WARNING: these files look like they contain a local path or a key:")
        for f in leaks:
            print("    " + f)
        return 1
    print("  no local paths or keys found in any file")
    if size_mb > 50:
        print("  WARNING: over the 50 MB submission limit")
        return 1
    print("  under the 50 MB limit")
    return 0


def cmd_report(args):
    all_runs = load_runs()
    if not all_runs:
        sys.exit("No results yet. Run: python run_eval.py run --models models.json")
    runs = [r for r in all_runs if not r.get("invalid") and r.get("error") != "timeout"]
    excluded = [r for r in all_runs if r.get("invalid") or r.get("error") == "timeout"]
    tasks = load_tasks()
    models, task_ids, grid, summary, tags = aggregate(runs, tasks)
    titles = {t["id"]: t for t in tasks}

    def lvl(m, n):
        p, t = summary[m].get("levels", {}).get(n, [0, 0])
        return f"{pct(p / t)} ({p}/{t})" if t else "-"

    trials = {}
    for r in runs:
        trials[r["model"]] = max(trials.get(r["model"], 0), r["run"])
    valid = {}
    for r in runs:
        valid.setdefault((r["model"], r["task"]), set()).add(r["run"])
    # Only report shortfalls for models that were meant to have three trials; the one-trial
    # baselines are described as such in the README, so listing them here would be noise.
    short_cells = [f"`{m}` / `{t}` returned {len(valid.get((m, t), ()))} usable answer(s)"
                   for m in models if trials.get(m, 0) >= 3
                   for t in task_ids if len(valid.get((m, t), ())) < trials[m]]
    md = ["# Frontend-eval results", "",
          f"Generated {time.strftime('%Y-%m-%d %H:%M')} by `python run_eval.py report`. "
          "Full-pass = every hidden test for the task passed. Invalid runs (empty or truncated answers) are excluded from every number below.",
          "",
          "| Model | Trials per task | Tasks attempted |", "|---|---|---|"]
    for m in models:
        attempted = len([t for t in task_ids if (m, t) in grid])
        md.append(f"| {m} | {trials.get(m, 0)} | {attempted} / {len(task_ids)} |")
    md.append("")
    md += ["## Summary by model", "", "| Model | Tasks fully passed | Mean test score | L1 happy path | L2 edge cases | L3 adversarial | Avg latency (s) | Est. cost (USD) |", "|---|---|---|---|---|---|---|---|"]
    for m in models:
        s = summary[m]
        md.append(f"| {m} | {s['tasks_fully_passed']:.1f} / {s['tasks']} | {pct(s['mean_score'])} | {lvl(m, 1)} | {lvl(m, 2)} | {lvl(m, 3)} | {s['avg_latency']:.1f} | {s['cost']:.3f} |")
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
    mp = RESULTS / "mutation.json"
    if mp.exists():
        mut = json.loads(mp.read_text(encoding="utf-8"))
        tot, kd = sum(r["mutants"] for r in mut), sum(r["killed"] for r in mut)
        md += ["", "## Grader strength (mutation testing)", "",
               f"Small bugs were injected into each reference solution; the hidden tests caught {kd} of {tot} ({pct(kd / tot) if tot else '-'}). Survivors may be equivalent (harmless) changes.", "",
               "| Task | Bugs injected | Caught | Survivors |", "|---|---|---|---|"]
        md += [f"| {r['task']} | {r['mutants']} | {r['killed']} | {len(r['survivors'])} |" for r in mut]
    if excluded:
        md += ["", "## Excluded runs (not model failures)", "", "These answers were empty or cut off, so they say nothing about the model and are left out of every score above.", ""]
        md += [f"- {r['model']} / {r['task']}: {r['invalid']}" for r in excluded]
    bs = blind_spots(runs)
    if bs:
        md += ["", "## Shared blind spots (every model that attempted the task failed these checks)", ""]
        md += [f"- `{task}`: {title}" for task, title, _ in bs[:25]]
    cons = sorted({r["model"] for r in runs if r.get("consensus")})
    for cm in cons:
        c = next(r["consensus"] for r in runs if r["model"] == cm)
        a, b = c["drafter"], c["reviewer"]
        status = {}
        for r in runs:
            if r["model"] in (a, b, cm):
                for t in r["tests"]:
                    status.setdefault((r["task"], t["title"]), {})[r["model"]] = t["status"] == "passed"
        both = [k for k, v in status.items() if v.get(a) is False and v.get(b) is False and v.get(cm) is False]
        fixed = [k for k, v in status.items() if v.get(cm) is True and (v.get(a) is False or v.get(b) is False)]
        md += ["", f"## Consensus gauntlet: {cm}", "",
               f"{a} drafts, {b} reviews and refines, {a} merges. Checks that **all three** still failed: {len(both)}. Checks the consensus fixed for at least one parent: {len(fixed)}.", ""]
        md += [f"- `{task}`: {title}" for task, title in sorted(both)[:25]]
    (RESULTS / "report.md").write_text("\n".join(md) + "\n", encoding="utf-8")
    write_report_html(build_report_data(all_runs, tasks), RESULTS / "report.html")
    if getattr(args, "sync_readme", False):
        sync_readme(readme_block(models, task_ids, grid, summary, trials, titles, short_cells))
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
    p.add_argument("--jobs", type=int, default=0, help="parallel graders (default: one per CPU)")
    p.add_argument("--consensus", action="store_true", help="add a multi-agent run: drafter writes, reviewer refines, drafter merges")
    p.add_argument("--drafter", default="claude-sonnet", help="model name (in models.json) that drafts and merges")
    p.add_argument("--reviewer", default="gpt-4o", help="model name (in models.json) that reviews")
    p.set_defaults(fn=cmd_run)
    p = sub.add_parser("mutate", help="grader strength: inject bugs into the reference solutions and count how many the tests catch")
    p.add_argument("--tasks", nargs="*")
    p.add_argument("--max", type=int, default=20, help="mutants per task (random sample, seeded)")
    p.add_argument("--seed", type=int, default=1)
    p.add_argument("--jobs", type=int, default=0)
    p.set_defaults(fn=cmd_mutate)
    p = sub.add_parser("battle", help="bring your own agent: grade any HTTP endpoint on every task")
    p.add_argument("--endpoint", required=True, help="e.g. http://localhost:18789 (OpenAI-style /v1/chat/completions) or any URL with --protocol simple")
    p.add_argument("--name", required=True, help="label for the scorecard, e.g. MechAgent")
    p.add_argument("--protocol", choices=["openai", "simple"], default="openai", help="simple: POST {prompt, system}, reply JSON text/response/output or plain text")
    p.add_argument("--model", help="model id sent to the endpoint (default: --name)")
    p.add_argument("--api-key-env", dest="api_key_env", help="environment variable holding a bearer token, if the endpoint needs one")
    p.add_argument("--tasks", nargs="*")
    p.add_argument("--runs", type=int, default=1)
    p.add_argument("--max-tokens", dest="max_tokens", type=int, default=4096)
    p.add_argument("--timeout", type=int, default=300)
    p.add_argument("--jobs", type=int, default=0)
    p.add_argument("--offline", action="store_true", help="re-grade cached answers of this agent only")
    p.add_argument("--refresh", action="store_true")
    p.set_defaults(fn=cmd_battle)
    p = sub.add_parser("package", help="build the submission ZIP (refuses an empty results block)")
    p.add_argument("--output", default="", help="where to write the zip (default: dist/frontend-eval-submission.zip)")
    p.set_defaults(fn=cmd_package)
    p = sub.add_parser("report")
    p.add_argument("--sync-readme", dest="sync_readme", action="store_true",
                   help="also replace the RESULTS block in README.md with the generated tables")
    p.set_defaults(fn=cmd_report)
    args = ap.parse_args()
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
