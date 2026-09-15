from pathlib import Path

def test_admin_product_update_declares_patch_and_put_methods():
    source = Path(__file__).resolve().parents[1].joinpath("routes_main.py").read_text()
    assert '@admin_router.api_route("/products/{product_id}", methods=["PATCH", "PUT"], response_model=Product)' in source
    assert "install_builder_product_update_put_alias" not in source
