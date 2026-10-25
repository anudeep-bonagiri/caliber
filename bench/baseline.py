#!/usr/bin/env python3
"""Run the sampled rows against one model and save every raw response (Task 22, step 4).

  agent/.venv/bin/python bench/baseline.py --model sonnet [--limit N] [--ids 2231 T1314]
  agent/.venv/bin/python bench/baseline.py --model asi1   [--limit N] [--ids ...]

sonnet  Anthropic Messages API over httpx (no SDK is installed in the project venvs). Requested id
        claude-sonnet-5-5; if the API answers "model not found" the next newest Sonnet is tried and the id
        actually used is recorded in every output file and in bench/outputs/sonnet/_meta.json.
        No temperature is sent: Claude Sonnet 5.5 returns 400 for a non-default temperature. Thinking is left
        at the API default (adaptive); effort is left at the API default. Cost is priced from the response
        usage at Sonnet list rates and the run stops once the cumulative spend reaches the cap.
asi1    https://api.asi1.ai/v1/chat/completions, model asi1-mini, temperature 0, one request at a time, paced
        to the free-plan quota (100 per 15 minutes, 1,000 per day).

Both models get the same prompt (bench/prompts/hold_or_clear.txt) with the row's bench/inputs/<id>.json
inserted. Rows run in a seeded shuffle, so a run stopped early is a random subset of the sample.
Existing ok outputs are skipped, so a stopped run resumes. Keys are read from .env and never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent))
from common import BENCH, CODES, ROOT, SEED, write_json  # noqa: E402

load_dotenv(ROOT / ".env")

PROMPT_PATH = BENCH / "prompts" / "hold_or_clear.txt"
OUT = BENCH / "outputs"

ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
ANTHROPIC_VERSION = "2023-06-01"
SONNET_IDS = ["claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6"]
# List rates, USD per million tokens, Anthropic first-party API (platform.claude.com pricing, as cached in the
# Claude API reference on 2026-10-06). Cache writes bill at 1.25x input, cache reads at 0.1x input; this run sends
# no cache_control, so those two counters are expected to be zero and are priced anyway.
SONNET_RATES = {
    "claude-sonnet-5-5": {"input": 2.00, "output": 10.00},
    "claude-sonnet-5": {"input": 2.00, "output": 10.00},
    "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
}
COST_CAP_USD = 15.00
SONNET_MAX_TOKENS = 4096

ASI_URL = "https://api.asi1.ai/v1/chat/completions"
ASI_MODEL = "asi1-mini"
ASI_MIN_INTERVAL_S = 9.1          # 100 requests per 15 minutes is one every 9.0 s
ASI_WINDOW_LIMIT = 100
ASI_WINDOW_S = 15 * 60
ASI_DAY_LIMIT = 1000

RETRY_STATUSES = {408, 409, 425, 429, 500, 502, 503, 504, 529}
MAX_ATTEMPTS = 7


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def load_prompt(input_doc: dict) -> str:
    tpl = PROMPT_PATH.read_text()
    assert "{{INPUT_JSON}}" in tpl
    return tpl.replace("{{INPUT_JSON}}", json.dumps(input_doc, indent=1, sort_keys=True))


def extract_json(raw: str) -> dict | None:
    """The first complete JSON object in the reply. A model that writes its object and then keeps talking is
    read by that object; a reply with no complete object is unparsed. The same rule applies to both models."""
    s = (raw or "").strip()
    s = re.sub(r"^```(?:json)?\s*|\s*```$", "", s, flags=re.I | re.S)
    try:
        data = json.loads(s)
        return data if isinstance(data, dict) else None
    except ValueError:
        pass
    dec = json.JSONDecoder()
    start = s.find("{")
    while start != -1:
        try:
            data, _ = dec.raw_decode(s[start:])
            if isinstance(data, dict):
                return data
        except ValueError:
            pass
        start = s.find("{", start + 1)
    return None


def parse_decision(text: str) -> dict | None:
    data = extract_json(text)
    if not data:
        return None
    decision = str(data.get("decision") or "").strip().lower()
    if decision not in ("hold", "clear"):
        return None
    code = str(data.get("code") or "").strip().lower() or None
    if decision == "hold" and code not in CODES:
        code = "unspecified"
    if decision == "clear":
        code = None
    reason = str(data.get("reason") or "").strip()
    return {"decision": decision, "code": code, "reason": reason[:500]}


def backoff_sleep(attempt: int, retry_after: str | None) -> None:
    delay = 2.0 * (2 ** attempt)
    if retry_after:
        try:
            delay = max(delay, float(retry_after))
        except ValueError:
            pass
    time.sleep(min(delay, 90.0))


# ---------------------------------------------------------------- Anthropic

def sonnet_cost(model: str, usage: dict) -> float:
    r = SONNET_RATES.get(model) or SONNET_RATES["claude-sonnet-5-5"]
    inp = int(usage.get("input_tokens", 0) or 0)
    out = int(usage.get("output_tokens", 0) or 0)
    cw = int(usage.get("cache_creation_input_tokens", 0) or 0)
    cr = int(usage.get("cache_read_input_tokens", 0) or 0)
    return (inp * r["input"] + out * r["output"] + cw * r["input"] * 1.25 + cr * r["input"] * 0.10) / 1_000_000


class SonnetRunner:
    def __init__(self, client: httpx.Client, api_key: str, model: str):
        self.client, self.api_key, self.model = client, api_key, model
        self.spent = 0.0
        self.lock = threading.Lock()
        self.stopped = False

    def call(self, prompt: str) -> tuple[int, dict, int]:
        """Returns (http status, body json, attempts)."""
        body = {"model": self.model, "max_tokens": SONNET_MAX_TOKENS, "messages": [{"role": "user", "content": prompt}]}
        headers = {"x-api-key": self.api_key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json"}
        last = (0, {"error": "no attempt"})
        for attempt in range(MAX_ATTEMPTS):
            try:
                r = self.client.post(ANTHROPIC_URL, headers=headers, json=body, timeout=120)
            except httpx.HTTPError as e:
                last = (0, {"error": {"type": "transport", "message": str(e)[:300]}})
                backoff_sleep(attempt, None)
                continue
            try:
                data = r.json()
            except ValueError:
                data = {"error": {"type": "non_json", "message": r.text[:300]}}
            last = (r.status_code, data)
            if r.status_code in RETRY_STATUSES:
                backoff_sleep(attempt, r.headers.get("retry-after"))
                continue
            return r.status_code, data, attempt + 1
        return last[0], last[1], MAX_ATTEMPTS

    def run_one(self, ref: str, input_doc: dict) -> dict:
        prompt = load_prompt(input_doc)
        t0 = time.time()
        status, data, attempts = self.call(prompt)
        rec = {
            "id": ref, "provider": "anthropic", "requestedModel": "claude-sonnet-5-5", "model": self.model,
            "startedAt": datetime.fromtimestamp(t0, timezone.utc).isoformat(timespec="seconds"),
            "durationMs": int((time.time() - t0) * 1000), "httpStatus": status, "attempts": attempts,
            "response": data, "status": "error", "text": None, "parsed": None, "usage": None, "costUsd": 0.0,
        }
        if status == 200 and isinstance(data, dict) and data.get("type") == "message":
            text = " ".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text").strip()
            usage = data.get("usage") or {}
            rec.update({"text": text, "parsed": parse_decision(text), "usage": usage,
                        "costUsd": round(sonnet_cost(data.get("model") or self.model, usage), 6),
                        "model": data.get("model") or self.model,
                        "stopReason": data.get("stop_reason")})
            rec["status"] = "ok" if rec["parsed"] else "unparsed"
            if data.get("stop_reason") == "refusal":
                rec["status"] = "refusal"
        return rec


def pick_sonnet_model(client: httpx.Client, api_key: str) -> tuple[str, list[dict]]:
    """Try the requested id with a one-token probe; on model-not-found fall through to the next Sonnet."""
    tried = []
    headers = {"x-api-key": api_key, "anthropic-version": ANTHROPIC_VERSION, "content-type": "application/json"}
    for mid in SONNET_IDS:
        body = {"model": mid, "max_tokens": 16, "messages": [{"role": "user", "content": "Reply with the single word ok."}]}
        r = client.post(ANTHROPIC_URL, headers=headers, json=body, timeout=60)
        try:
            data = r.json()
        except ValueError:
            data = {"error": {"type": "non_json"}}
        err = (data.get("error") or {}) if isinstance(data, dict) else {}
        tried.append({"model": mid, "httpStatus": r.status_code, "errorType": err.get("type"), "errorMessage": (err.get("message") or "")[:200]})
        if r.status_code == 200:
            return data.get("model") or mid, tried
        if r.status_code == 404 or err.get("type") == "not_found_error":
            continue
        raise SystemExit(f"anthropic probe failed with {r.status_code} {err.get('type')}: {(err.get('message') or '')[:200]}")
    raise SystemExit(f"no Sonnet id accepted: {tried}")


# ---------------------------------------------------------------- ASI:One

class AsiRunner:
    def __init__(self, client: httpx.Client, api_key: str, prior_starts: list[float]):
        self.client, self.api_key = client, api_key
        self.starts: list[float] = sorted(prior_starts)   # epoch seconds of earlier requests today, for the quota

    def pace(self) -> None:
        now = time.time()
        if self.starts:
            wait = ASI_MIN_INTERVAL_S - (now - self.starts[-1])
            if wait > 0:
                time.sleep(wait)
        now = time.time()
        window = [s for s in self.starts if now - s < ASI_WINDOW_S]
        if len(window) >= ASI_WINDOW_LIMIT:
            sleep_for = ASI_WINDOW_S - (now - window[0]) + 1
            print(f"asi1 window full ({len(window)} in 15 min), sleeping {sleep_for:.0f}s", flush=True)
            time.sleep(max(sleep_for, 0))

    def call(self, prompt: str) -> tuple[int, dict, int]:
        body = {"model": ASI_MODEL, "temperature": 0, "messages": [{"role": "user", "content": prompt}]}
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        last = (0, {"error": "no attempt"})
        for attempt in range(MAX_ATTEMPTS):
            self.pace()
            self.starts.append(time.time())
            try:
                r = self.client.post(ASI_URL, headers=headers, json=body, timeout=120)
            except httpx.HTTPError as e:
                last = (0, {"error": {"type": "transport", "message": str(e)[:300]}})
                backoff_sleep(attempt, None)
                continue
            try:
                data = r.json()
            except ValueError:
                data = {"error": {"type": "non_json", "message": r.text[:300]}}
            last = (r.status_code, data)
            if r.status_code in RETRY_STATUSES:
                backoff_sleep(attempt, r.headers.get("retry-after"))
                continue
            return r.status_code, data, attempt + 1
        return last[0], last[1], MAX_ATTEMPTS

    def run_one(self, ref: str, input_doc: dict) -> dict:
        prompt = load_prompt(input_doc)
        t0 = time.time()
        status, data, attempts = self.call(prompt)
        rec = {
            "id": ref, "provider": "asi1", "requestedModel": ASI_MODEL, "model": ASI_MODEL,
            "startedAt": datetime.fromtimestamp(t0, timezone.utc).isoformat(timespec="seconds"),
            "durationMs": int((time.time() - t0) * 1000), "httpStatus": status, "attempts": attempts,
            "response": data, "status": "error", "text": None, "parsed": None, "usage": None, "costUsd": 0.0,
        }
        if status == 200 and isinstance(data, dict) and data.get("choices"):
            msg = (data["choices"][0] or {}).get("message") or {}
            text = (msg.get("content") or "").strip()
            rec.update({"text": text, "parsed": parse_decision(text), "usage": data.get("usage"),
                        "model": data.get("model") or ASI_MODEL})
            rec["status"] = "ok" if rec["parsed"] else "unparsed"
        return rec


# ---------------------------------------------------------------- driver

def load_existing(out_dir: Path) -> dict[str, dict]:
    done = {}
    for p in out_dir.glob("*.json"):
        if p.name.startswith("_"):
            continue
        try:
            rec = json.loads(p.read_text())
        except ValueError:
            continue
        done[rec["id"]] = rec
    return done


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", choices=["sonnet", "asi1"], required=True)
    ap.add_argument("--limit", type=int, default=0, help="run at most N rows (after skipping finished ones)")
    ap.add_argument("--ids", nargs="*", default=None, help="run only these row ids")
    ap.add_argument("--concurrency", type=int, default=4)
    ap.add_argument("--redo-errors", action="store_true", help="re-run rows whose saved status is not ok")
    args = ap.parse_args()

    sample = json.loads((BENCH / "sample.json").read_text())
    rows = [r["id"] for r in sample["rows"]]
    random.Random(SEED).shuffle(rows)
    if args.ids:
        rows = [r for r in rows if r in set(args.ids)]
    out_dir = OUT / args.model
    out_dir.mkdir(parents=True, exist_ok=True)
    existing = load_existing(out_dir)
    todo = [r for r in rows if r not in existing or (args.redo_errors and existing[r].get("status") != "ok")]
    if args.limit:
        todo = todo[: args.limit]
    print(f"{args.model}: {len(existing)} saved, {len(todo)} to run", flush=True)

    inputs = {r: json.loads((BENCH / "inputs" / f"{r}.json").read_text()) for r in todo}
    client = httpx.Client(http2=False)
    meta_path = out_dir / "_meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}

    if args.model == "sonnet":
        key = os.environ.get("ANTHROPIC_API_KEY", "")
        if not key:
            print("BLOCKED: ANTHROPIC_API_KEY is not set", flush=True)
            return 2
        if meta.get("modelUsed"):
            model = meta["modelUsed"]
        else:
            model, tried = pick_sonnet_model(client, key)
            meta.update({"requestedModel": "claude-sonnet-5-5", "modelUsed": model, "probe": tried,
                         "rates": SONNET_RATES.get(model), "ratesSource": "Anthropic first-party API list prices, platform.claude.com pricing (cached 2026-10-06)",
                         "costCapUsd": COST_CAP_USD, "temperature": "not sent (Claude Sonnet 5.5 rejects a non-default temperature)",
                         "thinking": "API default (adaptive), effort API default", "maxTokens": SONNET_MAX_TOKENS})
            write_json(meta_path, meta)
        print(f"sonnet model in use: {model}", flush=True)
        runner = SonnetRunner(client, key, model)
        runner.spent = round(sum(float(e.get("costUsd", 0) or 0) for e in existing.values()), 6)
        print(f"spent so far: ${runner.spent:.4f} of ${COST_CAP_USD:.2f}", flush=True)
        done = 0
        stopped_for_cost = False
        with ThreadPoolExecutor(max_workers=max(1, args.concurrency)) as ex:
            pending = {}
            it = iter(todo)

            def submit_next():
                for ref in it:
                    fut = ex.submit(runner.run_one, ref, inputs[ref])
                    pending[fut] = ref
                    return True
                return False

            for _ in range(max(1, args.concurrency)):
                submit_next()
            while pending:
                for fut in as_completed(list(pending)):
                    ref = pending.pop(fut)
                    rec = fut.result()
                    write_json(out_dir / f"{ref}.json", rec)
                    with runner.lock:
                        runner.spent = round(runner.spent + rec["costUsd"], 6)
                    done += 1
                    d = rec["parsed"] or {}
                    print(f"[{done}/{len(todo)}] {ref} {rec['status']} {d.get('decision','-')} {d.get('code') or ''} ${runner.spent:.4f}", flush=True)
                    if runner.spent >= COST_CAP_USD:
                        stopped_for_cost = True
                    elif not stopped_for_cost:
                        submit_next()
                    break
        meta.update({"lastRunAt": now_iso(), "spentUsd": runner.spent, "stoppedForCost": stopped_for_cost,
                     "rowsSaved": len(load_existing(out_dir)), "rowsInSample": len(sample["rows"])})
        write_json(meta_path, meta)
        print(f"done {done}; spent ${runner.spent:.4f}; stopped for cost: {stopped_for_cost}", flush=True)
        return 0

    # asi1-mini
    key = os.environ.get("ASI_ONE_API_KEY", "")
    if not key:
        print("BLOCKED: ASI_ONE_API_KEY is not set", flush=True)
        return 2
    today = datetime.now(timezone.utc).date().isoformat()
    prior = []
    for e in existing.values():
        if str(e.get("startedAt", "")).startswith(today):
            prior.append(datetime.fromisoformat(e["startedAt"]).timestamp())
    requests_today = len(prior)
    runner = AsiRunner(client, key, prior)
    done = 0
    for ref in todo:
        if requests_today >= ASI_DAY_LIMIT:
            print(f"asi1 daily quota reached ({requests_today}); stopping", flush=True)
            break
        rec = runner.run_one(ref, inputs[ref])
        requests_today += rec["attempts"]
        write_json(out_dir / f"{ref}.json", rec)
        done += 1
        d = rec["parsed"] or {}
        print(f"[{done}/{len(todo)}] {ref} {rec['status']} {d.get('decision','-')} {d.get('code') or ''} http {rec['httpStatus']} attempts {rec['attempts']}", flush=True)
    meta.update({"model": ASI_MODEL, "temperature": 0, "lastRunAt": now_iso(), "requestsToday": requests_today,
                 "quota": {"per15min": ASI_WINDOW_LIMIT, "perDay": ASI_DAY_LIMIT, "paceSeconds": ASI_MIN_INTERVAL_S},
                 "rowsSaved": len(load_existing(out_dir)), "rowsInSample": len(sample["rows"])})
    write_json(meta_path, meta)
    print(f"done {done}; asi1 requests today {requests_today} of {ASI_DAY_LIMIT}", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
