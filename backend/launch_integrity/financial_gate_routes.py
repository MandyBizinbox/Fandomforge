"""Release-gate overrides for unsafe legacy financial mutation endpoints.

These routes are registered before the legacy admin router. They intentionally do
not rebuild historic wallet events or mark compatibility payouts paid. Current
financial state may be changed only by the authoritative payment, refund,
chargeback and approved payout-batch services.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from auth import get_current_user
from models import User

from .audit import write_audit_event
from .permissions import require_manager_permission

financial_gate_router = APIRouter(tags=["launch-integrity-financial-gate"])


async def _record_blocked_attempt(
    request: Request,
    user: User,
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    reason: str,
) -> None:
    require_manager_permission(user, "manage_payouts")
    await write_audit_event(
        request.app.state.db,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        actor=user,
        before=None,
        after={"mutation_applied": False, "blocked_by": "launch_integrity_release_gate"},
        reason=reason,
        request=request,
        metadata={"legacy_path_disabled": True},
    )


@financial_gate_router.post("/admin/wallet-ledger/rebuild")
async def block_historical_wallet_rebuild(
    request: Request,
    user: User = Depends(get_current_user),
):
    """Disable historical replay into the authoritative wallet ledger."""
    reason = (
        "Historical wallet-ledger rebuild is disabled. New paid-order events are "
        "posted idempotently by the authoritative financial service; historic "
        "records remain preserved and must be reconciled read-only."
    )
    await _record_blocked_attempt(
        request,
        user,
        action="finance.legacy_wallet_rebuild_blocked",
        entity_type="wallet_ledger",
        entity_id="authoritative",
        reason=reason,
    )
    raise HTTPException(
        status_code=410,
        detail={
            "code": "legacy_financial_mutation_disabled",
            "path": "/admin/wallet-ledger/rebuild",
            "mutation_applied": False,
            "authoritative_service": "wallet_transactions / paid-order financial events",
            "message": reason,
        },
    )


@financial_gate_router.patch("/admin/payouts/{payout_id}/paid")
async def block_legacy_payout_mark_paid(
    payout_id: str,
    request: Request,
    user: User = Depends(get_current_user),
):
    """Prevent a compatibility payout row from bypassing payout-batch controls."""
    reason = (
        "Direct legacy payout mark-paid is disabled. Use the approved Friday "
        "payout-batch send, provider webhook and reconciliation services."
    )
    await _record_blocked_attempt(
        request,
        user,
        action="finance.legacy_payout_mark_paid_blocked",
        entity_type="legacy_payout",
        entity_id=payout_id,
        reason=reason,
    )
    raise HTTPException(
        status_code=409,
        detail={
            "code": "legacy_financial_mutation_disabled",
            "path": f"/admin/payouts/{payout_id}/paid",
            "mutation_applied": False,
            "authoritative_service": "approved payout batches and provider reconciliation",
            "message": reason,
        },
    )
