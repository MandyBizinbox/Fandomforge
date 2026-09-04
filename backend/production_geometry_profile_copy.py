"""Bulk-copy V3 attribute-owned production geometry profiles through CSV.

This extends the canonical product-template CSV ZIP with
``production_profile_copies.csv``. It is intentionally a structural operation:
it can replace a target Size profile's old view/print-area layout with the
layout from another Size profile, while preserving Color-owned editor images on
compiled exact variations.

The module is statically composed above canonical geometry and the preserved base
CSV API; it performs no runtime installation or module rebinding.
"""

from __future__ import annotations

import copy
import csv
import io
import json
import uuid
import zipfile
from pathlib import PurePath
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping

import product_template_geometry_csv as geometry_csv
import product_template_csv_base as legacy_csv


PROFILE_COPY_FILENAME = "production_profile_copies.csv"
PROFILE_COPY_COLUMNS = [
    "template_id",
    "template_name",
    "source_updated_at",
    "production_attribute",
    "production_value",
    "production_profile_key",
    "current_area_sizes_json",
    "copy_from_production_value",
    "copy_from_profile_key",
    "area_overrides_json",
    "notes",
]

_ALLOWED_AREA_OVERRIDE_FIELDS = {
    "geometry_type",
    "x_pct",
    "y_pct",
    "width_pct",
    "height_pct",
    "width_mm",
    "height_mm",
    "bleed_mm",
    "safe_margin_mm",
    "rotation_deg",
    "dpi",
    "fit_mode",
    "pricing_area_mode",
    "required",
    "polygon_points",
    "mask_url",
    "allowed_print_option_ids",
    "standard_print_size_key",
    "notes",
    "status",
}

_BASE_EXPORT = geometry_csv.export_product_template_zip
_BASE_PARSE = geometry_csv.parse_product_template_import
_BASE_BUILD_PLAN = geometry_csv.build_import_plan
_BASE_APPLY = geometry_csv.apply_import_plan_to_documents


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


def _time_text(value: Any) -> str:
    return legacy_csv._time_text(value)


def _active_rows(value: Any) -> List[Dict[str, Any]]:
    return geometry_csv._active_rows(value)


def _profile_configuration(profile: Mapping[str, Any]) -> Dict[str, Any]:
    return geometry_csv._profile_configuration(profile)


def _area_rows_with_slots(configuration: Mapping[str, Any]) -> List[Dict[str, Any]]:
    return geometry_csv._area_rows_with_slots(configuration)


def _variation_attribute_value(variation: Mapping[str, Any], attribute_name: str) -> str:
    return geometry_csv._variation_attribute_value(variation, attribute_name)


def _cell(row: Mapping[str, Any], key: str) -> str:
    return legacy_csv._cell(row, key)


def _find_profile(template: Mapping[str, Any], profile_key: str) -> Dict[str, Any] | None:
    return geometry_csv._find_profile(template, profile_key)


def _find_profile_by_value(
    template: Mapping[str, Any],
    value: str,
) -> tuple[str, Dict[str, Any]] | tuple[None, None]:
    wanted = _normalise(value)
    profiles = template.get("attribute_production_profiles") or {}
    if not isinstance(profiles, Mapping):
        return None, None
    for key, profile in profiles.items():
        if not isinstance(profile, dict):
            continue
        candidates = {
            _normalise(key),
            _normalise(profile.get("attribute_value")),
        }
        if wanted and wanted in candidates:
            return _text(key), profile
    return None, None


def _area_size_summary(configuration: Mapping[str, Any]) -> Dict[str, Dict[str, Any]]:
    summary: Dict[str, Dict[str, Any]] = {}
    for entry in _area_rows_with_slots(configuration):
        area = entry["area"]
        summary[entry["geometry_slot"]] = {
            "name": area.get("name") or area.get("area_key") or "",
            "width_mm": area.get("width_mm"),
            "height_mm": area.get("height_mm"),
        }
    return summary


