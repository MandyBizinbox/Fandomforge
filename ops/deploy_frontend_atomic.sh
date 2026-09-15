#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="${FANDOMFORGE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
FRONTEND_DIR="${FANDOMFORGE_FRONTEND_DIR:-$ROOT/frontend}"
RELEASES_DIR="${FANDOMFORGE_FRONTEND_RELEASES:-$FRONTEND_DIR/releases}"
CURRENT_LINK="${FANDOMFORGE_FRONTEND_CURRENT:-$FRONTEND_DIR/current}"
PUBLIC_ORIGIN="${FANDOMFORGE_PUBLIC_ORIGIN:-https://fandomforge.co.za}"
NGINX_CONFIG="${FANDOMFORGE_NGINX_CONFIG:-/etc/nginx/sites-enabled/fandomforge.co.za}"
BOOTSTRAP_ONLY=0

if [[ "${1:-}" == "--bootstrap-current" ]]; then
  BOOTSTRAP_ONLY=1
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--bootstrap-current]" >&2
  exit 64
fi

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

validate_build() {
  local build_dir="$1"
  [[ -s "$build_dir/index.html" ]] || fail "Missing index.html in $build_dir"
  [[ -s "$build_dir/asset-manifest.json" ]] || fail "Missing asset-manifest.json in $build_dir"

  python3 - "$build_dir" <<'PY'
import json
import pathlib
import re
import sys

build = pathlib.Path(sys.argv[1]).resolve()
manifest = json.loads((build / "asset-manifest.json").read_text(encoding="utf-8"))
index = (build / "index.html").read_text(encoding="utf-8")
asset_urls = set()

for value in (manifest.get("files", {}) if isinstance(manifest, dict) else {}).values():
    if isinstance(value, str) and value.startswith("/static/"):
        asset_urls.add(value.split("?", 1)[0])
for value in re.findall(r'["\'](/static/[^"\']+\.(?:js|css))["\']', index):
    asset_urls.add(value)

if not asset_urls:
    raise SystemExit("No static assets found in build manifest/index")
main_js = [url for url in asset_urls if re.fullmatch(r"/static/js/main\.[^.]+\.js", url)]
main_css = [url for url in asset_urls if re.fullmatch(r"/static/css/main\.[^.]+\.css", url)]
if not main_js or not main_css:
    raise SystemExit(f"Missing main JS/CSS references: js={main_js!r} css={main_css!r}")

for url in sorted(asset_urls):
    candidate = (build / url.lstrip("/")).resolve()
    if build not in candidate.parents:
        raise SystemExit(f"Asset escaped build root: {url}")
    if not candidate.is_file() or candidate.stat().st_size == 0:
        raise SystemExit(f"Referenced asset missing/empty: {url}")
    if candidate.suffix in {".js", ".css"}:
        prefix = candidate.read_bytes()[:256].lstrip().lower()
        if prefix.startswith(b"<!doctype") or prefix.startswith(b"<html"):
            raise SystemExit(f"HTML found in static asset: {url}")

print(f"validated {len(asset_urls)} build assets")
PY
}

[[ -d "$ROOT/.git" ]] || fail "Not a Git checkout: $ROOT"
[[ -d "$FRONTEND_DIR" ]] || fail "Frontend directory not found: $FRONTEND_DIR"

DIRTY="$(git -C "$ROOT" status --porcelain)"
[[ -z "$DIRTY" ]] || {
  echo "Deployment stopped: checkout is dirty." >&2
  echo "$DIRTY" >&2
  exit 2
}

mkdir -p "$RELEASES_DIR"

if (( BOOTSTRAP_ONLY )); then
  BUILD_DIR="$FRONTEND_DIR/build"
  validate_build "$BUILD_DIR"
  if [[ -e "$CURRENT_LINK" || -L "$CURRENT_LINK" ]]; then
    [[ -L "$CURRENT_LINK" ]] || fail "$CURRENT_LINK exists and is not a symlink"
    echo "Current frontend link already exists: $CURRENT_LINK -> $(readlink "$CURRENT_LINK")"
    exit 0
  fi
  TMP_LINK="${CURRENT_LINK}.bootstrap.$$"
  rm -f -- "$TMP_LINK"
  ln -s "$BUILD_DIR" "$TMP_LINK"
  mv -Tf "$TMP_LINK" "$CURRENT_LINK"
  echo "Bootstrapped $CURRENT_LINK -> $BUILD_DIR"
  echo "Next: point Nginx root at $CURRENT_LINK, include ops/nginx/fandomforge-static-cache.locations.conf, run nginx -t, then reload Nginx."
  exit 0
fi

[[ -L "$CURRENT_LINK" ]] || fail "$CURRENT_LINK must be a symlink. Run $0 --bootstrap-current first."

