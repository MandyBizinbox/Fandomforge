"""Safe CSV export/import planning for existing product templates.

This module is deliberately database-agnostic:

* Export current product-template documents into a ZIP containing three CSVs.
* Parse an exported ZIP or an individual CSV.
* Build a patch-only import preview against current documents.
* Never create templates, variations, or print areas.
* Empty cells mean "leave unchanged".
* __CLEAR__ means remove the field.
* source_updated_at provides optimistic concurrency protection.

Database writes are intentionally handled by the authenticated admin route.
"""

from __future__ import annotations

import copy
import csv
import io
import json
import math
import zipfile
from datetime import datetime
from pathlib import PurePath
from typing import Any, Dict, Iterable, List, Mapping, MutableMapping


CLEAR_TOKEN = "__CLEAR__"

MAX_IMPORT_ROWS = 10_000
MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024

TEMPLATE_FILENAME = "templates.csv"
VARIATION_FILENAME = "variations.csv"
PRINT_AREA_FILENAME = "print_areas.csv"

TEMPLATE_COLUMNS = [
    "template_id",
    "source_updated_at",
    "blank_sku",
    "name",
    "description",
    "brand",
    "category",
    "category_id",
    "product_type_id",
    "status",
    "creator_visible",
    "admin_visible",
    "platform_blank_cost",
    "creator_blank_price",
    "base_blank_cost",
    "base_price",
    "product_image_url",
    "mockup_url",
    "available_sizes_json",
    "available_colors_json",
    "print_option_ids_json",
    "supplier_name",
    "supplier_url",
    "supplier_notes",
    "csv_readiness_notes",
    "variation_count",
    "print_area_count",
    "mockup_view_count",
]

VARIATION_COLUMNS = [
    "template_id",
    "template_name",
    "source_updated_at",
    "variation_id",
    "enabled",
    "status",
    "sku",
    "supplier_sku",
    "attributes_json",
    "platform_blank_cost",
    "creator_blank_price",
    "base_blank_cost",
    "cost",
    "image_url",
    "sort_order",
]

PRINT_AREA_COLUMNS = [
    "template_id",
    "template_name",
    "source_updated_at",
    "print_area_id",
    "name",
    "view_key",
    "screen_id",
    "screen_view",
    "x_pct",
    "y_pct",
    "width_pct",
    "height_pct",
    "width_mm",
    "height_mm",
    "required",
    "allowed_print_option_ids_json",
    "standard_print_size_key",
    "notes",
    "status",
]


# CSV column -> (Mongo/document field, data type, may be cleared)
TEMPLATE_SPECS = {
    "blank_sku": ("blank_sku", "text", True),
    "name": ("name", "text", False),
    "description": ("description", "text", True),
    "brand": ("brand", "text", True),
    "category": ("category", "text", False),
    "category_id": ("category_id", "text", True),
    "product_type_id": ("product_type_id", "text", True),
    "status": ("status", "status", False),
    "creator_visible": ("creator_visible", "bool", True),
    "admin_visible": ("admin_visible", "bool", True),
    "platform_blank_cost": ("platform_blank_cost", "float", True),
    "creator_blank_price": ("creator_blank_price", "float", True),
    "base_blank_cost": ("base_blank_cost", "float", True),
    "base_price": ("base_price", "float", True),
    "product_image_url": ("product_image_url", "text", True),
    "mockup_url": ("mockup_url", "text", True),
    "available_sizes_json": ("available_sizes", "json_list", True),
    "available_colors_json": ("available_colors", "json_list", True),
    "print_option_ids_json": ("print_option_ids", "json_list", True),
    "supplier_name": ("supplier_name", "text", True),
    "supplier_url": ("supplier_url", "text", True),
    "supplier_notes": ("supplier_notes", "text", True),
}

