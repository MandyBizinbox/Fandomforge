# Safe Frontend Deployment

FandomForge must never build directly into the directory Nginx is serving.

The production frontend now uses this model:

- `frontend/build/` — legacy/bootstrap build only; not the live deploy target after migration.
- `frontend/releases/<timestamp>-<git-sha>/` — immutable completed frontend releases.
- `frontend/current` — symlink to the active release. Nginx serves this path.
- `ops/deploy_frontend_atomic.sh` — canonical frontend deploy command.
- `ops/nginx/fandomforge-static-cache.locations.conf` — canonical static asset/cache contract.

## Why

A direct `npm run build` clears and rewrites `frontend/build`. During that window a browser can request a hashed JS/CSS file that temporarily does not exist. If the SPA fallback returns `index.html` for that request, a CDN can cache HTML under the static asset URL. Browsers then fail with errors such as `Unexpected token '<'`.

The atomic deploy script prevents that by building a complete release elsewhere, validating it, switching one symlink atomically, and then verifying the public JS/CSS responses.

## One-time production migration

Start only from a clean checkout and a known-good existing `frontend/build`.

```bash
cd /var/www/sites/fandomforge
git status --short
```

If output is not blank, stop. Do not stash, reset, discard, or overwrite local server changes.

Bootstrap the `current` symlink to the existing live build:

```bash
./ops/deploy_frontend_atomic.sh --bootstrap-current
```

Then edit the HTTPS FandomForge Nginx server block so its root is:

```nginx
root /var/www/sites/fandomforge/frontend/current;
```

Inside the same HTTPS server block include:

```nginx
include /var/www/sites/fandomforge/ops/nginx/fandomforge-static-cache.locations.conf;
```

Keep the SPA route fallback for application routes:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

The `/static/` include must take precedence so missing static assets return `404` instead of falling through to `index.html`.

Test before reload:

```bash
sudo nginx -t
```

Only if successful:

```bash
sudo systemctl reload nginx
```

Verify the currently linked build still serves correctly before the first atomic release deployment.

## Normal frontend deployment

```bash
cd /var/www/sites/fandomforge
git status --short
```

If blank:

```bash
git pull --ff-only origin feature/template-production-routing-v3
./ops/deploy_frontend_atomic.sh
```

Do not run `npm run build` directly on production after the atomic deployment system is enabled.

The script:

1. refuses to run on a dirty Git checkout;
2. verifies Nginx is rooted at `frontend/current` and uses the static 404/cache include when the config is readable;
3. builds with `BUILD_PATH` into a new immutable release directory;
4. validates `index.html`, `asset-manifest.json`, and every referenced static asset;
5. rejects JS/CSS files containing HTML;
6. atomically swaps the `frontend/current` symlink;
7. fetches the public index and current main JS/CSS through the public domain;
8. rejects wrong content types or HTML masquerading as JS/CSS;
9. restores the previous symlink automatically when public verification fails.

If public verification fails because Cloudflare has cached a poisoned static response, purge the Cloudflare cache and retry the deploy.

No backend restart is required for frontend-only deployments.

## Contract test

```bash
python3 tests/test_frontend_deploy_contract.py
```

The deployment CI also runs this contract and proves that CRACO can build successfully to a custom `BUILD_PATH`.
