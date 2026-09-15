"""Final duplicate-payment guard for creator payout transfer attempts.

The launch payout module already reserves wallet rows before a batch can be sent.
This guard verifies that reservation immediately before every initial send or
failed-transfer retry. A mismatch stops the entire transfer request before any
external Paystack call is made.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException


def install_payout_retry_guard(payout_module: Any) -> None:
    original = payout_module._send_or_retry_batch

    async def guarded_send_or_retry(
        db,
        batch: dict,
        *,
        retry_failed_only: bool = False,
        allow_off_cycle_retry: bool = False,
    ) -> dict:
        # Reconcile refunds first because that operation can legitimately remove
        # ledger rows from a not-yet-paid batch.
        await payout_module._reconcile_refunded_orders(db)
        fresh = await db.payout_batches.find_one({"id": batch.get("id")}, {"_id": 0})
        if not fresh:
            raise HTTPException(status_code=404, detail="Payout batch not found")

        candidate_statuses = {"failed", "reversed"} if retry_failed_only else {
            "pending",
            "failed",
            "reversed",
        }

        for item in fresh.get("items") or []:
            if item.get("status") not in candidate_statuses:
                continue

            transaction_ids = [value for value in (item.get("wallet_transaction_ids") or []) if value]
            amount = round(float(item.get("amount") or 0), 2)
            if not transaction_ids or amount <= 0:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Payout item {item.get('id')} has no positive reserved ledger balance. "
                        "Do not retry it; reconcile the batch first."
                    ),
                )

            rows = await db.wallet_transactions.find(
                {
                    "id": {"$in": transaction_ids},
                    "status": "in_batch",
                    "payout_batch_id": fresh.get("id"),
                    "payout_batch_item_id": item.get("id"),
                },
                {"_id": 0, "id": 1, "amount": 1},
            ).to_list(len(transaction_ids) + 1)

            reserved_ids = {row.get("id") for row in rows}
            reserved_total = round(sum(float(row.get("amount") or 0) for row in rows), 2)
            if reserved_ids != set(transaction_ids) or abs(reserved_total - amount) > 0.01:
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"Payout item {item.get('id')} no longer matches its reserved ledger rows. "
                        "No transfer was submitted. Reconcile the batch before retrying."
                    ),
                )

        return await original(
            db,
            fresh,
            retry_failed_only=retry_failed_only,
            allow_off_cycle_retry=allow_off_cycle_retry,
        )

    payout_module._send_or_retry_batch = guarded_send_or_retry
