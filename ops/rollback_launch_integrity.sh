#!/usr/bin/env bash
set -Eeuo pipefail

APP="/var/www/sites/fandomforge"
BACKEND="$APP/backend"
FRONTEND="$APP/frontend"
BACKEND_SERVICE="${BACKEND_SERVICE:-fandomforge-backend.service}"
BACKUP="${EXPECTED_BACKUP:?Set EXPECTED_BACKUP to the launch-integrity backup directory}"

[ -d "$BACKUP" ]
[ -f "$BACKUP/original-commit.txt" ]
[ -f "$BACKUP/original-branch.txt" ]
ORIGINAL_COMMIT="$(cat "$BACKUP/original-commit.txt")"
ORIGINAL_BRANCH="$(cat "$BACKUP/original-branch.txt")"

printf 'Rolling FandomForge application back to %s %s\n' "$ORIGINAL_BRANCH" "$ORIGINAL_COMMIT"

cd "$APP"
[ -z "$(git status --porcelain --untracked-files=no)" ] || {
    echo "Tracked source changes exist; refusing rollback."
    git status --short
    exit 1
}

if [ -d "$BACKUP/build.replaced" ]; then
    [ -d "$FRONTEND/build" ] && sudo mv "$FRONTEND/build" "$BACKUP/build.rollback-rejected-$(date +%s)"
    sudo mv "$BACKUP/build.replaced" "$FRONTEND/build"
elif [ -d "$BACKUP/build.previous" ]; then
    [ -d "$FRONTEND/build" ] && sudo mv "$FRONTEND/build" "$BACKUP/build.rollback-rejected-$(date +%s)"
    sudo cp -a "$BACKUP/build.previous" "$FRONTEND/build"
else
    echo "No previous frontend build is available."
    exit 1
fi

if [ -f "$BACKUP/backend.env" ]; then
    sudo cp "$BACKUP/backend.env" "$BACKEND/.env"
    sudo chmod 600 "$BACKEND/.env"
fi

if git show-ref --verify --quiet "refs/heads/$ORIGINAL_BRANCH"; then
    git checkout "$ORIGINAL_BRANCH"
else
    git checkout --detach "$ORIGINAL_COMMIT"
fi
git reset --hard "$ORIGINAL_COMMIT"

sudo systemctl restart "$BACKEND_SERVICE"
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl is-active --quiet "$BACKEND_SERVICE"

printf 'Application rollback complete.\n'
printf 'MongoDB records were not rolled back because the release performs no destructive migration or financial backfill.\n'
printf 'Safe additive indexes and empty collections may remain.\n'
