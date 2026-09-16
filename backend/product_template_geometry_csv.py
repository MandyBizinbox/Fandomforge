"""Canonical CSV support for variable-template production geometry.

The original product-template CSV tooling predates the V3 production model. It
exports template-level ``print_areas`` which are only runtime anchors for a
compiled variable template. V3 instead owns geometry either:

* once per production attribute profile (for example Size = XS), or
* independently on each exact variation.

This module extends the preserved base ZIP/import workflow with
``production_geometry.csv``. It is a normal static dependency layer and performs
no runtime installation or route rebinding.
"""

from __future__ import annotations

import copy
import csv
import io
import json
import math
import zipfile
from pathlib import PurePath
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping

import product_template_csv_base as legacy_csv


PRODUCTION_CONFIG_KEY = "__production_configuration__"
PRODUCTION_GEOMETRY_FILENAME = "production_geometry.csv"

PRODUCTION_GEOMETRY_COLUMNS = [
    "template_id",
    "template_name",
    "source_updated_at",
    "geometry_scope",
    "production_attribute",
    "production_value",
    "production_profile_key",
    "variation_id",
    "variation_label",
    "geometry_slot",
    "print_area_id",
    "area_name",
    "area_key",
    "view_key",
    "screen_id",
    "screen_view",
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
    "polygon_points_json",
    "mask_url",
    "allowed_print_option_ids_json",
    "standard_print_size_key",
    "notes",
    "status",
]

GEOMETRY_SPECS = {
    "geometry_type": ("geometry_type", "text", False),
    "x_pct": ("x_pct", "float", False),
    "y_pct": ("y_pct", "float", False),
    "width_pct": ("width_pct", "float", False),
    "height_pct": ("height_pct", "float", False),
    "width_mm": ("width_mm", "float", False),
    "height_mm": ("height_mm", "float", False),
    "bleed_mm": ("bleed_mm", "float", False),
    "safe_margin_mm": ("safe_margin_mm", "float", False),
    "rotation_deg": ("rotation_deg", "float", False),
    "dpi": ("dpi", "int", False),
    "fit_mode": ("fit_mode", "text", False),
    "pricing_area_mode": ("pricing_area_mode", "text", False),
    "required": ("required", "bool", False),
    "polygon_points_json": ("polygon_points", "json_list", True),
    "mask_url": ("mask_url", "text", True),
    "allowed_print_option_ids_json": (
        "allowed_print_option_ids",
        "json_list",
        False,
    ),
    "standard_print_size_key": (
        "standard_print_size_key",
        "text",
        False,
    ),
    "notes": ("notes", "text", True),
    "status": ("status", "status", False),
}

_GEOMETRY_TYPES = {"rectangle", "circle", "ellipse", "polygon", "mask"}
_GEOMETRY_ALIASES = {
    "rect": "rectangle",
    "square": "rectangle",
    "round": "circle",
    "oval": "ellipse",
    "custom": "mask",
    "svg": "mask",
    "png": "mask",
}
_FIT_MODES = {"contain", "cover", "stretch"}
_PRICING_AREA_MODES = {"bounding_box", "shape"}

_BASE_EXPORT = legacy_csv.export_product_template_zip
_BASE_PARSE = legacy_csv.parse_product_template_import
_BASE_BUILD_PLAN = legacy_csv.build_import_plan
_BASE_APPLY = legacy_csv.apply_import_plan_to_documents
_BASE_READ_CSV = legacy_csv._read_csv
_BASE_PARSE_CHANGES = legacy_csv._parse_changes
_BASE_CONTEXT_ERROR = legacy_csv._contextual_error
_BASE_STALE_ERROR = legacy_csv._stale_error
_BASE_APPLY_CHANGE_MAP = legacy_csv.apply_change_map


def _text(value: Any) -> str:
    return "" if value is None else str(value)


def _time_text(value: Any) -> str:
    return legacy_csv._time_text(value)


