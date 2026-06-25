"""FandomForge backend integration tests.

Covers: auth, creators, products, categories, artworks, subscription,
checkout + mock-complete, creator/printer/admin order visibility,
printer order updates, admin operations, role-based access.
"""
from __future__ import annotations
import io
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://forge-store-3.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@fandomforge.com", "password": "Admin123!"}
CREATOR = {"email": "neon@fandomforge.com", "password": "Band123!"}
PRINTER = {"email": "ink@fandomforge.com", "password": "Printer123!"}
BUYER = {"email": "fan@fandomforge.com", "password": "Fan123!"}


# ---------- Fixtures ----------
@pytest.fixture(scope="session")
def s():
    return requests.Session()


def _login(s, creds):
    r = s.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def admin_token(s):
    return _login(s, ADMIN)


@pytest.fixture(scope="session")
def band_token(s):
    return _login(s, CREATOR)


@pytest.fixture(scope="session")
def printer_token(s):
    return _login(s, PRINTER)


@pytest.fixture(scope="session")
def buyer_token(s):
    return _login(s, BUYER)


def H(token):
    return {"Authorization": f"Bearer {token}"}


# ---------- Health / auth ----------
def test_health(s):
    r = s.get(f"{API}/health", timeout=10)
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_auth_me(s, band_token):
    r = s.get(f"{API}/auth/me", headers=H(band_token), timeout=10)
    assert r.status_code == 200
    assert r.json()["email"] == CREATOR["email"]
    assert r.json()["role"] == "creator"


def test_login_invalid(s):
    r = s.post(f"{API}/auth/login", json={"email": "x@x.com", "password": "bad"}, timeout=10)
    assert r.status_code in (400, 401)


def test_register_and_me(s):
    import uuid as _u
    email = f"test_{_u.uuid4().hex[:8]}@example.com"
    r = s.post(f"{API}/auth/register", json={"email": email, "password": "Pass1234!", "name": "Tester"}, timeout=15)
    assert r.status_code in (200, 201), r.text
    tok = r.json().get("access_token")
    assert tok
    me = s.get(f"{API}/auth/me", headers=H(tok)).json()
    assert me["email"] == email


# ---------- Public ----------
def test_public_bands(s):
    r = s.get(f"{API}/creators")
    assert r.status_code == 200
    creators = r.json()
    assert len(creators) >= 3
    assert all(b["status"] == "active" for b in creators)


def test_band_by_slug(s):
    r = s.get(f"{API}/creators/slug/neon-graves")
    assert r.status_code == 200
    assert r.json()["slug"] == "neon-graves"


def test_public_products(s):
    r = s.get(f"{API}/products")
    assert r.status_code == 200
    prods = r.json()
    assert len(prods) >= 10
    pytest.first_product_id = prods[0]["id"]
    pytest.first_product_band_id = prods[0]["band_id"]


def test_product_detail(s):
    r = s.get(f"{API}/products/{pytest.first_product_id}")
    assert r.status_code == 200
    assert r.json()["id"] == pytest.first_product_id


def test_band_products(s):
    r = s.get(f"{API}/creators/{pytest.first_product_band_id}/products")
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_categories(s):
    r = s.get(f"{API}/categories")
    assert r.status_code == 200
    assert len(r.json()) >= 6


# ---------- Creator workflow ----------
def test_band_me(s, band_token):
    r = s.get(f"{API}/creators/me", headers=H(band_token))
    assert r.status_code == 200
    pytest.band_id = r.json()["id"]
    pytest.band_slug = r.json()["slug"]


