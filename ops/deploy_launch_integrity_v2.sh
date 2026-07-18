#!/usr/bin/env bash
set -Eeuo pipefail

APP="/var/www/sites/fandomforge"
BACKEND="$APP/backend"
FRONTEND="$APP/frontend"
BRANCH="agent/fandomforge-launch-integrity-overnight-20260718"
TARGET="${EXPECTED_TARGET:?Set EXPECTED_TARGET to the pinned launch-integrity candidate SHA}"
DOMAIN="${DOMAIN:-https://fandomforge.co.za}"
BACKEND_SERVICE="${BACKEND_SERVICE:-fandomforge-backend.service}"
SITE_CONFIG="${SITE_CONFIG:-/etc/nginx/sites-available/fandomforge.co.za}"
DEPLOY_USER="$(id -un)"
SERVICE_GROUP="$(systemctl show -p Group --value "$BACKEND_SERVICE")"
if [ -z "$SERVICE_GROUP" ]; then
    SERVICE_GROUP="$(systemctl show -p User --value "$BACKEND_SERVICE")"
fi
SERVICE_GROUP="${SERVICE_GROUP:-www-data}"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP="/var/backups/fandomforge/launch-integrity-$STAMP"
NEXT_BUILD="$FRONTEND/build.next-$STAMP"
REPORT="$BACKUP/deployment.log"
ORIGINAL_COMMIT=""
ORIGINAL_BRANCH=""
SOURCE_CHANGED=0
BUILD_CHANGED=0
ENV_CHANGED=0
COMPLETE=0

sudo install -d -m 750 -o "$(id -u)" -g "$(id -g)" "$BACKUP"
touch "$REPORT"
log() { printf '%s\n' "$*" | tee -a "$REPORT"; }

restore_source() {
    cd "$APP" || return 0
    if [ -n "$ORIGINAL_BRANCH" ] && git show-ref --verify --quiet "refs/heads/$ORIGINAL_BRANCH"; then
        git checkout "$ORIGINAL_BRANCH" || true
    else
        git checkout --detach "$ORIGINAL_COMMIT" || true
    fi
    git reset --hard "$ORIGINAL_COMMIT" || true
}

restore_backend_env() {
    [ -f "$BACKUP/backend.env" ] || return 0
    sudo cp "$BACKUP/backend.env" "$BACKEND/.env" || return 0
    sudo chown "$DEPLOY_USER:$SERVICE_GROUP" "$BACKEND/.env" || true
    sudo chmod 640 "$BACKEND/.env" || true
}

rollback() {
    local code=$?
    trap - ERR
    [ "$COMPLETE" = "1" ] && exit "$code"
    log "CRITICAL FAILURE — rolling back launch-integrity application release"
    if [ "$BUILD_CHANGED" = "1" ] && [ -d "$BACKUP/build.replaced" ]; then
        [ -d "$FRONTEND/build" ] && sudo mv "$FRONTEND/build" "$BACKUP/build.rejected" || true
        sudo mv "$BACKUP/build.replaced" "$FRONTEND/build" || true
    fi
    if [ "$ENV_CHANGED" = "1" ]; then
        restore_backend_env
    fi
    if [ "$SOURCE_CHANGED" = "1" ] && [ -n "$ORIGINAL_COMMIT" ]; then
        restore_source
    fi
    rm -rf "$NEXT_BUILD" 2>/dev/null || true
    sudo systemctl restart "$BACKEND_SERVICE" || true
    sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx || true
    log "Rollback attempted. No historical financial backfill was applied."
    log "Review $REPORT"
    exit "$code"
}
trap rollback ERR

cd "$APP"
ORIGINAL_COMMIT="$(git rev-parse HEAD)"
ORIGINAL_BRANCH="$(git branch --show-current)"
printf '%s\n' "$ORIGINAL_COMMIT" > "$BACKUP/original-commit.txt"
printf '%s\n' "$ORIGINAL_BRANCH" > "$BACKUP/original-branch.txt"
printf '%s\n' "$TARGET" > "$BACKUP/target-commit.txt"
log "FandomForge launch-integrity release"
log "Live source before release: ${ORIGINAL_BRANCH:-detached} $ORIGINAL_COMMIT"
log "Pinned candidate: $TARGET"
log "Backup: $BACKUP"

[ -z "$(git status --porcelain --untracked-files=no)" ] || {
    log "Tracked source changes exist; refusing deployment."
    git status --short | tee -a "$REPORT"
    exit 1
}

