"""Narrow compatibility shims for legacy route revisions."""
from __future__ import annotations

from typing import Any, Optional


def ensure_core_compat(core: Any) -> None:
    if not hasattr(core, "user_can_access_band"):
        async def user_can_access_band(db, user, band_id: str, permission: Optional[str] = None) -> bool:
            role = getattr(user, "role", "")
            if role in {"owner", "super_admin", "admin"}:
                return True
            creator = await db.creators.find_one({"id": band_id}, {"_id": 0, "user_id": 1})
            if creator and creator.get("user_id") == getattr(user, "id", None):
                return True
            membership = await db.band_members.find_one({
                "band_id": band_id,
                "user_id": getattr(user, "id", None),
                "status": "active",
            }, {"_id": 0})
            if not membership:
                return False
            if not permission:
                return True
            permissions = membership.get("permissions") or []
            return permission in permissions or membership.get("role") in {"owner", "admin"}
        core.user_can_access_band = user_can_access_band
