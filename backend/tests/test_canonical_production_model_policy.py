"""Regressions for first-class production-model extra-field persistence."""

from pathlib import Path

import models


BACKEND_ROOT = Path(__file__).resolve().parents[1]

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


def test_runtime_production_model_compat_installer_is_gone():
    assert not (BACKEND_ROOT / "production_model_compat.py").exists()

    server_source = (BACKEND_ROOT / "server.py").read_text(encoding="utf-8")
    assert "production_model_compat" not in server_source
    assert "install_production_model_compat" not in server_source