def _normalise(value: Any) -> str:
    return "-".join(
        part
        for part in "".join(
            character.lower() if character.isalnum() else " "
            for character in _text(value).strip()
        ).split()
        if part
    )


def _number_cell(row: Mapping[str, Any], *fields: str) -> Any:
    for field in fields:
        if field in row and row.get(field) is not None:
            return row.get(field)
    return ""


def _json_cell(value: Any) -> str:
    if value is None:
        return ""
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _bool_cell(row: Mapping[str, Any], field: str) -> str:
    if field not in row or row.get(field) is None:
        return ""
    return "true" if row.get(field) is True else "false" if row.get(field) is False else _text(row.get(field))


def _active_rows(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [
        row
        for row in value
        if isinstance(row, dict)
        and row.get("enabled") is not False
        and str(row.get("status") or "").lower() != "archived"
        and not row.get("archived")
        and not row.get("deleted")
        and row.get("disabled") is not True
    ]


def _variation_label(variation: Mapping[str, Any]) -> str:
    values = [str(value) for value in (variation.get("attributes") or {}).values() if value not in (None, "")]
    return " / ".join(values) or _text(variation.get("sku") or variation.get("supplier_sku") or variation.get("id"))


def _profile_configuration(profile: Mapping[str, Any]) -> Dict[str, Any]:
    configuration = profile.get("configuration") if isinstance(profile, Mapping) else None
    source = configuration if isinstance(configuration, Mapping) else profile
    return copy.deepcopy(dict(source or {}))


def _stored_variation_configuration(variation: Mapping[str, Any]) -> Dict[str, Any] | None:
    overrides = variation.get("print_area_overrides") or {}
    configuration = overrides.get(PRODUCTION_CONFIG_KEY) if isinstance(overrides, Mapping) else None
    if isinstance(configuration, Mapping):
        return copy.deepcopy(dict(configuration))
    return None


def _legacy_variation_configuration(
    variation: Mapping[str, Any],
    template: Mapping[str, Any],
) -> Dict[str, Any]:
    overrides = variation.get("print_area_overrides") or {}
    areas = []
    for source in _active_rows(template.get("print_areas")):
        area = copy.deepcopy(source)
        keys = [
            source.get("id"),
            source.get("area_key"),
            source.get("view_key"),
            source.get("screen_view"),
            "default",
        ]
        for key in filter(None, keys):
            value = overrides.get(key) if isinstance(overrides, Mapping) else None
            if isinstance(value, Mapping) and key != PRODUCTION_CONFIG_KEY:
                area.update(copy.deepcopy(value))
                break
        areas.append(area)
    return {
        "version": 3,
        "screens": copy.deepcopy(_active_rows(template.get("mockup_screens"))),
        "print_areas": areas,
        "print_option_ids": copy.deepcopy(template.get("print_option_ids") or []),
        "print_options": copy.deepcopy(template.get("print_options") or []),
    }


def _variation_configuration(
    variation: Mapping[str, Any],
    template: Mapping[str, Any],
) -> Dict[str, Any]:
    return _stored_variation_configuration(variation) or _legacy_variation_configuration(variation, template)


def _screen_identity(screen: Mapping[str, Any]) -> str:
    return _normalise(
        screen.get("view_key")
        or screen.get("view")
        or screen.get("screen_view")
        or screen.get("name")
        or screen.get("id")
        or "front"
    )


def _area_identity(area: Mapping[str, Any]) -> str:
    return _normalise(
        area.get("area_key")
        or area.get("name")
        or area.get("view_key")
        or area.get("screen_view")
        or area.get("id")
        or "print-area"
    )


def _area_rows_with_slots(configuration: Mapping[str, Any]) -> List[Dict[str, Any]]:
    screens = _active_rows(configuration.get("screens") or configuration.get("mockup_screens"))
    screen_by_id = {str(screen.get("id")): screen for screen in screens if screen.get("id")}
    counts: Dict[str, int] = {}
    rows: List[Dict[str, Any]] = []

    for area in _active_rows(configuration.get("print_areas")):
        screen = screen_by_id.get(str(area.get("screen_id") or ""), {})
        view = _screen_identity(screen) or _normalise(area.get("view_key") or area.get("screen_view") or "front")
        base = f"{view}::{_area_identity(area)}"
        occurrence = counts.get(base, 0)
        counts[base] = occurrence + 1
        rows.append({
            "area": area,
            "geometry_slot": f"{base}::{occurrence}",
        })

    return rows


def _geometry_row(
    *,
    template: Mapping[str, Any],
    configuration: Mapping[str, Any],
    area: Mapping[str, Any],
    geometry_slot: str,
    geometry_scope: str,
    production_attribute: str = "",
    production_value: str = "",
    production_profile_key: str = "",
    variation: Mapping[str, Any] | None = None,
) -> Dict[str, Any]:
    variation = variation or {}
    geometry_type = _normalise(area.get("geometry_type") or area.get("shape_type") or "rectangle").replace("-", "_")
    geometry_type = _GEOMETRY_ALIASES.get(geometry_type, geometry_type) or "rectangle"
    return {
        "template_id": _text(template.get("id")),
        "template_name": _text(template.get("name")),
        "source_updated_at": _time_text(template.get("updated_at")),
        "geometry_scope": geometry_scope,
        "production_attribute": production_attribute,
        "production_value": production_value,
        "production_profile_key": production_profile_key,
        "variation_id": _text(variation.get("id")),
        "variation_label": _variation_label(variation) if variation else "",
        "geometry_slot": geometry_slot,
        "print_area_id": _text(area.get("id")),
        "area_name": _text(area.get("name")),
        "area_key": _text(area.get("area_key")),
        "view_key": _text(area.get("view_key")),
        "screen_id": _text(area.get("screen_id")),
        "screen_view": _text(area.get("screen_view")),
        "geometry_type": geometry_type,
        "x_pct": _number_cell(area, "x_pct", "x"),
        "y_pct": _number_cell(area, "y_pct", "y"),
        "width_pct": _number_cell(area, "width_pct", "width"),
        "height_pct": _number_cell(area, "height_pct", "height"),
        "width_mm": _number_cell(area, "width_mm"),
        "height_mm": _number_cell(area, "height_mm"),
        "bleed_mm": _number_cell(area, "bleed_mm"),
        "safe_margin_mm": _number_cell(area, "safe_margin_mm", "safe_zone_mm"),
        "rotation_deg": _number_cell(area, "rotation_deg", "rotation"),
        "dpi": _number_cell(area, "dpi"),
        "fit_mode": _text(area.get("fit_mode")),
        "pricing_area_mode": _text(area.get("pricing_area_mode")),
        "required": _bool_cell(area, "required"),
        "polygon_points_json": _json_cell(area.get("polygon_points")),
        "mask_url": _text(area.get("mask_url") or area.get("clip_mask_url")),
        "allowed_print_option_ids_json": _json_cell(area.get("allowed_print_option_ids")),
        "standard_print_size_key": _text(area.get("standard_print_size_key") or area.get("print_size")),
        "notes": _text(area.get("notes")),
        "status": _text(area.get("status")),
    }


def production_geometry_rows(documents: Iterable[Mapping[str, Any]]) -> List[Dict[str, Any]]:
    """Return canonical editable geometry rows for the supplied templates."""
    rows: List[Dict[str, Any]] = []

    for template in sorted(documents, key=lambda item: _text(item.get("name")).lower()):
        variations = _active_rows(template.get("variations"))
        if not variations:
            # Non-variable products continue to use print_areas.csv.
            continue

        ownership = template.get("variation_inheritance") or {}
        if ownership.get("mode") == "attribute" and ownership.get("production_attribute"):
            production_attribute = _text(ownership.get("production_attribute"))
            profiles = template.get("attribute_production_profiles") or {}
            if isinstance(profiles, Mapping):
                for profile_key, profile in sorted(profiles.items(), key=lambda item: _text(item[0])):
                    if not isinstance(profile, Mapping):
                        continue
                    configuration = _profile_configuration(profile)
                    value = _text(profile.get("attribute_value") or profile_key)
                    for entry in _area_rows_with_slots(configuration):
                        rows.append(_geometry_row(
                            template=template,
                            configuration=configuration,
                            area=entry["area"],
                            geometry_slot=entry["geometry_slot"],
                            geometry_scope="attribute_profile",
                            production_attribute=production_attribute,
                            production_value=value,
                            production_profile_key=_text(profile_key),
                        ))
            continue

        for variation in variations:
            configuration = _variation_configuration(variation, template)
            for entry in _area_rows_with_slots(configuration):
                rows.append(_geometry_row(
                    template=template,
                    configuration=configuration,
                    area=entry["area"],
                    geometry_slot=entry["geometry_slot"],
                    geometry_scope="variation",
                    variation=variation,
                ))

    return rows


def _csv_bytes(columns: List[str], rows: Iterable[Mapping[str, Any]]) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=columns, extrasaction="ignore", lineterminator="\n")
    writer.writeheader()
    for row in rows:
        writer.writerow({column: row.get(column, "") for column in columns})
    return buffer.getvalue().encode("utf-8-sig")


