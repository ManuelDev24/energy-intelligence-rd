#!/usr/bin/env bash
# Verify an Energy RD task completion reported as a commit on Dev.
# Usage: ./scripts/verify_task_commit.sh TASK_ID COMMIT_SHA_OR_URL
set -euo pipefail

CANONICAL_REPO="ManuelDev24/energy-intelligence-rd"
CANONICAL_URL="https://github.com/${CANONICAL_REPO}"
INTEGRATION_BRANCH="Dev"

reject() {
  printf 'RECHAZADO: %s\n' "$1" >&2
  exit 2
}

if [[ $# -ne 2 ]]; then
  printf 'Usage: %s TASK_ID COMMIT_SHA_OR_URL\n' "$0" >&2
  exit 64
fi

TASK_ID="$1"
COMMIT_REF="$2"
[[ "$TASK_ID" =~ ^ERD-[A-Z]+-[A-Z0-9-]*$ ]] || reject "ID de tarea inválido: ${TASK_ID}"

if [[ "$COMMIT_REF" =~ ^[0-9a-fA-F]{7,64}$ ]]; then
  SHA="$COMMIT_REF"
elif [[ "$COMMIT_REF" =~ ^https://github\.com/ManuelDev24/energy-intelligence-rd/commit/([0-9a-fA-F]{7,64})/?$ ]]; then
  SHA="${BASH_REMATCH[1]}"
else
  reject "el commit debe pertenecer exactamente a ${CANONICAL_URL}/commit/<sha>"
fi

command -v gh >/dev/null 2>&1 || reject "gh no está instalado"
gh auth status >/dev/null 2>&1 || reject "gh no está autenticado"

git fetch origin "$INTEGRATION_BRANCH" --quiet || reject "no se pudo actualizar origin/${INTEGRATION_BRANCH}"
git cat-file -e "${SHA}^{commit}" 2>/dev/null || reject "el commit ${SHA} no existe localmente en el historial del repositorio"
git merge-base --is-ancestor "$SHA" "origin/${INTEGRATION_BRANCH}" \
  || reject "el commit ${SHA} no está contenido en origin/${INTEGRATION_BRANCH}"

MESSAGE="$(git log -1 --format=%B "$SHA")"
printf '%s' "$MESSAGE" | grep -Fq "[${TASK_ID}]" \
  || reject "el mensaje del commit debe contener [${TASK_ID}]"

RUNS_JSON="$(gh run list --repo "$CANONICAL_REPO" --workflow CI --branch "$INTEGRATION_BRANCH" \
  --limit 30 --json headSha,status,conclusion,updatedAt,displayTitle 2>/dev/null)" \
  || reject "no existe o no se puede consultar el workflow CI"

TASK_ID="$TASK_ID" TASK_SHA="$SHA" RUNS_JSON="$RUNS_JSON" python3 - <<'PY'
import json
import os
import subprocess
import sys

sha = os.environ["TASK_SHA"]
runs = json.loads(os.environ["RUNS_JSON"])
for run in runs:
    if run.get("status") != "completed" or run.get("conclusion") != "success":
        continue
    head = run.get("headSha")
    if not head:
        continue
    result = subprocess.run(["git", "merge-base", "--is-ancestor", sha, head])
    if result.returncode == 0:
        print(json.dumps({
            "verified": True,
            "repository": "ManuelDev24/energy-intelligence-rd",
            "task_id": os.environ.get("TASK_ID"),
            "commit": sha,
            "ci_head": head,
            "ci_workflow": "CI",
            "ci_status": "success",
        }))
        sys.exit(0)

print("RECHAZADO: CI no tiene una ejecución exitosa en este commit o una posterior de Dev", file=sys.stderr)
sys.exit(2)
PY
