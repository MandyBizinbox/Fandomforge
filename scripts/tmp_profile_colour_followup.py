from pathlib import Path

root = Path('.')

# Rename the resolution test now that it no longer protects a patch installer.
old = root/'backend/tests/test_production_profile_resolution_patch.py'
new = root/'backend/tests/test_production_profile_resolution.py'
assert old.exists() and not new.exists()
old.rename(new)

# Permanent CI follows canonical ownership and retains startup-graph coverage.
p = root/'.github/workflows/template-production-routing-v3-ci.yml'
s = p.read_text()
s = s.replace('      - "backend/profile_stocked_colours_patch.py"\n', '      - "backend/manufacturing_profile_colours.py"\n')
s = s.replace('      - "backend/profile_colour_projection_repair.py"\n', '')
s = s.replace('      - "backend/production_profile_resolution_patch.py"\n', '')
s = s.replace('      - "backend/tests/test_production_profile_resolution_patch.py"\n', '      - "backend/tests/test_production_profile_resolution.py"\n')
s = s.replace('            tests/test_production_profile_resolution_patch.py \\\n', '            tests/test_production_profile_resolution.py \\\n')
s = s.replace('          profile_stocked_colours_patch.py\n', '          manufacturing_profile_colours.py\n')
s = s.replace('          profile_colour_projection_repair.py\n', '')
s = s.replace('          production_profile_resolution_patch.py\n', '')
# Ensure canonical profile-colour module and resolution test are covered even if earlier formatting differed.
if '      - "backend/manufacturing_profile_colours.py"\n' not in s:
    marker = '      - "backend/unified_manufacturing_costing.py"\n'
    assert marker in s
    s = s.replace(marker, marker + '      - "backend/manufacturing_profile_colours.py"\n', 1)
if 'tests/test_production_profile_resolution.py' not in s:
    marker = '            tests/test_htv_profile_colour_assignment.py \\\n'
    assert marker in s
    s = s.replace(marker, marker + '            tests/test_production_profile_resolution.py \\\n', 1)
if '          manufacturing_profile_colours.py\n' not in s:
    marker = '          unified_manufacturing_costing.py\n'
    assert marker in s
    s = s.replace(marker, marker + '          manufacturing_profile_colours.py\n', 1)
p.write_text(s)

print('profile/colour CI cleanup applied')