def production_profile_copy_rows(
    documents: Iterable[Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    rows: List[Dict[str, Any]] = []
    for template in sorted(documents, key=lambda item: _text(item.get("name")).lower()):
        ownership = template.get("variation_inheritance") or {}
        if ownership.get("mode") != "attribute" or not ownership.get("production_attribute"):
            continue
        production_attribute = _text(ownership.get("production_attribute"))
        profiles = template.get("attribute_production_profiles") or {}
        if not isinstance(profiles, Mapping):
            continue
        for key, profile in sorted(profiles.items(), key=lambda item: _text(item[0])):
            if not isinstance(profile, Mapping):
                continue
            value = _text(profile.get("attribute_value") or key)
            configuration = _profile_configuration(profile)
            rows.append({
                "template_id": _text(template.get("id")),
                "template_name": _text(template.get("name")),
                "source_updated_at": _time_text(template.get("updated_at")),
                "production_attribute": production_attribute,
                "production_value": value,
                "production_profile_key": _text(key),
                "current_area_sizes_json": json.dumps(
                    _area_size_summary(configuration),
                    ensure_ascii=False,
                    separators=(",", ":"),
                    default=str,
                ),
                "copy_from_production_value": "",
                "copy_from_profile_key": "",
                "area_overrides_json": "",
                "notes": "",
            })
    return rows


def _csv_bytes(columns: List[str], rows: Iterable[Mapping[str, Any]]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(
        buffer,
        fieldnames=columns,
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in columns})
    return buffer.getvalue().encode("utf-8-sig")


def export_product_template_zip(documents: Iterable[Mapping[str, Any]]) -> bytes:
    documents = [dict(document) for document in documents]
    payload = _BASE_EXPORT(documents)
    rows = production_profile_copy_rows(documents)

    source = io.BytesIO(payload)
    output = io.BytesIO()
    with zipfile.ZipFile(source, "r") as existing, zipfile.ZipFile(
        output,
        "w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        for info in existing.infolist():
            if info.is_dir() or PurePath(info.filename).name == "README.txt":
                continue
            archive.writestr(info, existing.read(info))

        archive.writestr(
            PROFILE_COPY_FILENAME,
            _csv_bytes(PROFILE_COPY_COLUMNS, rows),
        )

        readme = (
            existing.read("README.txt").decode("utf-8")
            if "README.txt" in existing.namelist()
            else ""
        )
        readme += f"""

{PROFILE_COPY_FILENAME}
    Bulk structural copy for attribute-owned production geometry profiles.

How to copy one Size geometry profile to others
-----------------------------------------------
1. Find the target Size row.
2. Set copy_from_production_value to the source Size label, or set
   copy_from_profile_key to the source profile key.
3. Leave all identity columns unchanged.
4. Optional: area_overrides_json may override copied geometry fields by
   geometry_slot. Example:
   {{"front::front::0":{{"width_mm":330,"height_mm":320}},
     "back::back-full::0":{{"width_mm":330,"height_mm":370}}}}
5. The copy replaces the target profile's structural views and print areas,
   preserves Color-owned editor images, and synchronizes every matching exact
   variation immediately.
6. Empty copy_from fields mean no operation.
7. Preview/apply, stale timestamp checks and JSON backup are unchanged.
"""
        archive.writestr("README.txt", readme.encode("utf-8"))

    return output.getvalue()


def _empty_package() -> Dict[str, List[Dict[str, Any]]]:
    return {
        "templates": [],
        "variations": [],
        "print_areas": [],
        "production_geometry": [],
        "production_profile_copies": [],
    }


def parse_product_template_import(
    filename: str,
    content: bytes,
) -> Dict[str, List[Dict[str, Any]]]:
    filename = PurePath(filename or "").name

    if filename.lower().endswith(".zip"):
        try:
            archive = zipfile.ZipFile(io.BytesIO(content))
        except zipfile.BadZipFile as error:
            raise ValueError("Uploaded ZIP file is invalid.") from error

        with archive:
            names = {
                PurePath(info.filename).name.lower(): info
                for info in archive.infolist()
                if not info.is_dir()
            }
            base_names = {
                legacy_csv.TEMPLATE_FILENAME,
                legacy_csv.VARIATION_FILENAME,
                legacy_csv.PRINT_AREA_FILENAME,
                geometry_csv.PRODUCTION_GEOMETRY_FILENAME,
            }
            if any(name in names for name in base_names):
                package = _BASE_PARSE(filename, content)
            else:
                package = _empty_package()

            package.setdefault("production_profile_copies", [])
            info = names.get(PROFILE_COPY_FILENAME)
            if info:
                package["production_profile_copies"].extend(
                    legacy_csv._read_csv(
                        archive.read(info),
                        PROFILE_COPY_FILENAME,
                    )
                )

            if not any(
                package.get(key)
                for key in (
                    "templates",
                    "variations",
                    "print_areas",
                    "production_geometry",
                    "production_profile_copies",
                )
            ):
                raise ValueError("ZIP contains none of the supported CSV rows.")
            return package

    if filename.lower().endswith(".csv"):
        rows = legacy_csv._read_csv(content, filename)
        if rows:
            headers = set(rows[0].keys())
            if (
                filename.lower() == PROFILE_COPY_FILENAME
                or "copy_from_production_value" in headers
                or "copy_from_profile_key" in headers
            ):
                package = _empty_package()
                package["production_profile_copies"] = rows
                return package

    package = _BASE_PARSE(filename, content)
    package.setdefault("production_profile_copies", [])
    return package


def _parse_area_overrides(row: Mapping[str, Any]) -> tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    raw = _cell(row, "area_overrides_json")
    if not raw:
        return {}, []
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as error:
        return {}, [{
            "column": "area_overrides_json",
            "message": f"invalid JSON: {error.msg}",
        }]
    if not isinstance(parsed, dict):
        return {}, [{
            "column": "area_overrides_json",
            "message": "expected a JSON object keyed by geometry_slot",
        }]

    errors: List[Dict[str, Any]] = []
    cleaned: Dict[str, Dict[str, Any]] = {}
    for slot, patch in parsed.items():
        if not isinstance(patch, dict):
            errors.append({
                "column": "area_overrides_json",
                "message": f"override for {slot} must be a JSON object",
            })
            continue
        unsupported = sorted(set(patch) - _ALLOWED_AREA_OVERRIDE_FIELDS)
        if unsupported:
            errors.append({
                "column": "area_overrides_json",
                "message": f"unsupported fields for {slot}: {', '.join(unsupported)}",
            })
            continue
        cleaned[_text(slot)] = copy.deepcopy(patch)
    return cleaned, errors


def _validate_override_values(
    row: Mapping[str, Any],
    source_configuration: Mapping[str, Any],
    overrides: Mapping[str, Mapping[str, Any]],
) -> List[Dict[str, Any]]:
    errors: List[Dict[str, Any]] = []
    source_by_slot = {
        entry["geometry_slot"]: entry["area"]
        for entry in _area_rows_with_slots(source_configuration)
    }
    for slot, patch in overrides.items():
        source_area = source_by_slot.get(slot)
        if source_area is None:
            errors.append({
                "column": "area_overrides_json",
                "message": f"geometry_slot does not exist on source profile: {slot}",
            })
            continue

        csv_row = {
            "_source_file": row.get("_source_file"),
            "_row_number": row.get("_row_number"),
        }
        for field, value in patch.items():
            column = {
                "polygon_points": "polygon_points_json",
                "allowed_print_option_ids": "allowed_print_option_ids_json",
            }.get(field, field)
            if field in {"polygon_points", "allowed_print_option_ids"}:
                csv_row[column] = json.dumps(value)
            else:
                csv_row[column] = value
        _changes, field_errors = geometry_csv._validate_geometry_changes(
            csv_row,
            source_area,
        )
        errors.extend(field_errors)
    return errors


def build_import_plan(
    current_documents: Iterable[Mapping[str, Any]],
    package: Mapping[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    documents = [dict(document) for document in current_documents]
    base_package = {
        "templates": package.get("templates") or [],
        "variations": package.get("variations") or [],
        "print_areas": package.get("print_areas") or [],
        "production_geometry": package.get("production_geometry") or [],
    }
    plan = _BASE_BUILD_PLAN(documents, base_package)
    plan["production_profile_copy_updates"] = []

    by_id = {
        _text(document.get("id")): document
        for document in documents
        if document.get("id")
    }
    seen = set()

    for row in package.get("production_profile_copies") or []:
        template_id = _cell(row, "template_id")
        target_key = _cell(row, "production_profile_key")
        target_value = _cell(row, "production_value")
        source_key = _cell(row, "copy_from_profile_key")
        source_value = _cell(row, "copy_from_production_value")

        if not source_key and not source_value:
            continue

        duplicate_key = (template_id, target_key or _normalise(target_value))
        if duplicate_key in seen:
            plan["errors"].append(
                legacy_csv._contextual_error(row, "duplicate production profile copy row")
            )
            continue
        seen.add(duplicate_key)

        current = by_id.get(template_id)
        if current is None:
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "template_id does not exist; CSV import cannot create templates",
                )
            )
            continue

        current_updated_at = _time_text(current.get("updated_at"))
        if current_updated_at and not _cell(row, "source_updated_at"):
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "source_updated_at is required for templates that already have a version timestamp",
                )
            )
            continue
        stale = legacy_csv._stale_error(row, current)
        if stale:
            plan["errors"].append(stale)
            continue

        ownership = current.get("variation_inheritance") or {}
        if ownership.get("mode") != "attribute":
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "template is not using attribute-owned production geometry",
                )
            )
            continue

        production_attribute = _text(ownership.get("production_attribute"))
        requested_attribute = _cell(row, "production_attribute")
        if requested_attribute and _normalise(requested_attribute) != _normalise(production_attribute):
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "production_attribute does not match the template production owner",
                )
            )
            continue

        target_profile = _find_profile(current, target_key) if target_key else None
        if target_profile is None and target_value:
            resolved_key, target_profile = _find_profile_by_value(current, target_value)
            target_key = target_key or _text(resolved_key)
        if target_profile is None:
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "target production profile does not exist; CSV import cannot create profiles",
                )
            )
            continue

        expected_target_value = _text(target_profile.get("attribute_value") or target_key)
        if target_value and _normalise(target_value) != _normalise(expected_target_value):
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "production_value does not match the stored target profile",
                )
            )
            continue
        target_value = expected_target_value

        source_profile = _find_profile(current, source_key) if source_key else None
        if source_profile is None and source_value:
            resolved_key, source_profile = _find_profile_by_value(current, source_value)
            source_key = source_key or _text(resolved_key)
        if source_profile is None:
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "source production profile does not exist",
                )
            )
            continue

        source_value = _text(source_profile.get("attribute_value") or source_key)
        if target_key == source_key:
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "source and target production profiles must be different",
                )
            )
            continue

        source_configuration = _profile_configuration(source_profile)
        source_slots = _area_rows_with_slots(source_configuration)
        if not source_slots:
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "source production profile has no print areas to copy",
                )
            )
            continue

        overrides, override_errors = _parse_area_overrides(row)
        override_errors.extend(
            _validate_override_values(row, source_configuration, overrides)
        )
        if override_errors:
            for error in override_errors:
                plan["errors"].append(
                    legacy_csv._contextual_error(
                        row,
                        error.get("message") or "invalid area override",
                        column=error.get("column"),
                    )
                )
            continue

        required_screen_slots = {
            geometry_csv._screen_identity(screen)
            for screen in _active_rows(
                source_configuration.get("screens")
                or source_configuration.get("mockup_screens")
            )
        }
        required_screen_slots.discard("")

        missing_variation_views = []
        for variation in _active_rows(current.get("variations")):
            if _normalise(
                _variation_attribute_value(variation, production_attribute)
            ) != _normalise(target_value):
                continue
            configuration = geometry_csv._stored_variation_configuration(variation)
            if not configuration:
                continue
            variation_slots = {
                geometry_csv._screen_identity(screen)
                for screen in _active_rows(configuration.get("screens"))
            }
            missing = sorted(required_screen_slots - variation_slots)
            if missing:
                missing_variation_views.append({
                    "variation_id": variation.get("id"),
                    "missing": missing,
                })

        if missing_variation_views:
            first = missing_variation_views[0]
            plan["errors"].append(
                legacy_csv._contextual_error(
                    row,
                    "target variations are missing Color-owned editor views required by the source geometry",
                    variation_id=first.get("variation_id"),
                    missing_views=first.get("missing"),
                )
            )
            continue

        plan["production_profile_copy_updates"].append({
            "template_id": template_id,
            "production_attribute": production_attribute,
            "target_profile_key": target_key,
            "target_value": target_value,
            "source_profile_key": source_key,
            "source_value": source_value,
            "area_overrides": overrides,
        })

    touched = set(plan.get("touched_template_ids") or [])
    touched.update(
        update["template_id"]
        for update in plan["production_profile_copy_updates"]
    )
    plan["touched_template_ids"] = sorted(touched)

    summary = dict(plan.get("summary") or {})
    summary["production_profile_copy_rows"] = len(
        package.get("production_profile_copies") or []
    )
    summary["production_profile_copy_updates"] = len(
        plan["production_profile_copy_updates"]
    )
    summary["changed_cells"] = int(summary.get("changed_cells") or 0) + sum(
        1 + sum(len(patch) for patch in update.get("area_overrides", {}).values())
        for update in plan["production_profile_copy_updates"]
    )
    summary["touched_templates"] = len(plan["touched_template_ids"])
    summary["error_count"] = len(plan.get("errors") or [])
    summary["warning_count"] = len(plan.get("warnings") or [])
    plan["summary"] = summary
    plan["can_apply"] = not plan["errors"] and summary["changed_cells"] > 0
    return plan


