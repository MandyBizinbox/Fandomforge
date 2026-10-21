"""Read-only live catalogue calculation parity against the existing React code.

Uses production MongoDB for input ONLY and runs a local Node comparison.
No record contents are printed or written to files.
"""
import json
import os
import subprocess
from pathlib import Path

from dotenv import dotenv_values
from pymongo import MongoClient

from product_template_visibility import creator_template_query
from routes_main import (
    _creator_safe_product_template_doc,
    _compact_creator_catalogue_template,
)

ROOT = Path(__file__).resolve().parents[2]
CONFIG_ROOT = Path(os.environ.get("FANDOMFORGE_CONFIG_ROOT", "/var/www/sites/fandomforge"))
CONFIG = dotenv_values(CONFIG_ROOT / "backend" / ".env")
URI = CONFIG.get("MONGO_URL")
DB_NAME = CONFIG.get("DB_NAME")
if not URI or not DB_NAME:
    raise SystemExit("Missing Mongo config; aborted without connecting")

client = MongoClient(
    URI,
    serverSelectionTimeoutMS=5000,
    socketTimeoutMS=20000,
    retryWrites=False,
)
try:
    db = client[DB_NAME]
    rows = list(db.product_templates.find(
        creator_template_query({"status": "active"}), {"_id": 0}
    ).sort("name", 1).limit(500))
    full = [_creator_safe_product_template_doc(row) for row in rows]
    compact = [_compact_creator_catalogue_template(row) for row in full]
    options = list(db.print_options.find({}, {"_id": 0}).limit(1000))
finally:
    client.close()

payload = json.dumps(
    {"full": full, "compact": compact, "printOptions": options},
    default=str,
    separators=(",", ":"),
)

node = subprocess.run(
    ["node", "scripts/check-catalogue-parity.cjs"],
    cwd=ROOT / "frontend",
    env={**os.environ, "NODE_ENV": "test"},
    input=payload,
    text=True,
    check=False,
)
raise SystemExit(node.returncode)
