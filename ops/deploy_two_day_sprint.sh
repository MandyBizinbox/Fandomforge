#!/usr/bin/env bash
set -Eeuo pipefail

APP="/var/www/sites/fandomforge"
BACKEND="$APP/backend"
FRONTEND="$APP/frontend"
BRANCH="agent/public-launch-readiness-integrated-20260716-155921"
TARGET="${EXPECTED_TARGET:?Set EXPECTED_TARGET to the approved sprint commit SHA}"
DOMAIN="https://fandomforge.co.za"
BACKEND_SERVICE="fandomforge-backend.service"
SITE_CONFIG="/etc/nginx/sites-available/fandomforge.co.za"
CACHE_SNIPPET_SOURCE="$APP/ops/nginx/fandomforge-static-cache.locations.conf"
CACHE_SNIPPET_DEST="/etc/nginx/snippets/fandomforge-static-cache.locations.conf"

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="/var/backups/fandomforge/two-day-sprint-$STAMP"
NEXT_BUILD="$FRONTEND/build.next-$STAMP"
OLD_BUILD="$BACKUP/build.previous"
REPORT="$BACKUP/acceptance-report.txt"

ORIGINAL_COMMIT=""
SOURCE_UPDATED=0
BUILD_SWAPPED=0
BACKEND_RESTARTED=0
NGINX_CHANGED=0
ENV_CHANGED=0
CRITICAL_COMPLETE=0
WARNINGS=()

mkdir -p /tmp/fandomforge-sprint
sudo mkdir -p "$BACKUP"
sudo touch "$REPORT"
sudo chown "$(id -u):$(id -g)" "$REPORT"

log() {
    printf '%s\n' "$*" | tee -a "$REPORT"
}

warn() {
    WARNINGS+=("$*")
    log "WARNING: $*"
}

rollback() {
    local exit_code=$?
    trap - ERR

    log ""
    log "============================================================"
    log "CRITICAL DEPLOYMENT FAILURE — ROLLING BACK"
    log "============================================================"

    if [ "$BUILD_SWAPPED" = "1" ] && [ -d "$OLD_BUILD" ]; then
        if [ -d "$FRONTEND/build" ]; then
            sudo mv "$FRONTEND/build" "$BACKUP/rejected-build-$STAMP" 2>/dev/null || true
        fi
        sudo mv "$OLD_BUILD" "$FRONTEND/build" || true
    fi

    if [ "$NGINX_CHANGED" = "1" ]; then
        if [ -f "$BACKUP/nginx-site.conf" ]; then
            sudo cp "$BACKUP/nginx-site.conf" "$SITE_CONFIG" || true
        fi
        if [ -f "$BACKUP/cache-snippet.previous" ]; then
            sudo cp "$BACKUP/cache-snippet.previous" "$CACHE_SNIPPET_DEST" || true
        else
            sudo rm -f "$CACHE_SNIPPET_DEST" || true
        fi
    fi

    if [ "$ENV_CHANGED" = "1" ] && [ -f "$BACKUP/backend.env" ]; then
        sudo cp "$BACKUP/backend.env" "$BACKEND/.env" || true
    fi

    if [ "$SOURCE_UPDATED" = "1" ] && [ -n "$ORIGINAL_COMMIT" ]; then
        cd "$APP" || true
        git reset --hard "$ORIGINAL_COMMIT" || true
    fi

    rm -rf "$NEXT_BUILD" 2>/dev/null || true

    if [ "$BACKEND_RESTARTED" = "1" ] || [ "$SOURCE_UPDATED" = "1" ]; then
        sudo systemctl restart "$BACKEND_SERVICE" || true
    fi

    if sudo nginx -t >/dev/null 2>&1; then
        sudo systemctl reload nginx || true
    fi

    log "Rollback attempted. Review: $REPORT"
    exit "$exit_code"
}

trap rollback ERR