def export_product_template_zip(documents: Iterable[Mapping[str, Any]]) -> bytes:
    documents = [dict(document) for document in documents]
    original_payload = _BASE_EXPORT(documents)
    geometry_rows = production_geometry_rows(documents)

    source = io.BytesIO(original_payload)
    output = io.BytesIO()
    with zipfile.ZipFile(source, "r") as existing, zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for info in existing.infolist():
            if info.is_dir() or PurePath(info.filename).name == "README.txt":
                continue
            archive.writestr(info, existing.read(info))

        archive.writestr(
            PRODUCTION_GEOMETRY_FILENAME,
            _csv_bytes(PRODUCTION_GEOMETRY_COLUMNS, geometry_rows),
        )

        readme = existing.read("README.txt").decode("utf-8") if "README.txt" in existing.namelist() else ""
        readme += f"""

{PRODUCTION_GEOMETRY_FILENAME}
    Canonical V3 variable-product print geometry.

How to use production geometry
------------------------------
1. For attribute-owned templates, one profile row set is exported per production
   attribute value (for example Size = XS). Edit it once and every matching
   Colour/Size variation is updated automatically.
2. For individual variation templates, rows are exported per exact variation.
3. Do not change geometry_scope, production_profile_key, variation_id,
   geometry_slot or print_area_id. They identify the existing geometry record.
4. x_pct/y_pct/width_pct/height_pct control the mockup/editor boundary.
5. width_mm/height_mm are the real manufacturing dimensions.
6. geometry_type may be rectangle, circle, ellipse, polygon or mask.
7. allowed_print_option_ids_json controls the allowed Manufacturing Rule profiles.
8. Empty editable cells mean leave the current value unchanged.
9. Importing this CSV directly or inside the normal ZIP uses the same guarded
   preview, timestamp check, backup and apply workflow as the existing files.
"""
        archive.writestr("README.txt", readme.encode("utf-8"))

    return output.getvalue()


