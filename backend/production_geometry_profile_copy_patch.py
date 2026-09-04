"""Deprecated import alias for :mod:`production_geometry_profile_copy`.

The profile-copy implementation is canonical and statically composed. This alias
remains only for migration compatibility and performs no runtime rebinding.
"""
import production_geometry_profile_copy as _canonical

for _name in dir(_canonical):
    if not _name.startswith("__"):
        globals()[_name] = getattr(_canonical, _name)


def __getattr__(name):
    return getattr(_canonical, name)
