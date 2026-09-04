"""Compose Size-profile CSV copies with Color-owned editor views.

The structural profile-copy importer must not trust an exact variation's stored
screen list when image ownership belongs to another attribute. Those compiled
variation records can be stale precisely because the Size profile has not yet
been reconciled. The canonical image source is ``attribute_image_profiles``.

This module hydrates exact variations from their Color-owned image profile before
both import preview and apply. It also prunes unused/orphan screens from
production profiles so validation only requires editor views that are actually
referenced by print geometry.
"""

from __future__ import annotations

import copy
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping

import product_template_geometry_csv as geometry_csv
import production_geometry_profile_copy as profile_copy


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


def _prune_configuration_to_geometry_views(
    configuration: MutableMapping[str, Any],
) -> None:
    """Remove screens that no active print area can ever use.

    Size profiles may retain historical editor views even after their print
    areas were deleted. Those orphan screens are not production requirements
    and must not make Color-profile validation fail. Prefer exact screen IDs;
    use semantic view identity only when an area's stored screen ID is missing.
    """
    screens = profile_copy._active_rows(
        configuration.get("screens")
        or configuration.get("mockup_screens")
    )
    areas = profile_copy._active_rows(configuration.get("print_areas"))
    if not screens or not areas:
        return

    screen_by_id = {
        _text(screen.get("id")): screen
        for screen in screens
        if screen.get("id")
    }
    required_ids = set()
    fallback_views = set()

    for area in areas:
        screen_id = _text(area.get("screen_id"))
        if screen_id and screen_id in screen_by_id:
            required_ids.add(screen_id)
            continue
        view = geometry_csv._screen_identity({
            "view_key": area.get("view_key"),
            "screen_view": area.get("screen_view"),
        })
        if view:
            fallback_views.add(view)

    if not required_ids and not fallback_views:
        return

    pruned = [
        copy.deepcopy(screen)
        for screen in screens
        if (
            _text(screen.get("id")) in required_ids
            or geometry_csv._screen_identity(screen) in fallback_views
        )
    ]
    if not pruned:
        return

    configuration["screens"] = pruned
    if "mockup_screens" in configuration:
        configuration["mockup_screens"] = copy.deepcopy(pruned)


def _prune_attribute_production_profiles(template: MutableMapping[str, Any]) -> None:
    profiles = template.get("attribute_production_profiles") or {}
    if not isinstance(profiles, Mapping):
        return

    for profile in profiles.values():
        if not isinstance(profile, dict):
            continue
        configuration = profile.get("configuration")
        if isinstance(configuration, dict):
            _prune_configuration_to_geometry_views(configuration)
        else:
            _prune_configuration_to_geometry_views(profile)


def _hydrate_template_color_owned_screens(
    template: Mapping[str, Any],
) -> Dict[str, Any]:
    hydrated = copy.deepcopy(dict(template))
    ownership = hydrated.get("variation_inheritance") or {}
    if ownership.get("mode") != "attribute":
        return hydrated

    # Production/Size profiles only require screens referenced by active print
    # areas. This removes stale source views before profile-copy validation and
    # before the source profile is structurally cloned onto a target Size.
    _prune_attribute_production_profiles(hydrated)

    if not ownership.get("image_attribute"):
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
