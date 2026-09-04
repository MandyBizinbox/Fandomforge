"""Relax profile-copy preflight when Color-owned image views are incomplete.

Attribute-owned production geometry and Color-owned editor images are independent
sources of truth. A Size profile can validly contain Front/Back/Sleeve geometry
even while one Color profile is still missing one of those editor images. The
runtime composer already drops geometry for image views that do not exist.

The structural CSV copy importer previously made those missing Color views a
hard error, creating a circular dependency: stale/incomplete exact variations
could prevent the Size profile from being repaired. This canonical warning
policy keeps the missing-view information as warnings, injects temporary
structural view slots only for preview planning, and lets apply compile geometry
onto the real Color views that actually exist.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping, Set

import product_template_csv_base as legacy_csv
import product_template_geometry_csv as geometry_csv
import production_geometry_profile_copy as profile_copy
import production_geometry_profile_copy_color as color_patch


PRODUCTION_CONFIG_KEY = geometry_csv.PRODUCTION_CONFIG_KEY


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _normalise(value: Any) -> str:
    return "-".join(
        part
        for part in "".join(
            ch.lower() if ch.isalnum() else " "
            for ch in _text(value).strip()
        ).split()
        if part
    )


def _row_cell(row: Mapping[str, Any], key: str) -> str:
    return legacy_csv._cell(row, key)


def _find_source_profile(
    template: Mapping[str, Any],
    row: Mapping[str, Any],
) -> Dict[str, Any] | None:
    source_key = _row_cell(row, "copy_from_profile_key")
    source_value = _row_cell(row, "copy_from_production_value")
    if source_key:
        profile = profile_copy._find_profile(template, source_key)
        if profile is not None:
            return profile
    if source_value:
        _key, profile = profile_copy._find_profile_by_value(template, source_value)
        return profile
    return None


def _target_value(
    template: Mapping[str, Any],
    row: Mapping[str, Any],
) -> str:
    target_key = _row_cell(row, "production_profile_key")
    target_value = _row_cell(row, "production_value")
    if target_key:
        profile = profile_copy._find_profile(template, target_key)
        if profile is not None:
            return _text(profile.get("attribute_value") or target_key)
    if target_value:
        return target_value
    return ""


def _required_view_slots(source_profile: Mapping[str, Any]) -> Set[str]:
    configuration = profile_copy._profile_configuration(source_profile)
    screens = profile_copy._active_rows(
        configuration.get("screens") or configuration.get("mockup_screens")
    )
    areas = profile_copy._active_rows(configuration.get("print_areas"))
    screen_by_id = {
        _text(screen.get("id")): screen
        for screen in screens
        if screen.get("id")
    }

    required: Set[str] = set()
    for area in areas:
        screen = screen_by_id.get(_text(area.get("screen_id")))
        slot = geometry_csv._screen_identity(screen or {})
        if not slot:
            slot = _normalise(area.get("view_key") or area.get("screen_view"))
        if slot:
            required.add(slot)
    return required


def _stored_configuration_mutable(
    variation: MutableMapping[str, Any],
) -> Dict[str, Any] | None:
    overrides = variation.get("print_area_overrides")
    if not isinstance(overrides, dict):
        return None
    configuration = overrides.get(PRODUCTION_CONFIG_KEY)
    return configuration if isinstance(configuration, dict) else None


def _variation_view_slots(configuration: Mapping[str, Any]) -> Set[str]:
    return {
        geometry_csv._screen_identity(screen)
        for screen in profile_copy._active_rows(configuration.get("screens"))
        if geometry_csv._screen_identity(screen)
    }


def _inject_preview_slots(
    configuration: MutableMapping[str, Any],
    missing: Iterable[str],
) -> None:
    screens = configuration.get("screens")
    if not isinstance(screens, list):
        screens = []
        configuration["screens"] = screens

    existing_ids = {
        _text(screen.get("id"))
        for screen in screens
        if isinstance(screen, Mapping) and screen.get("id")
    }
    for index, slot in enumerate(sorted(set(missing))):
        base_id = f"__csv-preview-missing-{slot}"
        screen_id = base_id
        suffix = 1
        while screen_id in existing_ids:
            suffix += 1
            screen_id = f"{base_id}-{suffix}"
        existing_ids.add(screen_id)
        screens.append({
            "id": screen_id,
            "name": slot.replace("-", " ").title(),
            "view": slot,
            "view_key": slot,
            "image_url": "",
            "status": "active",
            "__csv_preview_placeholder": True,
        })


def _warning(
    row: Mapping[str, Any],
    *,
    target_value: str,
    affected_variations: List[Dict[str, Any]],
) -> Dict[str, Any]:
    missing = sorted({
        slot
        for item in affected_variations
        for slot in item.get("missing", [])
    })
    image_values = sorted({
        _text(item.get("image_value"))
        for item in affected_variations
        if item.get("image_value")
    })
    return legacy_csv._contextual_error(
        row,
        "Size geometry will be copied, but some Color variations are missing editor views; those views will remain unavailable until the Color images are added",
        production_value=target_value,
        affected_variation_count=len(affected_variations),
        missing_views=missing,
        color_values=image_values,
    )


def build_import_plan(
    current_documents: Iterable[Mapping[str, Any]],
    package: Mapping[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    # Start from the same authoritative Color hydration and source-profile
    # pruning used by the normal profile-copy repair.
    documents = color_patch._hydrate_documents(current_documents)
    by_id = {
        _text(document.get("id")): document
        for document in documents
        if document.get("id")
    }

    warnings: List[Dict[str, Any]] = []

    for row in package.get("production_profile_copies") or []:
        if not (
            _row_cell(row, "copy_from_profile_key")
            or _row_cell(row, "copy_from_production_value")
        ):
            continue

        template = by_id.get(_row_cell(row, "template_id"))
        if template is None:
            continue
        ownership = template.get("variation_inheritance") or {}
        if ownership.get("mode") != "attribute":
            continue

        source_profile = _find_source_profile(template, row)
        if source_profile is None:
            continue
        required = _required_view_slots(source_profile)
        if not required:
            continue

        production_attribute = _text(ownership.get("production_attribute"))
        image_attribute = _text(ownership.get("image_attribute"))
        target_value = _target_value(template, row)
        if not production_attribute or not target_value:
            continue

        affected: List[Dict[str, Any]] = []
        for variation in profile_copy._active_rows(template.get("variations")):
            if _normalise(
                profile_copy._variation_attribute_value(
                    variation,
                    production_attribute,
                )
            ) != _normalise(target_value):
                continue

            configuration = _stored_configuration_mutable(variation)
            if configuration is None:
                continue
            present = _variation_view_slots(configuration)
            missing = sorted(required - present)
            if not missing:
                continue

            affected.append({
                "variation_id": variation.get("id"),
                "image_value": profile_copy._variation_attribute_value(
                    variation,
                    image_attribute,
                ) if image_attribute else "",
                "missing": missing,
            })
            # These placeholders exist only in the copied in-memory documents
            # used to build the preview plan. They are never persisted. Their
            # purpose is to stop the structural hard-error gate from blocking
            # the canonical Size profile update.
            _inject_preview_slots(configuration, missing)

        if affected:
            warnings.append(
                _warning(
                    row,
                    target_value=target_value,
                    affected_variations=affected,
                )
            )

    # Call the structural profile-copy planner captured by the Color composition
    # layer. Static composition keeps this path deterministic with no runtime
    # replacement of module-level functions.
    plan = color_patch._BASE_BUILD_PLAN(documents, package)
    plan.setdefault("warnings", []).extend(warnings)

    summary = dict(plan.get("summary") or {})
    summary["warning_count"] = len(plan.get("warnings") or [])
    summary["error_count"] = len(plan.get("errors") or [])
    plan["summary"] = summary
    plan["can_apply"] = (
        not plan.get("errors")
        and int(summary.get("changed_cells") or 0) > 0
    )
    return plan


def apply_import_plan_to_documents(
    current_documents: Iterable[Mapping[str, Any]],
    plan: Mapping[str, Any],
    updated_at: Any,
) -> Dict[str, Any]:
    # Apply against real authoritative Color profiles, not preview placeholders.
    # The compiler drops geometry whose Color view does not exist, matching
    # frontend/runtime composition semantics.
    return color_patch.apply_import_plan_to_documents(
        current_documents,
        plan,
        updated_at,
    )