def test_products_mine(s, band_token):
    r = s.get(f"{API}/products/mine", headers=H(band_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_and_update_product(s, band_token):
    payload = {
        "title": "TEST_ProductE2E",
        "description": "pytest product",
        "category": "tshirt",
        "selling_price": 30.0,
        "print_cost": 10.0,
        "mockup_images": ["https://example.com/x.png"],
    }
    r = s.post(f"{API}/products", json=payload, headers=H(band_token))
    assert r.status_code == 200, r.text
    prod = r.json()
    assert prod["title"] == payload["title"]
    assert prod["band_id"] == pytest.band_id
    assert not prod["published"]
    assert len(prod["variations"]) == 3
    pytest.new_product_id = prod["id"]

    # PATCH update
    r = s.patch(f"{API}/products/{pytest.new_product_id}", json={"description": "updated"}, headers=H(band_token))
    assert r.status_code == 200
    assert r.json()["description"] == "updated"

    # Publish without approved artwork should fail
    r = s.patch(f"{API}/products/{pytest.new_product_id}", json={"published": True}, headers=H(band_token))
    assert r.status_code == 400


# ---------- Artwork upload & approval ----------
def test_artwork_upload(s, band_token):
    # minimal valid PNG bytes (1x1)
    png = (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\x00"
        b"\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )
    files = {"file": ("art.png", io.BytesIO(png), "image/png")}
    data = {"product_id": pytest.new_product_id, "placement": "front", "notes": "t", "dpi": "300"}
    r = s.post(
        f"{API}/artworks/upload",
        data=data,
        files=files,
        headers={"Authorization": f"Bearer {band_token}"},
    )
    assert r.status_code == 200, r.text
    j = r.json()
    assert j["status"] == "pending"
    pytest.artwork_id = j["id"]

    r = s.get(f"{API}/artworks/product/{pytest.new_product_id}", headers=H(band_token))
    assert r.status_code == 200
    assert any(a["id"] == pytest.artwork_id for a in r.json())


def test_artwork_approval_by_admin(s, admin_token):
    r = s.patch(
        f"{API}/artworks/{pytest.artwork_id}/status",
        params={"status": "approved"},
        headers=H(admin_token),
    )
    assert r.status_code == 200
    assert r.json()["status"] == "approved"


def test_publish_after_approval(s, band_token):
    r = s.patch(
        f"{API}/products/{pytest.new_product_id}",
        json={"published": True},
        headers=H(band_token),
    )
    assert r.status_code == 200, r.text
    assert r.json()["published"] is True


# ---------- Subscription ----------
def test_subscribe(s, band_token):
    r = s.post(f"{API}/payments/subscribe", headers=H(band_token))
    assert r.status_code == 200
    assert r.json()["status"] == "active"


# ---------- Checkout / orders ----------
def test_checkout_and_mock_complete(s):
    # use any seeded published product
    prods = s.get(f"{API}/products").json()
    p = prods[0]
    var = p["variations"][0]
    payload = {
        "items": [{
            "product_id": p["id"],
            "product_title": p["title"],
            "band_id": p["band_id"],
            "variation_id": var["id"],
            "size": var.get("size", "M"),
            "color": var.get("color", "Black"),
            "unit_price": p["selling_price"],
            "quantity": 1,
        }],
        "shipping_address": {
            "full_name": "Test Buyer",
            "email": "buyer_test@example.com",
            "phone": "0123456789",
            "line1": "1 Test St",
            "city": "Cape Town",
            "postal_code": "8001",
            "country": "ZA",
        },
        "payment_provider": "mock",
    }
    r = s.post(f"{API}/orders/checkout", json=payload)
    assert r.status_code == 200, r.text
    j = r.json()
    assert "order_id" in j and "payment_url" in j
    pytest.order_id = j["order_id"]

    r = s.post(f"{API}/orders/{pytest.order_id}/mock-complete")
    assert r.status_code == 200, r.text
    o = r.json()
    assert o["payment_status"] == "paid"
    assert o["status"] == "sent_to_printer"
    pytest.order_item_id = o["items"][0]["id"]
    pytest.order_band_id = o["items"][0]["band_id"]
    pytest.order_printer_id = o["items"][0].get("printer_id")


# ---------- Order visibility ----------
def test_band_orders_visibility(s, band_token):
    r = s.get(f"{API}/orders/creator", headers=H(band_token))
    assert r.status_code == 200


def test_admin_orders(s, admin_token):
    r = s.get(f"{API}/admin/orders", headers=H(admin_token))
    assert r.status_code == 200
    ids = [o["id"] for o in r.json()]
    assert pytest.order_id in ids


def test_printer_my_orders(s):
    # find printer who owns the order's printer_id
    if not pytest.order_printer_id:
        pytest.skip("order has no printer")
    for creds in [
        {"email": "ink@fandomforge.com", "password": "Printer123!"},
        {"email": "pressworks@fandomforge.com", "password": "Printer123!"},
        {"email": "totem@fandomforge.com", "password": "Printer123!"},
    ]:
        tok = _login(s, creds)
        r = s.get(f"{API}/printers/me/orders", headers=H(tok))
        assert r.status_code == 200
        if any(o["id"] == pytest.order_id for o in r.json()):
            pytest.owning_printer_token = tok
            return
    pytest.fail("No printer saw the order")


def test_printer_update_order_status(s):
    tok = pytest.owning_printer_token
    payload = {
        "item_id": pytest.order_item_id,
        "item_production_status": "in_production",
        "tracking_number": "TRK12345",
    }
    r = s.patch(f"{API}/orders/{pytest.order_id}/status", json=payload, headers=H(tok))
    assert r.status_code == 200, r.text
    item = next(i for i in r.json()["items"] if i["id"] == pytest.order_item_id)
    assert item.get("production_status") == "in_production"
    assert item.get("tracking_number") == "TRK12345"


# ---------- Admin ----------
def test_admin_stats(s, admin_token):
    r = s.get(f"{API}/admin/stats", headers=H(admin_token))
    assert r.status_code == 200
    j = r.json()
    for k in ("creators", "printers", "products", "orders_total", "orders_paid", "commission_revenue"):
        assert k in j


def test_admin_bands_list(s, admin_token):
    r = s.get(f"{API}/admin/creators", headers=H(admin_token))
    assert r.status_code == 200
    assert any(b["id"] == pytest.band_id for b in r.json())


def test_admin_band_status_and_commission(s, admin_token):
    r = s.patch(
        f"{API}/admin/creators/{pytest.band_id}/status",
        params={"status": "active"}, headers=H(admin_token)
    )
    assert r.status_code == 200
    r = s.patch(
        f"{API}/admin/creators/{pytest.band_id}/commission",
        params={"rate": 0.15}, headers=H(admin_token)
    )
    assert r.status_code == 200


def test_admin_commissions_and_payouts(s, admin_token):
    r = s.get(f"{API}/admin/commissions", headers=H(admin_token))
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    r = s.get(f"{API}/admin/payouts", headers=H(admin_token))
    assert r.status_code == 200
    payouts = r.json()
    assert isinstance(payouts, list)
    # mark first due payout paid
    due = [p for p in payouts if p.get("status") == "due"]
    if due:
        r = s.patch(f"{API}/admin/payouts/{due[0]['id']}/paid", headers=H(admin_token))
        assert r.status_code == 200


def test_admin_settings(s, admin_token):
    r = s.get(f"{API}/admin/settings", headers=H(admin_token))
    assert r.status_code == 200
    rate = r.json()["default_commission_rate"]
    r = s.patch(
        f"{API}/admin/settings",
        params={"default_commission_rate": 0.15},
        headers=H(admin_token),
    )
    assert r.status_code == 200


# ---------- Role-based access ----------
def test_buyer_cannot_admin(s, buyer_token):
    r = s.get(f"{API}/admin/stats", headers=H(buyer_token))
    assert r.status_code == 403


def test_band_cannot_assign_printer(s, band_token):
    r = s.post(
        f"{API}/orders/{pytest.order_id}/assign-printer",
        params={"printer_id": "x"},
        headers=H(band_token),
    )
    assert r.status_code == 403