VARIATION_SPECS = {
    "enabled": ("enabled", "bool", True),
    "status": ("status", "status", True),
    "sku": ("sku", "text", True),
    "supplier_sku": ("supplier_sku", "text", True),
    "attributes_json": ("attributes", "json_object", False),
    "platform_blank_cost": ("platform_blank_cost", "float", True),
    "creator_blank_price": ("creator_blank_price", "float", True),
    "base_blank_cost": ("base_blank_cost", "float", True),
    "cost": ("cost", "float", True),
    "image_url": ("image_url", "text", True),
    "sort_order": ("sort_order", "int", True),
}

PRINT_AREA_SPECS = {
    "name": ("name", "text", True),
    "view_key": ("view_key", "text", True),
    "screen_id": ("screen_id", "text", True),
    "screen_view": ("screen_view", "text", True),
    "x_pct": ("x_pct", "float", True),
    "y_pct": ("y_pct", "float", True),
    "width_pct": ("width_pct", "float", True),
    "height_pct": ("height_pct", "float", True),
    "width_mm": ("width_mm", "float", True),
    "height_mm": ("height_mm", "float", True),
    "required": ("required", "bool", True),
    "allowed_print_option_ids_json": (
        "allowed_print_option_ids",
        "json_list",
        True,
    ),
    "standard_print_size_key": (
        "standard_print_size_key",
        "text",
        True,
    ),
    "notes": ("notes", "text", True),
    "status": ("status", "status", True),
}

ALLOWED_STATUSES = {
    "active",
    "archived",
    "draft",
}


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _time_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, datetime):
        return value.isoformat()
    return str(value)


def _json_cell(value: Any) -> str:
    if value is None:
        return ""
    return json.dumps(
        value,
        ensure_ascii=False,
        separators=(",", ":"),
        default=str,
    )


def _bool_cell(document: Mapping[str, Any], field: str) -> str:
    if field not in document:
        return ""
    value = document.get(field)
    if value is True:
        return "true"
    if value is False:
        return "false"
    return "" if value is None else str(value)


def _number_cell(document: Mapping[str, Any], field: str) -> Any:
    if field not in document or document.get(field) is None:
        return ""
    return document.get(field)


def _active_rows(value: Any) -> List[Dict[str, Any]]:
    if not isinstance(value, list):
        return []

    return [
        row
        for row in value
        if isinstance(row, dict)
        and row.get("enabled") is not False
        and str(row.get("status") or "").strip().lower() != "archived"
        and not row.get("archived")
        and not row.get("deleted")
    ]


def _positive_number(value: Any) -> bool:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(number) and number > 0


def _has_blank_cost(template: Mapping[str, Any]) -> bool:
    for field in (
        "creator_blank_price",
        "base_blank_cost",
        "base_price",
        "platform_blank_cost",
    ):
        if _positive_number(template.get(field)):
            return True

    for variation in _active_rows(template.get("variations")):
        for field in (
            "creator_blank_price",
            "base_blank_cost",
            "platform_blank_cost",
            "cost",
        ):
            if _positive_number(variation.get(field)):
                return True

    return False


def _has_image(template: Mapping[str, Any]) -> bool:
    for field in (
        "creator_catalogue_thumbnail_url",
        "product_image_url",
        "mockup_url",
    ):
        if str(template.get(field) or "").strip():
            return True

    if any(str(value or "").strip() for value in template.get("mockup_images") or []):
        return True

    for variation in _active_rows(template.get("variations")):
        if str(variation.get("image_url") or "").strip():
            return True
        if any(
            str(value or "").strip()
            for value in (variation.get("mockup_screen_overrides") or {}).values()
        ):
            return True

    for screen in _active_rows(template.get("mockup_screens")):
        if str(screen.get("image_url") or "").strip():
            return True

    return False


