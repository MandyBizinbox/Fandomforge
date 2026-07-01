"""Production operation routes for launch-ready V1 costing."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Dict, List, Literal, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field, field_validator

from auth import get_current_user, require_role
from models import User, uid
from seed_production_operations import ACTIVE_V1_METHOD_KEYS, normalize_method_key, seed_production_operations

production_operations_router = APIRouter(prefix="/production-operations")

OperationType = Literal["heat_press", "application", "weeding", "cutting", "machine_time", "setup"]
CostBasis = Literal["per_operation", "per_print_area", "per_application", "per_element", "per_minute", "per_job", "per_cm2"]


def now() -> datetime:
    return datetime.now(timezone.utc)


def clean(doc: Optional[dict]) -> dict:
    out = dict(doc or {})
    out.pop("_id", None)
    return out


def slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in str(value or ""))
    return "-".join(part for part in cleaned.split("-") if part) or uid()[:8]


class ProductionOperationBase(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str
    operation_type: OperationType
    applies_to_method: List[str] = Field(default_factory=list)
    cost_basis: CostBasis
    cost: float = 0
    estimated_time: float = 0
    default_quantity: float = 1
    active: bool = True
    notes: Optional[str] = ""

    @field_validator("applies_to_method", mode="before")
    @classmethod
    def methods(cls, value: Any) -> List[str]:
        raw_values = [value] if isinstance(value, str) else list(value or [])
        normalized: List[str] = []
        for raw in raw_values:
            method = normalize_method_key(raw)
            if method and method not in normalized:
                normalized.append(method)
        return normalized


class ProductionOperationCreate(ProductionOperationBase):
    slug: Optional[str] = None


class ProductionOperationUpdate(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: Optional[str] = None
    operation_type: Optional[OperationType] = None
    applies_to_method: Optional[List[str]] = None
    cost_basis: Optional[CostBasis] = None
    cost: Optional[float] = None
    estimated_time: Optional[float] = None
    default_quantity: Optional[float] = None
    active: Optional[bool] = None
    notes: Optional[str] = None
    slug: Optional[str] = None

    @field_validator("applies_to_method", mode="before")
    @classmethod
    def methods(cls, value: Any) -> Optional[List[str]]:
        if value is None:
            return None
        raw_values = [value] if isinstance(value, str) else list(value or [])
        normalized: List[str] = []
        for raw in raw_values:
            method = normalize_method_key(raw)
            if method and method not in normalized:
                normalized.append(method)
        return normalized


class ProductionOperation(ProductionOperationBase):
    id: str = Field(default_factory=uid)
    slug: str
    created_at: datetime = Field(default_factory=now)
    updated_at: datetime = Field(default_factory=now)


class ProductionEstimateItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    print_area_id: Optional[str] = None
    method_key: Optional[str] = None
    manufacturing_method_id: Optional[str] = None
    print_method: Optional[str] = None
    operation_quantity: Optional[float] = None
    area_cm2: Optional[float] = None


class ProductionEstimateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    method_key: Optional[str] = None
    quantity: int = 1
    print_areas: List[ProductionEstimateItem] = Field(default_factory=list)
    artworks: List[ProductionEstimateItem] = Field(default_factory=list)


def normalize_payload(data: Dict[str, Any], existing: Optional[dict] = None) -> Dict[str, Any]:
    merged = dict(existing or {})
    merged.update(dict(data or {}))
    merged["name"] = str(merged.get("name") or "").strip()
    if not merged["name"]:
        raise HTTPException(status_code=400, detail="Production operation name is required")

    methods = []
    for method in merged.get("applies_to_method") or []:
        normalized = normalize_method_key(method)
        if normalized and normalized not in methods:
            methods.append(normalized)
    if not methods:
        raise HTTPException(status_code=400, detail="At least one active V1 method is required")
    if any(method not in ACTIVE_V1_METHOD_KEYS for method in methods):
        raise HTTPException(status_code=400, detail="Only active V1 methods are allowed for launch operations")
    merged["applies_to_method"] = methods

    for key in ("cost", "estimated_time", "default_quantity"):
        merged[key] = max(float(merged.get(key) or 0), 0)
    if not merged["default_quantity"]:
        merged["default_quantity"] = 1

    merged["notes"] = str(merged.get("notes") or "").strip()
    merged["active"] = bool(merged.get("active", True))
    merged["slug"] = slugify(merged.get("slug") or f"{methods[0]} {merged['name']}")
    return merged


async def get_or_404(db, operation_id: str) -> dict:
    doc = await db.production_operations.find_one({"id": operation_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Production operation not found")
    return doc


def item_method(item: ProductionEstimateItem, fallback: Optional[str]) -> str:
    return normalize_method_key(item.method_key or item.manufacturing_method_id or item.print_method or fallback)


def calc_line(operation: dict, method_key: str, quantity: int, item: Optional[ProductionEstimateItem]) -> dict:
    cost_basis = operation.get("cost_basis") or "per_operation"
    unit_cost = float(operation.get("cost") or 0)
    default_qty = float(operation.get("default_quantity") or 1)
    item_qty = float((item.operation_quantity if item else None) or default_qty or 1)
    minutes = float(operation.get("estimated_time") or 0)
    area_cm2 = float((item.area_cm2 if item else None) or 0)

    if cost_basis == "per_minute":
        charge_qty = minutes * item_qty * quantity
    elif cost_basis == "per_cm2":
        charge_qty = area_cm2 * item_qty * quantity
    else:
        charge_qty = item_qty * quantity

    return {
        "operation_id": operation.get("id"),
        "operation_name": operation.get("name"),
        "operation_type": operation.get("operation_type"),
        "cost_basis": cost_basis,
        "method_key": method_key,
        "print_area_id": item.print_area_id if item else None,
        "unit_cost": round(unit_cost, 4),
        "quantity": round(charge_qty, 4),
        "estimated_time": round(minutes * item_qty * quantity, 4),
        "total_cost": round(unit_cost * charge_qty, 4),
        "notes": operation.get("notes") or "",
    }


@production_operations_router.get("", response_model=List[ProductionOperation])
async def list_operations(request: Request, method: Optional[str] = None, method_key: Optional[str] = None, operation_type: Optional[str] = None, active: Optional[bool] = None, user: User = Depends(get_current_user)):
    db = request.app.state.db
    q: Dict[str, Any] = {}
    selected_method = normalize_method_key(method_key or method)
    if selected_method:
        q["applies_to_method"] = selected_method
    if operation_type:
        q["operation_type"] = operation_type
    if active is not None:
        q["active"] = active
    docs = await db.production_operations.find(q, {"_id": 0}).sort("name", 1).to_list(500)
    return [ProductionOperation(**clean(doc)) for doc in docs]


@production_operations_router.get("/{operation_id}", response_model=ProductionOperation)
async def get_operation(operation_id: str, request: Request, user: User = Depends(get_current_user)):
    return ProductionOperation(**clean(await get_or_404(request.app.state.db, operation_id)))


@production_operations_router.post("", response_model=ProductionOperation)
async def create_operation(payload: ProductionOperationCreate, request: Request, user: User = Depends(require_role("super_admin"))):
    db = request.app.state.db
    data = normalize_payload(payload.model_dump())
    if await db.production_operations.find_one({"slug": data["slug"]}, {"_id": 0}):
        raise HTTPException(status_code=400, detail="Production operation already exists")
    operation = ProductionOperation(**data, created_at=now(), updated_at=now())
    await db.production_operations.insert_one(operation.model_dump(mode="json"))
    return operation


@production_operations_router.patch("/{operation_id}", response_model=ProductionOperation)
async def update_operation(operation_id: str, payload: ProductionOperationUpdate, request: Request, user: User = Depends(require_role("super_admin"))):
    db = request.app.state.db
    existing = await get_or_404(db, operation_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="Nothing to update")
    data = normalize_payload(updates, existing)
    data["updated_at"] = now().isoformat()
    await db.production_operations.update_one({"id": operation_id}, {"$set": data})
    return ProductionOperation(**clean(await get_or_404(db, operation_id)))


@production_operations_router.delete("/{operation_id}")
async def delete_operation(operation_id: str, request: Request, force: bool = False, user: User = Depends(require_role("super_admin"))):
    db = request.app.state.db
    await get_or_404(db, operation_id)
    if force:
        await db.production_operations.delete_one({"id": operation_id})
        return {"status": "deleted"}
    await db.production_operations.update_one({"id": operation_id}, {"$set": {"active": False, "updated_at": now().isoformat()}})
    return {"status": "inactive"}


@production_operations_router.post("/seed-defaults")
async def seed_defaults(request: Request, user: User = Depends(require_role("super_admin"))):
    return {"status": "ok", **await seed_production_operations(request.app.state.db)}


@production_operations_router.post("/estimate")
async def estimate_operations(payload: ProductionEstimateRequest, request: Request, user: User = Depends(get_current_user)):
    db = request.app.state.db
    quantity = max(int(payload.quantity or 1), 1)
    items = list(payload.artworks or []) + list(payload.print_areas or [])
    method_keys: List[str] = []
    for item in items:
        method = item_method(item, payload.method_key)
        if method and method not in method_keys:
            method_keys.append(method)
    fallback_method = normalize_method_key(payload.method_key)
    if fallback_method and fallback_method not in method_keys:
        method_keys.append(fallback_method)

    lines: List[dict] = []
    for method in method_keys:
        if method not in ACTIVE_V1_METHOD_KEYS:
            continue
        operations = await db.production_operations.find({"applies_to_method": method, "active": True}, {"_id": 0}).to_list(100)
        method_items = [item for item in items if item_method(item, payload.method_key) == method] or [ProductionEstimateItem(method_key=method)]
        for operation in operations:
            if operation.get("cost_basis") == "per_job":
                lines.append(calc_line(operation, method, quantity, ProductionEstimateItem(method_key=method)))
            else:
                lines.extend(calc_line(operation, method, quantity, item) for item in method_items)

    return {
        "lines": lines,
        "total_operation_cost": round(sum(line["total_cost"] for line in lines), 4),
        "total_estimated_time": round(sum(line["estimated_time"] for line in lines), 4),
        "method_keys": method_keys,
    }