mongo_snapshot() {
    local label="$1"
    local output="$BACKUP/mongo-$label.json"
    (
        cd "$BACKEND"
        LABEL="$label" OUTPUT="$output" "$BACKEND/venv/bin/python" - <<'PY'
import json
import os
from collections import Counter
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient

root = Path.cwd()
load_dotenv(root / ".env")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]

collections = [
    "users",
    "creators",
    "products",
    "orders",
    "payments",
    "wallet_transactions",
    "payout_profiles",
    "payout_batches",
    "policies",
    "contact_messages",
    "notification_emails",
]
counts = {name: db[name].count_documents({}) for name in collections}
platform = db.settings.find_one({"id": "platform"}, {"_id": 0}) or {}

wallet_status = {
    row["_id"] or "unknown": row["count"]
    for row in db.wallet_transactions.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ])
}
batch_status = {
    row["_id"] or "unknown": row["count"]
    for row in db.payout_batches.aggregate([
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ])
}
verified_profiles = db.payout_profiles.count_documents({
    "owner_type": "creator",
    "provider": "paystack",
    "verification_status": "verified",
    "paystack_recipient_code": {"$nin": [None, ""]},
})
invalid_verified_profiles = db.payout_profiles.count_documents({
    "owner_type": "creator",
    "provider": "paystack",
    "verification_status": "verified",
    "$or": [
        {"paystack_recipient_code": None},
        {"paystack_recipient_code": ""},
        {"paystack_recipient_code": {"$exists": False}},
    ],
})

duplicate_wallet_membership = list(db.payout_batches.aggregate([
    {"$unwind": "$items"},
    {"$unwind": "$items.wallet_transaction_ids"},
    {"$group": {
        "_id": "$items.wallet_transaction_ids",
        "count": {"$sum": 1},
        "batches": {"$addToSet": "$id"},
    }},
    {"$match": {"count": {"$gt": 1}}},
    {"$limit": 100},
]))
duplicate_references = list(db.payout_batches.aggregate([
    {"$unwind": "$items"},
    {"$match": {"items.provider_reference": {"$nin": [None, ""]}}},
    {"$group": {
        "_id": "$items.provider_reference",
        "count": {"$sum": 1},
        "batches": {"$addToSet": "$id"},
    }},
    {"$match": {"count": {"$gt": 1}}},
    {"$limit": 100},
]))

result = {
    "label": os.environ["LABEL"],
    "database": os.environ["DB_NAME"],
    "counts": counts,
    "platform": {
        "support_email": platform.get("support_email"),
        "public_contact_email": platform.get("public_contact_email"),
        "paystack_enabled": bool(platform.get("paystack_enabled")),
        "paystack_mode": platform.get("paystack_mode"),
        "paystack_public_key_configured": bool(platform.get("paystack_public_key")),
        "paystack_secret_key_configured": bool(platform.get("paystack_secret_key")),
    },
    "wallet_status": wallet_status,
    "batch_status": batch_status,
    "verified_creator_paystack_profiles": verified_profiles,
    "invalid_verified_creator_profiles": invalid_verified_profiles,
    "duplicate_wallet_membership": duplicate_wallet_membership,
    "duplicate_provider_references": duplicate_references,
    "indexes": {
        "wallet_transactions": sorted(db.wallet_transactions.index_information().keys()),
        "payout_profiles": sorted(db.payout_profiles.index_information().keys()),
        "payout_batches": sorted(db.payout_batches.index_information().keys()),
        "notification_emails": sorted(db.notification_emails.index_information().keys()),
    },
}
Path(os.environ["OUTPUT"]).write_text(json.dumps(result, indent=2, default=str))
print(json.dumps(result, indent=2, default=str))
client.close()
PY
    ) | tee -a "$REPORT"
}