def readiness_notes(template: Mapping[str, Any]) -> List[str]:
    """Return CSV preparation hints, not the authoritative launch gate."""

    notes: List[str] = []

    if not str(template.get("description") or "").strip():
        notes.append("missing_description")

    if not _has_image(template):
        notes.append("missing_image")

    if not _has_blank_cost(template):
        notes.append("missing_blank_cost")

    if not (
        template.get("print_option_ids")
        or template.get("print_options")
    ):
        notes.append("missing_print_options")

    if not _active_rows(template.get("print_areas")):
        notes.append("missing_print_areas")

    if not _active_rows(template.get("mockup_screens")):
        notes.append("missing_mockup_views")

    if template.get("creator_visible") is False:
        notes.append("creator_hidden")

    return notes


def _csv_bytes(
    columns: List[str],
    rows: Iterable[Mapping[str, Any]],
) -> bytes:
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(
        buffer,
        fieldnames=columns,
        extrasaction="ignore",
        lineterminator="\n",
    )
    writer.writeheader()

    for row in rows:
        writer.writerow(
            {
                column: row.get(column, "")
                for column in columns
            }
        )

    # UTF-8 BOM improves Excel compatibility.
    return buffer.getvalue().encode("utf-8-sig")


def export_product_template_zip(
    documents: Iterable[Mapping[str, Any]],
) -> bytes:
    """Export templates and nested records as a round-trippable ZIP."""

    templates = sorted(
        [dict(document) for document in documents],
        key=lambda row: str(row.get("name") or "").lower(),
    )

    template_rows: List[Dict[str, Any]] = []
    variation_rows: List[Dict[str, Any]] = []
    print_area_rows: List[Dict[str, Any]] = []

    for template in templates:
        template_id = _text(template.get("id"))
        template_name = _text(template.get("name"))
        updated_at = _time_text(template.get("updated_at"))
        variations = [
            row
            for row in template.get("variations") or []
            if isinstance(row, dict)
        ]
        print_areas = [
            row
            for row in template.get("print_areas") or []
            if isinstance(row, dict)
        ]
        mockup_screens = [
            row
            for row in template.get("mockup_screens") or []
            if isinstance(row, dict)
        ]

        template_rows.append({
            "template_id": template_id,
            "source_updated_at": updated_at,
            "blank_sku": _text(template.get("blank_sku")),
            "name": template_name,
            "description": _text(template.get("description")),
            "brand": _text(template.get("brand")),
            "category": _text(template.get("category")),
            "category_id": _text(template.get("category_id")),
            "product_type_id": _text(template.get("product_type_id")),
            "status": _text(template.get("status")),
            "creator_visible": _bool_cell(template, "creator_visible"),
            "admin_visible": _bool_cell(template, "admin_visible"),
            "platform_blank_cost": _number_cell(
                template,
                "platform_blank_cost",
            ),
            "creator_blank_price": _number_cell(
                template,
                "creator_blank_price",
            ),
            "base_blank_cost": _number_cell(
                template,
                "base_blank_cost",
            ),
            "base_price": _number_cell(template, "base_price"),
            "product_image_url": _text(
                template.get("product_image_url")
            ),
            "mockup_url": _text(template.get("mockup_url")),
            "available_sizes_json": _json_cell(
                template.get("available_sizes")
            ),
            "available_colors_json": _json_cell(
                template.get("available_colors")
            ),
            "print_option_ids_json": _json_cell(
                template.get("print_option_ids")
            ),
            "supplier_name": _text(template.get("supplier_name")),
            "supplier_url": _text(template.get("supplier_url")),
            "supplier_notes": _text(template.get("supplier_notes")),
            "csv_readiness_notes": ";".join(
                readiness_notes(template)
            ),
            "variation_count": len(variations),
            "print_area_count": len(print_areas),
            "mockup_view_count": len(mockup_screens),
        })

        for variation in variations:
            variation_rows.append({
                "template_id": template_id,
                "template_name": template_name,
                "source_updated_at": updated_at,
                "variation_id": _text(variation.get("id")),
                "enabled": _bool_cell(variation, "enabled"),
                "status": _text(variation.get("status")),
                "sku": _text(variation.get("sku")),
                "supplier_sku": _text(
                    variation.get("supplier_sku")
                ),
                "attributes_json": _json_cell(
                    variation.get("attributes")
                ),
                "platform_blank_cost": _number_cell(
                    variation,
                    "platform_blank_cost",
                ),
                "creator_blank_price": _number_cell(
                    variation,
                    "creator_blank_price",
                ),
                "base_blank_cost": _number_cell(
                    variation,
                    "base_blank_cost",
                ),
                "cost": _number_cell(variation, "cost"),
                "image_url": _text(variation.get("image_url")),
                "sort_order": _number_cell(
                    variation,
                    "sort_order",
                ),
            })

        for area in print_areas:
            print_area_rows.append({
                "template_id": template_id,
                "template_name": template_name,
                "source_updated_at": updated_at,
                "print_area_id": _text(area.get("id")),
                "name": _text(area.get("name")),
                "view_key": _text(area.get("view_key")),
                "screen_id": _text(area.get("screen_id")),
                "screen_view": _text(area.get("screen_view")),
                "x_pct": _number_cell(area, "x_pct"),
                "y_pct": _number_cell(area, "y_pct"),
                "width_pct": _number_cell(area, "width_pct"),
                "height_pct": _number_cell(area, "height_pct"),
                "width_mm": _number_cell(area, "width_mm"),
                "height_mm": _number_cell(area, "height_mm"),
                "required": _bool_cell(area, "required"),
                "allowed_print_option_ids_json": _json_cell(
                    area.get("allowed_print_option_ids")
                ),
                "standard_print_size_key": _text(
                    area.get("standard_print_size_key")
                ),
                "notes": _text(area.get("notes")),
                "status": _text(area.get("status")),
            })

    readme = f"""FandomForge Product Template CSV Export

Files
-----
{TEMPLATE_FILENAME}
    One row per product template.

{VARIATION_FILENAME}
    One row per existing template variation.

{PRINT_AREA_FILENAME}
    One row per existing print area.

Import rules
------------
1. template_id, variation_id and print_area_id are immutable identifiers.
2. Empty editable cells leave the stored value unchanged.
3. Enter {CLEAR_TOKEN} to remove an optional field.
4. Imports update existing records only.
5. Imports never create templates, variations or print areas.
6. source_updated_at prevents stale exports from overwriting newer changes.
7. csv_readiness_notes is advisory and is not the authoritative launch gate.
8. Image URLs may reference images already uploaded through FandomForge.
"""

    output = io.BytesIO()

    with zipfile.ZipFile(
        output,
        mode="w",
        compression=zipfile.ZIP_DEFLATED,
    ) as archive:
        archive.writestr(
            TEMPLATE_FILENAME,
            _csv_bytes(TEMPLATE_COLUMNS, template_rows),
        )
        archive.writestr(
            VARIATION_FILENAME,
            _csv_bytes(VARIATION_COLUMNS, variation_rows),
        )
        archive.writestr(
            PRINT_AREA_FILENAME,
            _csv_bytes(PRINT_AREA_COLUMNS, print_area_rows),
        )
        archive.writestr("README.txt", readme.encode("utf-8"))

    return output.getvalue()


