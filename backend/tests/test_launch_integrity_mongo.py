import asyncio
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import uuid

from motor.motor_asyncio import AsyncIOMotorClient

from launch_integrity.audit import ensure_audit_indexes
from launch_integrity.entitlements import (
    ensure_entitlement_indexes,
    resolve_entitlement,
    set_entitlement_override,
)
from launch_integrity.finance import ensure_finance_indexes, post_paid_order_events
from launch_integrity.finance_reversals import apply_financial_reversal
from launch_integrity.printer_ops import ensure_job_for_item, ensure_printer_ops_indexes, reassign_job

MONGO_URL = "mongodb://localhost:27017"


def _snapshot(*, subtotal=200.0, creator=80.0, printer=70.0, commission=20.0, tax=0.0, fee=4.0, shipping=10.0):
    return {
        "currency": "ZAR",
        "subtotal": subtotal,
        "creator_earnings": creator,
        "printer_liability": printer,
        "platform_gross_revenue": 60.0,
        "platform_commission_amount": commission,
        "platform_commission_rate": 0.10,
        "tax_amount": tax,
        "payment_fee_allocation": fee,
        "shipping_allocation": shipping,
        "refundable_balance": subtotal,
        "already_refunded_amount": 0.0,
        "refunded_quantity": 0,
        "payment_fee": {
            "absorbed_by": "platform",
            "refundable": False,
            "refund_treatment": "non_refundable",
        },
        "shipping": {"treatment": "manual"},
    }


def _order(order_id="order-1", quantity=2, total=200.0):
    snapshot = _snapshot(subtotal=total)
    item = {
        "id": f"{order_id}-item",
        "product_id": "product-1",
        "product_title": "Launch Tee",
        "band_id": "creator-1",
        "creator_id": "creator-1",
        "printer_id": "printer-1",
        "quantity": quantity,
        "unit_price": total / quantity,
        "band_earnings": 80.0,
        "printer_payout": 70.0,
        "commission_amount": 20.0,
        "financial_snapshot": snapshot,
        "production_snapshot": {
            "commercial_snapshot": snapshot.copy(),
            "snapshot_sha256": "immutable-order-snapshot",
            "immutable": True,
        },
    }
    return {
        "id": order_id,
        "order_number": order_id.upper(),
        "payment_id": f"payment-{order_id}",
        "payment_status": "paid",
        "status": "sent_to_printer",
        "subtotal": total,
        "shipping_total": 0.0,
        "total": total,
        "refunded_total": 0.0,
        "financial_snapshot": {"currency": "ZAR", "snapshot_sha256": f"sha-{order_id}"},
        "items": [item],
    }


