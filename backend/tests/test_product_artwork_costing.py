from product_artwork_costing import calculate_artwork_area_cost, _option_policy, _method_key


def test_method_aliases_and_layer_policy():
    assert _method_key("DTF Transfers") == "dtf"
    assert _method_key("Heat Transfer Vinyl") == "htv"
    assert _option_policy({}, "dtf") is True
    assert _option_policy({"layer_pricing_mode":"separate"}, "dtf") is False


def test_area_rate_wrapper_preserves_base_and_applies_outsourced_costing():
    def base(slot, area, option):
        return {"calculation_type":"area_fixed_rate","area_cm2":100,"calculated_print_cost":1,"base_marker":"kept"}
    result=calculate_artwork_area_cost(
        base,
        {"combined_area_cm2":100},
        {},
        {"calculation_type":"area_fixed_rate","cost_per_cm2":0.5,"minimum_area_cm2":0,"minimum_print_cost":0,"application_cost":0,"waste_percentage":0,"markup_percentage":0},
    )
    assert result["base_marker"] == "kept"
    assert result["area_cm2"] == 100
    assert result["calculated_print_cost"] == 50
    assert result["pricing_source"] == "outsourced_area_rate"
