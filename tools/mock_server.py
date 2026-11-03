#!/usr/bin/env python3
"""Tiny OpenAI-compatible mock used to test the pipeline end to end without any API key.
Model 'mock-reference' answers with the reference solution, 'mock-wrong' with the first wrong solution,
'mock-chatty' with the reference wrapped in prose plus an extra small code block.
Usage: python tools/mock_server.py  (listens on 127.0.0.1:8765)"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def find_task(prompt):
    for d in sorted((ROOT / "tasks").iterdir()):
        p = d / "prompt.md"
        if p.exists() and p.read_text(encoding="utf-8").strip()[:300] in prompt:
            return d
    return None


class H(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        user = body["messages"][-1]["content"]
        d = find_task(user)
        model = body["model"]
        ref = next((d / "reference").glob("solution.*")).read_text(encoding="utf-8")
        if model == "mock-wrong":
            text = "```js\n" + next(iter(sorted((d / "wrong").glob("*.js*")))).read_text(encoding="utf-8") + "```"
        elif model == "mock-chatty":
            text = f"Sure! Here is the solution.\n\n```js\n// usage\nconsole.log(1)\n```\n\nFull file:\n\n```js\n{ref}```\n\nHope that helps."
        else:
            text = "```js\n" + ref + "```"
        out = json.dumps({"choices": [{"message": {"content": text}}], "usage": {"prompt_tokens": 1500, "completion_tokens": 900}}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", 8765), H).serve_forever()