async def _run_mongo_integrity_scenario():
    client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=5000)
    await client.admin.command("ping")
    db_name = f"fandomforge_integrity_{uuid.uuid4().hex}"
    db = client[db_name]
    try:
        await ensure_audit_indexes(db)
        await ensure_finance_indexes(db)
        await ensure_entitlement_indexes(db)
        await ensure_printer_ops_indexes(db)
        await db.settings.insert_one({
            "id": "platform",
            "modules": {
                "creators_enabled": True,
                "printers_enabled": True,
                "product_templates_enabled": True,
                "public_shop_enabled": True,
                "payouts_enabled": True,
            },
            "launch_integrity": {
                "financial_rules": {
                    "currency": "ZAR",
                    "shipping_refund_treatment": "manual",
                    "gateway_fee_refund_treatment": "non_refundable",
                }
            },
        })

        # Paid event creation and webhook replay are idempotent.
        order = _order()
        await db.orders.insert_one(order)
        first = await post_paid_order_events(db, order)
        second = await post_paid_order_events(db, order)
        assert first["created"] > 0
        assert second["created"] == 0
        assert await db.wallet_transactions.count_documents({"order_id": order["id"]}) == first["created"]
        assert await db.commissions.count_documents({"order_id": order["id"]}) == 1
        assert await db.payouts.count_documents({"order_id": order["id"]}) == 1

        # Partial quantity refund preserves the unpaid positive remainder.
        partial = await apply_financial_reversal(
            db,
            order_id=order["id"],
            event_type="refund",
            idempotency_key="refund-order-1-half",
            lines=[{"order_item_id": order["items"][0]["id"], "quantity": 1}],
            actor=SimpleNamespace(id="admin-1", role="admin"),
            reason="One item returned",
        )
        assert partial["amount"] == 100.0
        creator_events = await db.wallet_transactions.find({
            "order_id": order["id"], "owner_type": "creator", "owner_id": "creator-1"
        }, {"_id": 0}).to_list(20)
        available_creator_balance = round(sum(float(row["amount"]) for row in creator_events if row["status"] == "available"), 2)
        assert available_creator_balance == 40.0
        repeated = await apply_financial_reversal(
            db,
            order_id=order["id"],
            event_type="refund",
            idempotency_key="refund-order-1-half",
            lines=[{"order_item_id": order["items"][0]["id"], "quantity": 1}],
            reason="Webhook replay",
        )
        assert repeated["already_exists"] is True
        assert await db.financial_adjustments.count_documents({"idempotency_key": "refund-order-1-half"}) == 1

        # The second quantity closes the remaining Creator balance without duplication.
        await apply_financial_reversal(
            db,
            order_id=order["id"],
            event_type="refund",
            idempotency_key="refund-order-1-rest",
            lines=[{"order_item_id": order["items"][0]["id"], "quantity": 1}],
            reason="Second item returned",
        )
        creator_events = await db.wallet_transactions.find({
            "order_id": order["id"], "owner_type": "creator", "owner_id": "creator-1"
        }, {"_id": 0}).to_list(20)
        assert round(sum(float(row["amount"]) for row in creator_events if row["status"] == "available"), 2) == 0.0
        closed_order = await db.orders.find_one({"id": order["id"]}, {"_id": 0})
        assert closed_order["payment_status"] == "refunded"

        # A refund before transfer releases the exact row from its payout batch.
        batch_order = _order("order-batch", quantity=2, total=200.0)
        await db.orders.insert_one(batch_order)
        await post_paid_order_events(db, batch_order)
        creator_source = await db.wallet_transactions.find_one({
            "order_id": batch_order["id"], "event_type": "creator_earning"
        }, {"_id": 0})
        await db.wallet_transactions.update_one({"id": creator_source["id"]}, {"$set": {
            "status": "in_batch", "payout_batch_id": "batch-1", "payout_batch_item_id": "batch-item-1"
        }})
        await db.payout_batches.insert_one({
            "id": "batch-1",
            "status": "draft",
            "items": [{
                "id": "batch-item-1",
                "owner_id": "creator-1",
                "amount": creator_source["amount"],
                "status": "pending",
                "wallet_transaction_ids": [creator_source["id"]],
            }],
            "total_amount": creator_source["amount"],
        })
        await apply_financial_reversal(
            db,
            order_id=batch_order["id"],
            event_type="refund",
            idempotency_key="refund-batch-half",
            lines=[{"order_item_id": batch_order["items"][0]["id"], "quantity": 1}],
            reason="Refund before Friday send",
        )
        released = await db.wallet_transactions.find_one({"id": creator_source["id"]}, {"_id": 0})
        batch = await db.payout_batches.find_one({"id": "batch-1"}, {"_id": 0})
        assert released["status"] == "available"
        assert released.get("payout_batch_id") is None
        assert creator_source["id"] not in batch["items"][0]["wallet_transaction_ids"]

        # Refund after payout creates a negative available adjustment.
        paid_order = _order("order-paid", quantity=1, total=100.0)
        paid_order["items"][0]["financial_snapshot"] = _snapshot(subtotal=100.0, creator=40.0, printer=35.0, commission=10.0, fee=2.0, shipping=0.0)
        paid_order["items"][0]["production_snapshot"]["commercial_snapshot"] = paid_order["items"][0]["financial_snapshot"].copy()
        await db.orders.insert_one(paid_order)
        await post_paid_order_events(db, paid_order)
        await db.wallet_transactions.update_many(
            {"order_id": paid_order["id"], "owner_type": {"$in": ["creator", "printer"]}},
            {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
        )
        await apply_financial_reversal(
            db,
            order_id=paid_order["id"],
            event_type="chargeback",
            idempotency_key="chargeback-paid-order",
            actor=SimpleNamespace(id="provider", role="provider"),
            provider="paystack",
            reason="Provider dispute",
        )
        negative_creator = await db.wallet_transactions.find_one({
            "order_id": paid_order["id"],
            "owner_type": "creator",
            "original_event_reference": {"$ne": None},
            "status": "available",
        }, {"_id": 0})
        assert negative_creator and negative_creator["amount"] < 0

        # Platform module and plan limit enforcement are separate and auditable.
        await db.subscription_plans.insert_one({
            "id": "creator-free",
            "name": "Creator Free",
            "audience": "creator",
            "status": "active",
            "entitlements": {"product_publish": True, "max_products": 1},
            "limits": {"max_products": 1},
        })
        await db.account_subscriptions.insert_one({
            "id": "sub-creator-1",
            "owner_type": "creator",
            "owner_id": "creator-1",
            "plan_id": "creator-free",
            "status": "free",
        })
        await db.products.insert_one({"id": "existing-product", "band_id": "creator-1", "status": "published"})
        limit = await resolve_entitlement(db, "creator", "creator-1", "max_products")
        assert limit.allowed is False and limit.reason_code == "plan_limit_reached"
        await set_entitlement_override(
            db,
            owner_type="creator",
            owner_id="creator-1",
            feature_key="max_products",
            value=3,
            actor=SimpleNamespace(id="owner-1", role="owner"),
            reason="Temporary launch allowance",
            expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
        )
        assert (await resolve_entitlement(db, "creator", "creator-1", "max_products")).allowed is True
        await db.settings.update_one({"id": "platform"}, {"$set": {"modules.creators_enabled": False}})
        disabled = await resolve_entitlement(db, "creator", "creator-1", "product_publish")
        assert disabled.allowed is False and disabled.reason_code == "platform_module_disabled"
        await db.settings.update_one({"id": "platform"}, {"$set": {"modules.creators_enabled": True}})

        # Production job records retain the immutable production payload and assignment history.
        await db.printers.insert_many([
            {"id": "printer-1", "user_id": "printer-user-1", "company_name": "Printer One", "status": "active"},
            {"id": "printer-2", "user_id": "printer-user-2", "company_name": "Printer Two", "status": "active"},
        ])
        await db.creators.insert_one({"id": "creator-1", "user_id": "creator-user-1", "name": "Creator One"})
        job = await ensure_job_for_item(
            db,
            order=paid_order,
            item=paid_order["items"][0],
            printer_id="printer-1",
            actor=SimpleNamespace(id="owner-1", role="owner"),
            reason="Initial assignment",
        )
        assert job["production"]["immutable_order_snapshot"] is True
        assert job["printer_liability_event_id"]
        reassigned = await reassign_job(
            db,
            job,
            "printer-2",
            SimpleNamespace(id="admin-1", role="admin"),
            "Printer One rejected the job",
        )
        assert reassigned["printer_id"] == "printer-2"
        assert reassigned["assignment_history"][0]["from_printer_id"] == "printer-1"
        assert await db.audit_events.count_documents({}) > 0
    finally:
        await client.drop_database(db_name)
        client.close()


def test_launch_integrity_against_disposable_mongo():
    asyncio.run(_run_mongo_integrity_scenario())