configure_backend_env() {
    sudo cp "$BACKEND/.env" "$BACKUP/backend.env"
    ENV_FILE="$BACKEND/.env" "$BACKEND/venv/bin/python" - <<'PY'
import os
import secrets
from pathlib import Path

path = Path(os.environ["ENV_FILE"])
lines = path.read_text().splitlines() if path.exists() else []
values = {}
order = []
for line in lines:
    if not line or line.lstrip().startswith("#") or "=" not in line:
        order.append((None, line))
        continue
    key, value = line.split("=", 1)
    key = key.strip()
    values[key] = value
    order.append((key, None))

updates = {
    "ENVIRONMENT": "production",
    "SMTP_FROM_EMAIL": values.get("SMTP_FROM_EMAIL") or "help@fandomforge.co.za",
    "SMTP_FROM_NAME": values.get("SMTP_FROM_NAME") or "FandomForge Support",
    "SMTP_REPLY_TO": values.get("SMTP_REPLY_TO") or "help@fandomforge.co.za",
}
secret = (values.get("JWT_SECRET") or "").strip()
if not secret or secret == "change-this-to-a-long-random-secret" or len(secret) < 48:
    updates["JWT_SECRET"] = secrets.token_hex(48)

values.update(updates)
seen = set()
out = []
for key, literal in order:
    if key is None:
        out.append(literal)
        continue
    if key in seen:
        continue
    seen.add(key)
    out.append(f"{key}={values[key]}")
for key, value in values.items():
    if key not in seen:
        out.append(f"{key}={value}")
path.write_text("\n".join(out).rstrip() + "\n")
PY
    sudo chmod 600 "$BACKEND/.env"
    ENV_CHANGED=1
}

install_nginx_cache_rules() {
    test -f "$SITE_CONFIG"
    test -f "$CACHE_SNIPPET_SOURCE"

    sudo cp "$SITE_CONFIG" "$BACKUP/nginx-site.conf"
    if [ -f "$CACHE_SNIPPET_DEST" ]; then
        sudo cp "$CACHE_SNIPPET_DEST" "$BACKUP/cache-snippet.previous"
    fi
    sudo mkdir -p "$(dirname "$CACHE_SNIPPET_DEST")"
    sudo cp "$CACHE_SNIPPET_SOURCE" "$CACHE_SNIPPET_DEST"

    SITE_CONFIG_PATH="$SITE_CONFIG" sudo -E python3 - <<'PY'
import os
import re
from pathlib import Path

path = Path(os.environ["SITE_CONFIG_PATH"])
text = path.read_text()
include_line = "include /etc/nginx/snippets/fandomforge-static-cache.locations.conf;"
if include_line in text:
    raise SystemExit(0)

blocks = []
for match in re.finditer(r"\bserver\s*\{", text):
    start = match.start()
    opening = text.find("{", match.start())
    depth = 0
    quote = None
    escaped = False
    for index in range(opening, len(text)):
        char = text[index]
        if quote:
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == quote:
                quote = None
            continue
        if char in {'"', "'"}:
            quote = char
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                blocks.append((start, index, text[start:index + 1]))
                break

candidates = [
    block for block in blocks
    if "fandomforge.co.za" in block[2]
    and ("listen 443" in block[2] or "ssl" in block[2])
]
if not candidates:
    candidates = [
        block for block in blocks
        if "fandomforge.co.za" in block[2]
        and "/var/www/sites/fandomforge/frontend/build" in block[2]
    ]
if not candidates:
    raise SystemExit("Could not locate the FandomForge HTTPS server block")

_, closing, _ = candidates[0]
insertion = "\n    # FandomForge immutable hashed-asset caching\n    " + include_line + "\n"
text = text[:closing] + insertion + text[closing:]
path.write_text(text)
PY

    NGINX_CHANGED=1
    sudo nginx -t
}

