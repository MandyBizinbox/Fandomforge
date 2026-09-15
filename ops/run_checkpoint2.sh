#!/usr/bin/env bash
set -Eeuo pipefail

APP="/var/www/sites/fandomforge"
BRANCH="agent/public-launch-readiness-integrated-20260716-155921"
TARGET="${EXPECTED_TARGET:?Set EXPECTED_TARGET to the approved Checkpoint 2 commit SHA}"
RUNNER="/tmp/fandomforge-checkpoint2-${TARGET:0:12}.sh"

cd "$APP"
git fetch origin "$BRANCH"
REMOTE="$(git rev-parse "origin/$BRANCH")"

if [ "$REMOTE" != "$TARGET" ]; then
    echo "ERROR: Remote branch is at $REMOTE, expected $TARGET"
    exit 1
fi

git show "origin/$BRANCH:ops/deploy_two_day_sprint.sh" > "$RUNNER"

RUNNER_PATH="$RUNNER" python3 - <<'PY'
import os
from pathlib import Path

path = Path(os.environ["RUNNER_PATH"])
text = path.read_text()

old_tests = (
    'PYTHONPATH="$BACKEND" "$BACKEND/venv/bin/python" -m pytest -q '
    'tests/test_payout_launch_routes.py | tee -a "$REPORT"'
)
new_tests = (
    'PYTHONPATH="$BACKEND" "$BACKEND/venv/bin/python" -m pytest -q '
    'tests/test_payout_launch_routes.py tests/test_email_delivery.py | tee -a "$REPORT"'
)
if old_tests not in text:
    raise SystemExit("Could not find the backend test command in the deployment script")
text = text.replace(old_tests, new_tests, 1)

old_cache = (
    'cache_header="$(curl --silent --show-error --head --max-time 30 '
    '"$DOMAIN/$live_main" | tr -d \'\\r\' | grep -i \'^cache-control:\' | tail -n 1 || true)"'
)
new_cache = (
    'cache_header="$(curl --silent --show-error --head --max-time 30 '
    '"$DOMAIN/$live_main?deployment=$STAMP" | tr -d \'\\r\' | grep -i \'^cache-control:\' | tail -n 1 || true)"'
)
if old_cache not in text:
    raise SystemExit("Could not find the static-cache verification command")
text = text.replace(old_cache, new_cache, 1)

path.write_text(text)
PY

chmod 700 "$RUNNER"
EXPECTED_TARGET="$TARGET" bash "$RUNNER"