def _new_id(prefix: str) -> str:
    return f"{prefix}-csv-{uuid.uuid4().hex[:12]}"


def _clone_profile_configuration(
    source_configuration: Mapping[str, Any],
    area_overrides: Mapping[str, Mapping[str, Any]],
    configured_at: str,
) -> Dict[str, Any]:
    configuration = copy.deepcopy(dict(source_configuration))
    screens = _active_rows(configuration.get("screens") or configuration.get("mockup_screens"))
    screen_map: Dict[str, str] = {}
    cloned_screens = []
    for source_screen in screens:
        screen = copy.deepcopy(source_screen)
        old_id = _text(screen.get("id"))
        new_id = _new_id("screen")
        screen["id"] = new_id
        if old_id:
            screen_map[old_id] = new_id
        # Size profiles own structure, never a colour-specific image.
        screen["image_url"] = ""
        screen.pop("url", None)
        cloned_screens.append(screen)

    cloned_areas = []
    for entry in _area_rows_with_slots(configuration):
        source_area = entry["area"]
        area = copy.deepcopy(source_area)
        area["id"] = _new_id("area")
        old_screen_id = _text(area.get("screen_id"))
        if old_screen_id in screen_map:
            area["screen_id"] = screen_map[old_screen_id]
        override = area_overrides.get(entry["geometry_slot"]) or {}
        if override:
            csv_row = {}
            for field, value in override.items():
                column = {
                    "polygon_points": "polygon_points_json",
                    "allowed_print_option_ids": "allowed_print_option_ids_json",
                }.get(field, field)
                csv_row[column] = json.dumps(value) if field in {"polygon_points", "allowed_print_option_ids"} else value
            changes, errors = geometry_csv._validate_geometry_changes(csv_row, area)
            if errors:
                raise ValueError(
                    f"Invalid area override during apply for {entry['geometry_slot']}: {errors}"
                )
            geometry_csv._apply_geometry_changes(area, changes)
        cloned_areas.append(area)

    configuration["screens"] = cloned_screens
    configuration["print_areas"] = cloned_areas
    geometry_csv._refresh_configuration(configuration, configured_at)
    return configuration


