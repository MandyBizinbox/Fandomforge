"""Admin API for outsourced production-rate dry runs and batch updates."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict

from auth import require_role
from models import User
from outsourced_production_rates import (
    batch_update_outsourced_rates,
    rate_catalog,
)


outsourced_rates_router = APIRouter(prefix="/production-rules/outsourced-rates")


class OutsourcedRateBatchRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    dry_run: bool = True
    strict: bool = True


@outsourced_rates_router.get("/catalog")
async def get_outsourced_rate_catalog(
    user: User = Depends(require_role("super_admin")),
):
    return {"rates": rate_catalog()}


@outsourced_rates_router.post("/batch")
async def apply_outsourced_rate_batch(
    payload: OutsourcedRateBatchRequest,
    request: Request,
    user: User = Depends(require_role("super_admin")),
):
    try:
        result = await batch_update_outsourced_rates(
            request.app.state.db,
            dry_run=payload.dry_run,
            strict=payload.strict,
        )
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"status": "ok", **result}
