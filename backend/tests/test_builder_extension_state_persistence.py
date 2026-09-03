from types import SimpleNamespace

from models import Product, ProductArtworkGroup, ProductCreate


def test_builder_extension_fields_survive_product_create_validation():

    payload = ProductCreate(
        title="Builder product",
        description="",
        category="T-Shirts",
        template_id="template-1",
        selling_price=299,
        print_cost=50,
        brand="FWRD",
        variation_pricing_mode="by_attribute",
        artwork_groups=[
            {
                "label": "Front",
                "scope_type": "all",
                "variation_mockups": [
                    {"variation_ids": ["var-1"], "image_url": "/uploads/front.png"}
                ],
            }
        ],
    )

    dumped = payload.model_dump()
    assert dumped["brand"] == "FWRD"
    assert dumped["variation_pricing_mode"] == "by_attribute"
    assert dumped["artwork_groups"][0]["variation_mockups"][0]["image_url"] == "/uploads/front.png"


def test_builder_extension_fields_survive_product_response_validation():

    product = Product(
        id="product-1",
        band_id="creator-1",
        slug="builder-product",
        title="Builder product",
        description="",
        category="T-Shirts",
        template_id="template-1",
        selling_price=299,
        print_cost=50,
        brand="FWRD",
        variation_pricing_mode="uniform",
        artwork_groups=[
            ProductArtworkGroup(
                label="Front",
                scope_type="all",
                variation_mockups=[{"variation_ids": ["var-1"], "image_url": "/uploads/front.png"}],
            )
        ],
    )

    dumped = product.model_dump()
    assert dumped["brand"] == "FWRD"
    assert dumped["variation_pricing_mode"] == "uniform"
    assert dumped["artwork_groups"][0]["variation_mockups"][0]["variation_ids"] == ["var-1"]
