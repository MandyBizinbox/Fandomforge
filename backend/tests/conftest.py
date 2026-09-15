"""Pytest-only aliases for historical geometry CSV test modules.

Production code no longer ships the old ``*_patch.py`` modules. A few legacy
regression files still import those historical names; keep that vocabulary
inside the test process only until the test files themselves are renamed.
"""

import sys

import product_template_geometry_csv as geometry_csv
import production_geometry_profile_copy as profile_copy
import production_geometry_profile_copy_color as color_composition
import production_geometry_profile_copy_warnings as warning_policy


sys.modules.setdefault("product_template_geometry_csv_patch", geometry_csv)
sys.modules.setdefault("production_geometry_profile_copy_patch", profile_copy)
sys.modules.setdefault("production_geometry_profile_copy_color_patch", color_composition)
sys.modules.setdefault("production_geometry_profile_copy_warning_patch", warning_policy)