def _empty_package() -> Dict[str, List[Dict[str, Any]]]:
    return {
        "templates": [],
        "variations": [],
        "print_areas": [],
        "production_geometry": [],
    }


def parse_product_template_import(filename: str, content: bytes) -> Dict[str, List[Dict[str, Any]]]:
    filename = PurePath(filename or "").name

    if filename.lower().endswith(".zip"):
        try:
            archive = zipfile.ZipFile(io.BytesIO(content))
        except zipfile.BadZipFile as error:
            raise ValueError("Uploaded ZIP file is invalid.") from error

        with archive:
            names = {PurePath(info.filename).name.lower(): info for info in archive.infolist() if not info.is_dir()}
            legacy_names = {
                legacy_csv.TEMPLATE_FILENAME,
                legacy_csv.VARIATION_FILENAME,
                legacy_csv.PRINT_AREA_FILENAME,
            }
            if any(name in names for name in legacy_names):
                package = _BASE_PARSE(filename, content)
            else:
                package = _empty_package()

            package.setdefault("production_geometry", [])
            geometry_info = names.get(PRODUCTION_GEOMETRY_FILENAME)
            if geometry_info:
                package["production_geometry"].extend(
                    _BASE_READ_CSV(archive.read(geometry_info), PRODUCTION_GEOMETRY_FILENAME)
                )

            if not any(package.get(key) for key in ("templates", "variations", "print_areas", "production_geometry")):
                raise ValueError("ZIP contains none of the supported CSV rows.")
            return package

    if filename.lower().endswith(".csv"):
        rows = _BASE_READ_CSV(content, filename)
        if not rows:
            raise ValueError("CSV contains no data rows.")
        headers = set(rows[0].keys())
        if filename.lower() == PRODUCTION_GEOMETRY_FILENAME or "geometry_scope" in headers or "geometry_slot" in headers:
            package = _empty_package()
            package["production_geometry"] = rows
            return package

    package = _BASE_PARSE(filename, content)
    package.setdefault("production_geometry", [])
    return package


