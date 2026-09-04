from unified_manufacturing_costing import _apply_approved_rate, UNIFIED_COSTING_ENGINE_VERSION


def test_canonical_profile_saved_rate_is_not_replaced_by_legacy_defaults():
    profile={
        "id":"profile:dtf:standard_dtf",
        "profile_id":"profile:dtf:standard_dtf",
        "costing_engine_version":UNIFIED_COSTING_ENGINE_VERSION,
        "cost_per_cm2":9.99,
        "calculation_type":"area_fixed_rate",
    }
    result=_apply_approved_rate(profile,"dtf")
    assert result["cost_per_cm2"] == 9.99