def _screen_slots(screens: Iterable[Mapping[str, Any]]) -> Dict[str, List[Mapping[str, Any]]]:
    result: Dict[str, List[Mapping[str, Any]]] = {}
    for screen in screens:
        result.setdefault(geometry_csv._screen_identity(screen), []).append(screen)
    return result


def _compile_profile_geometry_onto_variation(
    profile_configuration: Mapping[str, Any],
    variation: MutableMapping[str, Any],
    configured_at: str,
) -> None:
    overrides = variation.get("print_area_overrides")
    if not isinstance(overrides, dict):
        overrides = {}
        variation["print_area_overrides"] = overrides

    existing_configuration = overrides.get(geometry_csv.PRODUCTION_CONFIG_KEY)
    if not isinstance(existing_configuration, dict):
        existing_configuration = geometry_csv._legacy_variation_configuration(variation, {})

    target_screens = copy.deepcopy(_active_rows(existing_configuration.get("screens")))
    source_screens = _active_rows(
        profile_configuration.get("screens")
        or profile_configuration.get("mockup_screens")
    )
    target_by_slot = _screen_slots(target_screens)
    source_by_id = {
        _text(screen.get("id")): screen
        for screen in source_screens
        if screen.get("id")
    }
    occurrence: Dict[str, int] = {}
    compiled_areas = []

    for area in _active_rows(profile_configuration.get("print_areas")):
        source_screen = source_by_id.get(_text(area.get("screen_id"))) or {}
        slot = geometry_csv._screen_identity(source_screen) or _normalise(
            area.get("view_key") or area.get("screen_view") or "front"
        )
        index = occurrence.get(slot, 0)
        occurrence[slot] = index + 1
        candidates = target_by_slot.get(slot) or []
        if index >= len(candidates):
            continue
        target_screen = candidates[index]
        compiled = copy.deepcopy(area)
        compiled["id"] = _new_id("vp-area")
        compiled["screen_id"] = target_screen.get("id")
        compiled["view_key"] = (
            compiled.get("view_key")
            or target_screen.get("view_key")
            or target_screen.get("view")
            or slot
        )
        compiled["screen_view"] = (
            compiled.get("screen_view")
            or target_screen.get("view")
            or target_screen.get("view_key")
            or slot
        )
        compiled_areas.append(compiled)

    configuration = {
        "version": max(int(profile_configuration.get("version") or 0), 3),
        "screens": target_screens,
        "print_areas": compiled_areas,
        "print_option_ids": copy.deepcopy(profile_configuration.get("print_option_ids") or []),
        "print_options": copy.deepcopy(profile_configuration.get("print_options") or []),
        "configured_at": configured_at,
    }
    geometry_csv._refresh_configuration(configuration, configured_at)

    old_area_ids = {
        _text(area.get("id"))
        for area in _active_rows(existing_configuration.get("print_areas"))
        if area.get("id")
    }
    preserved = {
        key: value
        for key, value in overrides.items()
        if key.startswith("__")
        and key != geometry_csv.PRODUCTION_CONFIG_KEY
        and key not in old_area_ids
    }
    preserved[geometry_csv.PRODUCTION_CONFIG_KEY] = configuration
    for area in compiled_areas:
        if area.get("id"):
            preserved[_text(area["id"])] = copy.deepcopy(area)
    variation["print_area_overrides"] = preserved


