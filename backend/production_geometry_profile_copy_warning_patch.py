"""Deprecated import alias for :mod:`production_geometry_profile_copy_warnings`.

Missing Color-view warning policy is statically composed through the canonical CSV
API. This alias performs no runtime installation or rebinding.
"""
import production_geometry_profile_copy_warnings as _canonical

for _name in dir(_canonical):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_canonical, _name)


def __getattr__(name):
    return getattr(_canonical, name)
