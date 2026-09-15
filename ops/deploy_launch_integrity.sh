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

STAMP="$(date -u +%Y%m%d-%H%M%S)"
BACKUP="/var/backups/fandomforge/launch-integrity-$STAMP"
NEXT_BUILD="$FRONTEND/build.next-$STAMP"
OLD_BUILD="$BACKUP/build.previous"
REPORT="$BACKUP/deployment.log"
ORIGINAL_COMMIT=""
ORIGINAL_BRANCH=""
SOURCE_CHANGED=0
BUILD_CHANGED=0
ENV_CHANGED=0
BACKEND_RESTARTED=0
NGINX_RELOADED=0
COMPLETE=0

sudo mkdir -p "$BACKUP"
sudo touch "$REPORT"
sudo chown "$(id -u):$(id -g)" "$REPORT"

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

rollback() {
    local code=$?
    trap - ERR
    [ "$COMPLETE" = "1" ] && exit "$code"
    log "CRITICAL FAILURE — rolling back application release"
    if [ "$BUILD_CHANGED" = "1" ] && [ -d "$OLD_BUILD" ]; then
        [ -d "$FRONTEND/build" ] && sudo mv "$FRONTEND/build" "$BACKUP/build.rejected" || true
        sudo mv "$OLD_BUILD" "$FRONTEND/build" || true
    fi
    if [ "$ENV_CHANGED" = "1" ] && [ -f "$BACKUP/backend.env" ]; then
        sudo cp "$BACKUP/backend.env" "$BACKEND/.env" || true
    fi
    if [ "$SOURCE_CHANGED" = "1" ] && [ -n "$ORIGINAL_COMMIT" ]; then
        restore_source
    fi
    rm -rf "$NEXT_BUILD" 2>/dev/null || true
    sudo systemctl restart "$BACKEND_SERVICE" || true
    sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx || true
    log "Rollback attempted. Additive indexes or empty collections created at startup are intentionally retained."
    log "Review $REPORT"
    exit "$code"
}
trap rollback ERR

log "FandomForge launch-integrity production release"
log "Target branch: $BRANCH"
log "Target commit: $TARGET"
log "Backup: $BACKUP"

cd "$APP"
ORIGINAL_COMMIT="$(git rev-parse HEAD)"
ORIGINAL_BRANCH="$(git branch --show-current)"
printf '%s\n' "$ORIGINAL_COMMIT" > "$BACKUP/original-commit.txt"
printf '%s\n' "$ORIGINAL_BRANCH" > "$BACKUP/original-branch.txt"
printf '%s\n' "$TARGET" > "$BACKUP/target-commit.txt"
log "Production source before release: ${ORIGINAL_BRANCH:-detached} $ORIGINAL_COMMIT"

[ -z "$(git status --porcelain --untracked-files=no)" ] || {
    log "Tracked source changes exist; refusing deployment."
    git status --short | tee -a "$REPORT"
    exit 1
}

git fetch origin "$BRANCH"
REMOTE="$(git rev-parse "origin/$BRANCH")"
[ "$REMOTE" = "$TARGET" ] || {
    log "Remote branch moved. Expected $TARGET, found $REMOTE"
    exit 1
}
git merge-base --is-ancestor "$ORIGINAL_COMMIT" "$TARGET" || {
    log "Target is not a safe descendant of the live production commit."
    exit 1
}

sudo cp "$BACKEND/.env" "$BACKUP/backend.env"
[ -f "$SITE_CONFIG" ] && sudo cp "$SITE_CONFIG" "$BACKUP/nginx-site.conf" || true
[ -d "$FRONTEND/build" ] && sudo cp -a "$FRONTEND/build" "$OLD_BUILD" || true

log "Capturing read-only before-state report"
cd "$APP"
"$BACKEND/venv/bin/python" ops/launch_integrity_report.py --label before --output "$BACKUP/integrity-before.json" | tee -a "$REPORT"
"$BACKEND/venv/bin/python" ops/launch_integrity_backfill.py --report "$BACKUP/backfill-dry-run.json" | tee -a "$REPORT"

cd "$APP"
git checkout -B "$BRANCH" "$TARGET"
SOURCE_CHANGED=1
[ "$(git rev-parse HEAD)" = "$TARGET" ]

log "Forcing production-safe runtime flags without changing credentials"
ENV_FILE="$BACKEND/.env" "$BACKEND/venv/bin/python" - <<'PY'
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
seen = set()
out = []
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
sudo chmod 600 "$BACKEND/.env"
ENV_CHANGED=1

