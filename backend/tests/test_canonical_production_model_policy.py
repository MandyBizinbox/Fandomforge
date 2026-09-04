"""Regressions for first-class production-model extra-field persistence."""

import models


PRODUCTION_COMPATIBLE_MODEL_NAMES = (
    "ProductTemplatePrintArea",
    "ProductTemplatePrintOption",
    "ProductTemplateVariation",
    "ProductTemplateBase",
    "ProductTemplateCreate",
    "ProductTemplateUpdate",
    "ProductTemplate",
    "ProductArtworkSnapshot",
    "ProductArtworkPlacement",
    "ProductArtworkSlot",
    "ProductArtworkGroup",
    "ProductBase",
    "ProductCreate",
    "ProductUpdate",
    "Product",
    "ProductionSnapshot",
    "OrderItem",
)


def test_production_models_canonically_allow_extra_fields():
    for name in PRODUCTION_COMPATIBLE_MODEL_NAMES:
        model = getattr(models, name)
        assert model.model_config.get("extra") == "allow", name


def test_production_models_preserve_unknown_fields_in_serialization():
    probe = {"source": "canonical-model-policy", "preserved": True}

    for name in PRODUCTION_COMPATIBLE_MODEL_NAMES:
        model = getattr(models, name)
        instance = model.model_construct(__production_compat_probe__=probe)
        assert instance.model_dump()["__production_compat_probe__"] == probe, name