def _read_csv(
    content: bytes,
    source_name: str,
) -> List[Dict[str, Any]]:
    try:
        decoded = content.decode("utf-8-sig")
    except UnicodeDecodeError as error:
        raise ValueError(
            f"{source_name} must be UTF-8 encoded."
        ) from error

    reader = csv.DictReader(io.StringIO(decoded))

    if not reader.fieldnames:
        raise ValueError(f"{source_name} has no CSV header.")

    headers = [
        str(header or "").strip()
        for header in reader.fieldnames
    ]

    if len(headers) != len(set(headers)):
        raise ValueError(
            f"{source_name} contains duplicate column names."
        )

    rows: List[Dict[str, Any]] = []

    for row_number, source_row in enumerate(reader, start=2):
        if len(rows) >= MAX_IMPORT_ROWS:
            raise ValueError(
                f"Import exceeds the {MAX_IMPORT_ROWS} row limit."
            )

        row = {
            str(key or "").strip(): value
            for key, value in source_row.items()
            if key is not None
        }

        if not any(
            str(value or "").strip()
            for value in row.values()
        ):
            continue

        row["_source_file"] = source_name
        row["_row_number"] = row_number
        rows.append(row)

    return rows


def _infer_csv_kind(headers: Iterable[str]) -> str:
    header_set = {
        str(header or "").strip()
        for header in headers
    }

    if "variation_id" in header_set:
        return "variations"

    if "print_area_id" in header_set:
        return "print_areas"

    if "template_id" in header_set:
        return "templates"

    raise ValueError(
        "CSV type could not be determined from its headers."
    )


