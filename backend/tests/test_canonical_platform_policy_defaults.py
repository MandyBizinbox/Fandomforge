"""Regressions for canonical public platform policy defaults."""

from pathlib import Path

import routes_main


BACKEND_ROOT = Path(__file__).resolve().parents[1]

LAUNCH_POLICY_DEFAULTS = {
    "intellectual_property_policy": "Approved Intellectual Property Policy content is required before broad creator onboarding.",
    "prohibited_content_policy": "Approved Prohibited Content Policy content is required before broad creator onboarding.",
    "copyright_complaint_procedure": "Approved Copyright Complaint Procedure content is required before broad creator onboarding.",
    "payout_policy": "Approved Payout Policy content is required before creator earnings and payout promises are published.",
    "store_suspension_termination_policy": "Approved Store Suspension and Termination Policy content is required before broad creator onboarding.",
}


def test_launch_policy_defaults_are_owned_by_routes_main():
    for key, expected in LAUNCH_POLICY_DEFAULTS.items():
        assert routes_main.DEFAULT_POLICY_SETTINGS[key] == expected
        assert key in routes_main.PUBLIC_POLICY_KEYS


def test_existing_public_policy_defaults_are_preserved():
    assert routes_main.DEFAULT_POLICY_SETTINGS["privacy_policy"] == "Privacy policy will be published here."
    assert routes_main.DEFAULT_POLICY_SETTINGS["creator_terms"] == "Creator terms will be published here."
    assert "privacy_policy" in routes_main.PUBLIC_POLICY_KEYS
    assert "creator_terms" in routes_main.PUBLIC_POLICY_KEYS


def test_configured_policy_content_overrides_default_without_dropping_other_policies():
    custom = "Approved custom payout policy content for regression coverage."
    payload = routes_main._public_platform_payload({"policies": {"payout_policy": custom}})

    assert payload["policies"]["payout_policy"] == custom
    assert payload["policies"]["intellectual_property_policy"] == LAUNCH_POLICY_DEFAULTS["intellectual_property_policy"]
    assert payload["policies"]["privacy_policy"] == "Privacy policy will be published here."


def test_runtime_platform_policy_patch_is_gone():
    assert not (BACKEND_ROOT / "platform_launch_policy_patch.py").exists()

    server_source = (BACKEND_ROOT / "server.py").read_text(encoding="utf-8")
    assert "platform_launch_policy_patch" not in server_source
    assert "install_platform_launch_policy_patch" not in server_source
