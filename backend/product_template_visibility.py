"""Product-template visibility policy shared by creator-facing routes."""
from __future__ import annotations

from typing import Any, Dict, Optional


HIDDEN_TEMPLATE_ADMIN_ROLES = frozenset({
    "owner",
    "super_admin",
    "admin",
    "manager",
})


def can_access_hidden_templates(user_or_role: Any) -> bool:
    """Return whether the actor may use admin-only product templates."""
    if isinstance(user_or_role, str):
        role = user_or_role
    else:
        role = getattr(user_or_role, "role", None)

    return str(role or "").strip().lower() in HIDDEN_TEMPLATE_ADMIN_ROLES


def creator_template_query(
    base: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Return a Mongo query that excludes only explicitly hidden templates.

    Missing ``creator_visible`` fields remain visible for legacy compatibility.
    """
    query = dict(base or {})
    query["creator_visible"] = {"$ne": False}
    return query


def strip_template_visibility_controls(
    template: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
    """Remove internal catalogue visibility controls from creator responses."""
    row = dict(template or {})
    row.pop("creator_visible", None)
    row.pop("admin_visible", None)
    return row
