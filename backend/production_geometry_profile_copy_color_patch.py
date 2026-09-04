"""Deprecated import alias for :mod:`production_geometry_profile_copy_color`.

Color-owned editor-view composition is now reached through the canonical module.
This alias performs no installation or rebinding.
"""
import production_geometry_profile_copy_color as _canonical

for _name in dir(_canonical):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_canonical, _name)


def __getattr__(name):
    return getattr(_canonical, name)
