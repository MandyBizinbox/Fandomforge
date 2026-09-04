"""Canonical product-template CSV API.

The original three-file CSV implementation lives in :mod:`product_template_csv_base`.
Production geometry, structural profile-copy, Color-owned image hydration and the
missing-view warning policy are composed here as the public API used by routes and
other callers.

This module intentionally performs no installer calls and does not mutate route or
server modules.  The legacy ``*_patch`` modules remain implementation layers during
the migration pass; callers no longer need runtime rebinding to reach their final
behaviour.
"""
from __future__ import annotations

import product_template_csv_base as _base


# Publish the complete historical API first.  The compatibility implementation
# modules import ``product_template_csv`` while this facade is initialising, so
# making the base symbols available before importing those layers gives them a
# stable, fully-defined base to capture without installer hooks.
for _name in dir(_base):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_base, _name)


def __getattr__(name):
    """Delegate any base helper not copied above, including private helpers."""
    return getattr(_base, name)


# Final effective production behaviour.  Export/parse are extended by geometry
# and profile-copy; build/apply additionally include Color hydration/pruning and
# the warning-not-error policy for incomplete Color-owned editor views.
from production_geometry_profile_copy_patch import (  # noqa: E402
    export_product_template_zip as export_product_template_zip,
    parse_product_template_import as parse_product_template_import,
)
from production_geometry_profile_copy_warning_patch import (  # noqa: E402
    apply_import_plan_to_documents as apply_import_plan_to_documents,
    build_import_plan as build_import_plan,
)


__all__ = sorted({
    name for name in globals()
    if not name.startswith("_")
})
