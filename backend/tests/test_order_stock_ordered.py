"""Internal stock procurement flag must never trigger buyer notifications."""
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from routes_main import InternalStockOrderedUpdate, admin_update_stock_ordered


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.mark.anyio
async def test_stock_ordered_is_internal_and_leaves_financial_status_unchanged():
    orders = MagicMock()
    orders.update_one = AsyncMock(return_value=SimpleNamespace(matched_count=1))
    db = SimpleNamespace(orders=orders)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    user = SimpleNamespace(id="admin-1", role="super_admin")

    result = await admin_update_stock_ordered(
        "order-123", InternalStockOrderedUpdate(stock_ordered=True), request, user
    )
    assert result["stock_ordered"] is True
    assert result["stock_ordered_by"] == "admin-1"
    args, _ = orders.update_one.await_args
    assert args[0]["id"] == "order-123"
    updated = args[1]["$set"]
    assert updated["stock_ordered"] is True
    assert "status" not in updated
    assert "payment_status" not in updated
    assert "updated_at" not in updated
    # The route never touches email queues or creates customer activity events.
    assert not hasattr(db, "notification_emails")
    assert not hasattr(db, "order_events")

    await admin_update_stock_ordered(
        "order-123", InternalStockOrderedUpdate(stock_ordered=False), request, user
    )
    updated = orders.update_one.await_args.args[1]["$set"]
    assert updated["stock_ordered"] is False
    assert updated["stock_ordered_at"] is None
    assert updated["stock_ordered_by"] is None


@pytest.mark.anyio
async def test_stock_ordered_requires_order_management_permission():
    orders = MagicMock()
    orders.update_one = AsyncMock()
    db = SimpleNamespace(orders=orders)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    buyer = SimpleNamespace(id="buyer-1", role="buyer")
    with pytest.raises(HTTPException) as error:
        await admin_update_stock_ordered(
            "order-123", InternalStockOrderedUpdate(stock_ordered=True), request, buyer
        )
    assert error.value.status_code == 403
    orders.update_one.assert_not_awaited()
