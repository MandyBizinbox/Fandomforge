"""Production rule API for Builder V2 manufacturing validation."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth import get_current_user, optional_user, require_role
from legacy_print_option_migration import seed_legacy_print_option_costing
from models import User
from production_rules_engine import apply_production_rules, clean_doc, public_rule
from seed_production_operations import normalize_method_key
from seed_production_rules import PRODUCTION_RULES_VERSION, seed_production_rules


production_rules_router = APIRouter(prefix="/production-rules")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def make_colour_id(name: str, fallback_hex: str = "") -> str:
    base = re.sub(r"[^a-z0-9]+", "_", str(name or "").lower()).strip("_")
    if base:
        return base
    return re.sub(r"[^a-z0-9]+", "_", str(fallback_hex or "colour").lower()).strip("_") or "colour"


def normalise_hex(value: Any) -> str:
    raw = str(value or "").strip()
    if re.fullmatch(r"#[0-9a-fA-F]{6}", raw):
        return raw.lower()
    if re.fullmatch(r"#[0-9a-fA-F]{3}", raw):
        return "#" + "".join(ch * 2 for ch in raw[1:]).lower()
    raise HTTPException(status_code=400, detail="Colour hex must be #RGB or #RRGGBB")


class ProductionMethodUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    display_name: Optional[str] = None
    description: Optional[str] = None
    active: Optional[bool] = None
    default_production_lead_time_days: Optional[int] = None
    supported_product_categories: Optional[List[str]] = None
    supported_materials: Optional[List[str]] = None
    supported_colours: Optional[Dict[str, Any]] = None
    supported_artwork_types: Optional[List[str]] = None
    maximum_artwork_width_mm: Optional[float] = None
    maximum_artwork_height_mm: Optional[float] = None
    minimum_artwork_width_mm: Optional[float] = None
    minimum_artwork_height_mm: Optional[float] = None
    minimum_resolution_dpi: Optional[int] = None
    transparent_background_required: Optional[bool] = None
    mirror_artwork_required: Optional[bool] = None
    gang_sheet_capable: Optional[bool] = None
    layer_behaviour: Optional[Dict[str, Any]] = None
    press_behaviour: Optional[Dict[str, Any]] = None
    cost_calculation_model: Optional[Dict[str, Any]] = None
    creator_restrictions: Optional[Dict[str, Any]] = None
    validation_rules: Optional[Dict[str, Any]] = None
    admin_notes: Optional[str] = None


class ProductionSettingsUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    default_packaging_cost: Optional[float] = None
    default_packaging_creator_markup_percent: Optional[float] = None
    default_additional_manufacturing_charges: Optional[List[Dict[str, Any]]] = None
    fail_publish_on_warnings: Optional[bool] = None
    allow_unknown_material_with_warning: Optional[bool] = None
    allow_unknown_category_with_warning: Optional[bool] = None
    minimum_creator_profit_required: Optional[float] = None
    notes: Optional[str] = None


class StockedColourUpdate(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: Optional[str] = None
    name: Optional[str] = None
    hex: Optional[str] = None
    aliases: Optional[List[str]] = None
    applies_to_methods: Optional[List[str]] = None
    active: Optional[bool] = None
    sort_order: Optional[int] = None

    @field_validator("applies_to_methods", mode="before")
    @classmethod
    def normalise_methods(cls, value: Any) -> Optional[List[str]]:
        if value is None:
            return None
        raw_values = [value] if isinstance(value, str) else list(value or [])
        out: List[str] = []
        for raw in raw_values:
            method = normalize_method_key(raw)
            if method and method not in out:
                out.append(method)
        return out


class LegacyPrintOptionCostingSeedRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    dry_run: bool = False
    raw_cost_source: str = "print_option_fallback_to_method"


class ProductionValidationRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    product: Dict[str, Any] = Field(default_factory=dict)
    template: Optional[Dict[str, Any]] = None
    publish: bool = False


def _method_public_projection(doc: dict) -> dict:
    row = public_rule(doc)
    row.setdefault("version", PRODUCTION_RULES_VERSION)
    return row


@production_rules_router.get("/methods")
async def list_methods(request: Request, active: Optional[bool] = True, user: Optional[User] = Depends(optional_user)):
    db = request.app.state.db
    q: Dict[str, Any] = {}
    if active is not None:
        q["active"] = active
    docs = await db.production_methods.find(q, {"_id": 0}).sort("display_name", 1).to_list(200)
    return [_method_public_projection(doc) for doc in docs]


@production_rules_router.get("/methods/{method_key}")
async def get_method(method_key: str, request: Request, user: Optional[User] = Depends(optional_user)):
    method = normalize_method_key(method_key)
    doc = await request.app.state.db.production_methods.find_one({"method_key": method}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Production method rule not found")
    return _method_public_projection(doc)


@production_rules_router.patch("/methods/{method_key}")
async def update_method(method_key: str, payload: ProductionMethodUpdate, request: Request, user: User = Depends(require_role("super_admin"))):
    method = normalize_method_key(method_key)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = now_iso()
    result = await request.app.state.db.production_methods.update_one({"method_key": method}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Production method rule not found")
    doc = await request.app.state.db.production_methods.find_one({"method_key": method}, {"_id": 0})
    return _method_public_projection(doc)


@production_rules_router.get("/stocked-colours")
async def list_stocked_colours(request: Request, method: Optional[str] = None, active: Optional[bool] = True, user: Optional[User] = Depends(optional_user)):
    q: Dict[str, Any] = {}
    selected_method = normalize_method_key(method)
    if active is not None:
        q["active"] = active
    if selected_method:
        q["applies_to_methods"] = selected_method
    docs = await request.app.state.db.stocked_colours.find(q, {"_id": 0}).sort("sort_order", 1).to_list(500)
    return [clean_doc(doc) for doc in docs]


@production_rules_router.post("/stocked-colours")
async def create_stocked_colour(payload: StockedColourUpdate, request: Request, user: User = Depends(require_role("super_admin"))):
    data = payload.model_dump(exclude_unset=True)
    name = str(data.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Colour name is required")
    data["hex"] = normalise_hex(data.get("hex"))
    colour_id = make_colour_id(data.get("id") or name, data.get("hex"))
    existing = await request.app.state.db.stocked_colours.find_one({"id": colour_id}, {"_id": 0})
    if existing:
        raise HTTPException(status_code=409, detail="Stocked colour already exists")
    data.update({
        "id": colour_id,
        "name": name,
        "active": bool(data.get("active", True)),
        "aliases": list(data.get("aliases") or []),
        "applies_to_methods": list(data.get("applies_to_methods") or []),
        "sort_order": int(data.get("sort_order") or 999),
        "created_at": now_iso(),
        "updated_at": now_iso(),
    })
    await request.app.state.db.stocked_colours.insert_one(data)
    return clean_doc(await request.app.state.db.stocked_colours.find_one({"id": colour_id}, {"_id": 0}))


@production_rules_router.patch("/stocked-colours/{colour_id}")
async def update_stocked_colour(colour_id: str, payload: StockedColourUpdate, request: Request, user: User = Depends(require_role("super_admin"))):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates.pop("id", None)
    if "hex" in updates and updates["hex"] is not None:
        updates["hex"] = normalise_hex(updates["hex"])
    if "name" in updates and updates["name"] is not None:
        updates["name"] = str(updates["name"]).strip()
    updates["updated_at"] = now_iso()
    result = await request.app.state.db.stocked_colours.update_one({"id": colour_id}, {"$set": updates})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stocked colour not found")
    return clean_doc(await request.app.state.db.stocked_colours.find_one({"id": colour_id}, {"_id": 0}))


@production_rules_router.get("/settings")
async def get_settings(request: Request, user: User = Depends(require_role("super_admin"))):
    doc = await request.app.state.db.production_rule_settings.find_one({"id": "default"}, {"_id": 0})
    if not doc:
        await seed_production_rules(request.app.state.db)
        doc = await request.app.state.db.production_rule_settings.find_one({"id": "default"}, {"_id": 0})
    return clean_doc(doc)


@production_rules_router.patch("/settings")
async def update_settings(payload: ProductionSettingsUpdate, request: Request, user: User = Depends(require_role("super_admin"))):
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    updates["updated_at"] = now_iso()
    await request.app.state.db.production_rule_settings.update_one({"id": "default"}, {"$set": updates}, upsert=True)
    return clean_doc(await request.app.state.db.production_rule_settings.find_one({"id": "default"}, {"_id": 0}))


@production_rules_router.post("/seed-defaults")
async def seed_defaults(request: Request, user: User = Depends(require_role("super_admin"))):
    return {"status": "ok", **await seed_production_rules(request.app.state.db)}


@production_rules_router.post("/seed-legacy-print-option-costing")
async def seed_legacy_print_option_costing_route(payload: LegacyPrintOptionCostingSeedRequest, request: Request, user: User = Depends(require_role("super_admin"))):
    result = await seed_legacy_print_option_costing(
        request.app.state.db,
        dry_run=payload.dry_run,
        raw_cost_source=payload.raw_cost_source,
    )
    return {"status": "ok", **result}


@production_rules_router.post("/validate")
async def validate_product(payload: ProductionValidationRequest, request: Request, user: User = Depends(get_current_user)):
    db = request.app.state.db
    product = dict(payload.product or {})
    template = payload.template
    if not template and product.get("template_id"):
        template = await db.product_templates.find_one({"id": product.get("template_id")}, {"_id": 0})
    global_print_options = await db.print_options.find({}, {"_id": 0}).to_list(500)
    validated = await apply_production_rules(db, product, template=template, global_print_options=global_print_options, publishing=payload.publish)
    return {
        "status": validated.get("manufacturing_validation_status"),
        "production_validation": validated.get("production_validation"),
        "manufacturing_cost_breakdown": validated.get("manufacturing_cost_breakdown"),
        "minimum_selling_price": validated.get("minimum_selling_price"),
        "product": validated,
    }
