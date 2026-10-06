"""Admin create must retain route ownership after the normalization wrappers."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import routes_main as core
from product_normalization_service import SERVER_OWNED_PRODUCT_FIELDS


@pytest.mark.parametrize('field', sorted(SERVER_OWNED_PRODUCT_FIELDS))
def test_admin_save_overrides_reintroduced_server_fields(monkeypatch, field):
    payload = core.AdminProductCreate(band_id='creator-1', title='QA Mug',
                                     category='mugs', selling_price=125, print_cost=0)
    normalized = payload.model_dump()
    for owned_field in SERVER_OWNED_PRODUCT_FIELDS:
        normalized.pop(owned_field, None)
    normalized[field] = 'untrusted'
    monkeypatch.setattr(core, 'normalize_template_product_payload', AsyncMock(return_value=normalized))
    monkeypatch.setattr(core, '_require_manager_permission', lambda *args: None)
    products = SimpleNamespace(insert_one=AsyncMock())
    db = SimpleNamespace(
        creators=SimpleNamespace(find_one=AsyncMock(return_value={'id': 'creator-1'})),
        printers=SimpleNamespace(find_one=AsyncMock(return_value={'id': 'printer-1'})),
        products=products,
    )
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(db=db)))
    user = SimpleNamespace(id='admin-1', role='super_admin')
    saved = asyncio.run(core._admin_create_product_core(payload, request, user))
    assert saved.band_id == 'creator-1'
    assert saved.created_by_user_id == 'admin-1'
    assert saved.created_by_role == 'super_admin'
    assert saved.assigned_printer_id == 'printer-1'
    assert saved.slug.startswith('qa-mug-')
    assert saved.created_at != 'untrusted'
    assert saved.updated_at != 'untrusted'
    assert saved.published is False
    products.insert_one.assert_awaited_once()
