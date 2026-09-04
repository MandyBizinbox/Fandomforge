from pathlib import Path
import ast

p = Path('backend/unified_manufacturing_costing.py')
s = p.read_text()
anchor = '''    for field in PROFILE_PRICING_FIELDS:\n        if field in source and _is_set(source.get(field)):\n            row[field] = copy.deepcopy(source.get(field))\n\n'''
assert anchor in s
addition = '''    for field in (\n        "colour_selection_mode",\n        "color_selection_mode",\n        "supported_colour_ids",\n        "available_colour_ids",\n        "stocked_colour_seed_version",\n        "stocked_colour_assignment_version",\n    ):\n        if field in source:\n            row[field] = copy.deepcopy(source.get(field))\n\n'''
s = s.replace(anchor, anchor + addition, 1)
ast.parse(s)
p.write_text(s)
print('canonical profile colour persistence fixed')
