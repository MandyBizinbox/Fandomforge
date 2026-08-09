"""Repair Size-profile CSV copy composition for Color-owned editor views.

The structural profile-copy importer must not trust an exact variation's stored
screen list when image ownership belongs to another attribute. Those compiled
variation records can be stale precisely because the Size profile has not yet
been reconciled. The canonical image source is ``attribute_image_profiles``.

This patch hydrates exact variations from their Color-owned image profile before
both import preview and apply. The existing profile-copy engine then validates
and compiles against the authoritative view list while preserving each Color's
actual image URLs.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List, Mapping

import product_template_csv as legacy_csv
import product_template_geometry_csv_patch as geometry_csv
import production_geometry_profile_copy_patch as profile_copy


_BASE_BUILD_PLAN = profile_copy.build_import_plan
_BASE_APPLY = profile_copy.apply_import_plan_to_documents


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _normalise(value: Any) -> str:
    return "-".join(
        part
        for part in "".join(
            character.lower() if character.isalnum() else " "
            for character in _text(value).strip()
        ).split()
        if part
    )


def _find_image_profile(
    template: Mapping[str, Any],
    image_value: str,
) -> Dict[str, Any] | None:
    profiles = template.get("attribute_image_profiles") or {}
    if not isinstance(profiles, Mapping):
        return None

    wanted = _normalise(image_value)
    if not wanted:
        return None

    direct = profiles.get(wanted)
    if isinstance(direct, dict):
        return direct

    for key, profile in profiles.items():
        if not isinstance(profile, dict):
            continue
        if wanted in {
            _normalise(key),
            _normalise(profile.get("attribute_value")),
        }:
            return profile
    return None


def _image_configuration_for_variation(
    template: Mapping[str, Any],
    variation: Mapping[str, Any],
) -> Dict[str, Any] | None:
    ownership = template.get("variation_inheritance") or {}
    if ownership.get("mode") != "attribute":
        return None

    image_attribute = _text(ownership.get("image_attribute"))
    if not image_attribute:
        return None

    image_value = profile_copy._variation_attribute_value(
        variation,
        image_attribute,
    )
    profile = _find_image_profile(template, image_value)
    if profile is None:
        return None

    configuration = profile_copy._profile_configuration(profile)
    screens = profile_copy._active_rows(
        configuration.get("screens")
        or configuration.get("mockup_screens")
    )
    if not screens:
        return None

    configuration["screens"] = copy.deepcopy(screens)
    return configuration


def _hydrate_template_color_owned_screens(
    template: Mapping[str, Any],
) -> Dict[str, Any]:
    hydrated = copy.deepcopy(dict(template))
    ownership = hydrated.get("variation_inheritance") or {}
    if ownership.get("mode") != "attribute" or not ownership.get("image_attribute"):
        return hydrated

    for variation in profile_copy._active_rows(hydrated.get("variations")):
        image_configuration = _image_configuration_for_variation(
            hydrated,
            variation,
        )
        if not image_configuration:
            continue

        overrides = variation.get("print_area_overrides")
        if not isinstance(overrides, dict):
            overrides = {}
            variation["print_area_overrides"] = overrides

        stored = overrides.get(geometry_csv.PRODUCTION_CONFIG_KEY)
        if isinstance(stored, dict):
            configuration = copy.deepcopy(stored)
        else:
            configuration = geometry_csv._legacy_variation_configuration(
                variation,
                hydrated,
            )

        # Color/image ownership is authoritative for the complete editor-view
        # list. Keep the variation's existing geometry/rules until the Size
        # profile-copy engine replaces them.
        configuration["screens"] = copy.deepcopy(
            image_configuration.get("screens") or []
        )
        overrides[geometry_csv.PRODUCTION_CONFIG_KEY] = configuration

    return hydrated


def _hydrate_documents(
    current_documents: Iterable[Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    return [
        _hydrate_template_color_owned_screens(document)
        for document in current_documents
    ]


def build_import_plan(
    current_documents: Iterable[Mapping[str, Any]],
    package: Mapping[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    return _BASE_BUILD_PLAN(
        _hydrate_documents(current_documents),
        package,
    )


def apply_import_plan_to_documents(
    current_documents: Iterable[Mapping[str, Any]],
    plan: Mapping[str, Any],
    updated_at: Any,
) -> Dict[str, Any]:
    return _BASE_APPLY(
        _hydrate_documents(current_documents),
        plan,
        updated_at,
    )


def install_production_geometry_profile_copy_color_patch(routes_module=None) -> None:
    """Install authoritative Color-profile hydration after profile-copy patch."""
    profile_copy.build_import_plan = build_import_plan
    profile_copy.apply_import_plan_to_documents = apply_import_plan_to_documents

    geometry_csv.build_import_plan = build_import_plan
    geometry_csv.apply_import_plan_to_documents = apply_import_plan_to_documents

    legacy_csv.build_import_plan = build_import_plan
    legacy_csv.apply_import_plan_to_documents = apply_import_plan_to_documents

    if routes_module is not None:
        routes_module.build_import_plan = build_import_plan
        routes_module.apply_import_plan_to_documents = apply_import_plan_to_documents
