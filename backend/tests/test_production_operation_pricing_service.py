import asyncio

import production_operation_pricing as pricing


def test_outsourced_area_rate_is_native_to_raw_cost_calculation():
    result = pricing._calculate_raw_print_cost(
        {
            "calculation_type":"area_fixed_rate",
            "cost_per_cm2":0.5,
            "minimum_area_cm2":100,
            "application_cost":10,
            "minimum_print_cost":0,
            "waste_percentage":0,
            "markup_percentage":0,
            "production_method_key":"dtf",
        },
        {"area_cm2":50,"manufacturing_profile_id":"profile:dtf:test"},
    )
    assert result["area_cm2"] == 50
    assert result["chargeable_area_cm2"] == 100
    assert result["application_cost"] == 10
    assert result["platform_print_cost"] == 60
    assert result["manufacturing_profile_id"] == "profile:dtf:test"


def test_embedded_application_method_detection():
    methods = pricing._embedded_application_methods({
        "artworks":[
            {"method_key":"HTV","application_cost":5},
            {"method_key":"dtf","application_cost":0},
        ]
    })
    assert methods == {"htv"}