log "Compiling backend and running non-provider validation"
cd "$BACKEND"
"$BACKEND/venv/bin/python" -m py_compile \
    auth.py server.py payout_launch_routes.py payout_retry_guard.py email_delivery.py e2e_support.py \
    launch_integrity/*.py
PYTHONPATH="$BACKEND" MONGO_URL="${MONGO_URL:-mongodb://localhost:27017}" \
    "$BACKEND/venv/bin/python" -m pytest -q \
    tests/test_launch_integrity_unit.py \
    tests/test_launch_integrity_routes.py \
    tests/test_launch_integrity_mongo.py \
    tests/test_payout_launch_routes.py \
    tests/test_email_delivery.py | tee "$BACKUP/backend-tests.txt"

log "Building route-split production frontend"
cd "$FRONTEND"
npm install --legacy-peer-deps --no-audit --no-fund
rm -rf "$NEXT_BUILD"
CI=false BUILD_PATH="$NEXT_BUILD" npm run build 2>&1 | tee "$BACKUP/frontend-build.log"
test -f "$NEXT_BUILD/index.html"
grep -Rqs "Friday Payout Account" "$NEXT_BUILD"
grep -Rqs "Plans & Upgrades" "$NEXT_BUILD"
find "$NEXT_BUILD/static" -type f -printf '%s\t%p\n' | sort -nr > "$BACKUP/frontend-bundles.tsv"

log "Activating frontend and backend"
if [ -d "$FRONTEND/build" ]; then
    sudo mv "$FRONTEND/build" "$BACKUP/build.replaced"
fi
sudo mv "$NEXT_BUILD" "$FRONTEND/build"
sudo find "$FRONTEND/build" -type d -exec chmod 755 {} \;
sudo find "$FRONTEND/build" -type f -exec chmod 644 {} \;
BUILD_CHANGED=1
sudo systemctl restart "$BACKEND_SERVICE"
BACKEND_RESTARTED=1
sudo nginx -t
sudo systemctl reload nginx
NGINX_RELOADED=1

log "Waiting for production health"
for attempt in $(seq 1 60); do
    if curl --fail --silent --max-time 10 "$DOMAIN/api/health" > "$BACKUP/api-health.json"; then
        break
    fi
    sleep 2
done
curl --fail --silent --max-time 20 "$DOMAIN/api/health" | tee -a "$REPORT"
grep -q 'launch_integrity_version' "$BACKUP/api-health.json"

log "Verifying public and protected routes"
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

auth_code="$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "$DOMAIN/api/auth/me")"
[ "$auth_code" = "401" ]
e2e_code="$(curl --silent --show-error --max-time 20 --output /dev/null --write-out '%{http_code}' "$DOMAIN/api/e2e/database-summary")"
[ "$e2e_code" = "404" ] || { log "Production E2E route unexpectedly returned $e2e_code"; exit 1; }

log "Capturing read-only after-state and checking record-count preservation"
cd "$APP"
"$BACKEND/venv/bin/python" ops/launch_integrity_report.py --label after --output "$BACKUP/integrity-after.json" | tee -a "$REPORT"
BEFORE="$BACKUP/integrity-before.json" AFTER="$BACKUP/integrity-after.json" "$BACKEND/venv/bin/python" - <<'PY'
import json, os
before = json.load(open(os.environ["BEFORE"]))
after = json.load(open(os.environ["AFTER"]))
losses = {}
for name, count in before.get("counts", {}).items():
    after_count = after.get("counts", {}).get(name, 0)
    if after_count < count:
        losses[name] = {"before": count, "after": after_count}
if losses:
    raise SystemExit(f"Production record counts decreased: {losses}")
critical = after.get("financial_integrity", {})
if critical.get("duplicate_wallet_idempotency_keys"):
    raise SystemExit("Duplicate wallet idempotency keys detected")
if critical.get("duplicate_adjustment_idempotency_keys"):
    raise SystemExit("Duplicate financial adjustment idempotency keys detected")
payout = after.get("payout_integrity", {})
if payout.get("duplicate_provider_references") or payout.get("duplicate_wallet_membership"):
    raise SystemExit("Payout duplicate/reservation conflict detected")
print("Record counts preserved and critical duplicate checks passed")
PY

log "Checking service state"
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
log "Rollback command: sudo EXPECTED_BACKUP=$BACKUP bash $APP/ops/rollback_launch_integrity.sh"