route_registry_check() {
    (
        cd "$BACKEND"
        PYTHONPATH="$BACKEND" "$BACKEND/venv/bin/python" - <<'PY'
from server import app

checks = {
    ("/api/payments/webhooks/paystack", "POST"): "payout_launch_routes",
    ("/api/admin/payout-batches/{batch_id}/send-paystack", "POST"): "payout_launch_routes",
    ("/api/admin/paystack/banks", "GET"): "payout_launch_routes",
    ("/api/creator-payouts/profile", "GET"): "payout_launch_routes",
    ("/api/creator-payouts/profile", "PUT"): "payout_launch_routes",
    ("/api/creator-payouts/profile/verify", "POST"): "payout_launch_routes",
    ("/api/admin/payout-batches/friday", "POST"): "payout_launch_routes",
    ("/api/admin/payout-batches/{batch_id}/retry-failed", "POST"): "payout_launch_routes",
    ("/api/admin/payout-batches/{batch_id}/reconcile", "POST"): "payout_launch_routes",
}

for (path, method), expected_module in checks.items():
    matches = [
        route for route in app.routes
        if getattr(route, "path", None) == path
        and method in (getattr(route, "methods", None) or set())
    ]
    assert matches, f"Missing route: {method} {path}"
    actual = matches[0].endpoint.__module__
    assert actual == expected_module, f"Wrong first route for {method} {path}: {actual}"
    print(f"OK {method} {path} -> {actual}")
PY
    ) | tee -a "$REPORT"
}

build_frontend() {
    cd "$FRONTEND"
    rm -rf "$NEXT_BUILD"

    sudo -u www-data npm install --legacy-peer-deps --no-audit --no-fund
    sudo -u www-data env \
        BUILD_PATH="$NEXT_BUILD" \
        GENERATE_SOURCEMAP=false \
        NODE_OPTIONS="--max-old-space-size=2048" \
        npm run build

    test -s "$NEXT_BUILD/index.html"

    git -C "$APP" restore frontend/package.json frontend/package-lock.json 2>/dev/null || true

    local main_rel
    main_rel="$(grep -oE 'static/js/main\.[A-Za-z0-9]+\.js' "$NEXT_BUILD/index.html" | head -n 1)"
    test -n "$main_rel"
    test -s "$NEXT_BUILD/$main_rel"

    local chunk_count old_main old_size new_size
    chunk_count="$(find "$NEXT_BUILD/static/js" -maxdepth 1 -type f -name '*.chunk.js' | wc -l | tr -d ' ')"
    if [ "$chunk_count" -lt 8 ]; then
        log "ERROR: Expected route-level code splitting; found only $chunk_count lazy JavaScript chunks."
        return 1
    fi

    old_main=""
    old_size="0"
    if [ -f "$FRONTEND/build/index.html" ]; then
        old_main="$(grep -oE 'static/js/main\.[A-Za-z0-9]+\.js' "$FRONTEND/build/index.html" | head -n 1 || true)"
        if [ -n "$old_main" ] && [ -f "$FRONTEND/build/$old_main" ]; then
            old_size="$(gzip -c "$FRONTEND/build/$old_main" | wc -c | tr -d ' ')"
        fi
    fi
    new_size="$(gzip -c "$NEXT_BUILD/$main_rel" | wc -c | tr -d ' ')"

    log "Frontend chunks: $chunk_count"
    log "Previous main JS gzip bytes: $old_size"
    log "New main JS gzip bytes: $new_size"
    printf 'old_main_gzip_bytes=%s\nnew_main_gzip_bytes=%s\nchunk_count=%s\n' \
        "$old_size" "$new_size" "$chunk_count" > "$BACKUP/frontend-size.txt"

    if grep -Fq "Friday Paystack Payouts" "$NEXT_BUILD/$main_rel"; then
        log "ERROR: Admin payout application remains inside the public main bundle."
        return 1
    fi
    if grep -Fq "Friday Payout Account" "$NEXT_BUILD/$main_rel"; then
        log "ERROR: Protected creator payout application remains inside the public main bundle."
        return 1
    fi

    required=(
        "Everything you need to start and run your FandomForge store"
        "Most paid orders are produced within 2 to 3 business days"
        "Standard courier delivery usually takes 3 to 4 business days"
        "Eligible creator payouts are processed every Friday through Paystack"
        "help@fandomforge.co.za"
        "Friday Paystack Payouts"
        "Friday Payout Account"
    )
    for text in "${required[@]}"; do
        grep -Rqs "$text" "$NEXT_BUILD" || {
            log "ERROR: Compiled build is missing: $text"
            return 1
        }
    done

    forbidden=(
        "info@theforgeza.co.za"
        "Do not rely on an unpublished schedule"
        "Only operationally confirmed promises are published"
        "Use the public support contact details configured for this FandomForge instance"
    )
    for text in "${forbidden[@]}"; do
        if grep -Rqs "$text" "$NEXT_BUILD"; then
            log "ERROR: Old public wording remains: $text"
            return 1
        fi
    done

    find "$NEXT_BUILD" -type f \
        \( -iname '*.png' -o -iname '*.jpg' -o -iname '*.jpeg' -o -iname '*.webp' -o -iname '*.avif' \) \
        -printf '%s %p\n' | sort -nr | head -n 25 > "$BACKUP/largest-build-images.txt" || true
}