def parse_product_template_import(
    filename: str,
    content: bytes,
) -> Dict[str, List[Dict[str, Any]]]:
    """Parse one export ZIP or one of its individual CSV files."""

    filename = PurePath(filename or "").name
    package = {
        "templates": [],
        "variations": [],
        "print_areas": [],
    }

    if filename.lower().endswith(".zip"):
        try:
            archive = zipfile.ZipFile(io.BytesIO(content))
        except zipfile.BadZipFile as error:
            raise ValueError("Uploaded ZIP file is invalid.") from error

        total_uncompressed = 0
        recognised = 0

        with archive:
            for info in archive.infolist():
                if info.is_dir():
                    continue

                if info.flag_bits & 0x1:
                    raise ValueError(
                        "Password-protected ZIP files are not supported."
                    )

                total_uncompressed += info.file_size

                if total_uncompressed > MAX_UNCOMPRESSED_BYTES:
                    raise ValueError(
                        "ZIP expands beyond the allowed size."
                    )

                basename = PurePath(info.filename).name.lower()

                kind_by_name = {
                    TEMPLATE_FILENAME: "templates",
                    VARIATION_FILENAME: "variations",
                    PRINT_AREA_FILENAME: "print_areas",
                }

                kind = kind_by_name.get(basename)

                if not kind:
                    continue

                package[kind].extend(
                    _read_csv(
                        archive.read(info),
                        PurePath(info.filename).name,
                    )
                )
                recognised += 1

        if recognised == 0:
            raise ValueError(
                "ZIP contains none of the supported CSV files."
            )

        return package

    if filename.lower().endswith(".csv"):
        rows = _read_csv(content, filename)

        if not rows:
            raise ValueError("CSV contains no data rows.")

        kind = _infer_csv_kind(rows[0].keys())
        package[kind] = rows
        return package

    raise ValueError(
        "Upload must be a .zip or .csv file."
    )


def _cell(row: Mapping[str, Any], key: str) -> str:
    value = row.get(key)
    if value is None:
        return ""
    return str(value).strip()


def _parse_bool(value: str) -> bool:
    normalised = value.strip().lower()

    if normalised in {"true", "1", "yes", "y"}:
        return True

    if normalised in {"false", "0", "no", "n"}:
        return False

    raise ValueError("expected true or false")


def _parse_number(value: str, integer: bool = False) -> Any:
    try:
        number = float(value)
    except ValueError as error:
        raise ValueError("expected a number") from error

    if not math.isfinite(number):
        raise ValueError("number must be finite")

    if integer:
        if not number.is_integer():
            raise ValueError("expected a whole number")
        return int(number)

    return number


def _parse_value(value: str, value_type: str) -> Any:
    if value_type == "text":
        return value

    if value_type == "bool":
        return _parse_bool(value)

    if value_type == "float":
        return _parse_number(value)

    if value_type == "int":
        return _parse_number(value, integer=True)

    if value_type == "status":
        normalised = value.strip().lower().replace("-", "_")

        if normalised not in ALLOWED_STATUSES:
            raise ValueError(
                "unsupported status; expected active, draft or archived"
            )

        return normalised.replace(" ", "_")

    if value_type in {"json_list", "json_object"}:
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as error:
            raise ValueError("expected valid JSON") from error

        if value_type == "json_list" and not isinstance(parsed, list):
            raise ValueError("expected a JSON array")

        if value_type == "json_object" and not isinstance(parsed, dict):
            raise ValueError("expected a JSON object")

        return parsed

    raise ValueError(f"unsupported field type {value_type}")