def _cell(row: Mapping[str, Any], key: str) -> str:
    return legacy_csv._cell(row, key)


def _find_variation(template: Mapping[str, Any], variation_id: str) -> Dict[str, Any] | None:
    return next(
        (
            variation
            for variation in template.get("variations") or []
            if isinstance(variation, dict) and _text(variation.get("id")) == variation_id
        ),
        None,
    )


def _find_profile(template: Mapping[str, Any], profile_key: str) -> Dict[str, Any] | None:
    profiles = template.get("attribute_production_profiles") or {}
    profile = profiles.get(profile_key) if isinstance(profiles, Mapping) else None
    return profile if isinstance(profile, dict) else None


def _find_area(configuration: Mapping[str, Any], area_id: str) -> Dict[str, Any] | None:
    return next(
        (
            area
            for area in configuration.get("print_areas") or []
            if isinstance(area, dict) and _text(area.get("id")) == area_id
        ),
        None,
    )


def _find_area_by_slot(configuration: Mapping[str, Any], geometry_slot: str) -> Dict[str, Any] | None:
    return next(
        (
            entry["area"]
            for entry in _area_rows_with_slots(configuration)
            if entry["geometry_slot"] == geometry_slot
        ),
        None,
    )


def _variation_attribute_value(variation: Mapping[str, Any], attribute_name: str) -> str:
    wanted = _normalise(attribute_name)
    for key, value in (variation.get("attributes") or {}).items():
        if _normalise(key) == wanted:
            return _text(value)
    return ""


def _validate_geometry_changes(
    row: Mapping[str, Any],
    current: Mapping[str, Any],
) -> tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    changes, errors = _BASE_PARSE_CHANGES(row, current, GEOMETRY_SPECS)

    if "geometry_type" in changes and changes["geometry_type"].get("action") == "set":
        raw = _normalise(changes["geometry_type"].get("value")).replace("-", "_")
        value = _GEOMETRY_ALIASES.get(raw, raw)
        if value not in _GEOMETRY_TYPES:
            errors.append({"column": "geometry_type", "message": "expected rectangle, circle, ellipse, polygon or mask"})
        else:
            changes["geometry_type"]["value"] = value

    if "fit_mode" in changes and changes["fit_mode"].get("action") == "set":
        value = _text(changes["fit_mode"].get("value")).strip().lower()
        if value not in _FIT_MODES:
            errors.append({"column": "fit_mode", "message": "expected contain, cover or stretch"})
        else:
            changes["fit_mode"]["value"] = value

    if "pricing_area_mode" in changes and changes["pricing_area_mode"].get("action") == "set":
        value = _text(changes["pricing_area_mode"].get("value")).strip().lower()
        if value not in _PRICING_AREA_MODES:
            errors.append({"column": "pricing_area_mode", "message": "expected bounding_box or shape"})
        else:
            changes["pricing_area_mode"]["value"] = value

    for field in ("x_pct", "y_pct"):
        if field in changes and changes[field].get("action") == "set":
            value = float(changes[field]["value"])
            if value < 0 or value > 100:
                errors.append({"column": field, "message": "must be between 0 and 100"})

    for field in ("width_pct", "height_pct"):
        if field in changes and changes[field].get("action") == "set":
            value = float(changes[field]["value"])
            if value <= 0 or value > 100:
                errors.append({"column": field, "message": "must be greater than 0 and no more than 100"})

    for field in ("width_mm", "height_mm", "dpi"):
        if field in changes and changes[field].get("action") == "set":
            if float(changes[field]["value"]) <= 0:
                errors.append({"column": field, "message": "must be greater than 0"})

    for field in ("bleed_mm", "safe_margin_mm"):
        if field in changes and changes[field].get("action") == "set":
            if float(changes[field]["value"]) < 0:
                errors.append({"column": field, "message": "may not be negative"})

    return changes, errors


