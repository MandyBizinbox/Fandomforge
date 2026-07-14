"""Extend the configurable public policy set required for creator launch.

The platform already stores policies as a settings dictionary and exposes them
through /public/policies/{policy_key}. This patch adds the missing launch policy
keys without hard-coding legal text or changing existing policy records.
"""
from __future__ import annotations

from typing import Any


LAUNCH_POLICY_DEFAULTS = {
    "intellectual_property_policy": "Approved Intellectual Property Policy content is required before broad creator onboarding.",
    "prohibited_content_policy": "Approved Prohibited Content Policy content is required before broad creator onboarding.",
    "copyright_complaint_procedure": "Approved Copyright Complaint Procedure content is required before broad creator onboarding.",
    "payout_policy": "Approved Payout Policy content is required before creator earnings and payout promises are published.",
    "store_suspension_termination_policy": "Approved Store Suspension and Termination Policy content is required before broad creator onboarding.",
}


def install_platform_launch_policy_patch(routes_main_module: Any) -> None:
    if getattr(routes_main_module, "_platform_launch_policy_patch_installed", False):
        return

    routes_main_module.DEFAULT_POLICY_SETTINGS.update(LAUNCH_POLICY_DEFAULTS)
    routes_main_module.PUBLIC_POLICY_KEYS.update(LAUNCH_POLICY_DEFAULTS.keys())
    routes_main_module._platform_launch_policy_patch_installed = True
