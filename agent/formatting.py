"""Reply text for the controller. Plain lines, no emoji, every number from a row."""

from __future__ import annotations

import json

HELP = """Dispatch Ledger controller. Commands:
  what needs me          holds waiting on you (also: holds, queue)
  why <txnRef>           the investigator's finding and evidence for one hold
  answer <txnRef> <text> answer the investigator's question (free text also works)
  approve <txnRef> [note]  release the payment; bank changes need a call-back note
  reject <txnRef> <reason> refuse the payment
  rules                  candidate and approved rules with backtest counts
  approve rule <n>       approve a drafted rule
  reject rule <n> <reason>
  status                 the business day clock and today's totals
  pause | resume | step  control the simulated clock
Transaction references look like 2231, T1042 or INV-1077."""

DECISION_CODES = {"vendor_bank_change", "limit"}


def dollars(cents) -> str:
    try:
        n = int(cents)
    except (TypeError, ValueError):
        return "$?"
    sign = "-" if n < 0 else ""
    return f"{sign}${abs(n) / 100:,.2f}"


def _q(value, limit: int = 160) -> str:
    s = str(value or "").strip()
    return s if len(s) <= limit else s[: limit - 3] + "..."


def hold_line(h: dict, tail: str) -> str:
    return f"{h.get('txn_ref')}  {dollars(h.get('cents'))}  {h.get('code')}  day {h.get('day')}  {tail}"


def format_holds(holds: list[dict]) -> str:
    """Awaiting holds first (with their question), then open holds that need a decision, then open ones
    still under investigation."""
    awaiting = sorted((h for h in holds if h.get("status") == "awaiting_controller"), key=_hold_key)
    open_rows = [h for h in holds if h.get("status") == "open"]
    decision = sorted((h for h in open_rows if h.get("code") in DECISION_CODES), key=_hold_key)
    investigating = sorted((h for h in open_rows if h.get("code") not in DECISION_CODES), key=_hold_key)

    lines: list[str] = []
    need = awaiting + decision
    if need:
        lines.append(f"Needs you ({len(need)}):")
        for h in awaiting:
            lines.append(hold_line(h, f"Q: {_q(h.get('question') or 'question pending')}"))
        for h in decision:
            what = "needs a call-back note to approve" if h.get("code") == "vendor_bank_change" else "over limit, approve or reject"
            lines.append(hold_line(h, what))
    else:
        lines.append("Nothing is waiting on you.")
    if investigating:
        lines.append(f"Investigating ({len(investigating)}):")
        for h in investigating:
            lines.append(hold_line(h, "investigating"))
    return "\n".join(lines)


def _hold_key(h: dict):
    return (-(h.get("day") or 0), str(h.get("txn_ref")))


def parse_json(text) -> dict:
    if isinstance(text, dict):
        return text
    try:
        data = json.loads(text or "")
    except (TypeError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def source_label(task: dict | None, finding: dict) -> str:
    src = (task or {}).get("source") or ""
    if src == "live" and finding.get("status") in (None, "ok"):
        return "live"
    if src == "replayed" or finding.get("status") == "replayed":
        return "replayed"
    return "scripted stand-in"


def format_why(hold: dict, task: dict | None) -> str:
    finding = parse_json((task or {}).get("finding_json"))
    lines = [
        f"{hold.get('txn_ref')}  {hold.get('code')}  {dollars(hold.get('cents'))}  day {hold.get('day')}  status {hold.get('status')}"
    ]
    if finding.get("finding"):
        lines.append(f"Finding: {_q(finding['finding'], 300)}")
    else:
        status = (task or {}).get("status") or "not started"
        lines.append(f"Finding: investigation {status}. Kernel reason: {_q(hold.get('reason'))}")
    for ev in (finding.get("evidence") or [])[:2]:
        if not isinstance(ev, dict):
            continue
        where = ", ".join(str(ev[k]) for k in ("source", "ref") if ev.get(k))
        lines.append(f"Evidence: \"{_q(ev.get('quote'))}\" ({where or 'unsourced'})")
    if finding.get("recommendation"):
        conf = finding.get("confidence")
        conf_txt = f" (confidence {float(conf):.2f})" if isinstance(conf, (int, float)) else ""
        lines.append(f"Recommendation: {finding['recommendation']}{conf_txt}")
    question = hold.get("question") or finding.get("question_for_controller")
    if question and hold.get("status") in ("open", "awaiting_controller"):
        lines.append(f"Question: {_q(question, 300)}")
    if hold.get("answer"):
        lines.append(f"Answer on file: {_q(hold['answer'], 200)}")
    if hold.get("callback_note"):
        lines.append(f"Call-back note: {_q(hold['callback_note'], 200)}")
    lines.append(f"source: {source_label(task, finding)}")
    return "\n".join(lines)


def format_rules(rules: list[dict]) -> str:
    if not rules:
        return "No rules yet. Answer an investigator's question and the worker drafts one."
    lines = [f"Rules ({len(rules)}):"]
    for r in sorted(rules, key=lambda r: int(r.get("id") or 0)):
        bt = parse_json(r.get("backtest_json"))
        bt_txt = ""
        if bt:
            bt_txt = f"  would have cleared {bt.get('wouldClear', '?')} of {bt.get('n', '?')} past rows; {bt.get('trueExceptionsCleared', '?')} were true exceptions"
        lines.append(
            f"#{r.get('id')}  {r.get('status')}  {r.get('condition')}  scope {_q(r.get('scope_json'), 80)}  "
            f"{r.get('uses')}  days {r.get('valid_from_day')}-{r.get('valid_to_day')}  from {r.get('source_txn_ref')}{bt_txt}"
        )
    return "\n".join(lines)


def format_status(day: dict | None, total: dict | None, total_days: int = 92) -> str:
    if not day:
        return "No business_day row. Has the module been published?"
    clock = "paused" if day.get("paused") else "running"
    tick = day.get("tick_micros")
    tick_txt = f", tick {int(tick) / 1_000_000:g} s" if tick else ""
    line = f"Day {day.get('day')} of {total_days} ({day.get('date')}), clock {clock}{tick_txt}."
    if total:
        line += (
            f" Today: {total.get('txn_count')} transactions, {total.get('auto_paid_count')} auto-paid "
            f"({dollars(total.get('auto_paid_cents'))}), {total.get('hold_count')} held, {total.get('rejected_count')} rejected."
        )
    else:
        line += " Nothing settled today yet."
    return line


def confirmation(action: str, ref: str, audit: dict | None) -> str:
    role = (audit or {}).get("actor_role") or "controller"
    first = f"{action} {ref} written to audit_event by {role}"
    if not audit:
        return first
    extra = f"event {audit.get('id')}, day {audit.get('day')}"
    detail = _q(audit.get("detail"), 120)
    if detail:
        extra += f", {detail}"
    return f"{first} ({extra})"


def refused(message: str) -> str:
    return f"Refused: {message}"