def _values_equal(left: Any, right: Any) -> bool:
    if isinstance(left, bool) or isinstance(right, bool):
        return left is right

    if isinstance(left, (int, float)) and isinstance(
        right,
        (int, float),
    ):
        return math.isclose(
            float(left),
            float(right),
            rel_tol=0,
            abs_tol=1e-9,
        )

    return left == right


def _parse_changes(
    row: Mapping[str, Any],
    current: Mapping[str, Any],
    specs: Mapping[str, tuple[str, str, bool]],
) -> tuple[Dict[str, Dict[str, Any]], List[Dict[str, Any]]]:
    changes: Dict[str, Dict[str, Any]] = {}
    errors: List[Dict[str, Any]] = []

    for column, (
        target_field,
        value_type,
        allow_clear,
    ) in specs.items():
        raw = _cell(row, column)

        if not raw:
            continue

        if raw == CLEAR_TOKEN:
            if not allow_clear:
                errors.append({
                    "column": column,
                    "message": "field may not be cleared",
                })
                continue

            if target_field in current:
                changes[target_field] = {
                    "action": "unset",
                }
            continue

        try:
            value = _parse_value(raw, value_type)
        except ValueError as error:
            errors.append({
                "column": column,
                "message": str(error),
                "value": raw,
            })
            continue

        if not _values_equal(current.get(target_field), value):
            changes[target_field] = {
                "action": "set",
                "value": value,
            }

    return changes, errors


def _contextual_error(
    row: Mapping[str, Any],
    message: str,
    **extra: Any,
) -> Dict[str, Any]:
    return {
        "source_file": row.get("_source_file"),
        "row_number": row.get("_row_number"),
        "template_id": _cell(row, "template_id"),
        "message": message,
        **extra,
    }


def _stale_error(
    row: Mapping[str, Any],
    current: Mapping[str, Any],
) -> Dict[str, Any] | None:
    expected = _cell(row, "source_updated_at")

    if not expected:
        return None

    actual = _time_text(current.get("updated_at"))

    if expected == actual:
        return None

    return _contextual_error(
        row,
        "template changed after this CSV was exported",
        expected_updated_at=expected,
        current_updated_at=actual,
    )