activate_build() {
    if [ -d "$FRONTEND/build" ]; then
        sudo mv "$FRONTEND/build" "$OLD_BUILD"
    fi
    sudo mv "$NEXT_BUILD" "$FRONTEND/build"
    if [ -d "$OLD_BUILD" ]; then
        sudo chown -R --reference="$OLD_BUILD" "$FRONTEND/build"
    fi
    sudo find "$FRONTEND/build" -type d -exec chmod 755 {} \;
    sudo find "$FRONTEND/build" -type f -exec chmod 644 {} \;
    BUILD_SWAPPED=1
}

critical_smoke_tests() {
    local api_health
    api_health="$(curl --silent --show-error --fail --max-time 30 "$DOMAIN/api/health")"
    printf '%s\n' "$api_health" > "$BACKUP/api-health.json"
    log "API health: $api_health"

    routes=(
        "/"
        "/faq"
        "/creator-onboarding"
        "/shipping-production-returns"
        "/legal"
        "/terms"
        "/privacy-policy"
        "/shipping-policy"
        "/returns"
        "/creator-terms"
        "/intellectual-property"
        "/prohibited-content"
        "/copyright-complaints"
        "/payout-policy"
        "/store-suspension-policy"
    )
    for route in "${routes[@]}"; do
        code="$(curl --location --silent --show-error --max-time 30 --output /dev/null --write-out '%{http_code}' "$DOMAIN$route?deployment=$STAMP")"
        [ "$code" = "200" ] || {
            log "ERROR: $route returned HTTP $code"
            return 1
        }
        log "HTTP 200 $route"
    done

    local auth_code
    auth_code="$(curl --silent --show-error --max-time 30 --output /dev/null --write-out '%{http_code}' "$DOMAIN/api/auth/me")"
    [ "$auth_code" = "401" ] || {
        log "ERROR: Protected API check returned HTTP $auth_code instead of 401"
        return 1
    }
    log "HTTP 401 /api/auth/me (expected protected response)"

    local live_html live_main cache_header
    live_html="$BACKUP/live-index.html"
    curl --silent --show-error --fail --max-time 30 "$DOMAIN/?deployment=$STAMP" > "$live_html"
    live_main="$(grep -oE 'static/js/main\.[A-Za-z0-9]+\.js' "$live_html" | head -n 1)"
    test -n "$live_main"
    cache_header="$(curl --silent --show-error --head --max-time 30 "$DOMAIN/$live_main" | tr -d '\r' | grep -i '^cache-control:' | tail -n 1 || true)"
    log "Live main JS cache header: ${cache_header:-missing}"
    if ! printf '%s' "$cache_header" | grep -qi 'immutable'; then
        log "ERROR: Hashed static assets are not being served with immutable caching."
        return 1
    fi
}

