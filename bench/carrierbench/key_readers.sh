#!/usr/bin/env bash
# Lists every tracked .ts, .tsx and .py file that names answer_key, and fails if any of them is outside the
# allowed readers (scripts/facts.py, seed/**, bench/**) on a line that is not a comment, a label or a test that
# asserts the key cannot be loaded or is not named. Council item 1 (Task 28): the agent and the worker never read the key.
# Usage: bash bench/carrierbench/key_readers.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

bad=0
echo "Allowed readers (score against the key):"
while IFS= read -r f; do
  case "$f" in
    scripts/facts.py|seed/*|bench/*) echo "  $f" ;;
  esac
done < <(git ls-files --cached --others --exclude-standard '*.ts' '*.tsx' '*.py' | xargs grep -l 'answer_key' || true)

echo "Mentions outside the allowed readers (each must be a comment, a label or a test that asserts the key is absent):"
while IFS= read -r hit; do
  f="${hit%%:*}"
  case "$f" in
    scripts/facts.py|seed/*|bench/*) continue ;;
  esac
  rest="${hit#*:}"; line="${rest%%:*}"; text="${rest#*:}"
  trimmed="$(printf '%s' "$text" | sed -E 's/^[[:space:]]+//')"
  kind=""
  case "$trimmed" in
    //*|\#*|\**) kind="comment" ;;
  esac
  if [ -z "$kind" ] && [[ "$f" == web/src/* ]] && [[ "$trimmed" != *fetch* && "$trimmed" != *import* ]]; then kind="label"; fi
  if [ -z "$kind" ] && [[ "$f" == */test/* || "$f" == *.test.ts ]] && [[ "$trimmed" == *toBeUndefined* || "$trimmed" == *not.toMatch* ]]; then kind="absence test"; fi
  if [ -z "$kind" ]; then kind="READER"; bad=1; fi
  echo "  $f:$line [$kind] $trimmed"
done < <(git ls-files --cached --others --exclude-standard '*.ts' '*.tsx' '*.py' | xargs grep -n 'answer_key' || true)

if [ "$bad" -ne 0 ]; then
  echo "key_readers: FAIL, a file outside scripts/facts.py, seed/ and bench/ reads the answer key"
  exit 1
fi
echo "key_readers: OK, no agent, worker, module or web code reads the answer key"