def build_import_plan(
    current_documents: Iterable[Mapping[str, Any]],
    package: Mapping[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    documents = [dict(document) for document in current_documents]
    legacy_package = {
        "templates": package.get("templates") or [],
        "variations": package.get("variations") or [],
        "print_areas": package.get("print_areas") or [],
    }
    plan = _BASE_BUILD_PLAN(documents, legacy_package)
    plan["production_geometry_updates"] = []

    by_id = {_text(document.get("id")): document for document in documents if document.get("id")}
    seen = set()

    for row in package.get("production_geometry") or []:
        template_id = _cell(row, "template_id")
        scope = _cell(row, "geometry_scope").lower()
        profile_key = _cell(row, "production_profile_key")
        variation_id = _cell(row, "variation_id")
        area_id = _cell(row, "print_area_id")
        geometry_slot = _cell(row, "geometry_slot")

        if not scope:
            scope = "attribute_profile" if profile_key else "variation" if variation_id else ""

        duplicate_key = (template_id, scope, profile_key or variation_id, area_id)
        if duplicate_key in seen:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "duplicate import row"))
            continue
        seen.add(duplicate_key)

        current = by_id.get(template_id)
        if not template_id:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "template_id is required"))
            continue
        if current is None:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "template_id does not exist; CSV import cannot create templates"))
            continue

        source_updated_at = _cell(row, "source_updated_at")
        current_updated_at = _time_text(current.get("updated_at"))
        if current_updated_at and not source_updated_at:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "source_updated_at is required for templates that already have a version timestamp"))
            continue
        stale = _BASE_STALE_ERROR(row, current)
        if stale:
            plan["errors"].append(stale)
            continue

        if not area_id:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "print_area_id is required"))
            continue
        if not geometry_slot:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "geometry_slot is required"))
            continue

        current_area = None
        production_attribute = _cell(row, "production_attribute")
        production_value = _cell(row, "production_value")

        if scope == "attribute_profile":
            ownership = current.get("variation_inheritance") or {}
            if ownership.get("mode") != "attribute":
                plan["errors"].append(_BASE_CONTEXT_ERROR(row, "template is not using attribute-owned production geometry"))
                continue
            expected_attribute = _text(ownership.get("production_attribute"))
            if production_attribute and _normalise(production_attribute) != _normalise(expected_attribute):
                plan["errors"].append(_BASE_CONTEXT_ERROR(row, "production_attribute does not match the template production owner"))
                continue
            production_attribute = expected_attribute
            if not profile_key:
                plan["errors"].append(_BASE_CONTEXT_ERROR(row, "production_profile_key is required for attribute_profile geometry"))
                continue
            profile = _find_profile(current, profile_key)
            if profile is None:
                plan["errors"].append(_BASE_CONTEXT_ERROR(row, "production profile does not exist; CSV import cannot create geometry profiles", production_profile_key=profile_key))
                continue
            expected_value = _text(profile.get("attribute_value") or profile_key)
            if production_value and _normalise(production_value) != _normalise(expected_value):
                plan["errors"].append(_BASE_CONTEXT_ERROR(row, "production_value does not match the stored production profile"))
                continue
            production_value = expected_value
            configuration = _profile_configuration(profile)
            current_area = _find_area(configuration, area_id)
        elif scope == "variation":
            if not variation_id:
                plan["errors"].append(_BASE_CONTEXT_ERROR(row, "variation_id is required for variation geometry"))
                continue
            variation = _find_variation(current, variation_id)
            if variation is None:
                plan["errors"].append(_BASE_CONTEXT_ERROR(row, "variation_id does not exist; CSV import cannot create variations", variation_id=variation_id))
                continue
            configuration = _variation_configuration(variation, current)
            current_area = _find_area(configuration, area_id)
        else:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "geometry_scope must be attribute_profile or variation"))
            continue

        if current_area is None:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "print_area_id does not exist in this production geometry configuration", print_area_id=area_id))
            continue

        actual_slot = next(
            (entry["geometry_slot"] for entry in _area_rows_with_slots(configuration) if _text(entry["area"].get("id")) == area_id),
            "",
        )
        if actual_slot and geometry_slot != actual_slot:
            plan["errors"].append(_BASE_CONTEXT_ERROR(row, "geometry_slot no longer matches this print area; export a fresh CSV", expected_geometry_slot=actual_slot))
            continue

        changes, field_errors = _validate_geometry_changes(row, current_area)
        for error in field_errors:
            plan["errors"].append(_BASE_CONTEXT_ERROR(
                row,
                error.pop("message"),
                production_profile_key=profile_key or None,
                variation_id=variation_id or None,
                print_area_id=area_id,
                **error,
            ))
        if field_errors:
            continue

        if changes:
            plan["production_geometry_updates"].append({
                "template_id": template_id,
                "geometry_scope": scope,
                "production_attribute": production_attribute,
                "production_value": production_value,
                "production_profile_key": profile_key,
                "variation_id": variation_id,
                "geometry_slot": geometry_slot,
                "print_area_id": area_id,
                "changes": changes,
            })

    touched = set(plan.get("touched_template_ids") or [])
    touched.update(update["template_id"] for update in plan["production_geometry_updates"])
    plan["touched_template_ids"] = sorted(touched)

    geometry_changed_cells = sum(len(update.get("changes") or {}) for update in plan["production_geometry_updates"])
    summary = dict(plan.get("summary") or {})
    summary["production_geometry_rows"] = len(package.get("production_geometry") or [])
    summary["production_geometry_updates"] = len(plan["production_geometry_updates"])
    summary["changed_cells"] = int(summary.get("changed_cells") or 0) + geometry_changed_cells
    summary["touched_templates"] = len(plan["touched_template_ids"])
    summary["error_count"] = len(plan.get("errors") or [])
    summary["warning_count"] = len(plan.get("warnings") or [])
    plan["summary"] = summary
    plan["can_apply"] = not plan["errors"] and summary["changed_cells"] > 0
    return plan