measure_performance() {
    local storefront_slug=""
    storefront_slug="$(
        cd "$BACKEND"
        "$BACKEND/venv/bin/python" - <<'PY'
import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
load_dotenv(Path.cwd() / ".env")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
creator = db.creators.find_one(
    {
        "status": "active",
        "$or": [
            {"store_visibility": "public"},
            {"visibility": "public"},
            {"store_visibility": {"$exists": False}},
        ],
    },
    {"_id": 0, "slug": 1},
)
print((creator or {}).get("slug") or "")
client.close()
PY
    )"

    local routes=("/" "/faq" "/creator-onboarding")
    if [ -n "$storefront_slug" ]; then
        routes+=("/creators/$storefront_slug")
    else
        warn "No public creator storefront was available for performance measurement."
    fi

    : > "$BACKUP/performance.tsv"
    printf 'route\trun\thttp_code\tstart_transfer_seconds\ttotal_seconds\tsize_bytes\n' >> "$BACKUP/performance.tsv"
    for route in "${routes[@]}"; do
        for run in 1 2 3; do
            curl --location --silent --show-error --max-time 30 --output /dev/null \
                --write-out "$route\t$run\t%{http_code}\t%{time_starttransfer}\t%{time_total}\t%{size_download}\n" \
                "$DOMAIN$route?performance=$STAMP-$run" >> "$BACKUP/performance.tsv"
        done
    done
    cat "$BACKUP/performance.tsv" | tee -a "$REPORT"

    local browser=""
    for candidate in chromium chromium-browser google-chrome google-chrome-stable; do
        if command -v "$candidate" >/dev/null 2>&1; then
            browser="$candidate"
            break
        fi
    done
    if [ -n "$browser" ]; then
        mkdir -p "$BACKUP/screenshots"
        timeout 60 "$browser" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
            --window-size=390,844 --screenshot="$BACKUP/screenshots/faq-mobile.png" \
            "$DOMAIN/faq?visual=$STAMP" >/dev/null 2>&1 || warn "Mobile Chromium screenshot failed."
        timeout 60 "$browser" --headless --no-sandbox --disable-gpu --disable-dev-shm-usage \
            --window-size=1440,1000 --screenshot="$BACKUP/screenshots/onboarding-desktop.png" \
            "$DOMAIN/creator-onboarding?visual=$STAMP" >/dev/null 2>&1 || warn "Desktop Chromium screenshot failed."
        log "Browser screenshots saved under $BACKUP/screenshots"
    else
        warn "Chromium is not installed; automated desktop/mobile screenshot capture was skipped."
    fi
}

verify_paystack_readiness() {
    local output="$BACKUP/paystack-readiness.json"
    (
        cd "$BACKEND"
        OUTPUT="$output" PYTHONPATH="$BACKEND" "$BACKEND/venv/bin/python" - <<'PY'
import asyncio
import json
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path.cwd() / ".env")

async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    platform = await db.settings.find_one({"id": "platform"}, {"_id": 0}) or {}
    result = {
        "enabled": bool(platform.get("paystack_enabled")),
        "mode": platform.get("paystack_mode") or "test",
        "public_key_configured": bool(platform.get("paystack_public_key")),
        "secret_key_configured": bool(platform.get("paystack_secret_key") or os.environ.get("PAYSTACK_SECRET_KEY")),
        "bank_lookup": "not_run",
        "bank_count": 0,
    }
    if result["enabled"] and result["secret_key_configured"]:
        try:
            from routes_main import _paystack_request
            response = await _paystack_request(db, "GET", "/bank?currency=ZAR")
            result["bank_lookup"] = "ok" if response.get("status") is not False else "provider_error"
            result["bank_count"] = len(response.get("data") or [])
        except Exception as exc:
            result["bank_lookup"] = "failed"
            result["error"] = str(exc)
    Path(os.environ["OUTPUT"]).write_text(json.dumps(result, indent=2))
    print(json.dumps(result, indent=2))
    client.close()

asyncio.run(main())
PY
    ) | tee -a "$REPORT"

    if ! grep -q '"bank_lookup": "ok"' "$output"; then
        warn "Paystack bank lookup did not pass. Configure/verify payout credentials before the first Friday transfer run."
    fi
}

