#!/usr/bin/env bash
# Verify that a reported Energy RD task PR belongs to the canonical repository.
# Usage: ./scripts/verify_task_pr.sh TASK_ID EXPECTED_BRANCH PR_NUMBER_OR_URL
set -euo pipefail

CANONICAL_REPO="ManuelDev24/energy-intelligence-rd"
CANONICAL_URL="https://github.com/${CANONICAL_REPO}"
INTEGRATION_BRANCH="Dev"

fail() {
  printf 'REJECTED: %s\n' "$1" >&2
  exit 2
}

if [[ $# -ne 3 ]]; then
  printf 'Usage: %s TASK_ID EXPECTED_BRANCH PR_NUMBER_OR_URL\n' "$0" >&2
  exit 64
fi

TASK_ID="$1"
EXPECTED_BRANCH="$2"
PR_REF="$3"

[[ "$TASK_ID" =~ ^ERD-[A-Z]+(-[A-Z0-9]+)+$ ]] || fail "invalid task ID: ${TASK_ID}"
[[ "$EXPECTED_BRANCH" =~ ^(feat|fix|chore|docs|test|refactor)/[a-z0-9][a-z0-9-]*$ ]] || fail "invalid expected branch: ${EXPECTED_BRANCH}"

if [[ "$PR_REF" =~ ^[0-9]+$ ]]; then
  PR_NUMBER="$PR_REF"
elif [[ "$PR_REF" =~ ^https://github\.com/ManuelDev24/energy-intelligence-rd/pull/([1-9][0-9]*)/?$ ]]; then
  PR_NUMBER="${BASH_REMATCH[1]}"
else
  fail "PR URL must belong exactly to ${CANONICAL_URL}/pull/<number>"
fi

command -v gh >/dev/null 2>&1 || fail "GitHub CLI (gh) is not installed"
gh auth status >/dev/null 2>&1 || fail "GitHub CLI is not authenticated"

# The explicit --repo prevents a malicious or accidental URL from switching targets.
PR_JSON="$(gh pr view "$PR_NUMBER" --repo "$CANONICAL_REPO" \
  --json number,url,state,isDraft,baseRefName,headRefName,title,author,statusCheckRollup,changedFiles 2>/dev/null)" \
  || fail "PR #${PR_NUMBER} was not found in ${CANONICAL_REPO}"

TASK_ID="$TASK_ID" EXPECTED_BRANCH="$EXPECTED_BRANCH" CANONICAL_REPO="$CANONICAL_REPO" INTEGRATION_BRANCH="$INTEGRATION_BRANCH" \
PR_JSON="$PR_JSON" python3 - <<'PY'
import json
import os
import sys

pr = json.loads(os.environ["PR_JSON"])
task_id = os.environ["TASK_ID"]
expected_branch = os.environ["EXPECTED_BRANCH"]
integration_branch = os.environ["INTEGRATION_BRANCH"]
errors = []

# OPEN = listo para revisión; MERGED = integrado en Dev (libera la siguiente tarea).
if pr.get("state") not in ("OPEN", "MERGED"):
    errors.append(f"PR state must be OPEN or MERGED, got {pr.get('state')!r}")
if pr.get("isDraft"):
    errors.append("PR is still a draft")
if pr.get("baseRefName") != integration_branch:
    errors.append(
        f"base branch must be {integration_branch!r}, got {pr.get('baseRefName')!r}"
    )
if pr.get("headRefName") != expected_branch:
    errors.append(
        f"head branch must be {expected_branch!r}, got {pr.get('headRefName')!r}"
    )
if task_id not in (pr.get("title") or ""):
    errors.append(f"PR title must include task ID {task_id}")
if not pr.get("changedFiles"):
    errors.append("PR has no changed files")

checks = pr.get("statusCheckRollup") or []
if not checks:
    errors.append("no GitHub checks reported; do not mark task ready for review")
else:
    acceptable = {"SUCCESS", "SKIPPED", "NEUTRAL"}
    failed = []
    for check in checks:
        status = check.get("status")
        conclusion = check.get("conclusion")
        name = check.get("name") or check.get("context") or "unnamed check"
        if status != "COMPLETED" or conclusion not in acceptable:
            failed.append(f"{name}: status={status!r}, conclusion={conclusion!r}")
    if failed:
        errors.append("checks not passing: " + "; ".join(failed))

if errors:
    print("REJECTED: " + " | ".join(errors), file=sys.stderr)
    sys.exit(2)

print(json.dumps({
    "verified": True,
    "repository": os.environ["CANONICAL_REPO"],
    "task_id": task_id,
    "pr": pr["number"],
    "state": pr.get("state"),
    "merged_into_dev": pr.get("state") == "MERGED",
    "url": pr["url"],
    "author": (pr.get("author") or {}).get("login"),
    "changed_files": pr.get("changedFiles"),
}, ensure_ascii=False))
PY