def _mirror_geometry_fields(area: MutableMapping[str, Any], changes: Mapping[str, Mapping[str, Any]]) -> None:
    for pct_field, legacy_field in (
        ("x_pct", "x"),
        ("y_pct", "y"),
        ("width_pct", "width"),
        ("height_pct", "height"),
    ):
        if pct_field in changes and changes[pct_field].get("action") == "set":
            area[legacy_field] = area.get(pct_field)

    if "geometry_type" in changes:
        if changes["geometry_type"].get("action") == "set":
            area["shape_type"] = area.get("geometry_type")
            area["clip_shape"] = area.get("geometry_type")

    if "mask_url" in changes:
        if changes["mask_url"].get("action") == "unset":
            area.pop("clip_mask_url", None)
        else:
            area["clip_mask_url"] = area.get("mask_url", "")

    if "standard_print_size_key" in changes and changes["standard_print_size_key"].get("action") == "set":
        area["print_size"] = area.get("standard_print_size_key")


def _apply_geometry_changes(area: MutableMapping[str, Any], changes: Mapping[str, Mapping[str, Any]]) -> None:
    _BASE_APPLY_CHANGE_MAP(area, changes)
    _mirror_geometry_fields(area, changes)


def _refresh_configuration(configuration: MutableMapping[str, Any], configured_at: str) -> None:
    option_ids = []
    seen = set()
    for area in _active_rows(configuration.get("print_areas")):
        for option_id in area.get("allowed_print_option_ids") or []:
            key = _text(option_id)
            if key and key not in seen:
                seen.add(key)
                option_ids.append(option_id)
    configuration["print_option_ids"] = option_ids
    configuration["version"] = max(int(configuration.get("version") or 0), 3)
    configuration["configured_at"] = configured_at