verify_contact_delivery() {
    local response_file="$BACKUP/contact-test-response.json"
    local payload
    payload="$(cat <<JSON
{"name":"FandomForge Launch Acceptance","email":"help@fandomforge.co.za","phone":"","topic":"Launch contact-form delivery test $STAMP","message":"Controlled two-day sprint contact-form test. Please retain this message as delivery evidence."}
JSON
)"

    if ! curl --silent --show-error --fail --max-time 30 \
        -H 'Content-Type: application/json' \
        --data "$payload" \
        "$DOMAIN/api/public/contact" > "$response_file"; then
        warn "The public contact form submission failed."
        return 0
    fi

    local contact_id
    contact_id="$(python3 - "$response_file" <<'PY'
import json, sys
print(json.load(open(sys.argv[1])).get("contact_id") or "")
PY
)"
    if [ -z "$contact_id" ]; then
        warn "The contact form response did not include a contact ID."
        return 0
    fi
    log "Contact test queued with ID: $contact_id"

    local status=""
    for _ in 1 2 3 4 5 6 7 8 9; do
        sleep 10
        status="$(
            cd "$BACKEND"
            CONTACT_ID="$contact_id" "$BACKEND/venv/bin/python" - <<'PY'
import os
from pathlib import Path
from dotenv import load_dotenv
from pymongo import MongoClient
load_dotenv(Path.cwd() / ".env")
client = MongoClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]
row = db.notification_emails.find_one(
    {"$or": [
        {"related_id": os.environ["CONTACT_ID"]},
        {"body": {"$regex": os.environ["CONTACT_ID"]}},
    ]},
    {"_id": 0, "status": 1, "provider": 1, "error": 1, "sent_at": 1, "attempt_count": 1},
)
if not row:
    print("missing")
else:
    print("|".join(str(row.get(key) or "") for key in ["status", "provider", "sent_at", "attempt_count", "error"]))
client.close()
PY
        )"
        log "Contact email status: $status"
        case "$status" in
            sent\|*) break ;;
            failed\|*) break ;;
        esac
    done

    if [[ "$status" != sent\|* ]]; then
        warn "The contact message was recorded but application email delivery did not reach sent status."
    else
        log "Application email delivery reached sent status. Human mailbox receipt confirmation remains required at CEO Checkpoint 2."
    fi
}

record_dns_status() {
    local output="$BACKUP/mail-dns.txt"
    {
        echo "MX"
        dig +short MX fandomforge.co.za 2>/dev/null || true
        echo
        echo "APEX TXT / SPF"
        dig +short TXT fandomforge.co.za 2>/dev/null || true
        echo
        echo "DMARC"
        dig +short TXT _dmarc.fandomforge.co.za 2>/dev/null || true
        echo
        echo "COMMON DKIM SELECTORS"
        for selector in default selector1 selector2 mail google smtp k1; do
            value="$(dig +short TXT "$selector._domainkey.fandomforge.co.za" 2>/dev/null || true)"
            [ -n "$value" ] && printf '%s: %s\n' "$selector" "$value"
        done
    } > "$output"
    cat "$output" | tee -a "$REPORT"

    grep -qE '[0-9]+[[:space:]]+[^[:space:]]+\.' "$output" || warn "No MX record was detected from the VPS resolver."
    grep -qi 'v=spf1' "$output" || warn "No SPF record was detected."
    grep -qi 'v=DMARC1' "$output" || warn "No DMARC record was detected."
    grep -qi 'v=DKIM1' "$output" || warn "No DKIM record was found under the common selectors checked; confirm the provider selector manually."
}

log "============================================================"
log "FandomForge two-day completion sprint deployment"
log "============================================================"
log "Branch: $BRANCH"
log "Target: $TARGET"
log "Backup: $BACKUP"

cd "$APP"
ORIGINAL_COMMIT="$(git rev-parse HEAD)"
CURRENT_BRANCH="$(git branch --show-current)"
log "Current branch: $CURRENT_BRANCH"
log "Current commit: $ORIGINAL_COMMIT"