def build_import_plan(
    current_documents: Iterable[Mapping[str, Any]],
    package: Mapping[str, List[Dict[str, Any]]],
) -> Dict[str, Any]:
    """Build a non-mutating patch plan against current documents."""

    documents = [
        dict(document)
        for document in current_documents
    ]

    by_id = {
        _text(document.get("id")): document
        for document in documents
        if _text(document.get("id"))
    }

    plan: Dict[str, Any] = {
        "template_updates": [],
        "variation_updates": [],
        "print_area_updates": [],
        "errors": [],
        "warnings": [],
    }

    seen_template_rows = set()
    seen_variation_rows = set()
    seen_print_area_rows = set()

    def validate_base(
        row: Mapping[str, Any],
        duplicate_key: Any,
        seen: set,
    ) -> Mapping[str, Any] | None:
        template_id = _cell(row, "template_id")

        if not template_id:
            plan["errors"].append(
                _contextual_error(
                    row,
                    "template_id is required",
                )
            )
            return None

        if duplicate_key in seen:
            plan["errors"].append(
                _contextual_error(
                    row,
                    "duplicate import row",
                )
            )
            return None

        seen.add(duplicate_key)

        current = by_id.get(template_id)

        if current is None:
            plan["errors"].append(
                _contextual_error(
                    row,
                    "template_id does not exist; "
                    "CSV import cannot create templates",
                )
            )
            return None

        stale = _stale_error(row, current)

        if stale:
            plan["errors"].append(stale)
            return None

        return current

    for row in package.get("templates") or []:
        template_id = _cell(row, "template_id")
        current = validate_base(
            row,
            template_id,
            seen_template_rows,
        )

        if current is None:
            continue

        changes, field_errors = _parse_changes(
            row,
            current,
            TEMPLATE_SPECS,
        )

        for error in field_errors:
            plan["errors"].append(
                _contextual_error(
                    row,
                    error.pop("message"),
                    **error,
                )
            )

        if field_errors:
            continue

        if changes:
            plan["template_updates"].append({
                "template_id": template_id,
                "changes": changes,
            })

    for row in package.get("variations") or []:
        template_id = _cell(row, "template_id")
        variation_id = _cell(row, "variation_id")
        duplicate_key = (template_id, variation_id)

        current = validate_base(
            row,
            duplicate_key,
            seen_variation_rows,
        )

        if current is None:
            continue

        if not variation_id:
            plan["errors"].append(
                _contextual_error(
                    row,
                    "variation_id is required",
                )
            )
            continue

        variations = [
            value
            for value in current.get("variations") or []
            if isinstance(value, dict)
        ]

        variation = next(
            (
                value
                for value in variations
                if _text(value.get("id")) == variation_id
            ),
            None,
        )

        if variation is None:
            plan["errors"].append(
                _contextual_error(
                    row,
                    "variation_id does not exist; "
                    "CSV import cannot create variations",
                    variation_id=variation_id,
                )
            )
            continue

        changes, field_errors = _parse_changes(
            row,
            variation,
            VARIATION_SPECS,
        )

        for error in field_errors:
            plan["errors"].append(
                _contextual_error(
                    row,
                    error.pop("message"),
                    variation_id=variation_id,
                    **error,
                )
            )

        if field_errors:
            continue

        if changes:
            plan["variation_updates"].append({
                "template_id": template_id,
                "variation_id": variation_id,
                "changes": changes,
            })

    for row in package.get("print_areas") or []:
        template_id = _cell(row, "template_id")
        print_area_id = _cell(row, "print_area_id")
        duplicate_key = (template_id, print_area_id)

        current = validate_base(
            row,
            duplicate_key,
            seen_print_area_rows,
        )

        if current is None:
            continue

        if not print_area_id:
            plan["errors"].append(
                _contextual_error(
                    row,
                    "print_area_id is required",
                )
            )
            continue

        print_areas = [
            value
            for value in current.get("print_areas") or []
            if isinstance(value, dict)
        ]

        print_area = next(
            (
                value
                for value in print_areas
                if _text(value.get("id")) == print_area_id
            ),
            None,
        )

        if print_area is None:
            plan["errors"].append(
                _contextual_error(
                    row,
                    "print_area_id does not exist; "
                    "CSV import cannot create print areas",
                    print_area_id=print_area_id,
                )
            )
            continue

        changes, field_errors = _parse_changes(
            row,
            print_area,
            PRINT_AREA_SPECS,
        )

        for error in field_errors:
            plan["errors"].append(
                _contextual_error(
                    row,
                    error.pop("message"),
                    print_area_id=print_area_id,
                    **error,
                )
            )

        if field_errors:
            continue

        if changes:
            plan["print_area_updates"].append({
                "template_id": template_id,
                "print_area_id": print_area_id,
                "changes": changes,
            })

    touched_template_ids = sorted({
        update["template_id"]
        for group in (
            "template_updates",
            "variation_updates",
            "print_area_updates",
        )
        for update in plan[group]
    })

    changed_cells = sum(
        len(update["changes"])
        for group in (
            "template_updates",
            "variation_updates",
            "print_area_updates",
        )
        for update in plan[group]
    )

    summary = {
        "template_rows": len(package.get("templates") or []),
        "variation_rows": len(package.get("variations") or []),
        "print_area_rows": len(package.get("print_areas") or []),
        "template_updates": len(plan["template_updates"]),
        "variation_updates": len(plan["variation_updates"]),
        "print_area_updates": len(plan["print_area_updates"]),
        "changed_cells": changed_cells,
        "touched_templates": len(touched_template_ids),
        "error_count": len(plan["errors"]),
        "warning_count": len(plan["warnings"]),
    }

    plan["summary"] = summary
    plan["touched_template_ids"] = touched_template_ids
    plan["can_apply"] = (
        not plan["errors"]
        and changed_cells > 0
    )

    return plan


