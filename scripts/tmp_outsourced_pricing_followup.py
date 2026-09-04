from pathlib import Path
import ast

root=Path('.')

p=root/'backend/outsourced_production_rates.py'
s=p.read_text()
s=s.replace('import re\nfrom datetime import datetime, timezone', 'import re\nfrom decimal import Decimal, ROUND_HALF_UP\nfrom datetime import datetime, timezone',1)
old='''COMMON_PRICING = {\n    "calculation_type": "area_fixed_rate",\n    "minimum_area_cm2": 100.0,\n    "application_cost": 7.5,\n    "minimum_print_cost": 0.0,\n    "waste_percentage": 0.0,\n    "markup_percentage": 5.0,\n}\n'''
new='''COMMON_PRICING = {\n    "calculation_type": "area_fixed_rate",\n    "minimum_area_cm2": 100.0,\n    "application_cost": 7.5,\n    "minimum_print_cost": 0.0,\n    "waste_percentage": 0.0,\n    "markup_percentage": 5.0,\n    # Canonical outsourced profiles derive their raw cost from area rates, not\n    # legacy fixed Print Option fields. Keep those compatibility fields neutral.\n    "platform_print_cost": 0.0,\n    "print_cost_max": 0.0,\n    "creator_print_price": 0.0,\n}\n'''
assert old in s
s=s.replace(old,new,1)
old='''def money(value: Any) -> float:\n    return round(number(value), 2)\n'''
new='''def money(value: Any) -> float:\n    # Financial manufacturing values use decimal half-up rounding consistently.\n    try:\n        decimal_value = Decimal(str(value if value not in (None, "") else 0))\n    except Exception:\n        decimal_value = Decimal("0")\n    return float(decimal_value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))\n'''
assert old in s
s=s.replace(old,new,1)
ast.parse(s); p.write_text(s)

p=root/'backend/tests/test_outsourced_production_rates.py'
s=p.read_text()
old='''# Applies financial half-up rounding and clears legacy fixed defaults before the\n# pure costing functions are exercised, matching the live server import order.\nimport outsourced_rate_runtime_patch  # noqa: F401\n\n'''
assert old in s
s=s.replace(old,'',1)
p.write_text(s)
print('outsourced production rate ownership follow-up applied')