[ "$CURRENT_BRANCH" = "$BRANCH" ] || {
    log "ERROR: Expected branch $BRANCH, found $CURRENT_BRANCH"
    exit 1
}
[ -z "$(git status --porcelain --untracked-files=no)" ] || {
    log "ERROR: Tracked local changes exist."
    git status --short | tee -a "$REPORT"
    exit 1
}

git fetch origin "$BRANCH"
REMOTE_COMMIT="$(git rev-parse "origin/$BRANCH")"
[ "$REMOTE_COMMIT" = "$TARGET" ] || {
    log "ERROR: Remote branch head $REMOTE_COMMIT does not match approved target $TARGET"
    exit 1
}
git merge-base --is-ancestor "$ORIGINAL_COMMIT" "$TARGET" || {
    log "ERROR: Target is not a safe descendant of the production commit."
    exit 1
}

mongo_snapshot before
sudo cp "$BACKEND/.env" "$BACKUP/backend.env"
sudo cp "$SITE_CONFIG" "$BACKUP/nginx-site.conf"

git pull --ff-only origin "$BRANCH"
SOURCE_UPDATED=1
[ "$(git rev-parse HEAD)" = "$TARGET" ]

configure_backend_env

log "Running backend syntax and payout unit checks..."
cd "$BACKEND"
"$BACKEND/venv/bin/python" -m py_compile \
    server.py \
    payout_launch_routes.py \
    email_delivery.py \
    routes_public_platform.py
PYTHONPATH="$BACKEND" "$BACKEND/venv/bin/python" -m pytest -q tests/test_payout_launch_routes.py | tee -a "$REPORT"
route_registry_check

log "Building route-split frontend..."
build_frontend

log "Installing immutable static cache rules..."
install_nginx_cache_rules

log "Restarting backend..."
sudo systemctl restart "$BACKEND_SERVICE"
BACKEND_RESTARTED=1
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl --silent --fail --max-time 5 http://127.0.0.1:8009/api/health > "$BACKUP/local-api-health.json"; then
        break
    fi
    sleep 2
done
curl --silent --show-error --fail --max-time 10 http://127.0.0.1:8009/api/health | tee -a "$REPORT"

log "Activating frontend build..."
activate_build
sudo nginx -t
sudo systemctl reload nginx

critical_smoke_tests
CRITICAL_COMPLETE=1
trap - ERR

mongo_snapshot after
verify_paystack_readiness
measure_performance
verify_contact_delivery
record_dns_status

cd "$APP"
FINAL_COMMIT="$(git rev-parse HEAD)"
[ "$FINAL_COMMIT" = "$TARGET" ] || warn "Final working tree commit changed unexpectedly: $FINAL_COMMIT"
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
    warn "Deployment left tracked source changes."
    git status --short | tee -a "$REPORT"
fi

printf '%s\n' "$BACKUP" | sudo tee /var/backups/fandomforge/LAST_DEPLOY >/dev/null
date --iso-8601=seconds | sudo tee "$BACKUP/deployed-at.txt" >/dev/null

log ""
log "============================================================"
log "CHECKPOINT 2 BUILD DEPLOYED"
log "============================================================"
log "Commit: $TARGET"
log "Report: $REPORT"
log "Previous frontend: $OLD_BUILD"
log ""
if [ "${#WARNINGS[@]}" -eq 0 ]; then
    log "Critical deployment and automated acceptance checks passed with no recorded warnings."
else
    log "Recorded acceptance warnings (${#WARNINGS[@]}):"
    for item in "${WARNINGS[@]}"; do
        log "- $item"
    done
fi
log ""
log "CEO Checkpoint 2 must confirm:"
log "- receipt of the controlled message in help@fandomforge.co.za"
log "- final desktop/mobile visual acceptance"
log "- Paystack test/live credentials and first verified creator account before the first Friday transfer"
