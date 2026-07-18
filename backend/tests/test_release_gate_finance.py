import asyncio
from copy import deepcopy
from types import SimpleNamespace
import uuid

from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorClient

from launch_integrity.audit import ensure_audit_indexes
from launch_integrity.finance import ensure_finance_indexes, record_provider_fee_actual
from launch_integrity.financial_gate_routes import (
    block_historical_wallet_rebuild,
    block_legacy_payout_mark_paid,
)

MONGO_URL = "mongodb://localhost:27017"


class RequestStub:
    def __init__(self, db):
        self.app = SimpleNamespace(state=SimpleNamespace(db=db))
        self.headers = {"x-correlation-id": "release-gate-test"}


async def _run_release_gate_scenario():
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    db_name = f"fandomforge_release_gate_{uuid.uuid4().hex}"
    db = client[db_name]
    try:
        await ensure_audit_indexes(db)
        await ensure_finance_indexes(db)
        owner = SimpleNamespace(id="owner-release-gate", role="owner")
        request = RequestStub(db)

        wallet_doc = {
            "id": "wallet-existing",
            "idempotency_key": "existing-wallet-key",
            "event_type": "creator_earning",
            "owner_type": "creator",
            "owner_id": "creator-1",
            "amount": 100.0,
            "status": "available",
        }
        payout_doc = {
            "id": "legacy-payout-1",
            "order_id": "order-legacy",
            "printer_id": "printer-1",
            "amount": 50.0,
            "status": "due",
        }
        await db.wallet_transactions.insert_one(deepcopy(wallet_doc))
        await db.payouts.insert_one(deepcopy(payout_doc))

        try:
            await block_historical_wallet_rebuild(request=request, user=owner)
            raise AssertionError("Legacy wallet rebuild did not block")
        except HTTPException as exc:
            assert exc.status_code == 410
            assert exc.detail["mutation_applied"] is False
            assert exc.detail["code"] == "legacy_financial_mutation_disabled"

        try:
            await block_legacy_payout_mark_paid(
                payout_id="legacy-payout-1",
                request=request,
                user=owner,
            )
            raise AssertionError("Legacy payout mark-paid did not block")
        except HTTPException as exc:
            assert exc.status_code == 409
            assert exc.detail["mutation_applied"] is False
            assert exc.detail["code"] == "legacy_financial_mutation_disabled"

        wallet_after = await db.wallet_transactions.find_one({"id": "wallet-existing"}, {"_id": 0})
        payout_after = await db.payouts.find_one({"id": "legacy-payout-1"}, {"_id": 0})
        assert wallet_after == wallet_doc
        assert payout_after == payout_doc
        assert await db.wallet_transactions.count_documents({}) == 1
        assert await db.payouts.count_documents({}) == 1
        assert await db.audit_events.count_documents({
            "action": {"$in": [
                "finance.legacy_wallet_rebuild_blocked",
                "finance.legacy_payout_mark_paid_blocked",
            ]}
        }) == 2

        immutable_order = {
            "id": "order-provider-fee",
            "order_number": "ORDER-PROVIDER-FEE",
            "total": 287.50,
            "currency": "ZAR",
            "financial_snapshot": {
                "snapshot_contract_version": "order_finance_v1",
                "customer_total": 287.50,
                "snapshot_sha256": "immutable-finance-snapshot",
            },
            "items": [{
                "id": "order-provider-fee-item",
                "creator_id": "creator-1",
                "printer_id": "printer-1",
                "financial_snapshot": {
                    "customer_unit_total": 237.50,
                    "creator_earnings": 82.00,
                    "printer_liability": 125.00,
                    "allocation_sha256": "immutable-item-allocation",
                },
            }],
        }
        payment = {
            "id": "payment-provider-fee",
            "order_id": immutable_order["id"],
            "provider": "paystack",
            "estimated_provider_fee": 4.00,
        }
        await db.orders.insert_one(deepcopy(immutable_order))
        await db.payments.insert_one(deepcopy(payment))

        first = await record_provider_fee_actual(db, payment, 6.25)
        second = await record_provider_fee_actual(db, payment, 6.25)
        stable_fields = ("actual_provider_fee", "estimated_provider_fee", "provider_fee_variance")
        assert {key: first[key] for key in stable_fields} == {
            key: second[key] for key in stable_fields
        }
        assert first["provider_fee_recorded_at"]
        assert second["provider_fee_recorded_at"]
        assert first["actual_provider_fee"] == 6.25
        assert first["estimated_provider_fee"] == 4.00
        assert first["provider_fee_variance"] == 2.25

        stored_payment = await db.payments.find_one({"id": payment["id"]}, {"_id": 0})
        assert stored_payment["provider_fee_variance"] == 2.25
        events = await db.wallet_transactions.find({
            "event_type": "payment_fee_variance",
            "payment_id": payment["id"],
        }, {"_id": 0}).to_list(10)
        assert len(events) == 1
        assert events[0]["owner_type"] == "platform"
        assert events[0]["owner_id"] == "platform"
        assert events[0]["amount"] == -2.25
        assert events[0]["idempotency_key"] == "provider-fee-variance:payment-provider-fee:6.25"

        order_after = await db.orders.find_one({"id": immutable_order["id"]}, {"_id": 0})
        assert order_after == immutable_order
        assert order_after["total"] == 287.50
        assert order_after["financial_snapshot"]["customer_total"] == 287.50
        assert order_after["items"][0]["financial_snapshot"]["creator_earnings"] == 82.00
        assert order_after["items"][0]["financial_snapshot"]["printer_liability"] == 125.00
        assert order_after["items"][0]["financial_snapshot"]["allocation_sha256"] == "immutable-item-allocation"
    finally:
        await client.drop_database(db_name)
        client.close()


def test_final_financial_release_gate_against_disposable_mongo():
    asyncio.run(_run_release_gate_scenario())