def apply_change_map(
    target: MutableMapping[str, Any],
    changes: Mapping[str, Mapping[str, Any]],
) -> None:
    """Apply one validated change map to an in-memory document."""

    for field, change in changes.items():
        action = change.get("action")

        if action == "unset":
            target.pop(field, None)
            continue

        if action == "set":
            target[field] = copy.deepcopy(
                change.get("value")
            )
            continue

        raise ValueError(
            f"Unsupported change action for {field}: {action}"
        )



def remove_unset_fields(
    document: Mapping[str, Any],
    unset_fields: Iterable[str],
) -> Dict[str, Any]:
    """Remove fields scheduled for MongoDB $unset from a $set document."""

    cleaned = copy.deepcopy(dict(document))

    for field in unset_fields:
        cleaned.pop(str(field), None)

    return cleaned

def apply_import_plan_to_documents(
    current_documents: Iterable[Mapping[str, Any]],
    plan: Mapping[str, Any],
    updated_at: Any,
) -> Dict[str, Any]:
    """Apply a validated plan to in-memory document copies.

    This does not access MongoDB. The caller remains responsible for:
    * creating a backup;
    * checking optimistic concurrency;
    * normalising and validating documents;
    * persisting the replacements.
    """

    touched_ids = list(
        plan.get("touched_template_ids") or []
    )

    source_by_id = {
        _text(document.get("id")): dict(document)
        for document in current_documents
        if _text(document.get("id"))
    }

    updated_by_id: Dict[str, Dict[str, Any]] = {}
    top_level_unsets: Dict[str, List[str]] = {}

    for template_id in touched_ids:
        source = source_by_id.get(template_id)

        if source is None:
            raise ValueError(
                f"Template disappeared before apply: {template_id}"
            )

        updated_by_id[template_id] = copy.deepcopy(source)
        top_level_unsets[template_id] = []

    for update in plan.get("template_updates") or []:
        template_id = update["template_id"]
        target = updated_by_id[template_id]
        changes = update.get("changes") or {}

        apply_change_map(target, changes)

        for field, change in changes.items():
            if change.get("action") == "unset":
                top_level_unsets[template_id].append(field)

    for update in plan.get("variation_updates") or []:
        template_id = update["template_id"]
        variation_id = update["variation_id"]
        target = updated_by_id[template_id]

        variation = next(
            (
                row
                for row in target.get("variations") or []
                if isinstance(row, dict)
                and _text(row.get("id")) == variation_id
            ),
            None,
        )

        if variation is None:
            raise ValueError(
                "Variation disappeared before apply: "
                f"{template_id}/{variation_id}"
            )

        apply_change_map(
            variation,
            update.get("changes") or {},
        )

    for update in plan.get("print_area_updates") or []:
        template_id = update["template_id"]
        print_area_id = update["print_area_id"]
        target = updated_by_id[template_id]

        print_area = next(
            (
                row
                for row in target.get("print_areas") or []
                if isinstance(row, dict)
                and _text(row.get("id")) == print_area_id
            ),
            None,
        )

        if print_area is None:
            raise ValueError(
                "Print area disappeared before apply: "
                f"{template_id}/{print_area_id}"
            )

        apply_change_map(
            print_area,
            update.get("changes") or {},
        )

    updated_at_text = _time_text(updated_at)

    for document in updated_by_id.values():
        document["updated_at"] = updated_at_text

    return {
        "documents": updated_by_id,
        "top_level_unsets": {
            template_id: sorted(set(fields))
            for template_id, fields
            in top_level_unsets.items()
        },
    }
