"""Canonical product-template CSV API.

The original three-file CSV implementation lives in :mod:`product_template_csv_base`.
Production geometry, structural profile-copy, Color-owned image hydration and the
missing-view warning policy are composed here as the public API used by routes and
other callers.

Runtime installers and route rebinding are not part of this API. The remaining
historical ``*_patch`` module names are deprecated import aliases only and are
being removed after dependent imports migrate to the canonical module names.
"""
from __future__ import annotations

import product_template_csv_base as _base


# Publish the complete historical API before composing production extensions.
# Geometry/profile-copy modules still have a short-lived upward import dependency
# during the filename migration; exposing the stable base first keeps that import
# deterministic without mutating route or server modules.
for _name in dir(_base):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_base, _name)


def __getattr__(name):
    """Delegate any base helper not copied above, including private helpers."""
    return getattr(_base, name)


# Final effective production behaviour. Export/parse are extended by geometry
# and structural profile-copy; build/apply additionally include Color hydration,
# orphan-view pruning, and warning-not-error handling for missing Color views.
from production_geometry_profile_copy import (  # noqa: E402
    export_product_template_zip as export_product_template_zip,
    parse_product_template_import as parse_product_template_import,
)
from production_geometry_profile_copy_warnings import (  # noqa: E402
    apply_import_plan_to_documents as apply_import_plan_to_documents,
    build_import_plan as build_import_plan,
)


__all__ = sorted({
    name for name in globals()
    if not name.startswith("_")
})