def apply_import_plan_to_documents(
    current_documents: Iterable[Mapping[str, Any]],
    plan: Mapping[str, Any],
    updated_at: Any,
) -> Dict[str, Any]:
    documents = [dict(document) for document in current_documents]
    applied = _BASE_APPLY(documents, plan, updated_at)
    configured_at = _time_text(updated_at)

    for update in plan.get("production_profile_copy_updates") or []:
        template_id = update["template_id"]
        target = applied["documents"].get(template_id)
        if target is None:
            raise ValueError(
                f"Template disappeared before profile copy apply: {template_id}"
            )

        source_profile = _find_profile(target, update["source_profile_key"])
        target_profile = _find_profile(target, update["target_profile_key"])
        if source_profile is None or target_profile is None:
            raise ValueError(
                f"Production profile disappeared before copy apply: {template_id}"
            )

        source_configuration = _profile_configuration(source_profile)
        cloned_configuration = _clone_profile_configuration(
            source_configuration,
            update.get("area_overrides") or {},
            configured_at,
        )
        target_profile["configuration"] = cloned_configuration
        target_profile["attribute_value"] = update["target_value"]
        target_profile["updated_at"] = configured_at

        for variation in _active_rows(target.get("variations")):
            if _normalise(
                _variation_attribute_value(
                    variation,
                    update["production_attribute"],
                )
            ) != _normalise(update["target_value"]):
                continue
            _compile_profile_geometry_onto_variation(
                cloned_configuration,
                variation,
                configured_at,
            )

        target["updated_at"] = configured_at

    return applied
