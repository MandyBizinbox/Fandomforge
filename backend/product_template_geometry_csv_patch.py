"""Deprecated import alias for :mod:`product_template_geometry_csv`.

Runtime installation was removed in the canonical CSV routing migration. New code
must import the canonical module directly; this alias exists only while dependent
modules are migrated off the historical name.
"""
import product_template_geometry_csv as _canonical

for _name in dir(_canonical):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_canonical, _name)


def __getattr__(name):
    return getattr(_canonical, name)
