"""Idempotent seed data for V1 production operations.

Production operations keep labour/application/setup cost separate from raw print cost.
These defaults are intentionally limited to active V1 manufacturing methods:
Sublimation, DTF Transfers, HTV, UV DTF and Adhesive Vinyl.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List


def utcnow_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def normalize_method_key(value: Any) -> str:
    key = str(value or "").strip().lower().replace("-", "_").replace(" ", "_")
    aliases = {
        "dtf_transfers": "dtf",
        "dtf_transfer": "dtf",
        "dtf_print": "dtf",
        "dtf_area_fixed_rate": "dtf",
        "dtf_area_from_sheet": "dtf",
        "dtf_full_sheet": "dtf",
        "dtf_fixed": "dtf",
        "sublimation_print": "sublimation",
        "sublimation_area_fixed_rate": "sublimation",
        "sublimation_area_from_sheet": "sublimation",
        "sublimation_full_sheet": "sublimation",
        "heat_transfer_vinyl": "htv",
        "htv_area_fixed_rate": "htv",
        "htv_area_from_sheet": "htv",
        "htv_full_sheet": "htv",
        "uvdtf": "uv_dtf",
        "uv_dtf_transfer": "uv_dtf",
        "uv_dtf_area_fixed_rate": "uv_dtf",
        "uv_dtf_area_from_sheet": "uv_dtf",
        "uv_dtf_full_sheet": "uv_dtf",
        "vinyl": "adhesive_vinyl",
        "adhesive": "adhesive_vinyl",
        "adhesive_vinyl_transfer": "adhesive_vinyl",
        "adhesive_vinyl_area_fixed_rate": "adhesive_vinyl",
        "adhesive_vinyl_area_from_sheet": "adhesive_vinyl",
        "adhesive_vinyl_full_sheet": "adhesive_vinyl",
    }

    if key in aliases:
        return aliases[key]

    # Launch-safe canonicalisation for pricing-rule/product-specific method keys.
    # Examples: sublimation_mug, htv_classic, adhesive_vinyl_frosted,
    # dtf_area_fixed_rate, uv_dtf_full_sheet.
    prefix_aliases = (
        ("adhesive_vinyl_", "adhesive_vinyl"),
        ("sublimation_", "sublimation"),
        ("uv_dtf_", "uv_dtf"),
        ("dtf_", "dtf"),
        ("htv_", "htv"),
    )
    for prefix, canonical in prefix_aliases:
        if key.startswith(prefix):
            return canonical

    return key


ACTIVE_V1_METHOD_KEYS = {"sublimation", "dtf", "htv", "uv_dtf", "adhesive_vinyl"}
INACTIVE_NON_V1_METHOD_KEYS = {"laser", "screen", "screen_print", "screen_printing", "embroidery"}


DEFAULT_PRODUCTION_OPERATIONS: List[Dict[str, Any]] = [
    {
        "id": "op-sublimation-heat-press-per-area",
        "slug": "sublimation-heat-press-per-area",
        "name": "Sublimation heat press placement",
        "operation_type": "heat_press",
        "applies_to_method": ["sublimation"],
        "cost_basis": "per_print_area",
        "cost": 10.0,
        "estimated_time": 5.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Charged once per sublimation placement/print area. Labour is separate from raw transfer or substrate cost.",
    },
    {
        "id": "op-sublimation-setup-per-job",
        "slug": "sublimation-setup-per-job",
        "name": "Sublimation setup / artwork prep",
        "operation_type": "setup",
        "applies_to_method": ["sublimation"],
        "cost_basis": "per_job",
        "cost": 5.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Per-job setup for sublimation production. Apply once per product/job, not once per placement.",
    },
    {
        "id": "op-dtf-heat-press-per-area",
        "slug": "dtf-heat-press-per-area",
        "name": "DTF heat press placement",
        "operation_type": "heat_press",
        "applies_to_method": ["dtf"],
        "cost_basis": "per_print_area",
        "cost": 8.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Charged once per DTF placement/print area. Do not hide this labour in raw DTF sheet cost.",
    },
    {
        "id": "op-dtf-setup-per-job",
        "slug": "dtf-setup-per-job",
        "name": "DTF setup / artwork prep",
        "operation_type": "setup",
        "applies_to_method": ["dtf"],
        "cost_basis": "per_job",
        "cost": 5.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Per-job setup for DTF production. Raw print cost remains separate from setup and pressing.",
    },
    {
        "id": "op-htv-cutting-per-job",
        "slug": "htv-cutting-per-job",
        "name": "HTV cutting setup",
        "operation_type": "cutting",
        "applies_to_method": ["htv"],
        "cost_basis": "per_job",
        "cost": 6.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Cutting setup for HTV jobs. Material cost remains separate.",
    },
    {
        "id": "op-htv-machine-time-per-minute",
        "slug": "htv-machine-time-per-minute",
        "name": "HTV cutter machine time",
        "operation_type": "machine_time",
        "applies_to_method": ["htv"],
        "cost_basis": "per_minute",
        "cost": 2.0,
        "estimated_time": 2.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Default cutter time estimate for HTV jobs. Can be refined later per design complexity.",
    },
    {
        "id": "op-htv-weeding-per-element",
        "slug": "htv-weeding-per-element",
        "name": "HTV weeding",
        "operation_type": "weeding",
        "applies_to_method": ["htv"],
        "cost_basis": "per_element",
        "cost": 8.0,
        "estimated_time": 5.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Charged per HTV design element/placement that requires weeding.",
    },
    {
        "id": "op-htv-heat-press-per-area",
        "slug": "htv-heat-press-per-area",
        "name": "HTV heat press placement",
        "operation_type": "heat_press",
        "applies_to_method": ["htv"],
        "cost_basis": "per_print_area",
        "cost": 8.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Charged once per HTV placement/print area.",
    },
    {
        "id": "op-htv-setup-per-job",
        "slug": "htv-setup-per-job",
        "name": "HTV setup / artwork prep",
        "operation_type": "setup",
        "applies_to_method": ["htv"],
        "cost_basis": "per_job",
        "cost": 5.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Per-job HTV setup before cutting, weeding and pressing.",
    },
    {
        "id": "op-uv-dtf-application-per-area",
        "slug": "uv-dtf-application-per-area",
        "name": "UV DTF application placement",
        "operation_type": "application",
        "applies_to_method": ["uv_dtf"],
        "cost_basis": "per_application",
        "cost": 7.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Charged once per UV DTF application/placement.",
    },
    {
        "id": "op-uv-dtf-setup-per-job",
        "slug": "uv-dtf-setup-per-job",
        "name": "UV DTF setup / surface prep",
        "operation_type": "setup",
        "applies_to_method": ["uv_dtf"],
        "cost_basis": "per_job",
        "cost": 4.0,
        "estimated_time": 2.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Per-job setup/surface prep for UV DTF production.",
    },
    {
        "id": "op-adhesive-vinyl-cutting-per-job",
        "slug": "adhesive-vinyl-cutting-per-job",
        "name": "Adhesive vinyl cutting setup",
        "operation_type": "cutting",
        "applies_to_method": ["adhesive_vinyl"],
        "cost_basis": "per_job",
        "cost": 5.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Cutting setup for adhesive vinyl jobs. Material cost remains separate.",
    },
    {
        "id": "op-adhesive-vinyl-machine-time-per-minute",
        "slug": "adhesive-vinyl-machine-time-per-minute",
        "name": "Adhesive vinyl cutter machine time",
        "operation_type": "machine_time",
        "applies_to_method": ["adhesive_vinyl"],
        "cost_basis": "per_minute",
        "cost": 2.0,
        "estimated_time": 2.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Default cutter time estimate for adhesive vinyl jobs. Can be refined later per design complexity.",
    },
    {
        "id": "op-adhesive-vinyl-weeding-per-element",
        "slug": "adhesive-vinyl-weeding-per-element",
        "name": "Adhesive vinyl weeding",
        "operation_type": "weeding",
        "applies_to_method": ["adhesive_vinyl"],
        "cost_basis": "per_element",
        "cost": 7.0,
        "estimated_time": 5.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Charged per adhesive vinyl design element/placement that requires weeding.",
    },
    {
        "id": "op-adhesive-vinyl-application-per-area",
        "slug": "adhesive-vinyl-application-per-area",
        "name": "Adhesive vinyl application placement",
        "operation_type": "application",
        "applies_to_method": ["adhesive_vinyl"],
        "cost_basis": "per_application",
        "cost": 6.0,
        "estimated_time": 3.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Charged once per adhesive vinyl application/placement.",
    },
    {
        "id": "op-adhesive-vinyl-setup-per-job",
        "slug": "adhesive-vinyl-setup-per-job",
        "name": "Adhesive vinyl setup / artwork prep",
        "operation_type": "setup",
        "applies_to_method": ["adhesive_vinyl"],
        "cost_basis": "per_job",
        "cost": 4.0,
        "estimated_time": 2.0,
        "default_quantity": 1,
        "active": True,
        "notes": "Per-job adhesive vinyl setup before cutting, weeding and application.",
    },
]


def normalize_operation_doc(operation: Dict[str, Any]) -> Dict[str, Any]:
    doc = dict(operation)
    doc["applies_to_method"] = [
        normalize_method_key(method)
        for method in doc.get("applies_to_method", [])
        if normalize_method_key(method) in ACTIVE_V1_METHOD_KEYS
    ]
    return doc


async def seed_production_operations(db) -> Dict[str, int]:
    """Insert V1 production operation defaults without overwriting admin edits."""
    await db.production_operations.create_index("id", unique=True)
    await db.production_operations.create_index("slug", unique=True)
    await db.production_operations.create_index("applies_to_method")
    await db.production_operations.create_index("operation_type")
    await db.production_operations.create_index("active")

    inserted = 0
    skipped = 0
    now = utcnow_iso()

    for operation in DEFAULT_PRODUCTION_OPERATIONS:
        doc = normalize_operation_doc(operation)
        methods = set(doc.get("applies_to_method") or [])

        if not methods or methods & INACTIVE_NON_V1_METHOD_KEYS:
            skipped += 1
            continue

        doc.setdefault("id", doc["slug"])
        doc.setdefault("active", True)
        doc["created_at"] = now
        doc["updated_at"] = now

        result = await db.production_operations.update_one(
            {"slug": doc["slug"]},
            {"$setOnInsert": doc},
            upsert=True,
        )
        if result.upserted_id is not None:
            inserted += 1
        else:
            skipped += 1

    return {"inserted": inserted, "skipped": skipped, "total_defaults": len(DEFAULT_PRODUCTION_OPERATIONS)}
