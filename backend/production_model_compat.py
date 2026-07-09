"""Pydantic compatibility for Builder V2 production-rule snapshots.

Several launch patches add manufacturing validation and costing fields at runtime.
The persisted Product/Order documents must retain those fields even before the
large model file is fully refactored with first-class typed fields.
"""
from __future__ import annotations

from typing import Iterable

from pydantic import ConfigDict


MODEL_NAMES_TO_ALLOW_EXTRA: tuple[str, ...] = (
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


def _allow_extra(model) -> None:
    if model is None:
        return
    current = dict(getattr(model, "model_config", {}) or {})
    if current.get("extra") == "allow":
        return
    current["extra"] = "allow"
    model.model_config = ConfigDict(**current)
    rebuild = getattr(model, "model_rebuild", None)
    if callable(rebuild):
        try:
            rebuild(force=True)
        except Exception:
            # Model rebuild can fail on forward refs during early import. The config
            # assignment above is still enough for runtime validation once imports
            # complete, so this should never block server startup.
            pass


def install_production_model_compat(model_names: Iterable[str] = MODEL_NAMES_TO_ALLOW_EXTRA) -> None:
    """Allow production-rule fields to survive Product/Order model serialisation."""
    import models

    if getattr(models, "_production_model_compat_installed", False):
        return

    for name in model_names:
        _allow_extra(getattr(models, name, None))

    models._production_model_compat_installed = True