git fetch origin "$BRANCH"
REMOTE="$(git rev-parse "origin/$BRANCH")"
[ "$REMOTE" = "$TARGET" ] || { log "Remote branch moved: $REMOTE"; exit 1; }
git merge-base --is-ancestor "$ORIGINAL_COMMIT" "$TARGET" || {
    log "Pinned candidate is not a descendant of the live commit."
    exit 1
}

sudo cp "$BACKEND/.env" "$BACKUP/backend.env"
[ -f "$SITE_CONFIG" ] && sudo cp "$SITE_CONFIG" "$BACKUP/nginx-site.conf" || true
[ -d "$FRONTEND/build" ] && sudo cp -a "$FRONTEND/build" "$BACKUP/build.previous" || true

# Checking out source does not restart the backend or swap the live frontend.
git checkout -B "$BRANCH" "$TARGET"
SOURCE_CHANGED=1
[ "$(git rev-parse HEAD)" = "$TARGET" ]

log "Capturing production before-state without mutation"
"$BACKEND/venv/bin/python" ops/launch_integrity_report.py \
    --label "before-$TARGET" \
    --output "$BACKUP/integrity-before.json" | tee -a "$REPORT"
"$BACKEND/venv/bin/python" ops/release_gate_audit.py \
    --candidate-sha "$TARGET" \
    --output "$BACKUP/release-gate-before.json" | tee -a "$REPORT"
"$BACKEND/venv/bin/python" ops/launch_integrity_backfill.py \
    --report "$BACKUP/backfill-dry-run.json" | tee -a "$REPORT"

BACKFILL="$BACKUP/backfill-dry-run.json" AUDIT="$BACKUP/release-gate-before.json" \
"$BACKEND/venv/bin/python" - <<'PY'
import json, os
backfill = json.load(open(os.environ["BACKFILL"]))
audit = json.load(open(os.environ["AUDIT"]))
if backfill.get("mode") != "dry_run":
    raise SystemExit("Backfill was not executed in dry-run mode")
for key in ("financial_values_modified", "completed_payouts_modified", "uploaded_files_modified"):
    if backfill.get(key) is not False:
        raise SystemExit(f"Unsafe backfill flag: {key}")
collisions = audit.get("artwork_version_collisions") or []
print(f"Dry-run provenance candidates reviewed; artwork version collisions: {len(collisions)}")
if collisions:
    print("Write-mode artwork backfill remains prohibited; deployment applies no backfill.")
PY

log "Applying production-safe environment flags only"
sudo env ENV_FILE="$BACKEND/.env" "$BACKEND/venv/bin/python" - <<'PY'
import os
from pathlib import Path
path = Path(os.environ["ENV_FILE"])
lines = path.read_text().splitlines() if path.exists() else []
updates = {
    "ENVIRONMENT": "production",
    "E2E_TEST_MODE": "0",
    "PUBLIC_APP_URL": "https://fandomforge.co.za",
    "FRONTEND_URL": "https://fandomforge.co.za",
}
out = []
seen = set()
for line in lines:
    if not line or line.lstrip().startswith("#") or "=" not in line:
        out.append(line)
        continue
    key, value = line.split("=", 1)
    key = key.strip()
    if key in updates:
        if key not in seen:
            out.append(f"{key}={updates[key]}")
            seen.add(key)
    else:
        out.append(line)
for key, value in updates.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out).rstrip() + "\n")
PY
sudo chown "$DEPLOY_USER:$SERVICE_GROUP" "$BACKEND/.env"
sudo chmod 640 "$BACKEND/.env"
ENV_CHANGED=1