if [[ -r "$NGINX_CONFIG" ]]; then
  grep -Fq "root $CURRENT_LINK;" "$NGINX_CONFIG" || fail "Nginx is not rooted at $CURRENT_LINK"
  grep -Fq "fandomforge-static-cache.locations.conf" "$NGINX_CONFIG" || fail "Nginx static cache/404 include is not configured"
else
  echo "WARNING: cannot read $NGINX_CONFIG; skipping local Nginx contract check" >&2
fi

GIT_SHA="$(git -C "$ROOT" rev-parse --verify HEAD)"
SHORT_SHA="${GIT_SHA:0:12}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RELEASE_DIR="$RELEASES_DIR/${STAMP}-${SHORT_SHA}"
[[ ! -e "$RELEASE_DIR" ]] || fail "Release already exists: $RELEASE_DIR"

PREVIOUS_TARGET="$(readlink -f "$CURRENT_LINK" || true)"
ACTIVATED=0

cleanup_failed_release() {
  local exit_code=$?
  if (( exit_code != 0 && ACTIVATED == 0 )) && [[ -d "$RELEASE_DIR" ]]; then
    rm -rf -- "$RELEASE_DIR"
  fi
  return "$exit_code"
}
trap cleanup_failed_release EXIT

echo "Building $GIT_SHA into $RELEASE_DIR"
(
  cd "$FRONTEND_DIR"
  CI=false BUILD_PATH="$RELEASE_DIR" npm run build
)

validate_build "$RELEASE_DIR"
printf '%s\n' "$GIT_SHA" > "$RELEASE_DIR/DEPLOYED_GIT_SHA"

TMP_LINK="${CURRENT_LINK}.next.$$"
rm -f -- "$TMP_LINK"
ln -s "$RELEASE_DIR" "$TMP_LINK"
mv -Tf "$TMP_LINK" "$CURRENT_LINK"
ACTIVATED=1

echo "Activated $CURRENT_LINK -> $RELEASE_DIR"

verify_public_asset() {
  local url_path="$1"
  local expected_type="$2"
  local headers body
  headers="$(mktemp)"
  body="$(mktemp)"
  if ! curl -fsS -D "$headers" -o "$body" "${PUBLIC_ORIGIN}${url_path}"; then
    rm -f "$headers" "$body"
    return 1
  fi
  if ! grep -qi "^content-type: ${expected_type}" "$headers"; then
    echo "Unexpected content type for ${url_path}:" >&2
    grep -i '^content-type:' "$headers" >&2 || true
    rm -f "$headers" "$body"
    return 1
  fi
  if head -c 256 "$body" | grep -Eqi '^[[:space:]]*<!doctype|^[[:space:]]*<html'; then
    echo "HTML returned for static asset ${url_path}" >&2
    rm -f "$headers" "$body"
    return 1
  fi
  rm -f "$headers" "$body"
}

mapfile -t MAIN_ASSETS < <(python3 - "$RELEASE_DIR/index.html" <<'PY'
import pathlib
import re
import sys
text = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
for url in re.findall(r'["\'](/static/(?:js|css)/main\.[^"\']+\.(?:js|css))["\']', text):
    print(url)
PY
)

PUBLIC_OK=1
PUBLIC_INDEX="$(mktemp)"
if ! curl -fsS -o "$PUBLIC_INDEX" "${PUBLIC_ORIGIN}/?deploy=${SHORT_SHA}-${STAMP}"; then
  PUBLIC_OK=0
fi
if (( PUBLIC_OK )); then
  for asset in "${MAIN_ASSETS[@]}"; do
    if ! grep -Fq "$asset" "$PUBLIC_INDEX"; then
      echo "Public index does not reference activated asset: $asset" >&2
      PUBLIC_OK=0
      break
    fi
  done
fi
rm -f "$PUBLIC_INDEX"

if (( PUBLIC_OK )); then
  for asset in "${MAIN_ASSETS[@]}"; do
    case "$asset" in
      *.js) expected="application/javascript" ;;
      *.css) expected="text/css" ;;
      *) continue ;;
    esac
    if ! verify_public_asset "$asset" "$expected"; then
      PUBLIC_OK=0
      break
    fi
  done
fi

if (( PUBLIC_OK == 0 )); then
  echo "Public asset verification failed. This can indicate a poisoned CDN/static response." >&2
  if [[ -n "$PREVIOUS_TARGET" && -d "$PREVIOUS_TARGET" ]]; then
    ROLLBACK_LINK="${CURRENT_LINK}.rollback.$$"
    rm -f -- "$ROLLBACK_LINK"
    ln -s "$PREVIOUS_TARGET" "$ROLLBACK_LINK"
    mv -Tf "$ROLLBACK_LINK" "$CURRENT_LINK"
    echo "Rolled back $CURRENT_LINK -> $PREVIOUS_TARGET" >&2
  fi
  echo "Purge the Cloudflare cache before retrying the deployment." >&2
  exit 3
fi

trap - EXIT
echo "Frontend deployment verified: $PUBLIC_ORIGIN"
