"""Contract tests for the preserved three-file product-template CSV base layer.

The canonical :mod:`product_template_csv` facade intentionally adds production
geometry and profile-copy extensions.  These original tests still protect the
unchanged base implementation without forcing the public facade back to its
legacy three-file contract.
"""

import sys

import product_template_csv as canonical_csv
import product_template_csv_base as base_csv


# The preserved contract module was written before the canonical facade existed
# and imports ``product_template_csv`` by its historical name.  Bind that name
# to the preserved base only while importing the contract, then immediately
# restore the canonical public module for every other test and runtime caller.
sys.modules["product_template_csv"] = base_csv
try:
    from product_template_csv_base_contract import *  # noqa: F401,F403
finally:
    sys.modules["product_template_csv"] = canonical_csv