log "Compiling backend and running no-provider tests"
cd "$BACKEND"
"$BACKEND/venv/bin/python" -m py_compile \
    auth.py server.py payout_launch_routes.py payout_retry_guard.py email_delivery.py e2e_support.py \
    launch_integrity/*.py ../ops/launch_integrity_report.py ../ops/launch_integrity_backfill.py \
    ../ops/release_gate_audit.py
PYTHONPATH="$BACKEND" "$BACKEND/venv/bin/python" -m pytest -q \
    tests/test_launch_integrity_unit.py \
    tests/test_launch_integrity_routes.py \
    tests/test_launch_integrity_mongo.py \
    tests/test_release_gate_finance.py \
    tests/test_payout_launch_routes.py \
    tests/test_email_delivery.py | tee "$BACKUP/backend-tests.txt"

log "Building production frontend into an inactive directory"
cd "$FRONTEND"
npm install --legacy-peer-deps --no-audit --no-fund
rm -rf "$NEXT_BUILD"
CI=false BUILD_PATH="$NEXT_BUILD" npm run build 2>&1 | tee "$BACKUP/frontend-build.log"
test -f "$NEXT_BUILD/index.html"
grep -Rqs "Friday Payout Account" "$NEXT_BUILD"
grep -Rqs "Plans & Upgrades" "$NEXT_BUILD"
find "$NEXT_BUILD/static" -type f -printf '%s\t%p\n' | sort -nr > "$BACKUP/frontend-bundles.tsv"

log "Activating candidate"
if [ -d "$FRONTEND/build" ]; then
    sudo mv "$FRONTEND/build" "$BACKUP/build.replaced"
fi
sudo mv "$NEXT_BUILD" "$FRONTEND/build"
sudo find "$FRONTEND/build" -type d -exec chmod 755 {} \;
sudo find "$FRONTEND/build" -type f -exec chmod 644 {} \;
BUILD_CHANGED=1
sudo systemctl restart "$BACKEND_SERVICE"
sudo nginx -t
sudo systemctl reload nginx

for attempt in $(seq 1 60); do
    curl --fail --silent --max-time 10 "$DOMAIN/api/health" > "$BACKUP/api-health.json" && break
    sleep 2
done
curl --fail --silent --max-time 20 "$DOMAIN/api/health" | tee -a "$REPORT"
grep -q 'launch_integrity_version' "$BACKUP/api-health.json"

log "Verifying public routes"
routes=(
    / /faq /creator-onboarding /shipping-production-returns /legal /terms /privacy-policy
    /shipping-policy /returns /creator-terms /intellectual-property /prohibited-content
    /copyright-complaints /payout-policy /store-suspension-policy /login /shop
)
for route in "${routes[@]}"; do
    code="$(curl --location --silent --show-error --max-time 30 --output /dev/null --write-out '%{http_code}' "$DOMAIN$route?release=$STAMP")"
    [ "$code" = "200" ] || { log "$route returned HTTP $code"; exit 1; }
    log "HTTP 200 $route"
done

[ "$(curl --silent --max-time 20 --output /dev/null --write-out '%{http_code}' "$DOMAIN/api/auth/me")" = "401" ]
[ "$(curl --silent --max-time 20 --output /dev/null --write-out '%{http_code}' "$DOMAIN/api/e2e/database-summary")" = "404" ]

log "Capturing after-state and enforcing no-record-loss and duplicate controls"
cd "$APP"
"$BACKEND/venv/bin/python" ops/launch_integrity_report.py \
    --label "after-$TARGET" \
    --output "$BACKUP/integrity-after.json" | tee -a "$REPORT"
"$BACKEND/venv/bin/python" ops/release_gate_audit.py \
    --candidate-sha "$TARGET" \
    --output "$BACKUP/release-gate-after.json" | tee -a "$REPORT"
BEFORE="$BACKUP/integrity-before.json" AFTER="$BACKUP/integrity-after.json" \
"$BACKEND/venv/bin/python" - <<'PY'
import json, os
before = json.load(open(os.environ["BEFORE"]))
after = json.load(open(os.environ["AFTER"]))
losses = {
    name: {"before": count, "after": after.get("counts", {}).get(name, 0)}
    for name, count in before.get("counts", {}).items()
    if after.get("counts", {}).get(name, 0) < count
}
if losses:
    raise SystemExit(f"Production record counts decreased: {losses}")
print("Record counts preserved; exact-SHA duplicate audit passed")
PY

sudo systemctl is-active --quiet "$BACKEND_SERVICE"
sudo nginx -t
cat > "$BACKUP/release-metadata.json" <<JSON
{
  "released_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "branch": "$BRANCH",
  "target_commit": "$TARGET",
  "original_branch": "$ORIGINAL_BRANCH",
  "original_commit": "$ORIGINAL_COMMIT",
  "backup": "$BACKUP",
  "read_only_integrity_report": "$BACKUP/integrity-after.json",
  "release_gate_audit": "$BACKUP/release-gate-after.json",
  "backfill_report": "$BACKUP/backfill-dry-run.json",
  "backfill_mode": "dry_run_only",
  "real_paystack_transfers_sent": false,
  "real_customer_cards_charged": false,
  "live_subscription_charges_started": false,
  "historical_financial_backfill_applied": false
}
JSON

COMPLETE=1
trap - ERR
log "LAUNCH-INTEGRITY CANDIDATE DEPLOYED"
log "Acceptance report: $BACKUP"
log "Rollback: sudo EXPECTED_BACKUP=$BACKUP bash $APP/ops/rollback_launch_integrity.sh"