def _apply_to_variation_configuration(
    variation: MutableMapping[str, Any],
    geometry_slot: str,
    changes: Mapping[str, Mapping[str, Any]],
    configured_at: str,
) -> bool:
    overrides = variation.get("print_area_overrides")
    if not isinstance(overrides, dict):
        return False
    configuration = overrides.get(PRODUCTION_CONFIG_KEY)
    if not isinstance(configuration, dict):
        return False
    target_area = _find_area_by_slot(configuration, geometry_slot)
    if target_area is None:
        return False
    _apply_geometry_changes(target_area, changes)
    _refresh_configuration(configuration, configured_at)
    if target_area.get("id"):
        overrides[str(target_area["id"])] = copy.deepcopy(target_area)
    return True


def apply_import_plan_to_documents(
    current_documents: Iterable[Mapping[str, Any]],
    plan: Mapping[str, Any],
    updated_at: Any,
) -> Dict[str, Any]:
    documents = [dict(document) for document in current_documents]
    applied = _BASE_APPLY(documents, plan, updated_at)
    configured_at = _time_text(updated_at)

    for update in plan.get("production_geometry_updates") or []:
        template_id = update["template_id"]
        target = applied["documents"].get(template_id)
        if target is None:
            raise ValueError(f"Template disappeared before geometry apply: {template_id}")

        scope = update["geometry_scope"]
        changes = update.get("changes") or {}
        geometry_slot = update["geometry_slot"]

        if scope == "attribute_profile":
            profile_key = update["production_profile_key"]
            profile = _find_profile(target, profile_key)
            if profile is None:
                raise ValueError(f"Production profile disappeared before apply: {template_id}/{profile_key}")
            configuration = profile.get("configuration") if isinstance(profile.get("configuration"), dict) else profile
            area = _find_area(configuration, update["print_area_id"])
            if area is None:
                raise ValueError(f"Production profile print area disappeared before apply: {template_id}/{profile_key}/{update['print_area_id']}")
            _apply_geometry_changes(area, changes)
            _refresh_configuration(configuration, configured_at)
            profile["updated_at"] = configured_at

            production_attribute = update.get("production_attribute") or ""
            production_value = update.get("production_value") or _text(profile.get("attribute_value") or profile_key)
            for variation in _active_rows(target.get("variations")):
                if _normalise(_variation_attribute_value(variation, production_attribute)) != _normalise(production_value):
                    continue
                _apply_to_variation_configuration(
                    variation,
                    geometry_slot,
                    changes,
                    configured_at,
                )

        elif scope == "variation":
            variation = _find_variation(target, update["variation_id"])
            if variation is None:
                raise ValueError(f"Variation disappeared before geometry apply: {template_id}/{update['variation_id']}")
            if not _apply_to_variation_configuration(variation, geometry_slot, changes, configured_at):
                # Legacy/uncompiled variation fallback. Keep its direct area override usable.
                overrides = variation.setdefault("print_area_overrides", {})
                direct = overrides.setdefault(update["print_area_id"], {})
                _apply_geometry_changes(direct, changes)
        else:
            raise ValueError(f"Unsupported geometry scope during apply: {scope}")

        target["updated_at"] = configured_at

    return applied
