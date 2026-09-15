"""Canonical role and manager-permission policy.

Frontend visibility is advisory. Every sensitive endpoint must call these helpers
or an equivalent dependency before mutating production state.
"""
from __future__ import annotations

from typing import Any, Dict, Iterable, Optional

from fastapi import HTTPException

OWNER_ROLES = frozenset({"owner", "super_admin"})
ADMIN_ROLES = frozenset({"owner", "super_admin", "admin"})
ADMINISH_ROLES = frozenset({"owner", "super_admin", "admin", "manager"})
CREATOR_REVIEW_ROLES = frozenset({"owner", "super_admin", "admin"})
PRINTER_REVIEW_ROLES = frozenset({"owner", "super_admin", "admin"})

MANAGER_PERMISSION_KEYS = frozenset({
    "manage_users",
    "manage_bands",
    "manage_band_users",
    "manage_products",
    "manage_product_templates",
    "manage_orders",
    "manage_artwork_review",
    "manage_printers",
    "manage_printer_users",
    "manage_printer_pricing",
    "manage_shipping",
    "manage_shop_payment_gateways",
    "manage_reports",
    "manage_platform_branding",
    "manage_subscriptions",
    "manage_payouts",
})


def role_of(user: Any) -> str:
    return str(getattr(user, "role", None) or (user or {}).get("role") or "").strip()


def user_id_of(user: Any) -> Optional[str]:
    return getattr(user, "id", None) or (user or {}).get("id")


def manager_permissions_of(user: Any) -> Dict[str, bool]:
    supplied = getattr(user, "manager_permissions", None)
    if supplied is None and isinstance(user, dict):
        supplied = user.get("manager_permissions")
    supplied = supplied if isinstance(supplied, dict) else {}
    return {key: bool(supplied.get(key, False)) for key in MANAGER_PERMISSION_KEYS}


def is_owner(user: Any) -> bool:
    return role_of(user) in OWNER_ROLES


def is_admin(user: Any) -> bool:
    return role_of(user) in ADMIN_ROLES


def is_adminish(user: Any) -> bool:
    return role_of(user) in ADMINISH_ROLES


def require_owner(user: Any) -> Any:
    if not is_owner(user):
        raise HTTPException(status_code=403, detail="Platform Owner access required")
    return user


def require_admin(user: Any) -> Any:
    if not is_admin(user):
        raise HTTPException(status_code=403, detail="Platform administrator access required")
    return user


def require_manager_permission(user: Any, permission: str) -> Any:
    if permission not in MANAGER_PERMISSION_KEYS:
        raise RuntimeError(f"Unknown manager permission: {permission}")
    role = role_of(user)
    if role in ADMIN_ROLES:
        return user
    if role != "manager":
        raise HTTPException(status_code=403, detail="Owner, admin or authorised manager access required")
    if not manager_permissions_of(user).get(permission):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "manager_permission_required",
                "permission": permission,
                "message": f"Manager permission required: {permission}",
            },
        )
    return user


def require_any_role(user: Any, roles: Iterable[str]) -> Any:
    allowed = set(roles)
    if role_of(user) not in allowed:
        raise HTTPException(status_code=403, detail=f"Requires one of: {sorted(allowed)}")
    return user


def can_review_creator(user: Any) -> bool:
    return role_of(user) in CREATOR_REVIEW_ROLES


def can_review_printer(user: Any) -> bool:
    return role_of(user) in PRINTER_REVIEW_ROLES


def role_home(role: str) -> str:
    if role in {"owner", "super_admin", "admin"}:
        return "/admin"
    if role == "manager":
        return "/manager"
    if role == "creator":
        return "/creator"
    if role == "printer":
        return "/printer"
    return "/account"
