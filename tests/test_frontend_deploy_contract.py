from pathlib import Path
import subprocess
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "ops" / "deploy_frontend_atomic.sh"
NGINX = ROOT / "ops" / "nginx" / "fandomforge-static-cache.locations.conf"
GITIGNORE = ROOT / ".gitignore"


class FrontendDeployContractTests(unittest.TestCase):
    def test_shell_syntax(self):
        subprocess.run(["bash", "-n", str(SCRIPT)], check=True)

    def test_build_is_staged_and_atomically_activated(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('BUILD_PATH="$RELEASE_DIR" npm run build', source)
        self.assertIn('mv -Tf "$TMP_LINK" "$CURRENT_LINK"', source)
        self.assertNotIn('rm -rf -- "$FRONTEND_DIR/build"', source)
        self.assertIn('git -C "$ROOT" status --porcelain', source)

    def test_public_asset_guard_catches_html_for_js_css(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('expected="application/javascript"', source)
        self.assertIn('expected="text/css"', source)
        self.assertIn("HTML returned for static asset", source)
        self.assertIn("Purge the Cloudflare cache before retrying", source)

    def test_nginx_static_requests_never_fall_back_to_spa_html(self):
        source = NGINX.read_text(encoding="utf-8")
        self.assertIn("location ^~ /static/", source)
        self.assertIn("try_files $uri =404;", source)
        self.assertIn('Cache-Control "public, max-age=31536000, immutable"', source)
        self.assertIn('Cache-Control "no-cache, no-store, must-revalidate"', source)
        static_block = source.split("location ^~ /static/", 1)[1].split("}", 1)[0]
        self.assertNotIn("/index.html", static_block)

    def test_runtime_release_paths_are_git_ignored(self):
        source = GITIGNORE.read_text(encoding="utf-8")
        self.assertIn("frontend/current", source)
        self.assertIn("frontend/releases/", source)


if __name__ == "__main__":
    unittest.main()
